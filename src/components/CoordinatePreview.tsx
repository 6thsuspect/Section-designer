'use client';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Point } from '@/engine/types';

/**
 * Interactive preview for the coordinate dialogs.
 *
 * Zoom (mouse wheel, anchored at the cursor), pan (drag the background), Fit
 * and Labels only change this preview's viewport/overlay state — the points
 * passed in are never modified.
 */
interface Props {
  points: Point[];
  /** Indices of selected points (highlighted). */
  selected?: Set<number>;
  /** Click on a node; `mode` mirrors the modifier keys used. */
  onSelectPoint?: (index: number, mode: 'single' | 'toggle' | 'range') => void;
  /** Click on empty preview space without dragging. */
  onClearSelection?: () => void;
  minHeight?: number;
}

type View = { x: number; y: number; w: number; h: number };

const ZOOM_STEP = 1.15;

function fitView(points: Point[]): View {
  if (points.length === 0) return { x: -50, y: -50, w: 100, h: 100 };
  const xs = points.map(p => p.x);
  const ys = points.map(p => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const w = maxX - minX || 100;
  const h = maxY - minY || 100;
  const pad = Math.max(w, h) * 0.12;
  // SVG space is Y-flipped (content drawn with scale(1,-1)), so top = −maxY.
  return { x: minX - pad, y: -maxY - pad, w: w + 2 * pad, h: h + 2 * pad };
}

function fmt(v: number): string {
  return Number(v.toFixed(4)).toString();
}

export default function CoordinatePreview({ points, selected, onSelectPoint, onClearSelection, minHeight = 260 }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [autoFit, setAutoFit] = useState(true);
  const [manualView, setManualView] = useState<View | null>(null);
  const [labels, setLabels] = useState(true);
  const [pixelWidth, setPixelWidth] = useState(300);
  const [panning, setPanning] = useState(false);
  const panRef = useRef<{ cx: number; cy: number; view: View; moved: boolean } | null>(null);

  const fitted = useMemo(() => fitView(points), [points]);
  const view = autoFit || !manualView ? fitted : manualView;
  const viewRef = useRef(view);
  useEffect(() => { viewRef.current = view; }, [view]);

  // Track rendered width so nodes/labels keep a constant on-screen size.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const update = () => setPixelWidth(svg.getBoundingClientRect().width || 300);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(svg);
    return () => observer.disconnect();
  }, []);

  /** Client (screen) → SVG user coordinates for the current viewBox. */
  const toSvg = useCallback((clientX: number, clientY: number): Point | null => {
    const svg = svgRef.current;
    const ctm = svg?.getScreenCTM();
    if (!svg || !ctm) return null;
    const p = svg.createSVGPoint();
    p.x = clientX;
    p.y = clientY;
    const q = p.matrixTransform(ctm.inverse());
    return { x: q.x, y: q.y };
  }, []);

  const zoomAt = useCallback((factor: number, anchor: Point | null) => {
    const v = viewRef.current;
    const a = anchor ?? { x: v.x + v.w / 2, y: v.y + v.h / 2 };
    const next: View = {
      x: a.x - (a.x - v.x) * factor,
      y: a.y - (a.y - v.y) * factor,
      w: v.w * factor,
      h: v.h * factor,
    };
    setManualView(next);
    setAutoFit(false);
  }, []);

  // Non-passive wheel listener so the page/dialog does not scroll.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      // Wheel up (deltaY < 0) zooms in, anchored at the cursor.
      zoomAt(e.deltaY < 0 ? 1 / ZOOM_STEP : ZOOM_STEP, toSvg(e.clientX, e.clientY));
    };
    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => svg.removeEventListener('wheel', onWheel);
  }, [toSvg, zoomAt]);

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0 && e.button !== 1) return;
    panRef.current = { cx: e.clientX, cy: e.clientY, view: viewRef.current, moved: false };
    svgRef.current?.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const pan = panRef.current;
    if (!pan) return;
    const dxPx = e.clientX - pan.cx;
    const dyPx = e.clientY - pan.cy;
    if (!pan.moved && Math.hypot(dxPx, dyPx) < 3) return;
    pan.moved = true;
    setPanning(true);
    const scale = svgRef.current?.getScreenCTM()?.a || 1; // px per SVG unit
    setManualView({ ...pan.view, x: pan.view.x - dxPx / scale, y: pan.view.y - dyPx / scale });
    setAutoFit(false);
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const pan = panRef.current;
    panRef.current = null;
    setPanning(false);
    if (svgRef.current?.hasPointerCapture(e.pointerId)) svgRef.current.releasePointerCapture(e.pointerId);
    if (pan && !pan.moved && e.target === svgRef.current) onClearSelection?.();
  };

  const unit = view.w / Math.max(pixelWidth, 1); // SVG units per screen pixel
  const nodeR = 3.5 * unit;
  const labelSize = 11 * unit;
  const zoomPct = Math.round((fitted.w / view.w) * 100);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-1 mb-1">
        <button
          type="button"
          className={`btn text-[10px] px-2 py-0.5 ${autoFit ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => { setAutoFit(true); setManualView(null); }}
          title="Fit In: fit the complete section in the preview (stays fitted while you edit until you zoom or pan)"
          aria-pressed={autoFit}
        >⤢ Fit</button>
        <button type="button" className="btn btn-ghost text-[10px] px-1.5 py-0.5" onClick={() => zoomAt(1 / ZOOM_STEP, null)} title="Zoom in">＋</button>
        <button type="button" className="btn btn-ghost text-[10px] px-1.5 py-0.5" onClick={() => zoomAt(ZOOM_STEP, null)} title="Zoom out">－</button>
        <button
          type="button"
          className={`btn text-[10px] px-2 py-0.5 ${labels ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => setLabels(l => !l)}
          title="Show/hide point labels"
          aria-pressed={labels}
        >🏷 Labels</button>
        <span className="ml-auto text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>{zoomPct}%</span>
      </div>
      <div className="flex-1 rounded overflow-hidden" style={{ background: '#0c1222', border: '1px solid var(--border)', minHeight }}>
        <svg
          ref={svgRef}
          viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
          className="w-full h-full block"
          style={{ minHeight, cursor: panning ? 'grabbing' : 'grab', touchAction: 'none' }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <g transform="scale(1,-1)">
            {/* Axes through the origin */}
            <line x1={view.x - view.w} y1={0} x2={view.x + 2 * view.w} y2={0} stroke="rgba(239,68,68,0.3)" strokeWidth={unit} />
            <line x1={0} y1={-(view.y - view.h)} x2={0} y2={-(view.y + 2 * view.h)} stroke="rgba(34,197,94,0.3)" strokeWidth={unit} />

            {points.length >= 3 && (
              <polygon
                points={points.map(p => `${p.x},${p.y}`).join(' ')}
                fill="rgba(59,130,246,0.2)"
                stroke="#3b82f6"
                strokeWidth={1.5 * unit}
                strokeLinejoin="round"
                pointerEvents="none"
              />
            )}
            {points.length === 2 && (
              <line x1={points[0].x} y1={points[0].y} x2={points[1].x} y2={points[1].y} stroke="#3b82f6" strokeWidth={1.5 * unit} />
            )}

            {points.map((p, i) => {
              const isSelected = selected?.has(i) ?? false;
              return (
                <g key={i}>
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r={isSelected ? nodeR * 1.5 : nodeR}
                    fill={isSelected ? '#22d3ee' : '#fbbf24'}
                    stroke={isSelected ? '#ffffff' : 'none'}
                    strokeWidth={unit}
                    style={{ cursor: onSelectPoint ? 'pointer' : undefined }}
                    onPointerDown={onSelectPoint ? e => {
                      e.stopPropagation();
                      onSelectPoint(i, e.shiftKey ? 'range' : (e.ctrlKey || e.metaKey) ? 'toggle' : 'single');
                    } : undefined}
                  >
                    <title>{`Point ${i + 1}: (${fmt(p.x)}, ${fmt(p.y)})`}</title>
                  </circle>
                  {(labels || isSelected) && (
                    <text
                      x={p.x + nodeR * 1.8}
                      y={-p.y - nodeR * 1.2}
                      fill={isSelected ? '#22d3ee' : '#fbbf24'}
                      fontSize={labelSize}
                      fontFamily="monospace"
                      transform="scale(1,-1)"
                      pointerEvents="none"
                    >
                      {labels ? `${i + 1}` : ''}{isSelected ? `${labels ? ' ' : ''}(${fmt(p.x)}, ${fmt(p.y)})` : ''}
                    </text>
                  )}
                </g>
              );
            })}
          </g>
        </svg>
      </div>
      <div className="text-[10px] mt-1 text-center" style={{ color: 'var(--text-muted)' }}>
        Scroll to zoom · drag to pan · preview only (geometry unchanged)
      </div>
    </div>
  );
}
