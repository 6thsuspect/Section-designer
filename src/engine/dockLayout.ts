/**
 * Dockable panel layout (pure logic — no React / DOM).
 *
 * Each panel is either docked to one side of the canvas (left / right / top /
 * bottom) or floating at a free screen rectangle. Several panels docked to the
 * same side share that side's size and are stacked (vertically on left/right,
 * horizontally on top/bottom) in `order`.
 */

export type DockSide = 'left' | 'right' | 'top' | 'bottom';
export type DockPlacement = DockSide | 'float';
export type PanelId = 'components' | 'properties';

export interface Rect { x: number; y: number; w: number; h: number }
export interface Pt { x: number; y: number }

export interface PanelState {
  open: boolean;
  dock: DockPlacement;
  /** Side used when re-docking a floating panel (double-click header). */
  lastDock: DockSide;
  /** Last floating rectangle (viewport px). */
  float: Rect;
  /** Stacking order within a side. */
  order: number;
}

export interface DockLayout {
  panels: Record<PanelId, PanelState>;
  /** Width for left/right docks, height for top/bottom docks (px). */
  sizes: Record<DockSide, number>;
}

export const PANEL_IDS: PanelId[] = ['components', 'properties'];
export const DOCK_SIDES: DockSide[] = ['left', 'right', 'top', 'bottom'];

export const PANEL_TITLES: Record<PanelId, string> = {
  components: 'Components',
  properties: 'Properties',
};

export const SIZE_LIMITS: Record<DockSide, { min: number; max: number }> = {
  left: { min: 180, max: 560 },
  right: { min: 220, max: 560 },
  top: { min: 120, max: 520 },
  bottom: { min: 120, max: 520 },
};

export const FLOAT_MIN = { w: 220, h: 160 };

export const DEFAULT_DOCK_LAYOUT: DockLayout = {
  panels: {
    components: { open: true, dock: 'left', lastDock: 'left', float: { x: 80, y: 90, w: 280, h: 460 }, order: 0 },
    properties: { open: true, dock: 'right', lastDock: 'right', float: { x: 420, y: 90, w: 320, h: 520 }, order: 0 },
  },
  sizes: { left: 224, right: 256, top: 240, bottom: 240 },
};

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function clampSideSize(side: DockSide, size: number): number {
  const { min, max } = SIZE_LIMITS[side];
  return Math.round(clamp(Number.isFinite(size) ? size : min, min, max));
}

/** Open panels docked on `side`, in stacking order. */
export function panelsOnSide(layout: DockLayout, side: DockSide): PanelId[] {
  return PANEL_IDS
    .filter(id => layout.panels[id].open && layout.panels[id].dock === side)
    .sort((a, b) => layout.panels[a].order - layout.panels[b].order || PANEL_IDS.indexOf(a) - PANEL_IDS.indexOf(b));
}

/** Open floating panels. */
export function floatingPanels(layout: DockLayout): PanelId[] {
  return PANEL_IDS.filter(id => layout.panels[id].open && layout.panels[id].dock === 'float');
}

/**
 * Translucent drop zones along the four edges of the canvas area.
 * Left/right span the full height; top/bottom sit between them, so zones
 * never overlap.
 */
export function computeDockZones(area: Rect): Record<DockSide, Rect> {
  const t = Math.round(clamp(Math.min(area.w, area.h) * 0.2, 40, 110));
  const tx = Math.min(t, area.w / 3);
  const ty = Math.min(t, area.h / 3);
  return {
    left: { x: area.x, y: area.y, w: tx, h: area.h },
    right: { x: area.x + area.w - tx, y: area.y, w: tx, h: area.h },
    top: { x: area.x + tx, y: area.y, w: Math.max(0, area.w - 2 * tx), h: ty },
    bottom: { x: area.x + tx, y: area.y + area.h - ty, w: Math.max(0, area.w - 2 * tx), h: ty },
  };
}

export function pointInRect(p: Pt, r: Rect): boolean {
  return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
}

/** Docking zone under the pointer, or null (→ float on release). */
export function hitDockZone(zones: Record<DockSide, Rect>, p: Pt): DockSide | null {
  for (const side of DOCK_SIDES) if (pointInRect(p, zones[side])) return side;
  return null;
}

/** Where a panel would land if dropped on `side` (for the drop preview). */
export function dockPreviewRect(area: Rect, side: DockSide, size: number): Rect {
  const s = clampSideSize(side, size);
  switch (side) {
    case 'left': return { x: area.x, y: area.y, w: Math.min(s, area.w / 2), h: area.h };
    case 'right': { const w = Math.min(s, area.w / 2); return { x: area.x + area.w - w, y: area.y, w, h: area.h }; }
    case 'top': return { x: area.x, y: area.y, w: area.w, h: Math.min(s, area.h / 2) };
    case 'bottom': { const h = Math.min(s, area.h / 2); return { x: area.x, y: area.y + area.h - h, w: area.w, h }; }
  }
}

/** Keep a floating rectangle on-screen and at least the minimum size. */
export function clampFloatRect(r: Rect, viewport: { w: number; h: number }): Rect {
  const w = clamp(r.w, Math.min(FLOAT_MIN.w, viewport.w), Math.max(FLOAT_MIN.w, viewport.w));
  const h = clamp(r.h, Math.min(FLOAT_MIN.h, viewport.h), Math.max(FLOAT_MIN.h, viewport.h));
  return {
    x: Math.round(clamp(r.x, 0, Math.max(0, viewport.w - w))),
    y: Math.round(clamp(r.y, 0, Math.max(0, viewport.h - h))),
    w: Math.round(w),
    h: Math.round(h),
  };
}

function withPanel(layout: DockLayout, id: PanelId, patch: Partial<PanelState>): DockLayout {
  return { ...layout, panels: { ...layout.panels, [id]: { ...layout.panels[id], ...patch } } };
}

/** Dock a panel to `side` (appended after panels already there). */
export function dockPanel(layout: DockLayout, id: PanelId, side: DockSide): DockLayout {
  const others = panelsOnSide(layout, side).filter(p => p !== id);
  const order = others.length ? Math.max(...others.map(p => layout.panels[p].order)) + 1 : 0;
  return withPanel(layout, id, { dock: side, lastDock: side, open: true, order });
}

/** Undock a panel to float at `rect`. */
export function floatPanel(layout: DockLayout, id: PanelId, rect: Rect, viewport: { w: number; h: number }): DockLayout {
  return withPanel(layout, id, { dock: 'float', open: true, float: clampFloatRect(rect, viewport) });
}

export function setPanelOpen(layout: DockLayout, id: PanelId, open: boolean): DockLayout {
  return withPanel(layout, id, { open });
}

export function setSideSize(layout: DockLayout, side: DockSide, size: number): DockLayout {
  return { ...layout, sizes: { ...layout.sizes, [side]: clampSideSize(side, size) } };
}

/** Toggle floating ↔ last docked side (header double-click / button). */
export function toggleFloat(layout: DockLayout, id: PanelId, viewport: { w: number; h: number }): DockLayout {
  const p = layout.panels[id];
  return p.dock === 'float'
    ? dockPanel(layout, id, p.lastDock)
    : floatPanel(layout, id, p.float, viewport);
}

const isSide = (v: unknown): v is DockSide => typeof v === 'string' && (DOCK_SIDES as string[]).includes(v);
const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);

/** Sanitise a persisted layout; anything malformed falls back to defaults. */
export function normalizeDockLayout(raw: unknown): DockLayout {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const rp = (r.panels && typeof r.panels === 'object' ? r.panels : {}) as Record<string, unknown>;
  const rs = (r.sizes && typeof r.sizes === 'object' ? r.sizes : {}) as Record<string, unknown>;
  const panels = {} as Record<PanelId, PanelState>;
  for (const id of PANEL_IDS) {
    const d = DEFAULT_DOCK_LAYOUT.panels[id];
    const p = (rp[id] && typeof rp[id] === 'object' ? rp[id] : {}) as Record<string, unknown>;
    const f = (p.float && typeof p.float === 'object' ? p.float : {}) as Record<string, unknown>;
    panels[id] = {
      open: typeof p.open === 'boolean' ? p.open : d.open,
      dock: p.dock === 'float' || isSide(p.dock) ? p.dock : d.dock,
      lastDock: isSide(p.lastDock) ? p.lastDock : d.lastDock,
      float: {
        x: num(f.x, d.float.x), y: num(f.y, d.float.y),
        w: Math.max(FLOAT_MIN.w, num(f.w, d.float.w)), h: Math.max(FLOAT_MIN.h, num(f.h, d.float.h)),
      },
      order: num(p.order, d.order),
    };
  }
  const sizes = {} as Record<DockSide, number>;
  for (const s of DOCK_SIDES) sizes[s] = clampSideSize(s, num(rs[s], DEFAULT_DOCK_LAYOUT.sizes[s]));
  return { panels, sizes };
}
