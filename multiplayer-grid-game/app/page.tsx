'use client'

import { useEffect, useRef, useState, useMemo, useCallback } from 'react'
import { useGesture } from '@use-gesture/react'
import { motion, AnimatePresence } from 'framer-motion'
import rough from 'roughjs'
import { useGameSocket, GameBlock, GameEvent } from '../hooks/useGameSocket'
import { useScramble } from '../hooks/useScramble'

const TONE_COLORS: Record<string, string> = {
  charcoal: '#3a332b',
  graphite: '#5b554c',
  wash: '#c5b7a4',
  paper: '#dfd3c1',
  terracotta: '#b86d52',
};

function getPlayerColor(name: string): { hex: string, name: string } {
  let hash = 0;
  for (const char of name) {
    hash = char.charCodeAt(0) + ((hash << 5) - hash);
  }
  hash = Math.abs(hash);

  const hue = hash % 360;
  const sat = 20 + ((hash >> 8) % 41);
  const light = 30 + ((hash >> 16) % 36);

  const h = hue;
  const s = sat / 100;
  const l = light / 100;

  let c = (1 - Math.abs(2 * l - 1)) * s;
  let x = c * (1 - Math.abs((h / 60) % 2 - 1));
  let m = l - c/2;
  let r = 0, g = 0, b = 0;
  if (0 <= h && h < 60) { r = c; g = x; b = 0; }
  else if (60 <= h && h < 120) { r = x; g = c; b = 0; }
  else if (120 <= h && h < 180) { r = 0; g = c; b = x; }
  else if (180 <= h && h < 240) { r = 0; g = x; b = c; }
  else if (240 <= h && h < 300) { r = x; g = 0; b = c; }
  else if (300 <= h && h < 360) { r = c; g = 0; b = x; }
  
  r = Math.round((r + m) * 255);
  g = Math.round((g + m) * 255);
  b = Math.round((b + m) * 255);
  const hex = "#" + (1 << 24 | r << 16 | g << 8 | b).toString(16).slice(1);

  let adjective = "";
  if (sat > 45) adjective = "Vivid";
  else if (sat < 30) adjective = "Washed";
  else if (light < 40) adjective = "Deep";
  else if (light > 55) adjective = "Pale";
  else adjective = "Muted";

  let noun = "";
  if (hue < 15 || hue >= 345) noun = "Crimson";
  else if (hue < 45) noun = "Terracotta";
  else if (hue < 75) noun = "Ochre";
  else if (hue < 105) noun = "Olive";
  else if (hue < 165) noun = "Viridian";
  else if (hue < 195) noun = "Teal";
  else if (hue < 255) noun = "Cobalt";
  else if (hue < 285) noun = "Indigo";
  else if (hue < 315) noun = "Violet";
  else noun = "Magenta";

  return { hex, name: `${adjective} ${noun}` };
}

function resolveColor(tone: string) {
  if (tone.startsWith('#')) return tone;
  return TONE_COLORS[tone] || TONE_COLORS['charcoal'];
}

function IdentityModal({ onSetHandle }: { onSetHandle: (name: string) => void }) {
  const [input, setInput] = useState('');
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-md" style={{ backgroundColor: 'rgba(238, 229, 212, 0.85)' }}>
      <div className="vellum-panel w-96 p-8 border border-[#3a332b] shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-16 h-16 bg-[#b86d52] opacity-10 blur-xl transform translate-x-1/2 -translate-y-1/2 rounded-full" />
        <h2 className="text-2xl font-bold mb-6 tracking-tight leading-none">[ ENTER<br/>DESIGNATION ]</h2>
        <form onSubmit={e => { e.preventDefault(); if (input.trim()) onSetHandle(input.trim().substring(0, 15).toUpperCase()); }}>
          <input 
            type="text" 
            autoFocus
            className="w-full bg-transparent border-b-2 border-[#3a332b] p-2 text-xl font-mono focus:outline-none focus:border-[#b86d52] uppercase placeholder-opacity-40"
            placeholder="GHOST_OP"
            value={input}
            onChange={e => setInput(e.target.value)}
            maxLength={15}
          />
          <div className="flex justify-between mt-8 text-xs text-[#82786b] font-mono tracking-widest">
            <span>15 CHAR MAX</span>
            <button type="submit" className="hover:text-[#b86d52] transition-colors">[ INITIALIZE ]</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function GameCanvas({ 
  blocks, 
  events,
  onCapture, 
  cameraOffset,
  onHoverUpdate,
  playerName
}: { 
  blocks: GameBlock[], 
  events: GameEvent[],
  onCapture: (x: number, y: number, adjacent: boolean) => void, 
  cameraOffset: React.MutableRefObject<{x: number, y: number, zoom: number}>,
  onHoverUpdate: (x: number, y: number) => void,
  playerName: string
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const blocksRef = useRef(blocks);
  useEffect(() => { blocksRef.current = blocks; }, [blocks]);

  const hoverCoordRef = useRef<{x: number, y: number} | null>(null);
  const minimapHoverRef = useRef<{name: string, mx: number, my: number} | null>(null);
  const mapExpandedRef = useRef(false);
  const [mapExpanded, setMapExpanded] = useState(false);
  const isAnimatingRef = useRef(false);
  const isDraggingRef = useRef(false);
  const ripplesRef = useRef<{x: number, y: number, r: number, max: number, start: number}[]>([]);

  const lastEventCountRef = useRef(events.length);
  useEffect(() => {
    if (events.length > lastEventCountRef.current) {
      const newEvents = events.slice(0, events.length - lastEventCountRef.current);
      newEvents.forEach(e => {
         const match = e.message.match(/CAPTURED (-?\d+) : (-?\d+)/);
         if (match) {
            const x = parseInt(match[1]);
            const y = parseInt(match[2]);
            ripplesRef.current.push({ x, y, r: 0, max: 120, start: Date.now() });
         }
      });
    }
    lastEventCountRef.current = events.length;
  }, [events]);

  const isAdjacent = (gx: number, gy: number) => {
    const owned = blocksRef.current.filter(b => b.owner === playerName && b.status === 'confirmed');
    if (owned.length === 0) return true;
    return owned.some(b => Math.abs(b.x - gx) <= 1 && Math.abs(b.y - gy) <= 1 && !(b.x === gx && b.y === gy));
  }

  const bind = useGesture({
    onDrag: ({ delta: [dx, dy], movement: [mx, my], last }) => {
      if (mapExpandedRef.current) return;
      cameraOffset.current.x += dx;
      cameraOffset.current.y += dy;
      
      if (Math.abs(mx) > 3 || Math.abs(my) > 3) {
        isDraggingRef.current = true;
      }
      
      if (last) {
        setTimeout(() => { isDraggingRef.current = false; }, 50);
      }
    },
    onWheel: ({ delta: [_, dy], event }) => {
      if (mapExpandedRef.current) return;
      const zoomSensitivity = 0.005;
      const prevZoom = cameraOffset.current.zoom;
      let newZoom = prevZoom * Math.exp(-dy * zoomSensitivity);
      newZoom = Math.max(0.1, Math.min(newZoom, 5));
      cameraOffset.current.zoom = newZoom;
    }
  }, {
    wheel: { eventOptions: { passive: false } }
  });

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    
    const handleWheel = (e: WheelEvent) => e.preventDefault();
    canvas.addEventListener('wheel', handleWheel, { passive: false });
    
    const context = canvas.getContext('2d')
    if (!context) return
    const rc = rough.canvas(canvas);
    let frame = 0

    const draw = (time: number) => {
      const rect = canvas.getBoundingClientRect()
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const width = Math.max(1, Math.floor(rect.width * dpr))
      const height = Math.max(1, Math.floor(rect.height * dpr))
      
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width
        canvas.height = height
      }
      
      context.setTransform(dpr, 0, 0, dpr, 0, 0)
      const w = rect.width
      const h = rect.height
      context.clearRect(0, 0, w, h)

      context.fillStyle = '#eee5d4'
      context.fillRect(0, 0, w, h)
      
      const zoom = cameraOffset.current.zoom;
      const baseGrid = Math.max(34, Math.min(56, w / 25));
      const grid = baseGrid * zoom;
      const offX = cameraOffset.current.x % grid;
      const offY = cameraOffset.current.y % grid;

      context.strokeStyle = 'rgba(58, 51, 43, 0.22)'
      context.lineWidth = 1
      for (let x = offX; x <= w; x += grid) {
        context.beginPath(); context.moveTo(x + 0.5, 0); context.lineTo(x + 0.5, h); context.stroke()
      }
      for (let y = offY; y <= h; y += grid) {
        context.beginPath(); context.moveTo(0, y + 0.5); context.lineTo(w, y + 0.5); context.stroke()
      }

      context.strokeStyle = 'rgba(58, 51, 43, 0.08)'
      for (let x = offX + grid / 2; x <= w; x += grid) { context.beginPath(); context.moveTo(x, 0); context.lineTo(x, h); context.stroke() }
      for (let y = offY + grid / 2; y <= h; y += grid) { context.beginPath(); context.moveTo(0, y); context.lineTo(w, y); context.stroke() }

      // Draw Blocks
      const currentBlocks = blocksRef.current;
      currentBlocks.forEach(block => {
        const px = block.x * grid + cameraOffset.current.x;
        const py = block.y * grid + cameraOffset.current.y;
        
        if (px + grid > 0 && px < w && py + grid > 0 && py < h) {
           const color = resolveColor(block.tone);
           const isPending = block.status === 'pending';
           rc.rectangle(px, py, grid, grid, {
             fill: color,
             stroke: '#3a332b',
             fillStyle: 'hachure',
             fillWeight: isPending ? 0.5 : 1,
             strokeWidth: isPending ? 0.5 : 1,
             roughness: 1.5,
           });
        }
      });

      // Draw Ripples
      const now = Date.now();
      ripplesRef.current = ripplesRef.current.filter(rip => {
        const elapsed = now - rip.start;
        const progress = elapsed / 1000;
        if (progress > 1) return false;
        
        rip.r = progress * rip.max * zoom;
        const alpha = 1 - Math.pow(progress, 2);
        
        const px = rip.x * grid + cameraOffset.current.x + grid / 2;
        const py = rip.y * grid + cameraOffset.current.y + grid / 2;
        
        context.strokeStyle = `rgba(184, 109, 82, ${alpha})`;
        context.lineWidth = 1.5;
        context.beginPath();
        context.arc(px, py, rip.r, 0, Math.PI * 2);
        context.stroke();
        return true;
      });

      // Hover Interaction
      const hoverCoord = hoverCoordRef.current;
      if (hoverCoord && !isDraggingRef.current && !mapExpandedRef.current) {
        const {x: hx, y: hy} = hoverCoord;
        const px = hx * grid + cameraOffset.current.x;
        const py = hy * grid + cameraOffset.current.y;
        const cx = px + grid / 2;
        const cy = py + grid / 2;

        if (isAdjacent(hx, hy)) {
          const pulse = 0.5 + Math.sin(time / 200) * 0.5
          const size = grid / 3 + pulse * 4;
          context.strokeStyle = `rgba(184,109,82,${0.55 + pulse * 0.3})`
          context.lineWidth = 1.2
          context.beginPath(); 
          context.moveTo(cx - size, cy); context.lineTo(cx - 5, cy); 
          context.moveTo(cx + 5, cy); context.lineTo(cx + size, cy); 
          context.moveTo(cx, cy - size); context.lineTo(cx, cy - 5); 
          context.moveTo(cx, cy + 5); context.lineTo(cx, cy + size); 
          context.stroke()
          context.strokeRect(cx - 7, cy - 7, 14, 14)
        } else {
           context.fillStyle = 'rgba(58,51,43,0.1)'
           context.fillRect(px, py, grid, grid);
        }
      }

      // Minimap Widget
      const isExpanded = mapExpandedRef.current;
      
      if (isExpanded) {
        // Blur background by overlaying a semi-transparent layer
        context.fillStyle = 'rgba(238, 229, 212, 0.85)';
        context.fillRect(0, 0, w, h);
      }
      
      const heatW = isExpanded ? w * 0.8 : 156;
      const heatH = isExpanded ? h * 0.8 : 120;
      const heatX = isExpanded ? w * 0.1 : w - 190;
      const heatY = isExpanded ? h * 0.1 : h - 164;
      
      context.fillStyle = isExpanded ? 'rgba(241,232,216,1)' : 'rgba(241,232,216,0.92)'; 
      context.fillRect(heatX, heatY, heatW, heatH)
      context.strokeStyle = 'rgba(58,51,43,0.46)'; context.strokeRect(heatX, heatY, heatW, heatH)
      context.save(); context.beginPath(); context.rect(heatX, heatY, heatW, heatH); context.clip()
      
      const gridSpacing = isExpanded ? (Math.min(heatW, heatH) / 30) : 8;
      for (let x = heatX + gridSpacing; x < heatX + heatW; x += gridSpacing) { context.strokeStyle = 'rgba(58,51,43,0.12)'; context.beginPath(); context.moveTo(x, heatY); context.lineTo(x, heatY + heatH); context.stroke() }
      for (let y = heatY + gridSpacing; y < heatY + heatH; y += gridSpacing) { context.beginPath(); context.moveTo(heatX, y); context.lineTo(heatX + heatW, y); context.stroke() }
      
      currentBlocks.forEach(block => {
        const normX = (block.x + 2500) / 5000;
        const normY = (block.y + 2500) / 5000;
        if (normX >= 0 && normX <= 1 && normY >= 0 && normY <= 1) {
            const bx = heatX + normX * heatW;
            const by = heatY + normY * heatH;
            context.fillStyle = resolveColor(block.tone);
            const pSize = isExpanded ? 4 : 2;
            context.fillRect(bx - pSize/2, by - pSize/2, pSize, pSize);
        }
      });
      
      const viewPropX = (-cameraOffset.current.x / grid + 2500) / 5000;
      const viewPropY = (-cameraOffset.current.y / grid + 2500) / 5000;
      const viewW = (w / grid) / 5000 * heatW;
      const viewH = (h / grid) / 5000 * heatH;
      context.strokeStyle = 'rgba(184,109,82,0.8)';
      context.lineWidth = isExpanded ? 2 : 1;
      context.strokeRect(heatX + viewPropX * heatW, heatY + viewPropY * heatH, Math.max(2, viewW), Math.max(2, viewH));

      context.restore()
      context.fillStyle = '#3a332b'; context.font = isExpanded ? '14px Courier New' : '10px Courier New'; 
      context.fillText(isExpanded ? 'SATELLITE VIEW' : 'ACTIVITY / LIVE', heatX + 9, heatY + (isExpanded ? 20 : 15))

      // Draw minimap tooltip if hovering over a block
      if (minimapHoverRef.current) {
        const { name, mx, my } = minimapHoverRef.current;
        context.fillStyle = 'rgba(58,51,43,0.95)';
        context.font = '12px Courier New';
        const textWidth = context.measureText(name).width;
        context.fillRect(mx + 10, my - 24, textWidth + 16, 22);
        context.fillStyle = '#f3eadc';
        context.fillText(name, mx + 18, my - 8);
      }

      frame = requestAnimationFrame(draw)
    }
    frame = requestAnimationFrame(draw)
    return () => {
      cancelAnimationFrame(frame);
      canvas.removeEventListener('wheel', handleWheel);
    }
  }, [playerName])

  const handlePointerMove = (e: React.PointerEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;
    const baseGrid = Math.max(34, Math.min(56, w / 25));
    const grid = baseGrid * cameraOffset.current.zoom;
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    
    const isExpanded = mapExpandedRef.current;
    const heatW = isExpanded ? w * 0.8 : 156;
    const heatH = isExpanded ? h * 0.8 : 120;
    const heatX = isExpanded ? w * 0.1 : w - 190;
    const heatY = isExpanded ? h * 0.1 : h - 164;
    
    if (mx >= heatX && mx <= heatX + heatW && my >= heatY && my <= heatY + heatH) {
      const propX = (mx - heatX) / heatW;
      const propY = (my - heatY) / heatH;
      const targetGridX = Math.floor((propX * 5000) - 2500);
      const targetGridY = Math.floor((propY * 5000) - 2500);
      
      const radius = isExpanded ? 10 : 30; 
      const found = blocksRef.current.find(b => Math.abs(b.x - targetGridX) < radius && Math.abs(b.y - targetGridY) < radius);
      if (found) {
        minimapHoverRef.current = { name: found.owner, mx, my };
      } else {
        minimapHoverRef.current = null;
      }
      return;
    } else {
      minimapHoverRef.current = null;
    }
    
    if (isExpanded) return;

    const gx = Math.floor((mx - cameraOffset.current.x) / grid);
    const gy = Math.floor((my - cameraOffset.current.y) / grid);
    
    if (!hoverCoordRef.current || hoverCoordRef.current.x !== gx || hoverCoordRef.current.y !== gy) {
        hoverCoordRef.current = {x: gx, y: gy};
        onHoverUpdate(gx, gy);
    }
  };

  const handlePointerLeave = () => {
    hoverCoordRef.current = null;
    minimapHoverRef.current = null;
  };

  const handleClick = (e: React.MouseEvent) => {
    if (isDraggingRef.current) return;

    const rect = canvasRef.current!.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const w = rect.width;
    const h = rect.height;

    const isExpanded = mapExpandedRef.current;
    const heatW = isExpanded ? w * 0.8 : 156;
    const heatH = isExpanded ? h * 0.8 : 120;
    const heatX = isExpanded ? w * 0.1 : w - 190;
    const heatY = isExpanded ? h * 0.1 : h - 164;
    
    if (mx >= heatX && mx <= heatX + heatW && my >= heatY && my <= heatY + heatH) {
      if (isAnimatingRef.current) return;
      isAnimatingRef.current = true;
      const propX = (mx - heatX) / heatW;
      const propY = (my - heatY) / heatH;
      
      const baseGrid = Math.max(34, Math.min(56, w / 25));
      const grid = baseGrid * cameraOffset.current.zoom;
      
      const targetGridX = (propX * 5000) - 2500;
      const targetGridY = (propY * 5000) - 2500;
      const targetX = -(targetGridX * grid) + w / 2;
      const targetY = -(targetGridY * grid) + h / 2;
      
      const panStep = () => {
         cameraOffset.current.x += (targetX - cameraOffset.current.x) * 0.1;
         cameraOffset.current.y += (targetY - cameraOffset.current.y) * 0.1;
         if (Math.abs(targetX - cameraOffset.current.x) > 1 || Math.abs(targetY - cameraOffset.current.y) > 1) {
            requestAnimationFrame(panStep);
         } else {
            cameraOffset.current.x = targetX;
            cameraOffset.current.y = targetY;
            isAnimatingRef.current = false;
         }
      }
      requestAnimationFrame(panStep);
      
      if (isExpanded) {
        setMapExpanded(false);
      }
      return;
    }

    if (isExpanded) return;

    if (!hoverCoordRef.current) return;
    const {x, y} = hoverCoordRef.current;
    const existing = blocksRef.current.find(b => b.x === x && b.y === y);
    if (existing) return;

    const adj = isAdjacent(x, y);
    onCapture(x, y, adj);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === 'INPUT') return;
      
      const panSpeed = 40;
      switch(e.key) {
        case 'ArrowUp':
        case 'w':
        case 'W':
          cameraOffset.current.y += panSpeed;
          break;
        case 'ArrowDown':
        case 's':
        case 'S':
          cameraOffset.current.y -= panSpeed;
          break;
        case 'ArrowLeft':
        case 'a':
        case 'A':
          cameraOffset.current.x += panSpeed;
          break;
        case 'ArrowRight':
        case 'd':
        case 'D':
          cameraOffset.current.x -= panSpeed;
          break;
        case 'Escape':
        case ' ':
          cameraOffset.current.x = 0;
          cameraOffset.current.y = 0;
          cameraOffset.current.zoom = 1;
          break;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    mapExpandedRef.current = mapExpanded;
  }, [mapExpanded]);

  return (
    <div {...bind()} style={{ flex: 1, touchAction: 'none', position: 'relative', overflow: 'hidden', minHeight: 0 }}>
      <canvas 
        ref={canvasRef} 
        className="game-canvas" 
        aria-label="Live multiplayer territory grid" 
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
        onClick={handleClick}
        style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}
      />
      
      <div 
        className="absolute z-10 pointer-events-auto"
        style={{
           right: mapExpanded ? '10%' : '190px',
           top: mapExpanded ? '10%' : 'auto',
           bottom: mapExpanded ? 'auto' : '164px',
           transform: 'translate(50%, -50%)',
        }}
      >
        <button 
          onClick={(e) => { e.stopPropagation(); setMapExpanded(!mapExpanded); }}
          className="bg-[#eee5d4] text-[#3a332b] p-1 border border-[#3a332b] hover:bg-[#b86d52] hover:text-[#f3eadc] transition-colors shadow-md"
          title="Toggle Fullscreen Map"
        >
          {mapExpanded ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square">
              <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"/>
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square">
              <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>
            </svg>
          )}
        </button>
      </div>
    </div>
  )
}

function Leaderboard({ blocks }: { blocks: GameBlock[] }) {
  const players = useMemo(() => {
    const counts: Record<string, { blocks: number, tone: string }> = {};
    blocks.forEach(b => {
      if (b.status === 'confirmed') {
        if (!counts[b.owner]) counts[b.owner] = { blocks: 0, tone: b.tone };
        counts[b.owner].blocks++;
      }
    });
    return Object.entries(counts)
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.blocks - a.blocks)
      .slice(0, 5);
  }, [blocks]);

  const displayPlayers = players.length > 0 ? players : [
    { name: 'WAITING', blocks: 0, tone: 'charcoal' }
  ];

  return <section className="vellum-panel leaderboard-panel">
    <div className="panel-kicker"><span>01 / FIELD STUDY</span><span>LIVE</span></div>
    <h2>Brutalist<br />Leaderboard</h2>
    <div className="sculpture" aria-label="Top players shown as block sculpture">
      {displayPlayers.map((player, index) => <div className="sculpture-column" key={player.name}>
        <div className="sculpture-block" style={{ height: `${52 + player.blocks * 2.5}px`, backgroundColor: resolveColor(player.tone) }}><span>{player.blocks}</span></div>
        <span className="sculpture-label">{index + 1}</span><span className="player-name uppercase">{player.name}</span>
      </div>)}
    </div>
    <div className="baseline" />
    <p className="annotation">BLOCK COUNT / CLAIMED TERRITORY</p>
  </section>
}

function Stamina({ stamina }: { stamina: number }) {
  return <section className="vellum-panel stamina-panel">
    <div className="panel-kicker"><span>02 / MATERIAL STATE</span><span>REGENERATING</span></div>
    <h2>Liquid Ink<br />Stamina</h2>
    <div className="stamina-track">
      <motion.div 
        className="stamina-fill" 
        animate={{ width: `${Math.max(0, Math.min(100, stamina))}%` }}
        transition={{ duration: 0.4, ease: "easeOut" }}
      >
        <span /><span /><span />
      </motion.div>
    </div>
    <div className="stamina-readout"><strong>{Math.floor(stamina)}%</strong><span>{Math.floor(stamina / 10)} / 10 ACTIONS</span></div>
    <div className="rule-label"><span>REPLENISH RATE</span><span>+2/s</span></div>
  </section>
}

export default function Page() {
  const { blocks, events, sendCapture, connectionStatus } = useGameSocket()
  const [stamina, setStamina] = useState(100)
  const cameraOffset = useRef({ x: 0, y: 0, zoom: 1 })
  const [playerName, setPlayerName] = useState<string | null>(null);
  const [playerColor, setPlayerColor] = useState<{hex: string, name: string} | null>(null);
  const [hoverCoord, setHoverCoord] = useState({x: 0, y: 0});
  
  const scrambleCursor = useScramble(`CURSOR // ${String(hoverCoord.x).padStart(3, '0')} : ${String(hoverCoord.y).padStart(3, '0')}`, 15);
  const [sectorLabel, setSectorLabel] = useState('SECTOR 0');
  const scrambleSector = useScramble(sectorLabel, 40);
  const [zoomLabel, setZoomLabel] = useState('ZOOM 1.00×');
  
  useEffect(() => {
    const interval = setInterval(() => {
      const absX = Math.abs(cameraOffset.current.x);
      const absY = Math.abs(cameraOffset.current.y);
      const sectorId = Math.floor((absX + absY) / 500);
      setSectorLabel(`SECTOR ${sectorId}`);
      setZoomLabel(`ZOOM ${cameraOffset.current.zoom.toFixed(2)}×`);
    }, 200);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem('grid_player_name');
    if (saved) handleSetHandle(saved);
  }, []);

  useEffect(() => {
    if (!playerName) return;
    const interval = setInterval(() => {
      setStamina(s => Math.min(100, s + 1));
    }, 500);
    return () => clearInterval(interval);
  }, [playerName]);

  const handleCapture = (x: number, y: number, adjacent: boolean) => {
    if (!playerName || !playerColor) return;
    const cost = adjacent ? 10 : 20;
    if (stamina < cost) return;
    setStamina(s => s - cost);
    sendCapture(x, y, playerName, playerColor.hex);
  }

  const handleSetHandle = (name: string) => {
    localStorage.setItem('grid_player_name', name);
    setPlayerName(name);
    setPlayerColor(getPlayerColor(name));
  };

  return <main className="game-shell">
    {!playerName && <IdentityModal onSetHandle={handleSetHandle} />}
    <header className="topbar">
      <div className="brand-lockup"><span className="brand-mark">▦</span><span>CLAIM / 05</span><span className="brand-divider" /><span className="brand-subtitle">MULTIPLAYER GRID STUDY</span></div>
      <div className="top-status"><span className="status-dot" />{connectionStatus.toUpperCase()}</div>
    </header>
    <div className="game-layout">
      <section className="board-wrap">
        <div className="board-meta"><span>{scrambleSector}</span><span>{zoomLabel}</span></div>
        <GameCanvas 
          blocks={blocks} 
          events={events}
          onCapture={handleCapture} 
          cameraOffset={cameraOffset} 
          onHoverUpdate={(x, y) => setHoverCoord({x, y})}
          playerName={playerName || ''}
        />
        <div className="cursor-readout">{scrambleCursor} <span>•</span> PAN / ZOOM ENABLED</div>
      </section>
      <aside className="sidebar">
        <div className="paper-clip" aria-hidden="true" />
        <div className="sidebar-title"><span>ARCHIVE / 09.06.26</span><strong>FIELD<br />NOTES</strong></div>
        <Leaderboard blocks={blocks} />
        <Stamina stamina={stamina} />
        <section className="vellum-panel activity-panel">
          <div className="panel-kicker"><span>03 / TRANSMISSION</span><span>NOW</span></div>
          <div className="event-list">
            <AnimatePresence>
              {events.length === 0 && <div className="pending">[ WAITING FOR DATA ]</div>}
              {events.map((event) => (
                <motion.div 
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="event-row" 
                  key={event.id}
                >
                  <span>{new Date(event.timestamp).getSeconds().toString().padStart(2, '0')}</span>
                  <p>{event.message}</p>
                  <i>●</i>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </section>
        <div className="sidebar-footer">
          <span>IDENTITY: {playerName || '???'}</span>
          {playerColor && (
             <span className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full border border-black/20" style={{ backgroundColor: playerColor.hex }}></span>
                {playerColor.name.toUpperCase()}
             </span>
          )}
        </div>
      </aside>
    </div>
  </main>
}
