# Grid Game - Multiplayer Territory Control

## Architecture
- **Frontend**: Next.js 14 (App Router), React 18, TailwindCSS, `rough.js` for canvas rendering, and `framer-motion` for UI animations.
- **Backend**: Go WebSocket server with Redis for high-tick-rate concurrency control and cross-node pub/sub broadcasting.
- **State Engine**: Redis `SETNX` acts as an atomic lock ensuring that no two players can claim the same grid block at the exact same millisecond.

## Features
- **Procedural HSL Color Generation**: Supports infinite players with deterministic, unique colors based on string hashing of player handles (supports UTF-8 like Hindi characters).
- **Kinetic Mechanics**: 
  - Passive Stamina Regeneration loop forces strategic territory expansion.
  - Custom `useScramble` React hook for cyberpunk UI text effects.
  - "Water-drop" kinetic ripple animations trigger globally via WebSocket when a tile is captured.
- **Interactive Minimap**: Features a YouTube-style expand toggle. When expanded, the minimap covers the screen with a blurred background overlay and allows precise teleportation clicks. Hovering over the minimap sweeps claimed territories to reveal player identities.
- **Responsive Layout**: Designed purely for 100vh absolute positioning to prevent scrolling and ensure perfect canvas interaction.

## Deployment Notes
Requires Redis running on `localhost:6379`. The Go backend listens on `:8080`, which the frontend strictly expects at `ws://localhost:8080/ws`.
