'use client';
import React, { useRef, useState, useCallback } from 'react';
import type { StoreState } from '@/store/useStore';
import type { Point, SectionComponent } from '@/engine/types';
import { computeComponentProps } from '@/engine/geometry';

interface Props {
  store: StoreState;
  showGrid: boolean;
  viewBox: { x: number; y: number; w: number; h: number };
  setViewBox: (vb: { x: number; y: number; w: number; h: number }) => void;
  dimensionFontScale: number;
}

const GRID_SIZES = [10, 25, 50, 100, 250, 500, 1000];

function getGridSize(viewW: number): number {
  const target = viewW / 10;
  return GRID_SIZES.find(s => s >= target) ?? 1000;
}

export default function Canvas({ store, showGrid, viewBox, setViewBox, dimensionFontScale }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef<{ x: number; y: number; vbx: number; vby: number }>({ x: 0, y: 0, vbx: 0, vby: 0 });
  const [dragId, setDragId] = useState<string | null>(null);
  const dragStartRef = useRef<{ x: number; y: number; ox: number; oy: number }>({ x: 0, y: 0, ox: 0, oy: 0 });
  const [mouseWorld, setMouseWorld] = useState<Point>({ x: 0, y: 0 });

  // Convert screen coordinates to engineering world coordinates (Y-up)
  const svgToWorld = useCallback((clientX: number, clientY: number): Point => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    const ratioX = viewBox.w / rect.width;
    const ratioY = viewBox.h / rect.height;
    // SVG Y coordinate (before flip)
    const svgY = viewBox.y + (clientY - rect.top) * ratioY;
    return {
      x: viewBox.x + (clientX - rect.left) * ratioX,
      // Negate Y because we use scale(1,-1) transform - engineering Y is up
      y: -svgY,
    };
  }, [viewBox]);

  // Zoom
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 1.1 : 0.9;
    const world = svgToWorld(e.clientX, e.clientY);
    setViewBox({
      x: world.x - (world.x - viewBox.x) * factor,
      y: world.y - (world.y - viewBox.y) * factor,
      w: viewBox.w * factor,
      h: viewBox.h * factor,
    });
  }, [svgToWorld, viewBox, setViewBox]);

  // Pan
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button === 1 || (e.button === 0 && e.shiftKey)) {
      setIsPanning(true);
      panStartRef.current = { x: e.clientX, y: e.clientY, vbx: viewBox.x, vby: viewBox.y };
      e.preventDefault();
    } else if (e.button === 0 && (e.target as SVGElement).tagName === 'svg') {
      store.selectComponent(null);
    }
  }, [viewBox, store]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const world = svgToWorld(e.clientX, e.clientY);
    setMouseWorld(world);

    if (isPanning) {
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const dx = (e.clientX - panStartRef.current.x) * (viewBox.w / rect.width);
      const dy = (e.clientY - panStartRef.current.y) * (viewBox.h / rect.height);
      setViewBox({
        ...viewBox,
        x: panStartRef.current.vbx - dx,
        y: panStartRef.current.vby - dy,
      });
    }

    if (dragId) {
      const comp = store.project.components.find(c => c.id === dragId);
      if (comp && !comp.locked) {
        const dx = world.x - dragStartRef.current.x;
        const dy = world.y - dragStartRef.current.y;
        store.updateComponent(dragId, {
          position: {
            x: dragStartRef.current.ox + dx,
            y: dragStartRef.current.oy + dy,
          },
        });
      }
    }
  }, [isPanning, dragId, viewBox, svgToWorld, setViewBox, store]);

  const handleMouseUp = useCallback(() => {
    setIsPanning(false);
    setDragId(null);
  }, []);

  const startDrag = useCallback((id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const comp = store.project.components.find(c => c.id === id);
    if (!comp || comp.locked) return;
    store.selectComponent(id);
    const world = svgToWorld(e.clientX, e.clientY);
    dragStartRef.current = { x: world.x, y: world.y, ox: comp.position.x, oy: comp.position.y };
    setDragId(id);
  }, [store, svgToWorld]);

  const gridSize = getGridSize(viewBox.w);

  return (
    <div className="relative w-full h-full" style={{ background: '#0c1222' }}>
      <svg
        ref={svgRef}
        className="w-full h-full"
        viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        style={{ cursor: isPanning ? 'grabbing' : dragId ? 'move' : 'crosshair' }}
      >
        <defs>
          <pattern id="grid" width={gridSize} height={gridSize} patternUnits="userSpaceOnUse">
            <path d={`M ${gridSize} 0 L 0 0 0 ${gridSize}`} fill="none" stroke="rgba(148,163,184,0.07)" strokeWidth={viewBox.w * 0.001} />
          </pattern>
          <pattern id="grid-major" width={gridSize * 5} height={gridSize * 5} patternUnits="userSpaceOnUse">
            <path d={`M ${gridSize * 5} 0 L 0 0 0 ${gridSize * 5}`} fill="none" stroke="rgba(148,163,184,0.12)" strokeWidth={viewBox.w * 0.002} />
          </pattern>
        </defs>

        {/* Grid */}
        {showGrid && (
          <>
            <rect x={viewBox.x} y={viewBox.y} width={viewBox.w} height={viewBox.h} fill="url(#grid)" />
            <rect x={viewBox.x} y={viewBox.y} width={viewBox.w} height={viewBox.h} fill="url(#grid-major)" />
          </>
        )}

        {/* Axes */}
        <line x1={viewBox.x} y1={0} x2={viewBox.x + viewBox.w} y2={0} stroke="rgba(239,68,68,0.3)" strokeWidth={viewBox.w * 0.001} />
        <line x1={0} y1={viewBox.y} x2={0} y2={viewBox.y + viewBox.h} stroke="rgba(34,197,94,0.3)" strokeWidth={viewBox.w * 0.001} />

        {/* Y-axis flipped: in engineering, Y is up. We use SVG transform to flip. */}
        <g transform="scale(1, -1)">
          {/* Components */}
          {store.project.components.filter(c => c.visible).map(comp => (
            <ComponentRenderer
              key={comp.id}
              comp={comp}
              selected={store.selectedComponentId === comp.id}
              strokeWidth={viewBox.w * 0.002}
              fontScale={dimensionFontScale}
              onMouseDown={(e) => startDrag(comp.id, e)}
            />
          ))}

          {/* Centroid marker */}
          {store.properties && store.properties.area > 0 && (
            <CentroidMarker
              cx={store.properties.centroidX}
              cy={store.properties.centroidY}
              size={viewBox.w * 0.015}
              principalAngle={store.properties.principalAngle}
              showPrincipal={Math.abs(store.properties.Ixy) > 0.01}
              axisLen={viewBox.w * 0.12}
              strokeWidth={viewBox.w * 0.002}
            />
          )}
        </g>
      </svg>

      {/* Coordinate display */}
      <div className="absolute bottom-2 left-2 px-2 py-1 rounded text-[10px] font-mono" style={{ background: 'rgba(15,23,42,0.85)', color: 'var(--text-secondary)' }}>
        X: {mouseWorld.x.toFixed(1)} &nbsp; Y: {mouseWorld.y.toFixed(1)} &nbsp; {store.project.units}
      </div>

      {/* Grid size indicator */}
      {showGrid && (
        <div className="absolute bottom-2 right-2 px-2 py-1 rounded text-[10px] font-mono" style={{ background: 'rgba(15,23,42,0.85)', color: 'var(--text-muted)' }}>
          Grid: {gridSize} {store.project.units}
        </div>
      )}
    </div>
  );
}

function ComponentRenderer({ comp, selected, strokeWidth, fontScale, onMouseDown }: {
  comp: SectionComponent;
  selected: boolean;
  strokeWidth: number;
  fontScale: number;
  onMouseDown: (e: React.MouseEvent) => void;
}) {
  const props = computeComponentProps(comp);
  const outline = props.outline;
  const isSubtract = comp.operation === 'subtract';
  const isLocked = comp.locked;

  const fillColor = isSubtract ? 'rgba(239,68,68,0.15)' : 'rgba(59,130,246,0.15)';
  const strokeColor = selected
    ? '#fbbf24'
    : isLocked ? '#f59e0b' : isSubtract ? '#ef4444' : '#3b82f6';

  // For circles and ellipses, render as polygon from outline
  if (outline.length < 2) return null;

  const d = outline.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ') + ' Z';

  // Compute bounding box for dimension annotations
  const xs = outline.map(p => p.x);
  const ys = outline.map(p => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const dimOffset = strokeWidth * 10 * fontScale;
  const fontSize = strokeWidth * 6 * fontScale;

  return (
    <g onMouseDown={onMouseDown} style={{ cursor: 'move' }}>
      <path
        d={d}
        fill={fillColor}
        stroke={strokeColor}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
      />
      {selected && (
        <>
          <path
            d={d}
            fill="none"
            stroke="#fbbf24"
            strokeWidth={strokeWidth * 0.5}
            strokeDasharray={`${strokeWidth * 4} ${strokeWidth * 2}`}
          />
          {/* Dimension annotations */}
          {/* Width dimension (bottom) */}
          <line x1={minX} y1={minY - dimOffset} x2={maxX} y2={minY - dimOffset}
            stroke="#fbbf24" strokeWidth={strokeWidth * 0.3} />
          <line x1={minX} y1={minY - dimOffset * 0.6} x2={minX} y2={minY - dimOffset * 1.4}
            stroke="#fbbf24" strokeWidth={strokeWidth * 0.3} />
          <line x1={maxX} y1={minY - dimOffset * 0.6} x2={maxX} y2={minY - dimOffset * 1.4}
            stroke="#fbbf24" strokeWidth={strokeWidth * 0.3} />
          <text
            x={(minX + maxX) / 2}
            y={-(minY - dimOffset * 1.6)}
            fill="#fbbf24"
            fontSize={fontSize}
            textAnchor="middle"
            fontFamily="JetBrains Mono, monospace"
            fontWeight={500}
            transform={`scale(1,-1)`}
          >
            {(maxX - minX).toFixed(0)}
          </text>
          {/* Height dimension (right) */}
          <line x1={maxX + dimOffset} y1={minY} x2={maxX + dimOffset} y2={maxY}
            stroke="#fbbf24" strokeWidth={strokeWidth * 0.3} />
          <line x1={maxX + dimOffset * 0.6} y1={minY} x2={maxX + dimOffset * 1.4} y2={minY}
            stroke="#fbbf24" strokeWidth={strokeWidth * 0.3} />
          <line x1={maxX + dimOffset * 0.6} y1={maxY} x2={maxX + dimOffset * 1.4} y2={maxY}
            stroke="#fbbf24" strokeWidth={strokeWidth * 0.3} />
          <text
            x={maxX + dimOffset * 1.6}
            y={-((minY + maxY) / 2)}
            fill="#fbbf24"
            fontSize={fontSize}
            textAnchor="middle"
            fontFamily="JetBrains Mono, monospace"
            fontWeight={500}
            transform={`scale(1,-1)`}
          >
            {(maxY - minY).toFixed(0)}
          </text>
        </>
      )}
    </g>
  );
}

function CentroidMarker({ cx, cy, size, principalAngle, showPrincipal, axisLen, strokeWidth }: {
  cx: number;
  cy: number;
  size: number;
  principalAngle: number;
  showPrincipal: boolean;
  axisLen: number;
  strokeWidth: number;
}) {
  const rad = (principalAngle * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  return (
    <g>
      {/* Centroid crosshair */}
      <circle cx={cx} cy={cy} r={size} fill="none" stroke="#fbbf24" strokeWidth={strokeWidth} />
      <line x1={cx - size * 1.5} y1={cy} x2={cx + size * 1.5} y2={cy} stroke="#fbbf24" strokeWidth={strokeWidth * 0.7} />
      <line x1={cx} y1={cy - size * 1.5} x2={cx} y2={cy + size * 1.5} stroke="#fbbf24" strokeWidth={strokeWidth * 0.7} />

      {/* Principal axes */}
      {showPrincipal && (
        <>
          <line
            x1={cx - axisLen * cos}
            y1={cy - axisLen * sin}
            x2={cx + axisLen * cos}
            y2={cy + axisLen * sin}
            stroke="#f59e0b"
            strokeWidth={strokeWidth * 0.5}
            strokeDasharray={`${strokeWidth * 3} ${strokeWidth * 1.5}`}
          />
          <line
            x1={cx + axisLen * sin}
            y1={cy - axisLen * cos}
            x2={cx - axisLen * sin}
            y2={cy + axisLen * cos}
            stroke="#f97316"
            strokeWidth={strokeWidth * 0.5}
            strokeDasharray={`${strokeWidth * 3} ${strokeWidth * 1.5}`}
          />
        </>
      )}

      {/* C.G. label */}
      <text
        x={cx + size * 2}
        y={-cy + size * 2}
        fill="#fbbf24"
        fontSize={size * 1.5}
        transform={`scale(1,-1) translate(0, ${-2 * cy})`}
        fontFamily="Inter, sans-serif"
        fontWeight={600}
      >
        C.G.
      </text>
    </g>
  );
}
