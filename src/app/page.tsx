'use client';

import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
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
import { computeSectionProperties } from '@/engine/geometry';
import type { Point, SectionProject, SectionComponent } from '@/engine/types';
import { DEFAULT_CANVAS_THEME, normalizeCanvasThemeSettings, resolveCanvasPalette } from '@/engine/canvasTheme';
import { DockDragLayer, DockFrame, PanelPortal, usePanelNodes, type DockDragHandle } from '@/components/Docking';
import {
  DEFAULT_DOCK_LAYOUT, PANEL_IDS, SIZE_LIMITS, clampFloatRect, dockPanel, floatPanel, floatingPanels,
  normalizeDockLayout, panelsOnSide, setPanelOpen, setSideSize, toggleFloat,
  type DockLayout, type DockSide, type PanelId, type Rect,
} from '@/engine/dockLayout';

const DEFAULT_SETTINGS: AppSettings = {
  theme: 'dark',
  fontSize: 'medium',
  dimensionFontScale: 1.5,
  accentColor: '#3b82f6',
  ...DEFAULT_CANVAS_THEME,
};

// Local persistence for app settings (theme etc.)
const SETTINGS_KEY = 'section-designer-settings';

// Panel resize bounds
const LAYOUT_KEY = 'section-designer:layout';
const viewportSize = () => ({ w: window.innerWidth, h: window.innerHeight });
const BOTTOM_MIN = 120, BOTTOM_MAX_RATIO = 0.6;

export default function Home() {
  const store = useStore();
  const [showGrid, setShowGrid] = useState(true);
  // AutoCAD-style Object Snap (F3). Persisted as a user preference.
  const [osnap, setOsnapState] = useState(true);
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem('section-designer:osnap');
      // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate client-only preference
      if (saved !== null) setOsnapState(saved === '1');
    } catch { /* storage unavailable */ }
  }, []);
  const setOsnap = useCallback((update: boolean | ((previous: boolean) => boolean)) => {
    setOsnapState(previous => {
      const next = typeof update === 'function' ? update(previous) : update;
      try { window.localStorage.setItem('section-designer:osnap', next ? '1' : '0'); } catch { /* ignore */ }
      return next;
    });
  }, []);
  const [viewBox, setViewBox] = useState({ x: -400, y: -400, w: 800, h: 800 });
  const [bottomCollapsed, setBottomCollapsed] = useState(false);
  const [dialogMode, setDialogMode] = useState<'save' | 'load' | null>(null);
  // Dockable panels (Components / Properties)
  const [layout, setLayout] = useState<DockLayout>(DEFAULT_DOCK_LAYOUT);
  const [frontPanel, setFrontPanel] = useState<PanelId>('properties');
  const panelNodes = usePanelNodes(PANEL_IDS);
  const dockDragRef = useRef<DockDragHandle>(null);
  const canvasAreaRef = useRef<HTMLDivElement>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showCustomShape, setShowCustomShape] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);

  // Resizable panels
  const [bottomHeight, setBottomHeight] = useState(280);
  const [isResizing, setIsResizing] = useState(false);

  // Custom shape editing (Edit Coordinates)
  const [editingShape, setEditingShape] = useState<{ id: string; name: string; points: Point[] } | null>(null);

  const hasSection = store.properties !== null && store.properties.area > 0;

  // Load persisted settings once on mount (deferred so the first render
  // matches the server output — same apply-after-mount flow as the theme)
  // Guards the persist effect so the defaults rendered on first mount never
  // overwrite the saved settings before they have been loaded.
  const settingsLoadedRef = useRef(false);
  useEffect(() => {
    const t = setTimeout(() => {
      settingsLoadedRef.current = true;
      try {
        const raw = window.localStorage.getItem(SETTINGS_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          setSettings({ ...DEFAULT_SETTINGS, ...parsed, ...normalizeCanvasThemeSettings(parsed) });
        }
      } catch {
        // ignore malformed settings
      }
    }, 0);
    return () => clearTimeout(t);
  }, []);

  // Persist settings whenever they change
  useEffect(() => {
    if (!settingsLoadedRef.current) return;
    try {
      window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch {
      // storage unavailable — non-fatal
    }
  }, [settings]);

  // Load / persist the dock layout (same deferred-load guard as settings)
  const layoutLoadedRef = useRef(false);
  useEffect(() => {
    const t = setTimeout(() => {
      layoutLoadedRef.current = true;
      try {
        const raw = window.localStorage.getItem(LAYOUT_KEY);
        if (raw) {
          const loaded = normalizeDockLayout(JSON.parse(raw));
          for (const id of PANEL_IDS) loaded.panels[id].float = clampFloatRect(loaded.panels[id].float, viewportSize());
          setLayout(loaded);
        }
      } catch { /* ignore malformed layout */ }
    }, 0);
    return () => clearTimeout(t);
  }, []);
  useEffect(() => {
    if (!layoutLoadedRef.current) return;
    try { window.localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout)); } catch { /* non-fatal */ }
  }, [layout]);

  // Keep floating panels on-screen when the window is resized
  useEffect(() => {
    const onResize = () => setLayout(l => {
      let next = l;
      for (const id of floatingPanels(l)) {
        const r = clampFloatRect(l.panels[id].float, viewportSize());
        const f = l.panels[id].float;
        if (r.x !== f.x || r.y !== f.y || r.w !== f.w || r.h !== f.h) {
          next = { ...next, panels: { ...next.panels, [id]: { ...next.panels[id], float: r } } };
        }
      }
      return next;
    });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const handleDock = useCallback((id: PanelId, side: DockSide) => setLayout(l => dockPanel(l, id, side)), []);
  const handleFloat = useCallback((id: PanelId, rect: Rect) => {
    setLayout(l => floatPanel(l, id, rect, viewportSize()));
    setFrontPanel(id);
  }, []);
  const handleToggleFloat = useCallback((id: PanelId) => {
    setLayout(l => toggleFloat(l, id, viewportSize()));
    setFrontPanel(id);
  }, []);
  const handleClosePanel = useCallback((id: PanelId) => setLayout(l => setPanelOpen(l, id, false)), []);
  const togglePanelOpen = useCallback((id: PanelId) => setLayout(l => setPanelOpen(l, id, !l.panels[id].open)), []);
  const handleHeaderPointerDown = useCallback((id: PanelId, e: React.PointerEvent) => {
    const f = layout.panels[id].float;
    dockDragRef.current?.begin(id, e, { w: f.w, h: f.h });
  }, [layout.panels]);
  const getCanvasRect = useCallback((): Rect | null => {
    const r = canvasAreaRef.current?.getBoundingClientRect();
    return r ? { x: r.left, y: r.top, w: r.width, h: r.height } : null;
  }, []);

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

  // Canvas colours (presentation only — never affects geometry)
  const canvasPalette = useMemo(
    () => resolveCanvasPalette({ canvasTheme: settings.canvasTheme, canvasCustom: settings.canvasCustom }),
    [settings.canvasTheme, settings.canvasCustom],
  );

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

  const handleImportProject = useCallback((project: SectionProject) => {
    store.setProject(project);
    // Fit from the imported geometry directly. Calling fitView here would use
    // the previous render's properties while React is applying setProject.
    const p = computeSectionProperties(project.components).props;
    if (p.area > 0) {
      const halfW = Math.max(Math.abs(p.xMax), Math.abs(p.xMin), 1) * 1.5;
      const halfH = Math.max(Math.abs(p.yMax), Math.abs(p.yMin), 1) * 1.5;
      const size = Math.max(halfW, halfH) * 2;
      setViewBox({ x: p.centroidX - size / 2, y: -p.centroidY - size / 2, w: size, h: size });
    }
  }, [store]);

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
      if (e.key === 'F3') {
        // AutoCAD: F3 toggles running object snaps
        e.preventDefault();
        setOsnap(o => !o);
        return;
      }
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
              const single = store.project.components.find(c => c.id === store.selectedIds[0]);
              if (store.selectedVoid && store.selectedIds.length === 1 && store.selectedIds[0] === store.selectedVoid.combinedId) {
                // Delete Cutout: remove the selected void of a combined section
                store.deleteCutout(store.selectedVoid);
              } else if (store.selectedIds.length === 1 && single?.associationKind === 'combined-cutout') {
                store.deleteCutout({ cutoutId: single.id });
              } else if (store.selectedIds.length > 1) {
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
  }, [store, fitView, setOsnap]);

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

  // Render the panels docked on one side, with a resize handle on the canvas edge
  const renderDockSide = (side: DockSide) => {
    const ids = panelsOnSide(layout, side);
    if (ids.length === 0) return null;
    const vertical = side === 'left' || side === 'right';
    const size = layout.sizes[side];
    const borderSide = { left: 'borderRight', right: 'borderLeft', top: 'borderBottom', bottom: 'borderTop' }[side];
    const container = (
      <div
        data-dock-side={side}
        className={`shrink-0 flex ${vertical ? 'flex-col' : 'flex-row'} overflow-hidden`}
        style={{
          background: 'var(--bg-secondary)',
          [vertical ? 'width' : 'height']: size,
          [borderSide]: '1px solid var(--border)',
        }}
      >
        {ids.map((id, i) => (
          <DockFrame
            key={id}
            id={id}
            node={panelNodes[id]}
            placement={side}
            className="flex-1 min-h-0 min-w-0"
            style={i > 0 ? { [vertical ? 'borderTop' : 'borderLeft']: '1px solid var(--border)' } : undefined}
            onHeaderPointerDown={handleHeaderPointerDown}
            onToggleFloat={handleToggleFloat}
            onClose={handleClosePanel}
          />
        ))}
      </div>
    );
    const resizer = (
      <div
        className={`panel-resizer ${vertical ? 'panel-resizer-v' : 'panel-resizer-h'}`}
        onPointerDown={e => beginResize(
          e, vertical ? 'x' : 'y', size,
          next => setLayout(l => setSideSize(l, side, next)),
          SIZE_LIMITS[side].min, SIZE_LIMITS[side].max,
          side === 'right' || side === 'bottom',
        )}
        title="Drag to resize"
      />
    );
    return side === 'left' || side === 'top'
      ? <>{container}{resizer}</>
      : <>{resizer}{container}</>;
  };

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
        onImportFile={() => setShowImport(true)}
        showGrid={showGrid}
        onToggleGrid={() => setShowGrid(!showGrid)}
        osnap={osnap}
        onToggleOsnap={() => setOsnap(o => !o)}
        onFitView={fitView}
        onOpenSettings={() => setShowSettings(true)}
        onOpenAbout={() => setShowAbout(true)}
        hasSection={hasSection}
        theme={settings.theme}
        onToggleTheme={toggleTheme}
      />

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {renderDockSide('left')}

        {/* Center column: top dock, canvas, bottom dock, results panel */}
        <div className="flex-1 flex flex-col overflow-hidden relative min-w-0">
          {renderDockSide('top')}

          <div ref={canvasAreaRef} className="flex-1 overflow-hidden relative min-h-0">
            {/* Components panel toggle */}
            <button
              className="absolute top-2 left-2 z-10 w-8 h-8 rounded flex items-center justify-center transition-colors"
              style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}
              onClick={() => togglePanelOpen('components')}
              title={layout.panels.components.open ? 'Hide Components Panel' : 'Show Components Panel'}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--text-secondary)' }}>
                {layout.panels.components.open ? (
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

            {/* Properties panel toggle */}
            <button
              className="absolute top-2 right-2 z-10 w-8 h-8 rounded flex items-center justify-center transition-colors"
              style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}
              onClick={() => togglePanelOpen('properties')}
              title={layout.panels.properties.open ? 'Hide Properties Panel' : 'Show Properties Panel'}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--text-secondary)' }}>
                {layout.panels.properties.open ? (
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

            <Canvas
              store={store}
              showGrid={showGrid}
              osnap={osnap}
              viewBox={viewBox}
              setViewBox={setViewBox}
              dimensionFontScale={settings.dimensionFontScale}
              palette={canvasPalette}
            />
          </div>

          {renderDockSide('bottom')}

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

        {renderDockSide('right')}
      </div>

      {/* Floating panels */}
      {floatingPanels(layout).map(id => (
        <DockFrame
          key={id}
          id={id}
          node={panelNodes[id]}
          placement="float"
          floatRect={layout.panels[id].float}
          zIndex={frontPanel === id ? 32 : 31}
          onHeaderPointerDown={handleHeaderPointerDown}
          onToggleFloat={handleToggleFloat}
          onClose={handleClosePanel}
          onFloatResize={handleFloat}
          onFocus={setFrontPanel}
        />
      ))}

      {/* Docking zones / drag ghost */}
      <DockDragLayer
        ref={dockDragRef}
        getCanvasRect={getCanvasRect}
        sideSizes={layout.sizes}
        onDock={handleDock}
        onFloat={handleFloat}
      />

      {/* Panel contents: mounted once, re-parented into whichever frame hosts them */}
      <PanelPortal node={panelNodes.components}>
        <ComponentsPanel store={store} onOpenCustomShape={() => setShowCustomShape(true)} onEditCoordinates={openEditCoordinates} />
      </PanelPortal>
      <PanelPortal node={panelNodes.properties}>
        <PropertiesPanel store={store} onEditCoordinates={openEditCoordinates} />
      </PanelPortal>

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
          onImport={handleImportProject}
        />
      )}
    </div>
  );
}
