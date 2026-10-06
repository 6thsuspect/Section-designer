/**
 * Canvas colour themes.
 *
 * Purely presentational: a theme only changes how the drawing canvas is
 * painted (background, grid, axes, object strokes/fills, overlays). It never
 * touches model geometry, section properties or exports.
 */

export type CanvasThemeId = 'grasshopper' | 'dark' | 'light' | 'custom';

/** User-editable canvas colours (used by the Custom theme). */
export interface CanvasCustomColors {
  /** Canvas background, #rrggbb. */
  background: string;
  /** Grid line colour, #rrggbb. */
  gridColor: string;
  /** Major grid line opacity 0–1 (minor lines are drawn fainter). */
  gridOpacity: number;
}

export interface CanvasThemeSettings {
  canvasTheme: CanvasThemeId;
  canvasCustom: CanvasCustomColors;
}

/** Fully resolved palette consumed by the canvas renderer. */
export interface CanvasPalette extends CanvasCustomColors {
  isLight: boolean;
  /** Minor grid line opacity (derived from gridOpacity). */
  gridMinorOpacity: number;
  axisX: string;
  axisY: string;
  addFill: string;
  addStroke: string;
  subtractFill: string;
  subtractStroke: string;
  lockedStroke: string;
  /** Selection highlight + dimension annotations. */
  selected: string;
  /** In-progress window/crossing preview highlight. */
  preview: string;
  previewFill: string;
  centroid: string;
  principal1: string;
  principal2: string;
  snap: string;
  overlayBg: string;
  overlayText: string;
}

export const CANVAS_THEME_LABELS: Record<CanvasThemeId, string> = {
  grasshopper: 'Grasshopper Style',
  dark: 'Dark',
  light: 'Bright / Light',
  custom: 'Custom',
};

/** Ratio of minor- to major-grid opacity. */
const MINOR_RATIO = 0.55;

type PresetId = Exclude<CanvasThemeId, 'custom'>;
type PaletteBase = Omit<CanvasPalette, 'gridMinorOpacity'>;

const PRESETS: Record<PresetId, PaletteBase> = {
  dark: {
    isLight: false,
    background: '#0c1222',
    gridColor: '#94a3b8',
    gridOpacity: 0.12,
    axisX: 'rgba(239,68,68,0.3)',
    axisY: 'rgba(34,197,94,0.3)',
    addFill: 'rgba(59,130,246,0.15)',
    addStroke: '#3b82f6',
    subtractFill: 'rgba(239,68,68,0.15)',
    subtractStroke: '#ef4444',
    lockedStroke: '#f59e0b',
    selected: '#fbbf24',
    preview: '#22d3ee',
    previewFill: 'rgba(34,211,238,0.18)',
    centroid: '#fbbf24',
    principal1: '#f59e0b',
    principal2: '#f97316',
    snap: '#facc15',
    overlayBg: 'rgba(15,23,42,0.85)',
    overlayText: '#94a3b8',
  },
  light: {
    isLight: true,
    background: '#f8fafc',
    gridColor: '#475569',
    gridOpacity: 0.18,
    axisX: 'rgba(220,38,38,0.55)',
    axisY: 'rgba(22,163,74,0.55)',
    addFill: 'rgba(37,99,235,0.12)',
    addStroke: '#2563eb',
    subtractFill: 'rgba(220,38,38,0.12)',
    subtractStroke: '#dc2626',
    lockedStroke: '#b45309',
    selected: '#d97706',
    preview: '#0891b2',
    previewFill: 'rgba(8,145,178,0.16)',
    centroid: '#b45309',
    principal1: '#d97706',
    principal2: '#ea580c',
    snap: '#ea580c',
    overlayBg: 'rgba(255,255,255,0.9)',
    overlayText: '#334155',
  },
  // Grasshopper (Rhino) canvas: warm grey background with a faint black grid,
  // red geometry preview and green selection.
  grasshopper: {
    isLight: true,
    background: '#d4d0c8',
    gridColor: '#000000',
    gridOpacity: 0.14,
    axisX: 'rgba(150,25,25,0.45)',
    axisY: 'rgba(30,120,30,0.45)',
    addFill: 'rgba(150,25,25,0.16)',
    addStroke: '#961919',
    subtractFill: 'rgba(51,65,85,0.16)',
    subtractStroke: '#334155',
    lockedStroke: '#8a5a00',
    selected: '#14a314',
    preview: '#0e7490',
    previewFill: 'rgba(14,116,144,0.18)',
    centroid: '#1f2937',
    principal1: '#7c2d12',
    principal2: '#9a3412',
    snap: '#c2410c',
    overlayBg: 'rgba(240,238,232,0.92)',
    overlayText: '#1f2937',
  },
};

export const DEFAULT_CANVAS_THEME: CanvasThemeSettings = {
  canvasTheme: 'dark',
  canvasCustom: {
    background: PRESETS.dark.background,
    gridColor: PRESETS.dark.gridColor,
    gridOpacity: PRESETS.dark.gridOpacity,
  },
};

const HEX_RE = /^#[0-9a-f]{6}$/i;

export function isHexColor(value: unknown): value is string {
  return typeof value === 'string' && HEX_RE.test(value);
}

/** Expand #rgb → #rrggbb and validate; returns null when invalid. */
export function normalizeHex(value: string): string | null {
  const v = value.trim();
  const short = /^#?([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(v);
  if (short) return `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`.toLowerCase();
  const long = /^#?([0-9a-f]{6})$/i.exec(v);
  return long ? `#${long[1].toLowerCase()}` : null;
}

export function clampOpacity(value: unknown, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(1, Math.max(0, n));
}

/** Relative luminance (WCAG) of a #rrggbb colour, 0–1. */
export function luminance(hex: string): number {
  const n = normalizeHex(hex) ?? '#000000';
  const ch = [1, 3, 5].map(i => parseInt(n.slice(i, i + 2), 16) / 255)
    .map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}

/** Background/grid/opacity of a theme (custom returns the stored colours). */
export function themeColors(settings: CanvasThemeSettings): CanvasCustomColors {
  if (settings.canvasTheme === 'custom') return { ...settings.canvasCustom };
  const p = PRESETS[settings.canvasTheme];
  return { background: p.background, gridColor: p.gridColor, gridOpacity: p.gridOpacity };
}

/** Resolve the full palette for the active canvas theme. */
export function resolveCanvasPalette(settings: CanvasThemeSettings): CanvasPalette {
  let base: PaletteBase;
  if (settings.canvasTheme === 'custom') {
    const c = settings.canvasCustom;
    // Pick object/overlay colours that contrast with the chosen background.
    const light = luminance(c.background) > 0.4;
    base = { ...PRESETS[light ? 'light' : 'dark'], ...c, isLight: light };
  } else {
    base = PRESETS[settings.canvasTheme] ?? PRESETS.dark;
  }
  return { ...base, gridMinorOpacity: base.gridOpacity * MINOR_RATIO };
}

/**
 * Sanitise persisted canvas-theme settings (unknown theme ids, malformed
 * colours and out-of-range opacity fall back to defaults).
 */
export function normalizeCanvasThemeSettings(raw: unknown): CanvasThemeSettings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const theme = typeof r.canvasTheme === 'string' && r.canvasTheme in CANVAS_THEME_LABELS
    ? (r.canvasTheme as CanvasThemeId)
    : DEFAULT_CANVAS_THEME.canvasTheme;
  const c = (r.canvasCustom && typeof r.canvasCustom === 'object' ? r.canvasCustom : {}) as Record<string, unknown>;
  const d = DEFAULT_CANVAS_THEME.canvasCustom;
  return {
    canvasTheme: theme,
    canvasCustom: {
      background: (typeof c.background === 'string' && normalizeHex(c.background)) || d.background,
      gridColor: (typeof c.gridColor === 'string' && normalizeHex(c.gridColor)) || d.gridColor,
      gridOpacity: clampOpacity(c.gridOpacity, d.gridOpacity),
    },
  };
}

/**
 * Apply an edit to one canvas colour. Editing while a preset is active
 * switches to Custom, seeded with that preset's colours, so the change is
 * kept and the preset itself stays intact.
 */
export function editCanvasColor(
  settings: CanvasThemeSettings,
  patch: Partial<CanvasCustomColors>,
): CanvasThemeSettings {
  const seeded = themeColors(settings);
  return { canvasTheme: 'custom', canvasCustom: { ...seeded, ...patch } };
}
