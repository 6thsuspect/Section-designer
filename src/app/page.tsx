'use client';

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useStore } from '@/store/useStore';
import Toolbar from '@/components/Toolbar';
import ComponentsPanel from '@/components/ComponentsPanel';
import PropertiesPanel from '@/components/PropertiesPanel';
import Canvas from '@/components/Canvas';
import BottomPanel from '@/components/BottomPanel';
import SaveLoadDialog from '@/components/SaveLoadDialog';
import SettingsDialog, { type AppSettings } from '@/components/SettingsDialog';
import CustomShapeDialog from '@/components/CustomShapeDialog';
import AboutDialog from '@/components/AboutDialog';
import ImportDialog from '@/components/ImportDialog';
import { downloadJSON, downloadCSV, exportPDF, downloadDXF, exportExcel } from '@/engine/exporters';
import type { Point, SectionProject, SectionComponent } from '@/engine/types';

const DEFAULT_SETTINGS: AppSettings = {
  theme: 'dark',
  fontSize: 'medium',
  dimensionFontScale: 1.5,
  accentColor: '#3b82f6',
};

// Local persistence for app settings (theme etc.)
const SETTINGS_KEY = 'section-designer-settings';

// Panel resize bounds
const LEFT_MIN = 180, LEFT_MAX = 420;
const RIGHT_MIN = 220, RIGHT_MAX = 520;
const BOTTOM_MIN = 120, BOTTOM_MAX_RATIO = 0.6;

export default function Home() {
  const store = useStore();
  const [showGrid, setShowGrid] = useState(true);
  const [viewBox, setViewBox] = useState({ x: -400, y: -400, w: 800, h: 800 });
  const [bottomCollapsed, setBottomCollapsed] = useState(false);
  const [dialogMode, setDialogMode] = useState<'save' | 'load' | null>(null);
  const [leftPanelOpen, setLeftPanelOpen] = useState(true);
  const [rightPanelOpen, setRightPanelOpen] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [showCustomShape, setShowCustomShape] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);

  // Resizable panels
  const [leftWidth, setLeftWidth] = useState(224);
  const [rightWidth, setRightWidth] = useState(256);
  const [bottomHeight, setBottomHeight] = useState(280);
  const [isResizing, setIsResizing] = useState(false);

  // Custom shape editing (Edit Coordinates)
  const [editingShape, setEditingShape] = useState<{ id: string; name: string; points: Point[] } | null>(null);

  const hasSection = store.properties !== null && store.properties.area > 0;

  // Load persisted settings once on mount (deferred so the first render
  // matches the server output — same apply-after-mount flow as the theme)
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        const raw = window.localStorage.getItem(SETTINGS_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          setSettings({ ...DEFAULT_SETTINGS, ...parsed });
        }
      } catch {
        // ignore malformed settings
      }
    }, 0);
    return () => clearTimeout(t);
  }, []);

  // Persist settings whenever they change
  useEffect(() => {
    try {
      window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch {
      // storage unavailable — non-fatal
    }
  }, [settings]);

  // Apply theme
  useEffect(() => {
    const root = document.documentElement;
    if (settings.theme === 'light') {
      root.style.setProperty('--bg-primary', '#f8fafc');
      root.style.setProperty('--bg-secondary', '#ffffff');
      root.style.setProperty('--bg-tertiary', '#e2e8f0');
      root.style.setProperty('--text-primary', '#0f172a');
      root.style.setProperty('--text-secondary', '#475569');
      root.style.setProperty('--text-muted', '#94a3b8');
      root.style.setProperty('--border', '#e2e8f0');
    } else {
      root.style.setProperty('--bg-primary', '#0f172a');
      root.style.setProperty('--bg-secondary', '#1e293b');
      root.style.setProperty('--bg-tertiary', '#334155');
      root.style.setProperty('--text-primary', '#f1f5f9');
      root.style.setProperty('--text-secondary', '#94a3b8');
      root.style.setProperty('--text-muted', '#64748b');
      root.style.setProperty('--border', '#334155');
    }
    root.style.setProperty('--accent', settings.accentColor);

    // Font size
    const fontSizes = { small: '12px', medium: '14px', large: '16px' };
    root.style.fontSize = fontSizes[settings.fontSize];
  }, [settings]);

  const toggleTheme = useCallback(() => {
    setSettings(s => ({ ...s, theme: s.theme === 'dark' ? 'light' : 'dark' }));
  }, []);

  // Fit view to content
  const fitView = useCallback(() => {
    if (!store.properties || store.project.components.length === 0) {
      setViewBox({ x: -400, y: -400, w: 800, h: 800 });
      return;
    }
    const p = store.properties;
    const cx = p.centroidX;
    const cy = p.centroidY;
    const halfW = Math.max(Math.abs(p.xMax), Math.abs(p.xMin), 100) * 1.5;
    const halfH = Math.max(Math.abs(p.yMax), Math.abs(p.yMin), 100) * 1.5;
    const size = Math.max(halfW, halfH) * 2;
    setViewBox({ x: cx - size / 2, y: -cy - size / 2, w: size, h: size });
  }, [store.properties, store.project.components.length]);

  // Export handlers
  const handleExportJSON = useCallback(() => {
    downloadJSON(store.project);
  }, [store.project]);

  const handleExportCSV = useCallback(() => {
    if (!store.properties) {
      alert('No section properties to export. Add components first.');
      return;
    }
    downloadCSV(store.properties, store.project);
  }, [store.properties, store.project]);

  const handleExportPDF = useCallback(() => {
    if (!store.properties) {
      alert('No section properties to export. Add components first.');
      return;
    }
    exportPDF(
      store.properties,
      store.project,
      store.calcTrace,
      store.stressResult ? {
        maxCompression: store.stressResult.maxCompression,
        maxTension: store.stressResult.maxTension,
        neutralAxisAngle: store.stressResult.neutralAxisAngle,
      } : null,
    );
  }, [store.properties, store.project, store.calcTrace, store.stressResult]);

  const handleExportDXF = useCallback(() => {
    if (!store.properties) {
      alert('No section properties to export. Add components first.');
      return;
    }
    downloadDXF(store.project, store.properties);
  }, [store.properties, store.project]);

  const handleExportExcel = useCallback(() => {
    if (!store.properties) {
      alert('No section properties to export. Add components first.');
      return;
    }
    exportExcel(store.project, store.properties);
  }, [store.properties, store.project]);

  const handleImportJSON = useCallback((project: SectionProject) => {
    store.setProject(project);
    setTimeout(fitView, 100);
  }, [store, fitView]);

  // Create custom shape from coordinates
  const handleCreateCustomShape = useCallback((name: string, points: Point[]) => {
    store.addCustomShape(name, points);
  }, [store]);

  // Apply edits to an existing custom shape (updates the same component,
  // recomputes geometry and section properties immediately)
  const handleUpdateCustomShape = useCallback((id: string, name: string, points: Point[]) => {
    store.updateComponent(id, { name, geometry: { points } });
    setEditingShape(null);
  }, [store]);

  const openEditCoordinates = useCallback((comp: SectionComponent) => {
    setEditingShape({
      id: comp.id,
      name: comp.name,
      points: (comp.geometry.points ?? []).map(p => ({ x: p.x, y: p.y })),
    });
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        switch (e.key.toLowerCase()) {
          case 'n': e.preventDefault(); store.newProject(); break;
          case 's': e.preventDefault(); setDialogMode('save'); break;
          case 'o': e.preventDefault(); setDialogMode('load'); break;
          case 'z': e.preventDefault(); store.undo(); break;
          case 'y': e.preventDefault(); store.redo(); break;
          case 'i': e.preventDefault(); setShowImport(true); break;
        }
      } else {
        switch (e.key.toLowerCase()) {
          case 'delete':
          case 'backspace':
            if (store.selectedIds.length > 0 && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
              e.preventDefault();
              if (store.selectedIds.length > 1) {
                store.deleteComponents(store.selectedIds);
              } else {
                store.deleteComponent(store.selectedIds[0]);
              }
            }
            break;
          case 'escape':
            store.selectComponent(null);
            setShowSettings(false);
            setShowCustomShape(false);
            setShowImport(false);
            setEditingShape(null);
            break;
          case 'f':
            if (document.activeElement?.tagName !== 'INPUT') fitView();
            break;
          case 'g':
            if (document.activeElement?.tagName !== 'INPUT') setShowGrid(g => !g);
            break;
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [store, fitView]);

  // ─── Panel resizing ──────────────────────────────────────────────────────
  const resizeState = useRef<{ pointerId: number; axis: 'x' | 'y'; start: number; size: number } | null>(null);

  const beginResize = useCallback((
    e: React.PointerEvent,
    axis: 'x' | 'y',
    currentSize: number,
    apply: (size: number) => void,
    min: number,
    max: number,
    invert: boolean,
  ) => {
    e.preventDefault();
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    resizeState.current = { pointerId: e.pointerId, axis, start: axis === 'x' ? e.clientX : e.clientY, size: currentSize };
    setIsResizing(true);

    const onMove = (ev: PointerEvent) => {
      const st = resizeState.current;
      if (!st || st.pointerId !== ev.pointerId) return;
      const pos = axis === 'x' ? ev.clientX : ev.clientY;
      const delta = pos - st.start;
      const next = invert ? st.size - delta : st.size + delta;
      apply(Math.max(min, Math.min(max, next)));
    };
    const onUp = (ev: PointerEvent) => {
      if (resizeState.current?.pointerId !== ev.pointerId) return;
      resizeState.current = null;
      setIsResizing(false);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onUp);
    };
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);
  }, []);

  const bottomMax = typeof window !== 'undefined' ? Math.max(BOTTOM_MIN, Math.round(window.innerHeight * BOTTOM_MAX_RATIO)) : 560;

  return (
    <div className="h-screen flex flex-col" style={{ background: 'var(--bg-primary)', userSelect: isResizing ? 'none' : undefined }}>
      {/* Toolbar */}
      <Toolbar
        store={store}
        onSave={() => setDialogMode('save')}
        onLoad={() => setDialogMode('load')}
        onExportJSON={handleExportJSON}
        onExportCSV={handleExportCSV}
        onExportPDF={handleExportPDF}
        onExportDXF={handleExportDXF}
        onExportExcel={handleExportExcel}
        onImportJSON={() => setShowImport(true)}
        showGrid={showGrid}
        onToggleGrid={() => setShowGrid(!showGrid)}
        onFitView={fitView}
        onOpenSettings={() => setShowSettings(true)}
        onOpenAbout={() => setShowAbout(true)}
        hasSection={hasSection}
        theme={settings.theme}
        onToggleTheme={toggleTheme}
      />

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Panel - Components */}
        {leftPanelOpen && (
          <>
            <div className="shrink-0 border-r overflow-hidden flex flex-col" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)', width: leftWidth }}>
              <ComponentsPanel store={store} onOpenCustomShape={() => setShowCustomShape(true)} onEditCoordinates={openEditCoordinates} />
            </div>
            {/* Left panel resize handle */}
            <div
              className="panel-resizer panel-resizer-v"
              onPointerDown={e => beginResize(e, 'x', leftWidth, setLeftWidth, LEFT_MIN, LEFT_MAX, false)}
              title="Drag to resize"
            />
          </>
        )}

        {/* Center - Canvas */}
        <div className="flex-1 flex flex-col overflow-hidden relative">
          {/* Left toggle button */}
          <button
            className="absolute top-2 left-2 z-10 w-8 h-8 rounded flex items-center justify-center transition-colors"
            style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}
            onClick={() => setLeftPanelOpen(!leftPanelOpen)}
            title={leftPanelOpen ? 'Hide Components Panel' : 'Show Components Panel'}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--text-secondary)' }}>
              {leftPanelOpen ? (
                <path d="M11 19l-7-7 7-7M18 19l-7-7 7-7" />
              ) : (
                <>
                  <line x1="3" y1="6" x2="21" y2="6" />
                  <line x1="3" y1="12" x2="21" y2="12" />
                  <line x1="3" y1="18" x2="21" y2="18" />
                </>
              )}
            </svg>
          </button>

          {/* Right toggle button */}
          <button
            className="absolute top-2 right-2 z-10 w-8 h-8 rounded flex items-center justify-center transition-colors"
            style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}
            onClick={() => setRightPanelOpen(!rightPanelOpen)}
            title={rightPanelOpen ? 'Hide Properties Panel' : 'Show Properties Panel'}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--text-secondary)' }}>
              {rightPanelOpen ? (
                <path d="M13 5l7 7-7 7M6 5l7 7-7 7" />
              ) : (
                <>
                  <line x1="3" y1="6" x2="21" y2="6" />
                  <line x1="3" y1="12" x2="21" y2="12" />
                  <line x1="3" y1="18" x2="21" y2="18" />
                </>
              )}
            </svg>
          </button>

          <div className="flex-1 overflow-hidden">
            <Canvas
              store={store}
              showGrid={showGrid}
              viewBox={viewBox}
              setViewBox={setViewBox}
              dimensionFontScale={settings.dimensionFontScale}
            />
          </div>

          {/* Bottom panel resize handle */}
          {!bottomCollapsed && (
            <div
              className="panel-resizer panel-resizer-h"
              onPointerDown={e => beginResize(e, 'y', bottomHeight, setBottomHeight, BOTTOM_MIN, bottomMax, true)}
              title="Drag to resize"
            />
          )}

          {/* Bottom Panel */}
          <BottomPanel
            store={store}
            collapsed={bottomCollapsed}
            onToggle={() => setBottomCollapsed(!bottomCollapsed)}
            height={bottomHeight}
          />
        </div>

        {/* Right panel resize handle */}
        {rightPanelOpen && (
          <>
            <div
              className="panel-resizer panel-resizer-v"
              onPointerDown={e => beginResize(e, 'x', rightWidth, setRightWidth, RIGHT_MIN, RIGHT_MAX, true)}
              title="Drag to resize"
            />
            <div className="shrink-0 border-l overflow-hidden flex flex-col" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)', width: rightWidth }}>
              <PropertiesPanel store={store} onEditCoordinates={openEditCoordinates} />
            </div>
          </>
        )}
      </div>

      {/* Copyright Footer */}
      <div
        className="h-6 flex items-center justify-center text-[10px] border-t shrink-0"
        style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)', color: 'var(--text-muted)' }}
      >
        © 2025 Arvind Singh Rawat. All Rights Reserved.
      </div>

      {/* Dialogs */}
      <SaveLoadDialog store={store} mode={dialogMode} onClose={() => setDialogMode(null)} />

      {showSettings && (
        <SettingsDialog
          settings={settings}
          onSettingsChange={setSettings}
          onClose={() => setShowSettings(false)}
        />
      )}

      {showCustomShape && !editingShape && (
        <CustomShapeDialog
          onClose={() => setShowCustomShape(false)}
          onCreateShape={handleCreateCustomShape}
        />
      )}

      {editingShape && (
        <CustomShapeDialog
          onClose={() => setEditingShape(null)}
          onCreateShape={handleCreateCustomShape}
          editShape={editingShape}
          onUpdateShape={handleUpdateCustomShape}
        />
      )}

      {showAbout && (
        <AboutDialog onClose={() => setShowAbout(false)} />
      )}

      {showImport && (
        <ImportDialog
          onClose={() => setShowImport(false)}
          onImport={handleImportJSON}
        />
      )}
    </div>
  );
}
