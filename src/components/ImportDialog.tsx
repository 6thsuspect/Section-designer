'use client';
import React, { useState, useCallback } from 'react';
import { validateAndImportJSON, type ImportResult } from '@/engine/exporters';
import { importDXF, type DXFImportResult } from '@/engine/dxfImporter';
import type { LengthUnit, SectionProject } from '@/engine/types';

interface Props {
  onClose: () => void;
  onImport: (project: SectionProject) => void;
}

type DialogResult = ImportResult & Pick<DXFImportResult, 'stats' | 'detectedUnit'>;

const DXF_UNITS: { value: LengthUnit; label: string }[] = [
  { value: 'mm', label: 'Millimetres (mm)' },
  { value: 'cm', label: 'Centimetres (cm)' },
  { value: 'm', label: 'Metres (m)' },
  { value: 'inch', label: 'Inches (in)' },
  { value: 'ft', label: 'Feet (ft)' },
];

export default function ImportDialog({ onClose, onImport }: Props) {
  const [dragOver, setDragOver] = useState(false);
  const [result, setResult] = useState<DialogResult | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const [sourceType, setSourceType] = useState<'json' | 'dxf' | null>(null);
  const [dxfText, setDxfText] = useState('');
  const [dxfUnit, setDxfUnit] = useState<LengthUnit>('mm');

  const handleFile = useCallback(async (file: File) => {
    setFileName(file.name);
    setResult(null);
    try {
      const text = await file.text();
      const isDxf = /\.dxf$/i.test(file.name);
      const isJson = /\.json$/i.test(file.name);
      if (!isDxf && !isJson) {
        setSourceType(null);
        setResult({ success: false, error: 'Unsupported file type. Select an ASCII DXF or Section Designer JSON file.' });
        return;
      }
      if (isDxf) {
        setSourceType('dxf');
        setDxfText(text);
        const imported = importDXF(text, file.name);
        if (imported.project) setDxfUnit(imported.project.units);
        setResult(imported);
      } else {
        setSourceType('json');
        setDxfText('');
        setResult(validateAndImportJSON(text));
      }
    } catch {
      setResult({ success: false, error: 'Failed to read file.' });
    }
  }, []);

  const handleUnitChange = useCallback((unit: LengthUnit) => {
    setDxfUnit(unit);
    if (dxfText) setResult(importDXF(dxfText, fileName, unit));
  }, [dxfText, fileName]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleImport = () => {
    if (result?.success && result.project) {
      onImport(result.project);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)' }}>
      <div className="panel w-[540px] max-h-[85vh] flex flex-col" style={{ background: 'var(--bg-secondary)' }}>
        <div className="panel-header flex justify-between items-center">
          <span>📥 Import Section</span>
          <button className="text-sm hover:opacity-70" onClick={onClose}>✕</button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          <div
            className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${dragOver ? 'border-blue-500 bg-blue-500/10' : ''}`}
            style={{ borderColor: dragOver ? 'var(--accent)' : 'var(--border)' }}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
          >
            <div className="text-3xl mb-3">📐</div>
            <div className="text-sm mb-2" style={{ color: 'var(--text-primary)' }}>
              Drag & drop a DXF or section file here
            </div>
            <div className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>
              Closed DXF contours are converted into calculation geometry
            </div>
            <input
              type="file"
              accept=".dxf,.json,.section.json,application/dxf,application/json"
              onChange={handleFileSelect}
              className="hidden"
              id="file-input"
            />
            <label htmlFor="file-input" className="btn btn-primary text-xs cursor-pointer">
              Select File
            </label>
          </div>

          {sourceType === 'dxf' && result?.success && (
            <div className="mt-4 p-3 rounded-lg flex items-center justify-between gap-4" style={{ background: 'var(--bg-primary)', border: '1px solid var(--border)' }}>
              <div>
                <div className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>DXF coordinate unit</div>
                <div className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                  {result.detectedUnit ? `Detected from $INSUNITS: ${result.detectedUnit}` : 'Not declared by the drawing — confirm the unit'}
                </div>
              </div>
              <select
                className="input text-xs py-1.5 w-44"
                value={dxfUnit}
                onChange={e => handleUnitChange(e.target.value as LengthUnit)}
                aria-label="DXF coordinate unit"
              >
                {DXF_UNITS.map(unit => <option key={unit.value} value={unit.value}>{unit.label}</option>)}
              </select>
            </div>
          )}

          {result && (
            <div className="mt-4">
              {result.success ? (
                <div className="p-4 rounded-lg" style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid var(--success)' }}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-lg">✅</span>
                    <span className="font-semibold" style={{ color: 'var(--success)' }}>
                      {sourceType === 'dxf' ? 'DXF geometry ready to import' : 'File validated successfully'}
                    </span>
                  </div>

                  {result.project && (
                    <div className="text-xs space-y-1" style={{ color: 'var(--text-secondary)' }}>
                      <div><strong>File:</strong> {fileName}</div>
                      <div><strong>Section:</strong> {result.project.name}</div>
                      <div><strong>Components:</strong> {result.project.components.length}</div>
                      <div><strong>Units:</strong> {result.project.units}</div>
                      {result.stats && (
                        <>
                          <div><strong>Closed contours:</strong> {result.stats.contoursImported}</div>
                          <div><strong>Detected cutouts:</strong> {result.stats.cutouts}</div>
                        </>
                      )}
                    </div>
                  )}

                  {result.warnings && result.warnings.length > 0 && (
                    <div className="mt-3 p-2 rounded text-xs" style={{ background: 'rgba(245,158,11,0.1)', color: 'var(--warning)' }}>
                      <div className="font-semibold mb-1">⚠️ Import notes:</div>
                      {result.warnings.map((warning, i) => <div key={i}>• {warning}</div>)}
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-4 rounded-lg" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid var(--danger)' }}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-lg">❌</span>
                    <span className="font-semibold" style={{ color: 'var(--danger)' }}>Import failed</span>
                  </div>
                  <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>{result.error}</div>
                </div>
              )}
            </div>
          )}

          <div className="mt-4 p-3 rounded-lg text-xs" style={{ background: 'var(--bg-primary)', color: 'var(--text-muted)' }}>
            <strong>Supported formats:</strong>
            <ul className="list-disc ml-4 mt-1 space-y-0.5">
              <li>ASCII DXF (.dxf): closed polylines, circles, ellipses, and connected line/arc loops</li>
              <li>Polyline bulge arcs are automatically discretized</li>
              <li>Nested contours and CUTOUT / HOLE / VOID layers become openings</li>
              <li>Section Designer and legacy project JSON files</li>
            </ul>
          </div>
        </div>

        <div className="p-4 border-t flex gap-2" style={{ borderColor: 'var(--border)' }}>
          <button className="btn btn-ghost flex-1" onClick={onClose}>Cancel</button>
          <button
            className="btn btn-primary flex-1"
            onClick={handleImport}
            disabled={!result?.success}
            style={{ opacity: result?.success ? 1 : 0.5 }}
          >
            Import & Calculate
          </button>
        </div>
      </div>
    </div>
  );
}
