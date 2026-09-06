package main

import "sync"

type Hub struct {
	// Registered clients.
	clients map[*Client]bool

	// Active clients mapped by player name
	clientsByName map[string]*Client

	// Inbound messages from the clients.
	broadcast chan []byte

	// Register requests from the clients.
	register chan *Client

	// Unregister requests from clients.
	unregister chan *Client

	mu sync.Mutex
}

func newHub() *Hub {
	return &Hub{
		broadcast:     make(chan []byte),
		register:      make(chan *Client),
		unregister:    make(chan *Client),
		clients:       make(map[*Client]bool),
		clientsByName: make(map[string]*Client),
	}
}

func (h *Hub) run() {
	for {
		select {
		case client := <-h.register:
			h.mu.Lock()
			h.clients[client] = true
			h.clientsByName[client.name] = client
			h.mu.Unlock()

		case client := <-h.unregister:
			h.mu.Lock()
			if _, ok := h.clients[client]; ok {
				delete(h.clients, client)
				if h.clientsByName[client.name] == client {
					delete(h.clientsByName, client.name)
				}
				close(client.send)
			}
			h.mu.Unlock()

		case message := <-h.broadcast:
			h.mu.Lock()
			for client := range h.clients {
				select {
				case client.send <- message:
				default:
					close(client.send)
					delete(h.clients, client)
					if h.clientsByName[client.name] == client {
						delete(h.clientsByName, client.name)
					}
				}
			}
			h.mu.Unlock()
		}
	}
}
