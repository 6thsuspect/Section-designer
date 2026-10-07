'use client';

/**
 * Dockable panel UI: frame with draggable tab header, drop-zone overlay and
 * a re-parenting slot so panel contents keep their React state (active tab,
 * open menus, scroll position) when docked, undocked or moved between sides.
 */

import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  computeDockZones,
  dockPreviewRect,
  hitDockZone,
  DOCK_SIDES,
  FLOAT_MIN,
  PANEL_TITLES,
  type DockPlacement,
  type DockSide,
  type PanelId,
  type Rect,
} from '@/engine/dockLayout';

// ─── Re-parenting (stable panel instances) ────────────────────────────────

/**
 * One persistent, detached DOM node per panel. Panel content is portalled
 * into it once; docking just moves the node between slots, so React never
 * unmounts the panel.
 */
export function usePanelNodes(ids: PanelId[]): Partial<Record<PanelId, HTMLDivElement>> {
  const [nodes, setNodes] = useState<Partial<Record<PanelId, HTMLDivElement>>>({});
  const key = ids.join('|');
  useEffect(() => {
    const next: Partial<Record<PanelId, HTMLDivElement>> = {};
    for (const id of key.split('|') as PanelId[]) {
      const el = document.createElement('div');
      el.className = 'dock-panel-content';
      el.dataset.panel = id;
      next[id] = el;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- DOM nodes can only be created client-side
    setNodes(next);
  }, [key]);
  return nodes;
}

/** Renders `children` into the persistent panel node (if created yet). */
export function PanelPortal({ node, children }: { node?: HTMLDivElement; children: React.ReactNode }) {
  return node ? createPortal(children, node) : null;
}

/** Placeholder that adopts the persistent panel node while mounted. */
function PanelSlot({ node }: { node?: HTMLDivElement }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const slot = ref.current;
    if (!slot || !node) return;
    slot.appendChild(node);
    return () => {
      // Only detach if no other slot has adopted it in the meantime.
      if (node.parentNode === slot) slot.removeChild(node);
    };
  }, [node]);
  return <div ref={ref} className="flex-1 min-h-0 min-w-0 flex flex-col overflow-hidden" />;
}

// ─── Frame ───────────────────────────────────────────────────────────────

interface FrameProps {
  id: PanelId;
  node?: HTMLDivElement;
  placement: DockPlacement;
  /** Floating rect (viewport px) when placement === 'float'. */
  floatRect?: Rect;
  zIndex?: number;
  className?: string;
  style?: React.CSSProperties;
  onHeaderPointerDown: (id: PanelId, e: React.PointerEvent) => void;
  onToggleFloat: (id: PanelId) => void;
  onClose: (id: PanelId) => void;
  onFloatResize?: (id: PanelId, rect: Rect) => void;
  onFocus?: (id: PanelId) => void;
}

export function DockFrame({
  id, node, placement, floatRect, zIndex, className = '', style,
  onHeaderPointerDown, onToggleFloat, onClose, onFloatResize, onFocus,
}: FrameProps) {
  const floating = placement === 'float';
  const [resizeRect, setResizeRect] = useState<Rect | null>(null);
  const rect = resizeRect ?? floatRect;

  const startResize = useCallback((e: React.PointerEvent) => {
    if (!floatRect || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    const start = { x: e.clientX, y: e.clientY };
    let latest = floatRect;
    const move = (ev: PointerEvent) => {
      latest = {
        ...floatRect,
        w: Math.max(FLOAT_MIN.w, Math.min(window.innerWidth - floatRect.x, floatRect.w + ev.clientX - start.x)),
        h: Math.max(FLOAT_MIN.h, Math.min(window.innerHeight - floatRect.y, floatRect.h + ev.clientY - start.y)),
      };
      setResizeRect(latest);
    };
    const up = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      setResizeRect(null);
      onFloatResize?.(id, latest);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  }, [floatRect, id, onFloatResize]);

  const frameStyle: React.CSSProperties = floating && rect
    ? {
        position: 'fixed', left: rect.x, top: rect.y, width: rect.w, height: rect.h, zIndex,
        boxShadow: '0 12px 32px rgba(0,0,0,0.45)', border: '1px solid var(--border)', borderRadius: 6,
        ...style,
      }
    : { ...style };

  return (
    <div
      data-dock-frame={id}
      className={`flex flex-col overflow-hidden ${className}`}
      style={{ background: 'var(--bg-secondary)', ...frameStyle }}
      onPointerDownCapture={() => onFocus?.(id)}
    >
      <div
        className="dock-tab-header"
        onPointerDown={e => onHeaderPointerDown(id, e)}
        onDoubleClick={e => {
          if ((e.target as HTMLElement).closest('button')) return;
          onToggleFloat(id);
        }}
        title="Drag to dock or float · double-click to toggle floating"
      >
        <span className="dock-grip" aria-hidden>⠿</span>
        <span className="flex-1 truncate">{PANEL_TITLES[id]}</span>
        <span className="text-[9px] uppercase opacity-60 mr-1">{floating ? 'floating' : placement}</span>
        <button
          type="button"
          className="dock-tab-btn"
          onClick={() => onToggleFloat(id)}
          title={floating ? 'Dock (to last side)' : 'Float / undock'}
          aria-label={floating ? 'Dock panel' : 'Float panel'}
        >
          {floating ? (
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><rect x="3" y="3" width="18" height="18" rx="2" /><line x1="9" y1="3" x2="9" y2="21" /></svg>
          ) : (
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><rect x="8" y="3" width="13" height="13" rx="2" /><path d="M16 21H5a2 2 0 0 1-2-2V8" /></svg>
          )}
        </button>
        <button type="button" className="dock-tab-btn" onClick={() => onClose(id)} title="Hide panel" aria-label="Hide panel">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
      </div>
      <PanelSlot node={node} />
      {floating && (
        <div className="dock-resize-corner" onPointerDown={startResize} title="Drag to resize" />
      )}
    </div>
  );
}

// ─── Drag manager + zone overlay ───────────────────────────────────────────

interface DragState {
  id: PanelId;
  pointerId: number;
  start: { x: number; y: number };
  active: boolean;
  pointer: { x: number; y: number };
  grab: { x: number; y: number };
  size: { w: number; h: number };
  area: Rect | null;
  hover: DockSide | null;
}

export interface DockDragHandle {
  begin: (id: PanelId, e: React.PointerEvent, floatSize: { w: number; h: number }) => void;
}

interface DragProps {
  /** Canvas area in viewport px — docking zones are drawn along its edges. */
  getCanvasRect: () => Rect | null;
  sideSizes: Record<DockSide, number>;
  onDock: (id: PanelId, side: DockSide) => void;
  onFloat: (id: PanelId, rect: Rect) => void;
}

const DRAG_THRESHOLD = 4;

/**
 * Owns drag state locally (so the page does not re-render on every pointer
 * move) and renders the translucent docking zones, drop preview and ghost.
 */
export const DockDragLayer = forwardRef<DockDragHandle, DragProps>(function DockDragLayer(
  { getCanvasRect, sideSizes, onDock, onFloat }, ref,
) {
  const [drag, setDrag] = useState<DragState | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const update = (d: DragState | null) => { dragRef.current = d; setDrag(d); };

  const propsRef = useRef({ getCanvasRect, onDock, onFloat });
  useEffect(() => { propsRef.current = { getCanvasRect, onDock, onFloat }; });

  useImperativeHandle(ref, () => ({
    begin(id, e, floatSize) {
      if (e.button !== 0 || (e.target as HTMLElement).closest('button')) return;
      const frame = (e.currentTarget as HTMLElement).closest('[data-dock-frame]') as HTMLElement | null;
      const fr = frame?.getBoundingClientRect();
      const floating = frame?.style.position === 'fixed';
      const size = floating && fr ? { w: fr.width, h: fr.height } : floatSize;
      const grab = fr
        ? floating
          ? { x: e.clientX - fr.left, y: e.clientY - fr.top }
          : { x: Math.min(Math.max(12, e.clientX - fr.left), size.w - 40), y: 12 }
        : { x: 20, y: 12 };
      update({
        id, pointerId: e.pointerId, start: { x: e.clientX, y: e.clientY }, active: false,
        pointer: { x: e.clientX, y: e.clientY }, grab, size, area: null, hover: null,
      });
    },
  }), []);

  useEffect(() => {
    if (!drag) return;
    const move = (ev: PointerEvent) => {
      const d = dragRef.current;
      if (!d || ev.pointerId !== d.pointerId) return;
      const pointer = { x: ev.clientX, y: ev.clientY };
      let { active, area } = d;
      if (!active) {
        if (Math.hypot(pointer.x - d.start.x, pointer.y - d.start.y) < DRAG_THRESHOLD) return;
        active = true;
        area = propsRef.current.getCanvasRect();
      }
      ev.preventDefault();
      const hover = area ? hitDockZone(computeDockZones(area), pointer) : null;
      update({ ...d, active, area, pointer, hover });
    };
    const up = (ev: PointerEvent) => {
      const d = dragRef.current;
      if (!d || ev.pointerId !== d.pointerId) return;
      update(null);
      if (!d.active) return;
      if (d.hover) propsRef.current.onDock(d.id, d.hover);
      else propsRef.current.onFloat(d.id, { x: ev.clientX - d.grab.x, y: ev.clientY - d.grab.y, w: d.size.w, h: d.size.h });
    };
    const key = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape' && dragRef.current) {
        ev.stopPropagation();
        update(null);
      }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    window.addEventListener('keydown', key, true);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      window.removeEventListener('keydown', key, true);
    };
  }, [drag !== null]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!drag?.active) return null;
  const zones = drag.area ? computeDockZones(drag.area) : null;
  const preview = drag.area && drag.hover ? dockPreviewRect(drag.area, drag.hover, sideSizes[drag.hover]) : null;
  const ghost = { x: drag.pointer.x - drag.grab.x, y: drag.pointer.y - drag.grab.y };
  const box = (r: Rect): React.CSSProperties => ({ position: 'fixed', left: r.x, top: r.y, width: r.w, height: r.h });

  return (
    <div className="fixed inset-0 z-40" style={{ cursor: 'grabbing', userSelect: 'none' }}>
      {/* Landing preview */}
      {preview && <div className="dock-preview" style={box(preview)} />}
      {/* Docking zones */}
      {zones && DOCK_SIDES.map(side => (
        <div key={side} className={`dock-zone ${drag.hover === side ? 'dock-zone-active' : ''}`} style={box(zones[side])}>
          <span className="dock-zone-label">
            {side === 'left' ? '◧' : side === 'right' ? '◨' : side === 'top' ? '⬒' : '⬓'} {side}
          </span>
        </div>
      ))}
      {/* Ghost of the dragged panel */}
      <div
        className="dock-ghost"
        style={{ ...box({ x: ghost.x, y: ghost.y, w: drag.size.w, h: drag.size.h }), opacity: drag.hover ? 0.35 : 0.85 }}
      >
        <div className="dock-tab-header" style={{ pointerEvents: 'none' }}>
          <span className="dock-grip">⠿</span>
          <span className="flex-1">{PANEL_TITLES[drag.id]}</span>
          <span className="text-[9px] uppercase opacity-70">{drag.hover ? `dock ${drag.hover}` : 'float'}</span>
        </div>
      </div>
    </div>
  );
});
