import { useState, useEffect, useCallback, useRef } from 'react';

export type BlockStatus = 'pending' | 'confirmed';

export interface GameBlock {
  id: string;
  x: number;
  y: number;
  owner: string;
  tone: string; // e.g., 'charcoal', 'terracotta'
  status: BlockStatus;
}

export interface GameEvent {
  id: string;
  message: string;
  timestamp: number;
}

export function useGameSocket(playerName: string | null, onNameTaken?: () => void) {
  const [blocks, setBlocks] = useState<GameBlock[]>([]);
  const [events, setEvents] = useState<GameEvent[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!playerName) return;

    // Connect to the backend with identity
    const ws = new WebSocket(`ws://localhost:8080/ws?name=${encodeURIComponent(playerName)}`);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnectionStatus('connected');
    };

    ws.onclose = (event) => {
      setConnectionStatus('disconnected');
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      setConnectionStatus('disconnected');
      
      // Since browser JS cannot read the HTTP status code of a WebSocket connection failure directly,
      // a rapid drop before `onopen` heavily implies our 409 Conflict rejection.
      if (ws.readyState === WebSocket.CLOSED) {
         onNameTaken?.();
      }
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'UPDATE') {
          setBlocks(prev => {
            const existingIndex = prev.findIndex(b => b.x === data.block.x && b.y === data.block.y);
            if (existingIndex >= 0) {
              const newBlocks = [...prev];
              newBlocks[existingIndex] = { ...data.block, status: 'confirmed' };
              return newBlocks;
            } else {
              return [...prev, { ...data.block, status: 'confirmed' }];
            }
          });
          setEvents(prev => {
            const newEvent: GameEvent = {
              id: `${data.block.x}-${data.block.y}-${Date.now()}`,
              message: `${data.block.owner.toUpperCase()} CAPTURED ${data.block.x} : ${data.block.y}`,
              timestamp: Date.now()
            };
            return [newEvent, ...prev].slice(0, 50); // Keep last 50 events
          });
        } else if (data.type === 'REJECT') {
          setBlocks(prev => prev.filter(b => !(b.x === data.block.x && b.y === data.block.y && b.status === 'pending')));
        } else if (data.type === 'SYNC') {
           setBlocks(data.blocks.map((b: any) => ({ ...b, status: 'confirmed'})));
        }
      } catch (err) {
        console.error('Failed to parse WebSocket message:', err);
      }
    };

    return () => {
      ws.close();
    };
  }, [playerName]);

  const sendCapture = useCallback((x: number, y: number, owner: string = 'YOU', tone: string = 'terracotta') => {
    setBlocks(prev => {
      const filtered = prev.filter(b => !(b.x === x && b.y === y));
      return [...filtered, { id: `${x},${y}`, x, y, owner, tone, status: 'pending' }];
    });

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'CAPTURE',
        payload: { x, y, owner, tone }
      }));
    }
  }, []);

  return { blocks, events, sendCapture, connectionStatus };
}
