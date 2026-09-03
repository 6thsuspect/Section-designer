'use client';
import React, { useState } from 'react';
import type { StoreState } from '@/store/useStore';
import ExportMenu from './ExportMenu';

interface ToolbarProps {
  store: StoreState;
  onSave: () => void;
  onLoad: () => void;
  onExportJSON: () => void;
  onExportCSV: () => void;
  onExportPDF: () => void;
  onExportDXF: () => void;
  onExportExcel: () => void;
  onImportJSON: () => void;
  showGrid: boolean;
  onToggleGrid: () => void;
  onFitView: () => void;
  onOpenSettings: () => void;
  onOpenAbout: () => void;
  hasSection: boolean;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
}

export default function Toolbar({ 
  store, onSave, onLoad, 
  onExportJSON, onExportCSV, onExportPDF, onExportDXF, onExportExcel, onImportJSON,
  showGrid, onToggleGrid, onFitView, onOpenSettings, onOpenAbout, hasSection,
  theme, onToggleTheme 
}: ToolbarProps) {
  const [logoOk, setLogoOk] = useState(true);
  return (
    <div className="h-11 flex items-center px-3 gap-1 border-b" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)' }}>
      {/* Brand */}
      <div className="flex items-center gap-2 mr-4">
        <div className="w-7 h-7 rounded flex items-center justify-center font-extrabold text-sm overflow-hidden" style={{ background: 'var(--accent)' }}>
          {logoOk ? (
            // Project logo asset — replace public/logo.svg to rebrand
            // eslint-disable-next-line @next/next/no-img-element
            <img src="/logo.svg" alt="Section Designer" className="w-7 h-7 object-contain" onError={() => setLogoOk(false)} />
          ) : (
            'SD'
          )}
        </div>
        <div className="hidden sm:block">
          <div className="text-sm font-bold leading-tight">Section Designer</div>
          <div className="text-[10px] leading-tight" style={{ color: 'var(--text-muted)' }}>Draw · Analyse · Design</div>
        </div>
      </div>

      <div className="w-px h-6 mx-1" style={{ background: 'var(--border)' }} />

      {/* File */}
      <button className="btn btn-ghost text-xs" onClick={store.newProject} title="New (Ctrl+N)">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14,2 14,8 20,8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg>
        New
      </button>
      <button className="btn btn-ghost text-xs" onClick={onLoad} title="Open from Database (Ctrl+O)">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>
        Open
      </button>
      <button className="btn btn-ghost text-xs" onClick={onSave} title="Save to Database (Ctrl+S)">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17,21 17,13 7,13 7,21"/><polyline points="7,3 7,8 15,8"/></svg>
        Save
      </button>

      <div className="w-px h-6 mx-1" style={{ background: 'var(--border)' }} />

      {/* Edit */}
      <button className="btn btn-ghost text-xs" onClick={store.undo} disabled={store.undoStack.length === 0} title="Undo (Ctrl+Z)">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="1,4 1,10 7,10"/><path d="M3.51 15a9 9 0 102.13-9.36L1 10"/></svg>
      </button>
      <button className="btn btn-ghost text-xs" onClick={store.redo} disabled={store.redoStack.length === 0} title="Redo (Ctrl+Y)">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23,4 23,10 17,10"/><path d="M20.49 15a9 9 0 11-2.13-9.36L23 10"/></svg>
      </button>

      <div className="w-px h-6 mx-1" style={{ background: 'var(--border)' }} />

      {/* View */}
      <button className="btn btn-ghost text-xs" onClick={onToggleGrid} title="Toggle Grid (G)">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="3" x2="9" y2="21"/><line x1="15" y1="3" x2="15" y2="21"/></svg>
        {showGrid ? 'Grid ✓' : 'Grid'}
      </button>
      <button className="btn btn-ghost text-xs" onClick={onFitView} title="Fit View (F)">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 3H5a2 2 0 00-2 2v3m18 0V5a2 2 0 00-2-2h-3m0 18h3a2 2 0 002-2v-3M3 16v3a2 2 0 002 2h3"/></svg>
        Fit
      </button>

      <div className="flex-1" />

      {/* Import/Export Menu */}
      <ExportMenu
        onExportPDF={onExportPDF}
        onExportJSON={onExportJSON}
        onExportDXF={onExportDXF}
        onExportExcel={onExportExcel}
        onExportCSV={onExportCSV}
        onImportJSON={onImportJSON}
        disabled={!hasSection}
      />

      <div className="w-px h-6 mx-1" style={{ background: 'var(--border)' }} />

      {/* Dark / Light mode toggle */}
      <button className="btn btn-ghost text-xs" onClick={onToggleTheme} title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}>
        {theme === 'dark' ? (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg>
        )}
        {theme === 'dark' ? 'Light' : 'Dark'}
      </button>

      <div className="w-px h-6 mx-1" style={{ background: 'var(--border)' }} />

      {/* Settings */}
      <button className="btn btn-ghost text-xs" onClick={onOpenSettings} title="Settings">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="3"/>
          <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"/>
        </svg>
      </button>

      {/* About */}
      <button className="btn btn-ghost text-xs" onClick={onOpenAbout} title="About">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10"/>
          <path d="M12 16v-4M12 8h.01"/>
        </svg>
      </button>
    </div>
  );
}
