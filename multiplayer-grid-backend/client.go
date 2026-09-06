package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"

	"github.com/gorilla/websocket"
	"github.com/redis/go-redis/v9"
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin: func(r *http.Request) bool {
		return true // Allow all origins for now
	},
}

type Client struct {
	hub   *Hub
	conn  *websocket.Conn
	send  chan []byte
	redis *redis.Client
}

type Message struct {
	Type    string      `json:"type"`
	Payload interface{} `json:"payload,omitempty"`
}

type CapturePayload struct {
	X     int    `json:"x"`
	Y     int    `json:"y"`
	Owner string `json:"owner"`
	Tone  string `json:"tone"`
}

type UpdateMessage struct {
	Type  string `json:"type"`
	Block struct {
		X     int    `json:"x"`
		Y     int    `json:"y"`
		Owner string `json:"owner"`
		Tone  string `json:"tone"`
	} `json:"block"`
}

func (c *Client) readPump() {
	defer func() {
		c.hub.unregister <- c
		c.conn.Close()
	}()

	for {
		_, message, err := c.conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("error: %v", err)
			}
			break
		}

		var msg Message
		if err := json.Unmarshal(message, &msg); err != nil {
			continue
		}

		if msg.Type == "CAPTURE" {
			payloadBytes, _ := json.Marshal(msg.Payload)
			var payload CapturePayload
			json.Unmarshal(payloadBytes, &payload)
			
			ctx := context.Background()
			key := fmt.Sprintf("block:%d:%d", payload.X, payload.Y)
			
			// Prepare JSON string for storage
			blockData, _ := json.Marshal(map[string]string{
				"owner": payload.Owner,
				"tone":  payload.Tone,
			})
			
			// SETNX lock
			set, err := c.redis.SetNX(ctx, key, string(blockData), 0).Result()
			if err != nil {
				log.Printf("Redis error: %v", err)
				continue
			}
			
			if set {
				// Success, broadcast UPDATE via Pub/Sub
				update := UpdateMessage{
					Type: "UPDATE",
				}
				update.Block.X = payload.X
				update.Block.Y = payload.Y
				update.Block.Owner = payload.Owner
				update.Block.Tone = payload.Tone

				updateBytes, _ := json.Marshal(update)
				c.redis.Publish(ctx, "grid_updates", updateBytes)
			} else {
				// Failure, conflict: send REJECT to just this client
				reject := map[string]interface{}{
					"type": "REJECT",
					"block": map[string]int{
						"x": payload.X,
						"y": payload.Y,
					},
				}
				rejectBytes, _ := json.Marshal(reject)
				c.send <- rejectBytes
			}
		}
	}
}

func (c *Client) writePump() {
	for {
		select {
		case message, ok := <-c.send:
			if !ok {
				c.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}
			c.conn.WriteMessage(websocket.TextMessage, message)
		}
	}
}

func serveWs(hub *Hub, rdb *redis.Client, w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Println(err)
		return
	}
	client := &Client{hub: hub, conn: conn, send: make(chan []byte, 256), redis: rdb}
	client.hub.register <- client

	go client.writePump()
	go client.readPump()

	// Send initial state (SYNC) to the connected client
	go func() {
		ctx := context.Background()
		var cursor uint64
		var keys []string
		for {
			var k []string
			var err error
			k, cursor, err = rdb.Scan(ctx, cursor, "block:*:*", 100).Result()
			if err != nil {
				log.Println("Redis scan error:", err)
				break
			}
			keys = append(keys, k...)
			if cursor == 0 {
				break
			}
		}

		if len(keys) > 0 {
			vals, err := rdb.MGet(ctx, keys...).Result()
			if err == nil {
				var blocks []map[string]interface{}
				for i, keyStr := range keys {
					var x, y int
					fmt.Sscanf(keyStr, "block:%d:%d", &x, &y)
					
					valStr, ok := vals[i].(string)
					if !ok {
						blocks = append(blocks, map[string]interface{}{"x": x, "y": y, "owner": vals[i], "tone": "charcoal"})
					} else {
						var data map[string]string
						if err := json.Unmarshal([]byte(valStr), &data); err == nil {
							blocks = append(blocks, map[string]interface{}{"x": x, "y": y, "owner": data["owner"], "tone": data["tone"]})
						} else {
							blocks = append(blocks, map[string]interface{}{"x": x, "y": y, "owner": valStr, "tone": "charcoal"})
						}
					}
				}
				syncMsg := map[string]interface{}{
					"type": "SYNC",
					"blocks": blocks,
				}
				syncBytes, _ := json.Marshal(syncMsg)
				
				// Prevent panic if client disconnects while scanning Redis
				defer func() {
					if r := recover(); r != nil {
						log.Println("Recovered from panic writing to closed client channel")
					}
				}()
				client.send <- syncBytes
			}
		}
	}()
}
