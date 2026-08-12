'use client';
import React from 'react';

export interface AppSettings {
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
