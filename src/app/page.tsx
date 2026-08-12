'use client';

import React, { useState, useCallback, useEffect } from 'react';
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
import type { Point, SectionProject } from '@/engine/types';

const DEFAULT_SETTINGS: AppSettings = {
  theme: 'dark',
  fontSize: 'medium',
  dimensionFontScale: 1.5,
  accentColor: '#3b82f6',
};

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

  const hasSection = store.properties !== null && store.properties.area > 0;

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
            if (store.selectedComponentId && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
              e.preventDefault();
              store.deleteComponent(store.selectedComponentId);
            }
            break;
          case 'escape':
            store.selectComponent(null);
            setShowSettings(false);
            setShowCustomShape(false);
            setShowImport(false);
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

  return (
    <div className="h-screen flex flex-col" style={{ background: 'var(--bg-primary)' }}>
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
      />

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Panel - Components */}
        {leftPanelOpen && (
          <div className="w-56 shrink-0 border-r overflow-hidden flex flex-col" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)' }}>
            <ComponentsPanel store={store} onOpenCustomShape={() => setShowCustomShape(true)} />
          </div>
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

          {/* Bottom Panel */}
          <BottomPanel store={store} collapsed={bottomCollapsed} onToggle={() => setBottomCollapsed(!bottomCollapsed)} />
        </div>

        {/* Right Panel - Properties */}
        {rightPanelOpen && (
          <div className="w-64 shrink-0 border-l overflow-hidden flex flex-col" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)' }}>
            <PropertiesPanel store={store} />
          </div>
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

      {showCustomShape && (
        <CustomShapeDialog
          onClose={() => setShowCustomShape(false)}
          onCreateShape={handleCreateCustomShape}
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
