'use client';
import React, { useState } from 'react';
import {
  CANVAS_THEME_LABELS,
  editCanvasColor,
  normalizeHex,
  resolveCanvasPalette,
  themeColors,
  type CanvasCustomColors,
  type CanvasThemeId,
  type CanvasThemeSettings,
} from '@/engine/canvasTheme';

export interface AppSettings extends CanvasThemeSettings {
  theme: 'dark' | 'light';
  fontSize: 'small' | 'medium' | 'large';
  dimensionFontScale: number;
  accentColor: string;
}

interface Props {
  settings: AppSettings;
  onSettingsChange: (settings: AppSettings) => void;
  onClose: () => void;
}

const ACCENT_COLORS = [
  { name: 'Blue', value: '#3b82f6' },
  { name: 'Green', value: '#22c55e' },
  { name: 'Purple', value: '#8b5cf6' },
  { name: 'Orange', value: '#f97316' },
  { name: 'Pink', value: '#ec4899' },
  { name: 'Cyan', value: '#06b6d4' },
];

export default function SettingsDialog({ settings, onSettingsChange, onClose }: Props) {
  const updateSetting = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    onSettingsChange({ ...settings, [key]: value });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)' }}>
      <div className="panel w-[400px] max-h-[80vh] flex flex-col" style={{ background: 'var(--bg-secondary)' }}>
        <div className="panel-header flex justify-between items-center">
          <span>⚙️ Settings</span>
          <button className="text-sm hover:opacity-70" onClick={onClose}>✕</button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {/* Theme */}
          <div className="mb-5">
            <label className="text-[11px] font-semibold uppercase mb-2 block" style={{ color: 'var(--text-muted)' }}>
              Theme
            </label>
            <div className="flex gap-2">
              <button
                className={`flex-1 py-2 px-3 rounded text-sm font-semibold flex items-center justify-center gap-2 ${settings.theme === 'dark' ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => updateSetting('theme', 'dark')}
              >
                🌙 Dark
              </button>
              <button
                className={`flex-1 py-2 px-3 rounded text-sm font-semibold flex items-center justify-center gap-2 ${settings.theme === 'light' ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => updateSetting('theme', 'light')}
              >
                ☀️ Light
              </button>
            </div>
          </div>

          {/* Canvas Theme */}
          <CanvasThemeSection settings={settings} onSettingsChange={onSettingsChange} />

          {/* Font Size */}
          <div className="mb-5">
            <label className="text-[11px] font-semibold uppercase mb-2 block" style={{ color: 'var(--text-muted)' }}>
              Interface Font Size
            </label>
            <div className="flex gap-2">
              {(['small', 'medium', 'large'] as const).map(size => (
                <button
                  key={size}
                  className={`flex-1 py-2 px-3 rounded font-semibold capitalize ${settings.fontSize === size ? 'btn-primary' : 'btn-ghost'}`}
                  style={{ fontSize: size === 'small' ? '11px' : size === 'medium' ? '13px' : '15px' }}
                  onClick={() => updateSetting('fontSize', size)}
                >
                  {size}
                </button>
              ))}
            </div>
          </div>

          {/* Dimension Font Scale */}
          <div className="mb-5">
            <label className="text-[11px] font-semibold uppercase mb-2 block" style={{ color: 'var(--text-muted)' }}>
              Canvas Dimension Font Size
            </label>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min="0.5"
                max="3"
                step="0.25"
                value={settings.dimensionFontScale}
                onChange={e => updateSetting('dimensionFontScale', parseFloat(e.target.value))}
                className="flex-1"
              />
              <span className="text-sm font-mono w-12 text-center" style={{ color: 'var(--text-primary)' }}>
                {settings.dimensionFontScale.toFixed(2)}x
              </span>
            </div>
            <div className="flex justify-between text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>
              <span>Small</span>
              <span>Large</span>
            </div>
          </div>

          {/* Accent Color */}
          <div className="mb-5">
            <label className="text-[11px] font-semibold uppercase mb-2 block" style={{ color: 'var(--text-muted)' }}>
              Accent Color
            </label>
            <div className="flex gap-2 flex-wrap">
              {ACCENT_COLORS.map(color => (
                <button
                  key={color.value}
                  className="w-10 h-10 rounded-lg border-2 transition-transform hover:scale-110"
                  style={{
                    background: color.value,
                    borderColor: settings.accentColor === color.value ? '#fff' : 'transparent',
                  }}
                  onClick={() => updateSetting('accentColor', color.value)}
                  title={color.name}
                />
              ))}
            </div>
          </div>

          {/* Preview */}
          <div className="mt-6 p-3 rounded" style={{ background: 'var(--bg-primary)', border: '1px solid var(--border)' }}>
            <div className="text-[10px] font-semibold uppercase mb-2" style={{ color: 'var(--text-muted)' }}>Preview</div>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded" style={{ background: settings.accentColor }} />
              <div>
                <div className="font-semibold" style={{ color: 'var(--text-primary)', fontSize: settings.fontSize === 'small' ? '11px' : settings.fontSize === 'medium' ? '13px' : '15px' }}>
                  Sample Text
                </div>
                <div style={{ color: 'var(--text-muted)', fontSize: settings.fontSize === 'small' ? '10px' : settings.fontSize === 'medium' ? '11px' : '13px' }}>
                  Secondary text
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="p-4 border-t" style={{ borderColor: 'var(--border)' }}>
          <button className="btn btn-primary w-full" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

const THEME_ORDER: CanvasThemeId[] = ['grasshopper', 'dark', 'light', 'custom'];

/** Canvas theme picker + background / grid colour and grid opacity controls. */
function CanvasThemeSection({ settings, onSettingsChange }: {
  settings: AppSettings;
  onSettingsChange: (settings: AppSettings) => void;
}) {
  const active = themeColors(settings);
  const setTheme = (canvasTheme: CanvasThemeId) => {
    // Choosing Custom for the first time starts from the colours on screen.
    if (canvasTheme === 'custom' && settings.canvasTheme !== 'custom') {
      onSettingsChange({ ...settings, ...editCanvasColor(settings, {}) });
    } else {
      onSettingsChange({ ...settings, canvasTheme });
    }
  };
  const edit = (patch: Partial<CanvasCustomColors>) =>
    onSettingsChange({ ...settings, ...editCanvasColor(settings, patch) });

  const labelCls = 'text-[11px] font-semibold uppercase mb-2 block';
  return (
    <div className="mb-5">
      <label className={labelCls} style={{ color: 'var(--text-muted)' }}>Canvas Theme</label>
      <div className="grid grid-cols-2 gap-2">
        {THEME_ORDER.map(id => {
          const p = resolveCanvasPalette({ canvasTheme: id, canvasCustom: settings.canvasCustom });
          const isActive = settings.canvasTheme === id;
          return (
            <button
              key={id}
              type="button"
              aria-pressed={isActive}
              className="rounded p-1.5 text-left transition-colors"
              style={{
                border: `2px solid ${isActive ? 'var(--accent)' : 'var(--border)'}`,
                background: 'var(--bg-primary)',
              }}
              onClick={() => setTheme(id)}
              title={CANVAS_THEME_LABELS[id]}
            >
              <ThemeSwatch palette={p} />
              <div className="text-[11px] font-semibold mt-1" style={{ color: 'var(--text-primary)' }}>
                {CANVAS_THEME_LABELS[id]}
              </div>
            </button>
          );
        })}
      </div>

      <div className="mt-3 space-y-2">
        <ColorRow label="Canvas Background" value={active.background} onChange={v => edit({ background: v })} />
        <ColorRow label="Grid Line Color" value={active.gridColor} onChange={v => edit({ gridColor: v })} />
        <div className="flex items-center gap-2">
          <span className="text-xs w-32 shrink-0" style={{ color: 'var(--text-secondary)' }}>Grid Line Opacity</span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={active.gridOpacity}
            onChange={e => edit({ gridOpacity: parseFloat(e.target.value) })}
            className="flex-1"
            aria-label="Grid line opacity"
          />
          <span className="text-xs font-mono w-10 text-right" style={{ color: 'var(--text-primary)' }}>
            {Math.round(active.gridOpacity * 100)}%
          </span>
        </div>
        <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
          Changing a colour switches to <b>Custom</b>, starting from the current theme. Colours only affect the
          canvas display — geometry, properties and exports are unchanged.
        </p>
      </div>
    </div>
  );
}

function ThemeSwatch({ palette }: { palette: ReturnType<typeof resolveCanvasPalette> }) {
  return (
    <svg viewBox="0 0 80 36" className="w-full h-9 rounded" style={{ background: palette.background, display: 'block' }}>
      {[10, 20, 30, 40, 50, 60, 70].map(x => (
        <line key={`v${x}`} x1={x} y1={0} x2={x} y2={36} stroke={palette.gridColor}
          strokeOpacity={x === 40 ? palette.gridOpacity : palette.gridMinorOpacity} strokeWidth={0.6} />
      ))}
      {[9, 18, 27].map(y => (
        <line key={`h${y}`} x1={0} y1={y} x2={80} y2={y} stroke={palette.gridColor}
          strokeOpacity={palette.gridMinorOpacity} strokeWidth={0.6} />
      ))}
      <rect x={14} y={8} width={30} height={7} fill={palette.addFill} stroke={palette.addStroke} strokeWidth={1} />
      <rect x={25} y={15} width={8} height={14} fill={palette.addFill} stroke={palette.addStroke} strokeWidth={1} />
      <rect x={52} y={10} width={16} height={16} fill={palette.addFill} stroke={palette.selected} strokeWidth={1.2} />
    </svg>
  );
}

function ColorRow({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  // Local text buffer so partially typed hex values are not rejected mid-edit.
  const [draft, setDraft] = useState<string | null>(null);
  const commit = (text: string) => {
    const hex = normalizeHex(text);
    if (hex) onChange(hex);
    setDraft(null);
  };
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs w-32 shrink-0" style={{ color: 'var(--text-secondary)' }}>{label}</span>
      <input
        type="color"
        value={value}
        onChange={e => onChange(e.target.value.toLowerCase())}
        className="w-8 h-7 p-0 rounded cursor-pointer"
        style={{ border: '1px solid var(--border)', background: 'transparent' }}
        aria-label={label}
      />
      <input
        type="text"
        value={draft ?? value}
        onChange={e => {
          setDraft(e.target.value);
          const hex = normalizeHex(e.target.value);
          if (hex && e.target.value.replace('#', '').length === 6) onChange(hex);
        }}
        onBlur={e => commit(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') commit((e.target as HTMLInputElement).value); }}
        className="flex-1 min-w-0 px-2 py-1 rounded text-xs font-mono"
        style={{ background: 'var(--bg-primary)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
        spellCheck={false}
        aria-label={`${label} hex`}
      />
    </div>
  );
}
