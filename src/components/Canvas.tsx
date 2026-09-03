'use client';
import React, { useRef, useState, useCallback, useEffect } from 'react';
import type { StoreState } from '@/store/useStore';
import type { Point, SectionComponent } from '@/engine/types';
import { computeComponentProps, polygonInsideRect, polygonIntersectsRect } from '@/engine/geometry';

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

type SelectionRect = { x0: number; y0: number; x1: number; y1: number; mode: 'window' | 'crossing' } | null;

export default function Canvas({ store, showGrid, viewBox, setViewBox, dimensionFontScale }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef<{ x: number; y: number; vbx: number; vby: number }>({ x: 0, y: 0, vbx: 0, vby: 0 });
  const [dragId, setDragId] = useState<string | null>(null);
  const dragStartRef = useRef<{ x: number; y: number; ox: number; oy: number }>({ x: 0, y: 0, ox: 0, oy: 0 });
  const [mouseWorld, setMouseWorld] = useState<Point>({ x: 0, y: 0 });

  // Rectangular (AutoCAD-style) selection state
  const [selRect, setSelRect] = useState<SelectionRect>(null);
  const selStartRef = useRef<{ sx: number; sy: number; wx: number; wy: number } | null>(null);
  const selRectRef = useRef<SelectionRect>(null);

  // ─── Screen ↔ world transform ────────────────────────────────────────────
  // The SVG uses preserveAspectRatio="xMidYMid meet" (default): the viewBox is
  // scaled UNIFORMLY and letterboxed inside the element. The previous mapping
  // assumed independent x/y scales filling the whole rect, which introduced a
  // cursor offset whenever the canvas was not square. Compute the actual
  // uniform scale + centering offsets and use them everywhere.
  const getViewTransform = useCallback(() => {
    const svg = svgRef.current;
    if (!svg) return { scale: 1, offX: 0, offY: 0, left: 0, top: 0 };
    const rect = svg.getBoundingClientRect();
    const scale = rect.width > 0 && rect.height > 0
      ? Math.min(rect.width / viewBox.w, rect.height / viewBox.h)
      : 1;
    const offX = (rect.width - viewBox.w * scale) / 2;
    const offY = (rect.height - viewBox.h * scale) / 2;
    return { scale, offX, offY, left: rect.left, top: rect.top };
  }, [viewBox]);

  // Convert screen (client) coordinates to engineering world coordinates (Y-up)
  const svgToWorld = useCallback((clientX: number, clientY: number): Point => {
    const { scale, offX, offY, left, top } = getViewTransform();
    const sx = viewBox.x + (clientX - left - offX) / scale;
    const sy = viewBox.y + (clientY - top - offY) / scale;
    return {
      x: sx,
      // Negate Y because we use scale(1,-1) transform - engineering Y is up
      y: -sy,
    };
  }, [getViewTransform, viewBox]);

  // Non-passive wheel listener so preventDefault works while zooming
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const factor = e.deltaY > 0 ? 1.1 : 0.9;
      const world = svgToWorld(e.clientX, e.clientY);
      setViewBox({
        x: world.x - (world.x - viewBox.x) * factor,
        y: world.y - (world.y - viewBox.y) * factor,
        w: viewBox.w * factor,
        h: viewBox.h * factor,
      });
    };
    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => svg.removeEventListener('wheel', onWheel);
  }, [svgToWorld, viewBox, setViewBox]);

  // ─── Pointer interactions ────────────────────────────────────────────────
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button === 1 || (e.button === 0 && e.shiftKey)) {
      // Pan (middle button or Shift+left)
      setIsPanning(true);
      panStartRef.current = { x: e.clientX, y: e.clientY, vbx: viewBox.x, vby: viewBox.y };
      svgRef.current?.setPointerCapture(e.pointerId);
      e.preventDefault();
    } else if (e.button === 0 && (e.target as SVGElement).tagName === 'svg') {
      // Begin a potential rectangle selection on empty space.
      // A click without movement still deselects (existing behaviour);
      // dragging opens a window/crossing selection rectangle.
      const world = svgToWorld(e.clientX, e.clientY);
      selStartRef.current = { sx: e.clientX, sy: e.clientY, wx: world.x, wy: world.y };
      svgRef.current?.setPointerCapture(e.pointerId);
    }
  }, [viewBox, svgToWorld]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    const world = svgToWorld(e.clientX, e.clientY);
    setMouseWorld(world);

    if (isPanning) {
      const { scale } = getViewTransform();
      const dx = (e.clientX - panStartRef.current.x) / scale;
      const dy = (e.clientY - panStartRef.current.y) / scale;
      setViewBox({
        ...viewBox,
        x: panStartRef.current.vbx - dx,
        y: panStartRef.current.vby - dy,
      });
      return;
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
        }, { history: false });
      }
      return;
    }

    // Rectangle selection while dragging on empty space
    const start = selStartRef.current;
    if (start) {
      const movedPx = Math.hypot(e.clientX - start.sx, e.clientY - start.sy);
      if (movedPx > 3) {
        const mode: 'window' | 'crossing' = e.clientX >= start.sx ? 'window' : 'crossing';
        const rect: SelectionRect = {
          x0: start.wx, y0: start.wy, x1: world.x, y1: world.y, mode,
        };
        selRectRef.current = rect;
        setSelRect(rect);
      }
    }
  }, [isPanning, dragId, viewBox, svgToWorld, getViewTransform, setViewBox, store]);

  const finishPointer = useCallback((e: React.PointerEvent) => {
    if (svgRef.current?.hasPointerCapture(e.pointerId)) {
      svgRef.current.releasePointerCapture(e.pointerId);
    }
    setIsPanning(false);

    if (dragId) {
      setDragId(null);
    } else if (selStartRef.current) {
      const start = selStartRef.current;
      const rect = selRectRef.current;
      if (rect) {
        // Window: fully inside; Crossing: inside or touching (AutoCAD rules)
        const rx0 = Math.min(rect.x0, rect.x1), rx1 = Math.max(rect.x0, rect.x1);
        const ry0 = Math.min(rect.y0, rect.y1), ry1 = Math.max(rect.y0, rect.y1);
        const ids: string[] = [];
        for (const comp of store.project.components) {
          if (!comp.visible || comp.locked) continue;
          const outline = computeComponentProps(comp).outline;
          if (outline.length === 0) continue;
          const hit = rect.mode === 'window'
            ? polygonInsideRect(outline, rx0, ry0, rx1, ry1)
            : polygonIntersectsRect(outline, rx0, ry0, rx1, ry1);
          if (hit) ids.push(comp.id);
        }
        store.selectComponents(ids);
      } else {
        // Simple click on empty canvas — deselect (existing behaviour)
        store.selectComponent(null);
      }
      selStartRef.current = null;
      selRectRef.current = null;
      setSelRect(null);
    }
  }, [dragId, store]);

  // Escape cancels an in-progress rectangle selection
  useEffect(() => {
    if (!selRect) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        selStartRef.current = null;
        selRectRef.current = null;
        setSelRect(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selRect]);

  const startDrag = useCallback((id: string, e: React.PointerEvent) => {
    e.stopPropagation();
    const comp = store.project.components.find(c => c.id === id);
    if (!comp || comp.locked) return;
    store.selectComponent(id);
    // One undo entry per drag (moves during the drag skip history)
    store.pushUndoSnapshot();
    const world = svgToWorld(e.clientX, e.clientY);
    dragStartRef.current = { x: world.x, y: world.y, ox: comp.position.x, oy: comp.position.y };
    setDragId(id);
    // Capture the pointer so the drag keeps tracking outside the canvas
    svgRef.current?.setPointerCapture(e.pointerId);
  }, [store, svgToWorld]);

  const gridSize = getGridSize(viewBox.w);

  const selBox = selRect ? {
    x: Math.min(selRect.x0, selRect.x1),
    y: -Math.max(selRect.y0, selRect.y1), // world → svg (Y flip)
    w: Math.abs(selRect.x1 - selRect.x0),
    h: Math.abs(selRect.y1 - selRect.y0),
  } : null;

  return (
    <div className="relative w-full h-full" style={{ background: '#0c1222' }}>
      <svg
        ref={svgRef}
        className="w-full h-full"
        viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finishPointer}
        onPointerCancel={finishPointer}
        style={{ cursor: isPanning ? 'grabbing' : dragId ? 'move' : 'crosshair', touchAction: 'none' }}
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
              selected={store.selectedIds.includes(comp.id)}
              strokeWidth={viewBox.w * 0.002}
              fontScale={dimensionFontScale}
              onPointerDown={(e) => startDrag(comp.id, e)}
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

        {/* Rectangle selection overlay (drawn in svg screen space, outside the flip) */}
        {selBox && selRect && (
          <g pointerEvents="none">
            <rect
              x={selBox.x}
              y={selBox.y}
              width={selBox.w}
              height={selBox.h}
              fill={selRect.mode === 'window' ? 'rgba(59,130,246,0.10)' : 'rgba(34,197,94,0.10)'}
              stroke={selRect.mode === 'window' ? '#3b82f6' : '#22c55e'}
              strokeWidth={viewBox.w * 0.0015}
              strokeDasharray={selRect.mode === 'crossing' ? `${viewBox.w * 0.008} ${viewBox.w * 0.005}` : undefined}
            />
            <text
              x={selBox.x + selBox.w / 2}
              y={selBox.y - viewBox.w * 0.008}
              fill={selRect.mode === 'window' ? '#3b82f6' : '#22c55e'}
              fontSize={viewBox.w * 0.016}
              textAnchor="middle"
              fontFamily="JetBrains Mono, monospace"
            >
              {selRect.mode === 'window' ? 'WINDOW' : 'CROSSING'} · {selBox.w.toFixed(1)} × {selBox.h.toFixed(1)}
            </text>
          </g>
        )}
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

function ComponentRenderer({ comp, selected, strokeWidth, fontScale, onPointerDown }: {
  comp: SectionComponent;
  selected: boolean;
  strokeWidth: number;
  fontScale: number;
  onPointerDown: (e: React.PointerEvent) => void;
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
    <g onPointerDown={onPointerDown} style={{ cursor: 'move' }}>
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
