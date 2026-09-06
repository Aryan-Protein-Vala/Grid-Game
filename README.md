<div align="center">
  <img src="./multiplayer-grid-game/public/icon.svg" width="128" height="128" alt="Grid Game Logo" />
  <h1>MULTIPLAYER GRID STUDY</h1>
  <p><strong>Massive Multiplayer Real-Time Redis Grid Game</strong></p>
</div>

---

## ⚡ Architecture
- **Frontend**: Next.js App Router, `framer-motion`, `use-gesture`, Custom Hooks for WS lifecycle.
- **Backend**: Go WebSocket server with `gorilla/websocket`.
- **Database**: Local Redis instance via `redis/go-redis/v9`.

## 🎮 Mechanics
- **Pan & Zoom**: Infinite 5000x5000 grid bounded by a coordinate system. Use 2-finger scroll to pan, and Pinch (or CTRL+Scroll) to zoom.
- **Minimap**: Click the top-right map icon to open a full-screen, blurred interactive navigation HUD. Click anywhere on the map to teleport your camera.
- **Unique Identities**: Connect with a 15-character max designation. Your name acts as a hash seed for your unique drop coordinate!
- **Color Hashing**: Every player has a unique HSL color generated from their name, allowing up to hundreds of uniquely identifiable colors without hardcoding them.
- **Stamina System**: Actions cost stamina (10 for adjacent, 20 for distant captures). Recharges natively at 2/s.

## 🚀 Setup

### 1. Start Redis
```bash
brew services start redis
```

### 2. Start Go Backend
```bash
cd multiplayer-grid-backend
go run .
```

### 3. Start Frontend
```bash
cd multiplayer-grid-game
pnpm install
pnpm dev
```
Open [http://localhost:3000](http://localhost:3000) and initialize your identity.
