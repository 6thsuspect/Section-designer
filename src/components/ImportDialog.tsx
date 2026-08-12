'use client';
import React, { useState, useCallback } from 'react';
import { validateAndImportJSON, type ImportResult } from '@/engine/exporters';
import type { SectionProject } from '@/engine/types';

interface Props {
  onClose: () => void;
  onImport: (project: SectionProject) => void;
}

export default function ImportDialog({ onClose, onImport }: Props) {
  const [dragOver, setDragOver] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [fileName, setFileName] = useState<string>('');

  const handleFile = useCallback(async (file: File) => {
    setFileName(file.name);
    try {
      const text = await file.text();
      const importResult = validateAndImportJSON(text);
      setResult(importResult);
    } catch (e) {
      setResult({ success: false, error: 'Failed to read file.' });
    }
  }, []);

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
      <div className="panel w-[500px] max-h-[85vh] flex flex-col" style={{ background: 'var(--bg-secondary)' }}>
        <div className="panel-header flex justify-between items-center">
          <span>📥 Import Section</span>
          <button className="text-sm hover:opacity-70" onClick={onClose}>✕</button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {/* Drop zone */}
          <div
            className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${dragOver ? 'border-blue-500 bg-blue-500/10' : ''}`}
            style={{ borderColor: dragOver ? 'var(--accent)' : 'var(--border)' }}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
          >
            <div className="text-3xl mb-3">📄</div>
            <div className="text-sm mb-2" style={{ color: 'var(--text-primary)' }}>
              Drag & drop a section file here
            </div>
            <div className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>
              or click to browse
            </div>
            <input
              type="file"
              accept=".json,.section.json"
              onChange={handleFileSelect}
              className="hidden"
              id="file-input"
            />
            <label
              htmlFor="file-input"
              className="btn btn-primary text-xs cursor-pointer"
            >
              Select File
            </label>
          </div>

          {/* Result display */}
          {result && (
            <div className="mt-4">
              {result.success ? (
                <div className="p-4 rounded-lg" style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid var(--success)' }}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-lg">✅</span>
                    <span className="font-semibold" style={{ color: 'var(--success)' }}>
                      File validated successfully
                    </span>
                  </div>
                  
                  {result.project && (
                    <div className="text-xs space-y-1" style={{ color: 'var(--text-secondary)' }}>
                      <div><strong>File:</strong> {fileName}</div>
                      <div><strong>Section:</strong> {result.project.name}</div>
                      <div><strong>Components:</strong> {result.project.components.length}</div>
                      <div><strong>Units:</strong> {result.project.units}</div>
                    </div>
                  )}

                  {result.warnings && result.warnings.length > 0 && (
                    <div className="mt-3 p-2 rounded text-xs" style={{ background: 'rgba(245,158,11,0.1)', color: 'var(--warning)' }}>
                      <div className="font-semibold mb-1">⚠️ Warnings:</div>
                      {result.warnings.map((w, i) => (
                        <div key={i}>• {w}</div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-4 rounded-lg" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid var(--danger)' }}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-lg">❌</span>
                    <span className="font-semibold" style={{ color: 'var(--danger)' }}>
                      Import failed
                    </span>
                  </div>
                  <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                    {result.error}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Help text */}
          <div className="mt-4 p-3 rounded-lg text-xs" style={{ background: 'var(--bg-primary)', color: 'var(--text-muted)' }}>
            <strong>Supported formats:</strong>
            <ul className="list-disc ml-4 mt-1 space-y-0.5">
              <li>Section Designer JSON (.section.json)</li>
              <li>Legacy project files (.json)</li>
            </ul>
          </div>
        </div>

        <div className="p-4 border-t flex gap-2" style={{ borderColor: 'var(--border)' }}>
          <button className="btn btn-ghost flex-1" onClick={onClose}>
            Cancel
          </button>
          <button 
            className="btn btn-primary flex-1" 
            onClick={handleImport}
            disabled={!result?.success}
            style={{ opacity: result?.success ? 1 : 0.5 }}
          >
            Import Section
          </button>
        </div>
      </div>
    </div>
  );
}
