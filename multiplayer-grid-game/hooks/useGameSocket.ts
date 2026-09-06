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

    // Connect to the backend with identity, using an env var for production or falling back to localhost
    let baseUrl = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8080/ws';
    if (baseUrl.startsWith('https://')) {
      baseUrl = baseUrl.replace(/^https:\/\//, 'wss://');
    } else if (baseUrl.startsWith('http://')) {
      baseUrl = baseUrl.replace(/^http:\/\//, 'ws://');
    }
    baseUrl = baseUrl.replace(/\/+$/, '');
    if (!baseUrl.endsWith('/ws')) {
      baseUrl += '/ws';
    }
    // Retrieve or initialize unique player session token
    let token = '';
    if (typeof window !== 'undefined') {
      token = localStorage.getItem('grid_player_token') || '';
      if (!token) {
        token = Math.random().toString(36).substring(2) + Date.now().toString(36);
        localStorage.setItem('grid_player_token', token);
      }
    }

    const ws = new WebSocket(`${baseUrl}?name=${encodeURIComponent(playerName)}&token=${encodeURIComponent(token)}`);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnectionStatus('connected');
    };

    ws.onclose = (event) => {
      setConnectionStatus('disconnected');
      // Only trigger onNameTaken if the server explicitly rejected the connection with code 4001 (NAME_TAKEN)
      if (event.code === 4001) {
        onNameTaken?.();
      }
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      setConnectionStatus('disconnected');
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
