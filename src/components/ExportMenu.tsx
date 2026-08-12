'use client';
import React, { useState, useRef, useEffect } from 'react';

interface Props {
  onExportPDF: () => void;
  onExportJSON: () => void;
  onExportDXF: () => void;
  onExportExcel: () => void;
  onExportCSV: () => void;
  onImportJSON: () => void;
  disabled?: boolean;
}

export default function ExportMenu({ 
  onExportPDF, 
  onExportJSON, 
  onExportDXF, 
  onExportExcel, 
  onExportCSV,
  onImportJSON,
  disabled 
}: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleAction = (action: () => void) => {
    action();
    setIsOpen(false);
  };

  return (
    <div className="relative" ref={menuRef}>
      {/* Import Button */}
      <button 
        className="btn btn-ghost text-xs mr-1" 
        onClick={onImportJSON}
        title="Import Section (.json)"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
          <polyline points="17 8 12 3 7 8"/>
          <line x1="12" y1="3" x2="12" y2="15"/>
        </svg>
        Import
      </button>

      {/* Export Dropdown */}
      <button 
        className="btn btn-primary text-xs"
        onClick={() => setIsOpen(!isOpen)}
        disabled={disabled}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
          <polyline points="7 10 12 15 17 10"/>
          <line x1="12" y1="15" x2="12" y2="3"/>
        </svg>
        Export
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>

      {isOpen && (
        <div 
          className="absolute right-0 mt-1 w-52 rounded-lg shadow-lg py-1 z-50"
          style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}
        >
          <div className="px-3 py-1.5 text-[10px] font-semibold uppercase" style={{ color: 'var(--text-muted)' }}>
            Export Section
          </div>
          
          <button
            className="w-full px-3 py-2 text-left text-xs flex items-center gap-2 hover:bg-opacity-10 transition-colors"
            style={{ color: 'var(--text-primary)' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-tertiary)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            onClick={() => handleAction(onExportPDF)}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
              <polyline points="14,2 14,8 20,8"/>
            </svg>
            <div>
              <div className="font-medium">Export PDF</div>
              <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Engineering report with drawing</div>
            </div>
          </button>

          <button
            className="w-full px-3 py-2 text-left text-xs flex items-center gap-2 hover:bg-opacity-10 transition-colors"
            style={{ color: 'var(--text-primary)' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-tertiary)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            onClick={() => handleAction(onExportJSON)}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
              <polyline points="14,2 14,8 20,8"/>
              <path d="M8 13h2M8 17h2M14 13h2M14 17h2"/>
            </svg>
            <div>
              <div className="font-medium">Export JSON</div>
              <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Editable section file</div>
            </div>
          </button>

          <button
            className="w-full px-3 py-2 text-left text-xs flex items-center gap-2 hover:bg-opacity-10 transition-colors"
            style={{ color: 'var(--text-primary)' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-tertiary)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            onClick={() => handleAction(onExportDXF)}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="2"/>
              <path d="M3 9h18M9 21V9"/>
            </svg>
            <div>
              <div className="font-medium">Export DXF</div>
              <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>CAD geometry file</div>
            </div>
          </button>

          <button
            className="w-full px-3 py-2 text-left text-xs flex items-center gap-2 hover:bg-opacity-10 transition-colors"
            style={{ color: 'var(--text-primary)' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-tertiary)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            onClick={() => handleAction(onExportExcel)}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
              <polyline points="14,2 14,8 20,8"/>
              <line x1="8" y1="13" x2="16" y2="13"/>
              <line x1="8" y1="17" x2="16" y2="17"/>
            </svg>
            <div>
              <div className="font-medium">Export Excel (.xlsx)</div>
              <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Calculation workbook with formulas</div>
            </div>
          </button>

          <div className="my-1 border-t" style={{ borderColor: 'var(--border)' }} />

          <button
            className="w-full px-3 py-2 text-left text-xs flex items-center gap-2 hover:bg-opacity-10 transition-colors"
            style={{ color: 'var(--text-secondary)' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-tertiary)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            onClick={() => handleAction(onExportCSV)}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
              <polyline points="14,2 14,8 20,8"/>
            </svg>
            <div>
              <div className="font-medium">Export CSV</div>
              <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Simple data table</div>
            </div>
          </button>
        </div>
      )}
    </div>
  );
}
