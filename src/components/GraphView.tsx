import React, { useEffect, useRef, useState, useCallback } from 'react';
import { ZoomIn, ZoomOut, Maximize2, Pause, Play, Compass, ExternalLink } from 'lucide-react';
import type { GraphLink, GraphNode, PageData } from '../types';

interface GraphViewProps {
  nodes: GraphNode[];
  links: GraphLink[];
  onSelectNode: (url: string) => void;
  pages: PageData[];
}

interface SimNode extends GraphNode {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
}

export const GraphView: React.FC<GraphViewProps> = ({
  nodes,
  links,
  onSelectNode,
  pages,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const simNodesRef = useRef<Map<string, SimNode>>(new Map());
  const [hoveredNode, setHoveredNode] = useState<SimNode | null>(null);
  const [isPhysicsRunning, setIsPhysicsRunning] = useState(true);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const selectedSimNodeRef = useRef<SimNode | null>(null);

  // Sync props into simulation nodes
  useEffect(() => {
    const currentSim = simNodesRef.current;
    const canvas = canvasRef.current;
    const width = canvas ? canvas.width : 800;
    const height = canvas ? canvas.height : 600;

    nodes.forEach((n, idx) => {
      if (!currentSim.has(n.id)) {
        // Position initial node in center, rest in radial ring
        const angle = (idx / Math.max(1, nodes.length)) * Math.PI * 2;
        const dist = n.depth === 0 ? 0 : 80 + n.depth * 60 + Math.random() * 40;
        currentSim.set(n.id, {
          ...n,
          x: width / 2 + Math.cos(angle) * dist,
          y: height / 2 + Math.sin(angle) * dist,
          vx: (Math.random() - 0.5) * 2,
          vy: (Math.random() - 0.5) * 2,
          radius: n.depth === 0 ? 14 : Math.max(7, Math.min(12, 6 + Math.log2(n.linksCount + 1) * 2)),
        });
      } else {
        const existing = currentSim.get(n.id)!;
        existing.statusCode = n.statusCode;
        existing.linksCount = n.linksCount;
        existing.title = n.title;
      }
    });

    // Cleanup stale nodes
    const nodeIds = new Set(nodes.map((n) => n.id));
    for (const [id] of currentSim.entries()) {
      if (!nodeIds.has(id)) {
        currentSim.delete(id);
      }
    }
  }, [nodes]);

  // Main Physics and Rendering Loop
  useEffect(() => {
    let animId: number;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const runSim = () => {
      const width = canvas.width;
      const height = canvas.height;
      const simNodes = Array.from(simNodesRef.current.values());

      if (isPhysicsRunning && simNodes.length > 0) {
        const kRepulsion = 1200;
        const kAttraction = 0.04;
        const damping = 0.88;
        const centerGravity = 0.015;
        const centerX = width / 2;
        const centerY = height / 2;

        // Repulsion between all node pairs
        for (let i = 0; i < simNodes.length; i++) {
          const n1 = simNodes[i];
          for (let j = i + 1; j < simNodes.length; j++) {
            const n2 = simNodes[j];
            const dx = n2.x - n1.x;
            const dy = n2.y - n1.y;
            const dist = Math.sqrt(dx * dx + dy * dy) || 1;
            if (dist < 350) {
              const force = (kRepulsion / (dist * dist)) * 0.8;
              const fx = (dx / dist) * force;
              const fy = (dy / dist) * force;
              n1.vx -= fx;
              n1.vy -= fy;
              n2.vx += fx;
              n2.vy += fy;
            }
          }

          // Center gravity
          n1.vx += (centerX - n1.x) * centerGravity;
          n1.vy += (centerY - n1.y) * centerGravity;
        }

        // Link springs attraction
        links.forEach((l) => {
          const s = simNodesRef.current.get(l.source);
          const t = simNodesRef.current.get(l.target);
          if (s && t) {
            const dx = t.x - s.x;
            const dy = t.y - s.y;
            const dist = Math.sqrt(dx * dx + dy * dy) || 1;
            const targetDist = 90;
            const force = (dist - targetDist) * kAttraction;
            const fx = (dx / dist) * force;
            const fy = (dy / dist) * force;
            s.vx += fx;
            s.vy += fy;
            t.vx -= fx;
            t.vy -= fy;
          }
        });

        // Apply velocity & damping
        simNodes.forEach((n) => {
          if (selectedSimNodeRef.current !== n) {
            n.vx *= damping;
            n.vy *= damping;
            n.x += n.vx;
            n.y += n.vy;
          }
        });
      }

      // RENDER
      ctx.clearRect(0, 0, width, height);
      ctx.save();
      ctx.translate(offset.x, offset.y);
      ctx.scale(scale, scale);

      // Draw Links
      links.forEach((l) => {
        const s = simNodesRef.current.get(l.source);
        const t = simNodesRef.current.get(l.target);
        if (s && t) {
          const isHighlighted = hoveredNode && (hoveredNode.id === s.id || hoveredNode.id === t.id);
          ctx.beginPath();
          ctx.moveTo(s.x, s.y);
          ctx.lineTo(t.x, t.y);
          ctx.strokeStyle = isHighlighted
            ? 'rgba(255, 85, 0, 0.75)'
            : 'rgba(255, 255, 255, 0.12)';
          ctx.lineWidth = isHighlighted ? 2.5 : 1;
          ctx.stroke();

          // Draw small arrow indicator halfway
          if (isHighlighted) {
            const mx = (s.x + t.x) / 2;
            const my = (s.y + t.y) / 2;
            ctx.beginPath();
            ctx.arc(mx, my, 2.5, 0, Math.PI * 2);
            ctx.fillStyle = 'var(--brave-orange)';
            ctx.fill();
          }
        }
      });

      // Draw Nodes
      simNodes.forEach((n) => {
        const isHovered = hoveredNode?.id === n.id;
        const isRoot = n.depth === 0;

        // Node fill color by status code
        let color = '#38bdf8'; // cyan
        if (isRoot) color = '#ff5500'; // Brave orange
        else if (n.statusCode >= 200 && n.statusCode < 300) color = '#10b981'; // green
        else if (n.statusCode >= 300 && n.statusCode < 400) color = '#00f0ff'; // cyan
        else if (n.statusCode >= 400 && n.statusCode < 500) color = '#f43f5e'; // red
        else if (n.statusCode >= 500 || n.statusCode === 0) color = '#a855f7'; // purple

        // Outer glow
        if (isHovered || isRoot) {
          ctx.beginPath();
          ctx.arc(n.x, n.y, n.radius + 6, 0, Math.PI * 2);
          ctx.fillStyle = isRoot ? 'rgba(255, 85, 0, 0.25)' : 'rgba(0, 240, 255, 0.25)';
          ctx.fill();
        }

        ctx.beginPath();
        ctx.arc(n.x, n.y, n.radius, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();

        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = isHovered ? 2 : 1;
        ctx.stroke();

        // Label if zoomed in or root or hovered
        if (scale > 0.85 || isRoot || isHovered) {
          ctx.font = isRoot ? 'bold 11px Outfit, sans-serif' : '10px Inter, sans-serif';
          ctx.fillStyle = '#f8fafc';
          ctx.textAlign = 'center';
          const label = n.title ? n.title.slice(0, 22) : n.url.replace(/^https?:\/\//, '').slice(0, 22);
          ctx.fillText(label, n.x, n.y + n.radius + 14);
        }
      });

      ctx.restore();
      animId = requestAnimationFrame(runSim);
    };

    animId = requestAnimationFrame(runSim);
    return () => cancelAnimationFrame(animId);
  }, [links, hoveredNode, isPhysicsRunning, scale, offset]);

  // Handle Resize
  useEffect(() => {
    const handleResize = () => {
      const canvas = canvasRef.current;
      if (!canvas || !canvas.parentElement) return;
      canvas.width = canvas.parentElement.clientWidth;
      canvas.height = canvas.parentElement.clientHeight || 580;
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Mouse coordinate translation
  const getCanvasCoords = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const rawX = e.clientX - rect.left;
    const rawY = e.clientY - rect.top;
    return {
      x: (rawX - offset.x) / scale,
      y: (rawY - offset.y) / scale,
    };
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const { x, y } = getCanvasCoords(e);
    // Check if clicked a node
    for (const node of simNodesRef.current.values()) {
      const dx = node.x - x;
      const dy = node.y - y;
      if (Math.sqrt(dx * dx + dy * dy) <= node.radius + 4) {
        selectedSimNodeRef.current = node;
        return;
      }
    }

    // Otherwise start canvas panning
    isDraggingRef.current = true;
    dragStartRef.current = { x: e.clientX - offset.x, y: e.clientY - offset.y };
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (selectedSimNodeRef.current) {
      const { x, y } = getCanvasCoords(e);
      selectedSimNodeRef.current.x = x;
      selectedSimNodeRef.current.y = y;
      return;
    }

    if (isDraggingRef.current) {
      setOffset({
        x: e.clientX - dragStartRef.current.x,
        y: e.clientY - dragStartRef.current.y,
      });
      return;
    }

    // Hover detection
    const { x, y } = getCanvasCoords(e);
    let found: SimNode | null = null;
    for (const node of simNodesRef.current.values()) {
      const dx = node.x - x;
      const dy = node.y - y;
      if (Math.sqrt(dx * dx + dy * dy) <= node.radius + 4) {
        found = node;
        break;
      }
    }
    setHoveredNode(found);
  };

  const handleMouseUp = () => {
    if (selectedSimNodeRef.current) {
      selectedSimNodeRef.current = null;
    }
    isDraggingRef.current = false;
  };

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const { x, y } = getCanvasCoords(e);
    for (const node of simNodesRef.current.values()) {
      const dx = node.x - x;
      const dy = node.y - y;
      if (Math.sqrt(dx * dx + dy * dy) <= node.radius + 4) {
        onSelectNode(node.url);
        return;
      }
    }
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
    const newScale = Math.max(0.2, Math.min(3, scale * zoomFactor));
    setScale(newScale);
  };

  const resetView = () => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
  };

  return (
    <div className="glass-panel graph-view-card" id="network-graph-panel">
      {/* Graph Toolbar */}
      <div className="graph-toolbar">
        <button
          className="graph-tool-btn"
          id="btn-graph-zoom-in"
          onClick={() => setScale((s) => Math.min(3, s * 1.2))}
          title="Zoom In"
        >
          <ZoomIn size={16} />
        </button>
        <button
          className="graph-tool-btn"
          id="btn-graph-zoom-out"
          onClick={() => setScale((s) => Math.max(0.2, s * 0.8))}
          title="Zoom Out"
        >
          <ZoomOut size={16} />
        </button>
        <button
          className="graph-tool-btn"
          id="btn-graph-reset"
          onClick={resetView}
          title="Reset View"
        >
          <Maximize2 size={16} />
        </button>
        <button
          className="graph-tool-btn"
          id="btn-graph-toggle-physics"
          onClick={() => setIsPhysicsRunning(!isPhysicsRunning)}
          title={isPhysicsRunning ? 'Pause Physics' : 'Resume Physics'}
        >
          {isPhysicsRunning ? <Pause size={16} /> : <Play size={16} />}
        </button>
      </div>

      {/* Legend */}
      <div className="graph-legend">
        <div className="legend-item">
          <span className="legend-dot" style={{ background: '#ff5500' }} />
          <span>Seed / Origin</span>
        </div>
        <div className="legend-item">
          <span className="legend-dot" style={{ background: '#10b981' }} />
          <span>200 OK</span>
        </div>
        <div className="legend-item">
          <span className="legend-dot" style={{ background: '#00f0ff' }} />
          <span>3xx Redirect</span>
        </div>
        <div className="legend-item">
          <span className="legend-dot" style={{ background: '#f43f5e' }} />
          <span>4xx Broken / Not Found</span>
        </div>
        <div className="legend-item">
          <span className="legend-dot" style={{ background: '#a855f7' }} />
          <span>5xx / Timeout</span>
        </div>
      </div>

      {nodes.length === 0 ? (
        <div className="empty-state">
          <Compass className="empty-state-icon" size={48} />
          <h3>Interactive Link Graph</h3>
          <p>Launch a crawl to watch pages and hyperlinks map out in real time!</p>
        </div>
      ) : (
        <canvas
          ref={canvasRef}
          className="graph-canvas"
          id="crawlix-canvas"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onClick={handleClick}
          onWheel={handleWheel}
        />
      )}

      {/* Hover Info Card */}
      {hoveredNode && (
        <div
          style={{
            position: 'absolute',
            bottom: '1rem',
            left: '1rem',
            background: 'rgba(15, 19, 29, 0.95)',
            border: '1px solid var(--bg-surface-border)',
            borderRadius: 'var(--radius-md)',
            padding: '0.75rem 1rem',
            maxWidth: '320px',
            boxShadow: 'var(--shadow-md)',
            zIndex: 20,
            pointerEvents: 'none',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.2rem' }}>
            <span
              className={`status-badge status-${hoveredNode.statusCode >= 200 && hoveredNode.statusCode < 300 ? '200' : '400'}`}
              style={{ fontSize: '0.65rem' }}
            >
              {hoveredNode.statusCode || 'PENDING'}
            </span>
            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Depth: {hoveredNode.depth}</span>
          </div>
          <div style={{ fontWeight: 700, fontSize: '0.85rem', color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {hoveredNode.title || 'Untitled Page'}
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--cyan-accent)', wordBreak: 'break-all', marginTop: '0.2rem' }}>
            {hoveredNode.url}
          </div>
          <div style={{ fontSize: '0.7rem', color: 'var(--brave-orange)', marginTop: '0.4rem', fontWeight: 600 }}>
            Click node to view full extracted page details
          </div>
        </div>
      )}
    </div>
  );
};
