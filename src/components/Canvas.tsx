'use client';
import React, { useRef, useState, useCallback, useEffect, useMemo } from 'react';
import type { StoreState } from '@/store/useStore';
import type { Point, SectionComponent } from '@/engine/types';
import { computeComponentProps } from '@/engine/geometry';
import { pickComponent, selectByRect } from '@/engine/selection';

/** Pick-box half size in screen pixels for click selection near edges/nodes. */
const PICKBOX_PX = 5;
/** Movement (px) before a press on empty space becomes a selection window. */
const DRAG_THRESHOLD_PX = 3;
import { combinedVoids, componentRenderRings } from '@/engine/combine';
import { findObjectSnap, linkedIds, SNAP_LABELS, type SnapResult } from '@/engine/osnap';

/** Snap aperture in screen pixels (AutoCAD APERTURE default ≈ 10). */
const SNAP_APERTURE_PX = 12;
/** Object-snap tracking: X/Y alignment aperture (px). */
const GUIDE_ALIGN_PX = 8;
/** Max length of perpendicular face guides (px). */
const GUIDE_PERP_PX = 220;
/** How close the cursor must be to the selected object to show hover guides (px). */
const GUIDE_HOVER_APERTURE_PX = 14;

import { computeGuides, findAlignment, guideFeatures, hoverSource, referenceFeatures, translateFeatures, type Guide, type GuideFeatures, type RefFeatures } from '@/engine/guides';
import { resolveCanvasPalette, DEFAULT_CANVAS_THEME, type CanvasPalette } from '@/engine/canvasTheme';

const DEFAULT_PALETTE = resolveCanvasPalette(DEFAULT_CANVAS_THEME);

interface Props {
  store: StoreState;
  showGrid: boolean;
  /** Object Snap enabled (OSNAP / F3). */
  osnap: boolean;
  viewBox: { x: number; y: number; w: number; h: number };
  setViewBox: React.Dispatch<React.SetStateAction<{ x: number; y: number; w: number; h: number }>>;
  dimensionFontScale: number;
  /** Canvas colour theme (presentation only). */
  palette?: CanvasPalette;
}

const GRID_SIZES = [10, 25, 50, 100, 250, 500, 1000];

function getGridSize(viewW: number): number {
  const target = viewW / 10;
  return GRID_SIZES.find(s => s >= target) ?? 1000;
}

type SelectionRect = { x0: number; y0: number; x1: number; y1: number; mode: 'window' | 'crossing'; additive: boolean } | null;

export default function Canvas({ store, showGrid, osnap, viewBox, setViewBox, dimensionFontScale, palette: paletteProp }: Props) {
  const palette = paletteProp ?? DEFAULT_PALETTE;
  const svgRef = useRef<SVGSVGElement>(null);
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef<{ x: number; y: number; vbx: number; vby: number }>({ x: 0, y: 0, vbx: 0, vby: 0 });
  const [dragId, setDragId] = useState<string | null>(null);
  const dragStartRef = useRef<{ x: number; y: number; ox: number; oy: number; others: { id: string; x: number; y: number }[] }>({ x: 0, y: 0, ox: 0, oy: 0, others: [] });
  const [mouseWorld, setMouseWorld] = useState<Point>({ x: 0, y: 0 });
  // Active snap plus world-units-per-pixel at detection time (for glyph sizing).
  const [snap, setSnap] = useState<(SnapResult & { px: number }) | null>(null);
  // Dynamic object-snap guide lines (drag / hover), with world-units-per-pixel.
  const [dragGuides, setDragGuides] = useState<{ guides: Guide[]; px: number } | null>(null);
  const [hoverGuides, setHoverGuides] = useState<{ guides: Guide[]; px: number; key: string } | null>(null);
  // Geometry captured at drag start: moving features (at start position) + static references.
  const guideDragRef = useRef<{ base: GuideFeatures; refs: RefFeatures[] } | null>(null);

  // Rectangular (AutoCAD-style) selection state
  const [selRect, setSelRect] = useState<SelectionRect>(null);
  const selStartRef = useRef<{ sx: number; sy: number; wx: number; wy: number; additive: boolean } | null>(null);
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

  // AutoCAD-style cursor-anchored wheel zoom. Work entirely in SVG viewBox
  // coordinates here (whose Y points down); mixing engineering Y-up values
  // into viewBox.y was the source of the previous vertical cursor drift.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      setViewBox(current => {
        const rect = svg.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return current;

        const scale = Math.min(rect.width / current.w, rect.height / current.h);
        const offX = (rect.width - current.w * scale) / 2;
        const offY = (rect.height - current.h * scale) / 2;
        const cursorX = current.x + (e.clientX - rect.left - offX) / scale;
        const cursorY = current.y + (e.clientY - rect.top - offY) / scale;

        // Exponential scaling handles both wheel notches and high-resolution
        // trackpads smoothly. Negative delta (wheel up) zooms in.
        const wheelDelta = e.deltaMode === WheelEvent.DOM_DELTA_LINE
          ? e.deltaY * 16
          : e.deltaMode === WheelEvent.DOM_DELTA_PAGE ? e.deltaY * rect.height : e.deltaY;
        const requestedFactor = Math.max(0.5, Math.min(2, Math.exp(wheelDelta * 0.0015)));
        const nextWidth = Math.max(1e-4, Math.min(1e12, current.w * requestedFactor));
        const factor = nextWidth / current.w;
        const nextHeight = current.h * factor;

        return {
          x: cursorX - (cursorX - current.x) * factor,
          y: cursorY - (cursorY - current.y) * factor,
          w: nextWidth,
          h: nextHeight,
        };
      });
    };
    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => svg.removeEventListener('wheel', onWheel);
  }, [setViewBox]);

  // Reference geometry for hover guides around the current selection.
  const selectionKey = store.selectedIds.join('|');
  const hoverGeometry = useMemo(() => {
    if (!osnap || store.selectedIds.length === 0) return null;
    const comps = store.project.components;
    const selected = comps.filter(c => c.visible && store.selectedIds.includes(c.id));
    if (selected.length === 0) return null;
    const exclude = new Set(selected.flatMap(c => [...linkedIds(c.id, comps)]));
    const merged: GuideFeatures = { points: [], segments: [] };
    for (const c of selected) {
      const f = guideFeatures(c);
      merged.points.push(...f.points);
      merged.segments.push(...f.segments);
    }
    return { selected: merged, refs: referenceFeatures(comps, exclude) };
  }, [osnap, store.selectedIds, store.project.components]);

  // ─── Pointer interactions ────────────────────────────────────────────────
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button === 1 || (e.button === 0 && e.shiftKey)) {
      // Pan (middle button or Shift+left)
      setIsPanning(true);
      panStartRef.current = { x: e.clientX, y: e.clientY, vbx: viewBox.x, vby: viewBox.y };
      svgRef.current?.setPointerCapture(e.pointerId);
      e.preventDefault();
    } else if (e.button === 0) {
      // Any press that reaches the canvas (empty space, grid, axes — objects
      // stop propagation) starts a potential pick / window / crossing selection.
      const world = svgToWorld(e.clientX, e.clientY);
      selStartRef.current = { sx: e.clientX, sy: e.clientY, wx: world.x, wy: world.y, additive: e.ctrlKey || e.metaKey };
      svgRef.current?.setPointerCapture(e.pointerId);
      e.preventDefault();
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
        const raw = { x: dragStartRef.current.ox + dx, y: dragStartRef.current.oy + dy };
        // Alt while dragging temporarily overrides OSNAP (free move).
        const px = 1 / getViewTransform().scale;
        const snapped = osnap && !e.altKey
          ? findObjectSnap(comp, raw, store.project.components, {
              tolerance: SNAP_APERTURE_PX * px,
              excludeIds: new Set([comp.id, ...dragStartRef.current.others.map(o => o.id)]
                .flatMap(id => [...linkedIds(id, store.project.components)])),
              nodes: [{ x: 0, y: 0 }],
            })
          : null;
        setSnap(snapped ? { ...snapped, px } : null);
        let target = snapped?.position ?? raw;
        // Object-snap tracking: without a point snap, pull the object onto the
        // X / Y of nearby reference points, then show the guide lines.
        const gd = guideDragRef.current;
        if (osnap && !e.altKey && gd) {
          const origin = { x: dragStartRef.current.ox, y: dragStartRef.current.oy };
          if (!snapped) {
            const moving = translateFeatures(gd.base, { x: raw.x - origin.x, y: raw.y - origin.y });
            const align = findAlignment(moving.points, gd.refs, GUIDE_ALIGN_PX * px);
            target = { x: raw.x + (align.dx ?? 0), y: raw.y + (align.dy ?? 0) };
          }
          const placed = translateFeatures(gd.base, { x: target.x - origin.x, y: target.y - origin.y });
          setDragGuides({
            guides: computeGuides(placed, gd.refs, {
              alignTolerance: Math.max(1e-9, 0.25 * px),
              perpRadius: GUIDE_PERP_PX * px,
              maxPerpendicular: 3,
            }),
            px,
          });
        } else {
          setDragGuides(null);
        }
        // Move every other selected object by the same (snapped) displacement.
        const ddx = target.x - dragStartRef.current.ox;
        const ddy = target.y - dragStartRef.current.oy;
        store.moveComponents([
          { id: dragId, position: target },
          ...dragStartRef.current.others.map(o => ({ id: o.id, position: { x: o.x + ddx, y: o.y + ddy } })),
        ], { history: false });
      }
      return;
    }

    // Hover guides: from the selected object's point under the cursor.
    if (hoverGeometry && !selStartRef.current) {
      const px = 1 / getViewTransform().scale;
      const source = hoverSource(hoverGeometry.selected, world, GUIDE_HOVER_APERTURE_PX * px);
      if (source) {
        const onFace = hoverGeometry.selected.segments.filter(s => {
          const vx = s.b.x - s.a.x, vy = s.b.y - s.a.y;
          const len = Math.hypot(vx, vy);
          if (len < 1e-12) return false;
          const cross = Math.abs((source.x - s.a.x) * vy - (source.y - s.a.y) * vx) / len;
          const t = ((source.x - s.a.x) * vx + (source.y - s.a.y) * vy) / (len * len);
          return cross < 1e-6 * Math.max(1, len) && t >= -1e-9 && t <= 1 + 1e-9;
        });
        setHoverGuides({
          guides: computeGuides({ points: [source], segments: onFace }, hoverGeometry.refs, {
            alignTolerance: GUIDE_ALIGN_PX * px,
            perpRadius: GUIDE_PERP_PX * px,
            maxPerpendicular: 3,
          }),
          px,
          key: selectionKey,
        });
      } else if (hoverGuides) {
        setHoverGuides(null);
      }
    } else if (hoverGuides) {
      setHoverGuides(null);
    }

    // Rectangle selection while dragging on empty space
    const start = selStartRef.current;
    if (start) {
      const movedPx = Math.hypot(e.clientX - start.sx, e.clientY - start.sy);
      if (movedPx > DRAG_THRESHOLD_PX || selRectRef.current) {
        // Left → right = Window (fully inside); right → left = Crossing.
        const mode: 'window' | 'crossing' = e.clientX >= start.sx ? 'window' : 'crossing';
        const rect: SelectionRect = {
          x0: start.wx, y0: start.wy, x1: world.x, y1: world.y, mode, additive: start.additive || e.ctrlKey || e.metaKey,
        };
        selRectRef.current = rect;
        setSelRect(rect);
      }
    }
  }, [isPanning, dragId, viewBox, svgToWorld, getViewTransform, setViewBox, store, osnap, hoverGeometry, hoverGuides, selectionKey]);

  const finishPointer = useCallback((e: React.PointerEvent) => {
    if (svgRef.current?.hasPointerCapture(e.pointerId)) {
      svgRef.current.releasePointerCapture(e.pointerId);
    }
    setIsPanning(false);

    if (dragId) {
      setDragId(null);
      setSnap(null);
      setDragGuides(null);
      guideDragRef.current = null;
    } else if (selStartRef.current) {
      const start = selStartRef.current;
      const rect = selRectRef.current;
      if (rect) {
        const ids = selectByRect(store.project.components, rect, rect.mode);
        store.selectComponents(rect.additive ? [...new Set([...store.selectedIds, ...ids])] : ids);
      } else {
        // Click: pick-box selection near edges/nodes, otherwise deselect.
        const world = svgToWorld(e.clientX, e.clientY);
        const picked = pickComponent(store.project.components, world, PICKBOX_PX / getViewTransform().scale);
        if (picked) {
          if (start.additive) {
            store.selectComponents(store.selectedIds.includes(picked.id)
              ? store.selectedIds.filter(id => id !== picked.id)
              : [...store.selectedIds, picked.id]);
          } else {
            store.selectComponent(picked.id);
          }
        } else if (!start.additive) {
          store.selectComponent(null);
        }
      }
      selStartRef.current = null;
      selRectRef.current = null;
      setSelRect(null);
    }
  }, [dragId, store, svgToWorld, getViewTransform]);

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
    if (!comp) return;
    if (e.ctrlKey || e.metaKey) {
      // Ctrl/⌘-click toggles the shape in the multi-selection (e.g. to Combine).
      store.selectComponents(store.selectedIds.includes(id)
        ? store.selectedIds.filter(x => x !== id)
        : [...store.selectedIds, id]);
      return;
    }
    if (comp.associationKind === 'combined-cutout' && comp.managedByParent) {
      // Cut-outs of a combined section are selectable (for Delete Cutout) but not draggable.
      store.selectComponent(id);
      return;
    }
    if (comp.locked) {
      // Locked (frozen) objects can be selected to inspect, but not moved.
      store.selectComponent(id);
      return;
    }
    const alreadySelected = store.selectedIds.includes(id);
    if (!alreadySelected) store.selectComponent(id);
    // One undo entry per drag (moves during the drag skip history)
    store.pushUndoSnapshot();
    const world = svgToWorld(e.clientX, e.clientY);
    // Dragging one object of a multi-selection moves the whole selection.
    const others = alreadySelected
      ? store.project.components
          .filter(c => c.id !== id && store.selectedIds.includes(c.id) && !c.locked && !c.managedByParent)
          .map(c => ({ id: c.id, x: c.position.x, y: c.position.y }))
      : [];
    dragStartRef.current = { x: world.x, y: world.y, ox: comp.position.x, oy: comp.position.y, others };
    // Capture guide geometry once per drag (references do not move).
    const movingIds = [id, ...others.map(o => o.id)];
    const base: GuideFeatures = { points: [], segments: [] };
    for (const mid of movingIds) {
      const mc = store.project.components.find(c => c.id === mid);
      if (!mc) continue;
      const f = guideFeatures(mc);
      base.points.push(...f.points);
      base.segments.push(...f.segments);
    }
    const exclude = new Set(movingIds.flatMap(mid => [...linkedIds(mid, store.project.components)]));
    guideDragRef.current = { base, refs: referenceFeatures(store.project.components, exclude) };
    setHoverGuides(null);
    setDragId(id);
    // Capture the pointer so the drag keeps tracking outside the canvas
    svgRef.current?.setPointerCapture(e.pointerId);
  }, [store, svgToWorld]);

  const gridSize = getGridSize(viewBox.w);

  // Guides shown now: drag guides while dragging, otherwise hover guides for
  // the current selection (gone when deselected, OSNAP off or cursor away).
  const activeGuides = dragId
    ? dragGuides
    : osnap && !selRect && !isPanning && hoverGuides && hoverGuides.key === selectionKey && store.selectedIds.length > 0
      ? hoverGuides
      : null;

  // Live selection preview: objects that the current window/crossing would select.
  const previewIds = useMemo(
    () => new Set(selRect ? selectByRect(store.project.components, selRect, selRect.mode) : []),
    [selRect, store.project.components],
  );

  const selBox = selRect ? {
    x: Math.min(selRect.x0, selRect.x1),
    y: -Math.max(selRect.y0, selRect.y1), // world → svg (Y flip)
    w: Math.abs(selRect.x1 - selRect.x0),
    h: Math.abs(selRect.y1 - selRect.y0),
  } : null;

  return (
    <div className="relative w-full h-full" style={{ background: palette.background, transition: 'background-color 120ms linear' }}>
      <svg
        ref={svgRef}
        className="w-full h-full"
        viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finishPointer}
        onPointerCancel={finishPointer}
        onPointerLeave={() => { if (!dragId) setHoverGuides(null); }}
        style={{ cursor: isPanning ? 'grabbing' : dragId ? 'move' : 'crosshair', touchAction: 'none' }}
      >
        <defs>
          <pattern id="grid" width={gridSize} height={gridSize} patternUnits="userSpaceOnUse">
            <path d={`M ${gridSize} 0 L 0 0 0 ${gridSize}`} fill="none" stroke={palette.gridColor} strokeOpacity={palette.gridMinorOpacity} strokeWidth={viewBox.w * 0.001} />
          </pattern>
          <pattern id="grid-major" width={gridSize * 5} height={gridSize * 5} patternUnits="userSpaceOnUse">
            <path d={`M ${gridSize * 5} 0 L 0 0 0 ${gridSize * 5}`} fill="none" stroke={palette.gridColor} strokeOpacity={palette.gridOpacity} strokeWidth={viewBox.w * 0.002} />
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
        <line x1={viewBox.x} y1={0} x2={viewBox.x + viewBox.w} y2={0} stroke={palette.axisX} strokeWidth={viewBox.w * 0.001} />
        <line x1={0} y1={viewBox.y} x2={0} y2={viewBox.y + viewBox.h} stroke={palette.axisY} strokeWidth={viewBox.w * 0.001} />

        {/* Y-axis flipped: in engineering, Y is up. We use SVG transform to flip. */}
        <g transform="scale(1, -1)">
          {/* Components */}
          {store.project.components.filter(c => c.visible).map(comp => (
            <ComponentRenderer
              key={comp.id}
              comp={comp}
              selected={store.selectedIds.includes(comp.id)}
              preview={previewIds.has(comp.id)}
              strokeWidth={viewBox.w * 0.002}
              fontScale={dimensionFontScale}
              onPointerDown={(e) => startDrag(comp.id, e)}
              palette={palette}
            />
          ))}

          {/* Interior voids of combined sections: click to select (Delete Cutout) */}
          {store.project.components.filter(c => c.visible && c.geometry.rings && c.geometry.rings.length > 1).map(comp =>
            combinedVoids(comp).map((ring, index) => {
              const selected = store.selectedVoid?.combinedId === comp.id && store.selectedVoid.index === index;
              return (
                <path
                  key={`${comp.id}:void:${index}`}
                  d={ring.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ') + ' Z'}
                  fill={selected ? 'rgba(239,68,68,0.25)' : 'rgba(0,0,0,0)'}
                  stroke={selected ? '#ef4444' : 'none'}
                  strokeWidth={viewBox.w * 0.002}
                  strokeDasharray={selected ? `${viewBox.w * 0.008} ${viewBox.w * 0.004}` : undefined}
                  style={{ cursor: 'pointer' }}
                  onPointerDown={e => { e.stopPropagation(); store.selectVoid(comp.id, index); }}
                >
                  <title>{`Void ${index + 1} of ${comp.name} — click to select, Delete to remove`}</title>
                </path>
              );
            }),
          )}

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
              palette={palette}
            />
          )}
          {/* Dynamic object-snap guide lines */}
          {activeGuides && activeGuides.guides.length > 0 && (
            <GuideLayer guides={activeGuides.guides} px={activeGuides.px} color={palette.guide} halo={palette.background} units={store.project.units} />
          )}
          {/* Object snap indicator (AutoCAD-style glyph at the snap point) */}
          {snap && dragId && (
            <SnapMarker snap={snap} size={SNAP_APERTURE_PX * 0.8 * snap.px} color={palette.snap} />
          )}
        </g>

        {/* Snap label (outside the Y flip so text is upright) */}
        {snap && dragId && (() => {
          const px = snap.px;
          return (
            <g pointerEvents="none">
              <rect
                x={snap.target.x + 14 * px}
                y={-snap.target.y + 10 * px}
                width={(SNAP_LABELS[snap.kind].length * 7 + 10) * px}
                height={18 * px}
                rx={3 * px}
                fill="rgba(15,23,42,0.92)"
                stroke="#facc15"
                strokeWidth={px}
              />
              <text
                x={snap.target.x + 19 * px}
                y={-snap.target.y + 23 * px}
                fill="#facc15"
                fontSize={12 * px}
                fontFamily="JetBrains Mono, monospace"
              >
                {SNAP_LABELS[snap.kind]}
              </text>
            </g>
          );
        })()}

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
              {selRect.mode === 'window' ? 'WINDOW' : 'CROSSING'}{selRect.additive ? ' (+)' : ''} · {selBox.w.toFixed(1)} × {selBox.h.toFixed(1)} · {previewIds.size} object{previewIds.size === 1 ? '' : 's'}
            </text>
          </g>
        )}
      </svg>

      {/* Coordinate display */}
      <div className="absolute bottom-2 left-2 px-2 py-1 rounded text-[10px] font-mono" style={{ background: palette.overlayBg, color: palette.overlayText }}>
        X: {mouseWorld.x.toFixed(1)} &nbsp; Y: {mouseWorld.y.toFixed(1)} &nbsp; {store.project.units}
        &nbsp;·&nbsp;<span style={{ color: osnap ? palette.snap : undefined, opacity: osnap ? 1 : 0.5 }}>OSNAP {osnap ? 'ON' : 'OFF'}</span>
      </div>

      {/* Grid size indicator */}
      {showGrid && (
        <div className="absolute bottom-2 right-2 px-2 py-1 rounded text-[10px] font-mono" style={{ background: palette.overlayBg, color: palette.overlayText, opacity: 0.85 }}>
          Grid: {gridSize} {store.project.units}
        </div>
      )}
    </div>
  );
}

function ComponentRenderer({ comp, selected, preview = false, strokeWidth, fontScale, onPointerDown, palette }: {
  comp: SectionComponent;
  selected: boolean;
  /** Highlighted as part of the in-progress selection window. */
  preview?: boolean;
  strokeWidth: number;
  fontScale: number;
  onPointerDown: (e: React.PointerEvent) => void;
  palette: CanvasPalette;
}) {
  const props = computeComponentProps(comp);
  const outline = props.outline;
  const isSubtract = comp.operation === 'subtract';
  const isLocked = comp.locked;

  const fillColor = isSubtract ? palette.subtractFill : palette.addFill;
  const strokeColor = preview && !selected
    ? palette.preview
    : selected
    ? palette.selected
    : isLocked ? palette.lockedStroke : isSubtract ? palette.subtractStroke : palette.addStroke;

  // For circles and ellipses, render as polygon from outline
  if (outline.length < 2) return null;

  // Combined sections render their exact rings (outer + voids) so the
  // zero-width keyhole bridge of the coordinate boundary is not drawn.
  const rings = componentRenderRings(comp) ?? [outline];
  const d = rings
    .map(ring => ring.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ') + ' Z')
    .join(' ');

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
        fillRule="evenodd"
        fill={preview && !selected ? palette.previewFill : fillColor}
        stroke={strokeColor}
        strokeWidth={preview && !selected ? strokeWidth * 1.8 : strokeWidth}
        strokeLinejoin="round"
      />
      {selected && (
        <>
          <path
            d={d}
            fill="none"
            stroke={palette.selected}
            strokeWidth={strokeWidth * 0.5}
            strokeDasharray={`${strokeWidth * 4} ${strokeWidth * 2}`}
          />
          {/* Dimension annotations */}
          {/* Width dimension (bottom) */}
          <line x1={minX} y1={minY - dimOffset} x2={maxX} y2={minY - dimOffset}
            stroke={palette.selected} strokeWidth={strokeWidth * 0.3} />
          <line x1={minX} y1={minY - dimOffset * 0.6} x2={minX} y2={minY - dimOffset * 1.4}
            stroke={palette.selected} strokeWidth={strokeWidth * 0.3} />
          <line x1={maxX} y1={minY - dimOffset * 0.6} x2={maxX} y2={minY - dimOffset * 1.4}
            stroke={palette.selected} strokeWidth={strokeWidth * 0.3} />
          <text
            x={(minX + maxX) / 2}
            y={-(minY - dimOffset * 1.6)}
            fill={palette.selected}
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
            stroke={palette.selected} strokeWidth={strokeWidth * 0.3} />
          <line x1={maxX + dimOffset * 0.6} y1={minY} x2={maxX + dimOffset * 1.4} y2={minY}
            stroke={palette.selected} strokeWidth={strokeWidth * 0.3} />
          <line x1={maxX + dimOffset * 0.6} y1={maxY} x2={maxX + dimOffset * 1.4} y2={maxY}
            stroke={palette.selected} strokeWidth={strokeWidth * 0.3} />
          <text
            x={maxX + dimOffset * 1.6}
            y={-((minY + maxY) / 2)}
            fill={palette.selected}
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

function CentroidMarker({ cx, cy, size, principalAngle, showPrincipal, axisLen, strokeWidth, palette }: {
  cx: number;
  cy: number;
  size: number;
  principalAngle: number;
  showPrincipal: boolean;
  axisLen: number;
  strokeWidth: number;
  palette: CanvasPalette;
}) {
  const rad = (principalAngle * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  return (
    <g>
      {/* Centroid crosshair */}
      <circle cx={cx} cy={cy} r={size} fill="none" stroke={palette.centroid} strokeWidth={strokeWidth} />
      <line x1={cx - size * 1.5} y1={cy} x2={cx + size * 1.5} y2={cy} stroke={palette.centroid} strokeWidth={strokeWidth * 0.7} />
      <line x1={cx} y1={cy - size * 1.5} x2={cx} y2={cy + size * 1.5} stroke={palette.centroid} strokeWidth={strokeWidth * 0.7} />

      {/* Principal axes */}
      {showPrincipal && (
        <>
          <line
            x1={cx - axisLen * cos}
            y1={cy - axisLen * sin}
            x2={cx + axisLen * cos}
            y2={cy + axisLen * sin}
            stroke={palette.principal1}
            strokeWidth={strokeWidth * 0.5}
            strokeDasharray={`${strokeWidth * 3} ${strokeWidth * 1.5}`}
          />
          <line
            x1={cx + axisLen * sin}
            y1={cy - axisLen * cos}
            x2={cx - axisLen * sin}
            y2={cy + axisLen * cos}
            stroke={palette.principal2}
            strokeWidth={strokeWidth * 0.5}
            strokeDasharray={`${strokeWidth * 3} ${strokeWidth * 1.5}`}
          />
        </>
      )}

      {/* C.G. label */}
      <text
        x={cx + size * 2}
        y={-cy + size * 2}
        fill={palette.centroid}
        fontSize={size * 1.5}
        transform={`scale(1,-1) translate(0, ${-2 * cy})`}
        fontFamily="Inter, sans-serif"
        fontWeight={600}
      >
        C.G. ({Math.abs(cx) < 1e-9 ? '0' : cx.toFixed(2)}, {Math.abs(cy) < 1e-9 ? '0' : cy.toFixed(2)})
      </text>
    </g>
  );
}

/** AutoCAD OSNAP marker glyphs: □ endpoint, △ midpoint, ○ centre, ◇ quadrant, ⊗ node, ⧖ nearest. */
function SnapMarker({ snap, size, color = '#facc15' }: { snap: SnapResult; size: number; color?: string }) {
  const { x, y } = snap.target;
  const h = size * 0.75;
  const sw = size * 0.16;
  const common = { fill: 'none', stroke: color, strokeWidth: sw } as const;
  let glyph: React.ReactNode;
  switch (snap.kind) {
    case 'endpoint':
      glyph = <rect x={x - h} y={y - h} width={2 * h} height={2 * h} {...common} />;
      break;
    case 'midpoint':
      glyph = <polygon points={`${x - h},${y - h * 0.8} ${x + h},${y - h * 0.8} ${x},${y + h}`} {...common} />;
      break;
    case 'center':
      glyph = <circle cx={x} cy={y} r={h} {...common} />;
      break;
    case 'quadrant':
      glyph = <polygon points={`${x},${y + h} ${x + h},${y} ${x},${y - h} ${x - h},${y}`} {...common} />;
      break;
    case 'node':
      glyph = (
        <>
          <circle cx={x} cy={y} r={h} {...common} />
          <path d={`M ${x - h * 0.7} ${y - h * 0.7} L ${x + h * 0.7} ${y + h * 0.7} M ${x - h * 0.7} ${y + h * 0.7} L ${x + h * 0.7} ${y - h * 0.7}`} {...common} />
        </>
      );
      break;
    default:
      // Nearest: hourglass
      glyph = <path d={`M ${x - h} ${y + h} L ${x + h} ${y + h} L ${x - h} ${y - h} L ${x + h} ${y - h} Z`} {...common} />;
  }
  return (
    <g pointerEvents="none">
      {snap.distance > 1e-9 && (
        <line
          x1={snap.source.x} y1={snap.source.y} x2={x} y2={y}
          stroke={color} strokeWidth={sw * 0.5} strokeDasharray={`${size * 0.3} ${size * 0.2}`} opacity={0.6}
        />
      )}
      {glyph}
    </g>
  );
}

/**
 * Dashed object-snap guides (drawn inside the Y-flipped group).
 * Alignment guides extend slightly past both points (tracking-line look);
 * perpendicular guides get a right-angle tick and the gap distance.
 */
function GuideLayer({ guides, px, color, halo, units }: {
  guides: Guide[];
  px: number;
  color: string;
  halo: string;
  units: string;
}) {
  const sw = 1.1 * px;
  const dash = `${6 * px} ${4 * px}`;
  const tick = 7 * px;
  const font = 11 * px;
  const fmt = (d: number) => (Math.abs(d) >= 1000 ? d.toFixed(0) : Math.abs(d) >= 10 ? d.toFixed(1) : d.toFixed(2));
  return (
    <g pointerEvents="none" data-testid="snap-guides">
      {guides.map((g, i) => {
        const vx = g.to.x - g.from.x;
        const vy = g.to.y - g.from.y;
        const len = Math.hypot(vx, vy) || 1;
        const ux = vx / len, uy = vy / len;
        const ext = 14 * px;
        const isAlign = g.kind !== 'perp';
        const a = isAlign ? { x: g.from.x - ux * ext, y: g.from.y - uy * ext } : g.from;
        const b = isAlign ? { x: g.to.x + ux * ext, y: g.to.y + uy * ext } : g.to;
        // Label at the midpoint, offset to the side of the line.
        const mid = { x: (g.from.x + g.to.x) / 2 - uy * 8 * px, y: (g.from.y + g.to.y) / 2 + ux * 8 * px };
        // Right-angle tick at the foot (on the face the guide meets).
        const foot = g.ref === 'edge' ? g.to : g.from;
        const back = g.ref === 'edge' ? -1 : 1;
        const nx = -uy, ny = ux;
        const tickPath = `M ${foot.x + back * ux * tick} ${foot.y + back * uy * tick} `
          + `L ${foot.x + back * ux * tick + nx * tick} ${foot.y + back * uy * tick + ny * tick} `
          + `L ${foot.x + nx * tick} ${foot.y + ny * tick}`;
        const label = isAlign ? `${g.kind === 'align-x' ? '⇕' : '⇔'} ${fmt(g.distance)}` : `⊥ ${fmt(g.distance)} ${units}`;
        return (
          <g key={i} data-guide-kind={g.kind}>
            <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={color} strokeWidth={sw} strokeDasharray={dash} />
            {g.kind === 'perp' && <path d={tickPath} fill="none" stroke={color} strokeWidth={sw * 0.9} />}
            {/* Reference marker (×) and source marker (○) */}
            <path
              d={`M ${g.to.x - 4 * px} ${g.to.y - 4 * px} L ${g.to.x + 4 * px} ${g.to.y + 4 * px} M ${g.to.x - 4 * px} ${g.to.y + 4 * px} L ${g.to.x + 4 * px} ${g.to.y - 4 * px}`}
              stroke={color} strokeWidth={sw * 1.3}
            />
            <circle cx={g.from.x} cy={g.from.y} r={3 * px} fill="none" stroke={color} strokeWidth={sw * 1.2} />
            <text
              x={mid.x}
              y={-mid.y}
              transform="scale(1,-1)"
              fontSize={font}
              fill={color}
              stroke={halo}
              strokeWidth={3 * px}
              paintOrder="stroke"
              textAnchor="middle"
              dominantBaseline="middle"
              fontFamily="JetBrains Mono, monospace"
              fontWeight={600}
            >
              {label}
            </text>
          </g>
        );
      })}
    </g>
  );
}
