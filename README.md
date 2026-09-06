<div align="center">
  <img src="./multiplayer-grid-game/public/icon.svg" width="180" height="180" alt="Claim / 05 Logo" />
  
  <br />
  <h1><strong>CLAIM / 05</strong></h1>
  <p><strong>A tactile, real-time multiplayer territory grid interface.</strong></p>

  <p>
    <a href="https://multiplayer-grid-game-theta.vercel.app/"><strong>🔴 PLAY LIVE →</strong></a>
  </p>

  <p>
    <a href="#-live-deployments">Live Deployments</a> •
    <a href="#-architecture">Architecture</a> •
    <a href="#%EF%B8%8F-tech-stack">Tech Stack</a> •
    <a href="#-features--mechanics">Features & Mechanics</a> •
    <a href="#-quick-start">Quick Start</a>
  </p>
</div>

<br/>

> **CLAIM / 05** is a massive multiplayer grid-capture game built on top of WebSockets and Redis. Dive into an expansive `5000x5000` coordinate space, stake your claim on the map, and watch the battlefield evolve in real-time as other players conquer adjacent territories.

---

## 🌐 Live Deployments

| Component | Platform | URL / Endpoint | Details |
| :--- | :--- | :--- | :--- |
| **Frontend Web App** | **Vercel** | [**multiplayer-grid-game-theta.vercel.app**](https://multiplayer-grid-game-theta.vercel.app/) | Edge-optimized Next.js 14 App Router client |
| **Backend WebSocket Engine** | **Render** | `wss://grid-game-4rri.onrender.com/ws` | High-concurrency Go WebSocket cluster |
| **Engine Health Check** | **Render** | [`https://grid-game-4rri.onrender.com/health`](https://grid-game-4rri.onrender.com/health) | 24/7 liveness monitoring target |
| **State & Pub/Sub Layer** | **Render Key-Value** | `redis://...:6379` | Sub-millisecond atomic cell locking & broadcasts |
| **24/7 Keep-Alive Sentry** | **GitHub Actions** | [Workflow `.github/workflows/keep-alive.yml`](.github/workflows/keep-alive.yml) | Scheduled 10-min heartbeat to ensure 0s cold starts |

---

## 🏗️ Architecture

```
                       +-----------------------------------+
                       |      Web Client (Next.js 14)      |
                       |        Hosted on Vercel           |
                       +-----------------+-----------------+
                                         |
                            Secure WebSockets (WSS)
                                         |
                                         v
                       +-----------------------------------+
                       |    Go WebSocket Engine (Render)   |
                       |       Gorilla WS + Hub Pattern    |
                       +-----------------+-----------------+
                                         |
                             SETNX & Redis Pub/Sub
                                         |
                                         v
                       +-----------------------------------+
                       |    Redis Key-Value (Render)       |
                       |    Fast Atomic Territory Storage   |
                       +-----------------------------------+
```

1. **Stateful Ingestion:** Players open persistent bidirectional WebSocket connections to the Go backend on Render.
2. **Atomic Conflict Resolution:** When multiple players click the same coordinate, the Go server uses Redis `SETNX` (Set if Not Exists) to ensure mathematical zero-conflict ownership.
3. **Cluster Broadcasting:** Winning cell captures are published to the Redis `grid_updates` Pub/Sub channel, fanning out instant delta updates across all connected clients.
4. **Resilient Reconnection:** Browser sessions are tied to persistent tokens in `localStorage`. Page reloads seamlessly re-attach to the same player handle without name-collision errors.
5. **Persistent Ink Stamina:** Player ink capacity is strictly timestamp-persisted across page reloads and regenerates at 2 points/second.

---

## 🛠️ Tech Stack

<div align="center">
  <table>
    <tr>
      <td align="center"><strong>Frontend (Vercel)</strong></td>
      <td align="center"><strong>Backend (Render)</strong></td>
      <td align="center"><strong>State & Cache (Render)</strong></td>
    </tr>
    <tr>
      <td align="center">Next.js 14 (App Router)</td>
      <td align="center">Golang 1.21+</td>
      <td align="center">Redis 7 (Key-Value)</td>
    </tr>
    <tr>
      <td align="center">React 18 & TypeScript</td>
      <td align="center">Gorilla WebSocket</td>
      <td align="center">Redis Pub/Sub Engine</td>
    </tr>
    <tr>
      <td align="center">Framer Motion</td>
      <td align="center">Concurrent Channel Hubs</td>
      <td align="center">go-redis/v9 Client</td>
    </tr>
    <tr>
      <td align="center">Rough.js (Canvas Drawing)</td>
      <td align="center">Automated Health Endpoints</td>
      <td align="center">Persistent In-Memory Store</td>
    </tr>
    <tr>
      <td align="center">Tailwind CSS (Vellum Theme)</td>
      <td align="center">Containerized Native Executable</td>
      <td align="center">GitHub Actions Keep-Alive Cron</td>
    </tr>
  </table>
</div>

---

## ✨ Features & Mechanics

- 🗺️ **Infinite Coordinate Field**: Sprawling 5000x5000 board driven by high-performance HTML5 Canvas math.
- 🎯 **Tactile Gestures**: Pan smoothly with two-finger scroll or drag; zoom fluidly with pinch gestures or `CTRL + Scroll`.
- 🛰️ **Home Spawn Recenter**: Press `SPACE` or `ESC` (or tap the Google Maps-style target crosshair button) to immediately snap back to your unique home spawn location.
- 📡 **Sub-Millisecond Sync**: Instantaneous block capture and state distribution across all online explorers.
- 🎨 **Identity Hashing**: Identities act as cryptographic seeds to generate deterministic HSL color palettes and distant spawn locations.
- 🔋 **Liquid Ink Stamina Economy**: Capturing adjacent blocks costs 10 ink, while remote captures cost 20 ink. Ink stamina persists across reloads and regenerates dynamically.
- 🛰️ **Global Satellite Minimap**: Full-screen expandable minimap with live heat indicators, player location crosshair, and quick orbital drops.

---

## 🚀 Quick Start (Local Development)

### 1. Start Redis
```bash
# macOS via Homebrew
brew install redis
brew services start redis
```

### 2. Launch Go Backend
```bash
cd multiplayer-grid-backend
go run .
# Server will start on :8080 (connects to redis://localhost:6379/0)
```

### 3. Launch Next.js Frontend
```bash
cd multiplayer-grid-game
pnpm install
pnpm dev
# Frontend runs on http://localhost:3000
```

Open [http://localhost:3000](http://localhost:3000), enter your designation, and begin exploring the grid!

---

<div align="center">
  <p>Engineered with Go, Redis, Next.js, and Vercel.</p>
</div>
