'use client';
import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import type { Point } from '@/engine/types';
import CoordinatePreview from './CoordinatePreview';
import { formatCoordinates, type CopyFormat } from '@/engine/coordinateClipboard';

interface Props {
  onClose: () => void;
  onCreateShape: (name: string, points: Point[]) => void;
  /** When provided, the dialog edits an existing custom shape instead of creating one. */
  editShape?: { id: string; name: string; points: Point[] } | null;
  onUpdateShape?: (id: string, name: string, points: Point[]) => void;
}

/** Parse coordinate text into points – pure function, no side-effects */
function parsePoints(text: string): { points: Point[]; lineErrors: string[] } {
  const lines = text.split('\n');
  const points: Point[] = [];
  const lineErrors: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const parts = line.split(/[\s,]+/).filter(p => p);
    if (parts.length < 2) {
      lineErrors.push(`Line ${i + 1}: Need two numbers (x, y).`);
      continue;
    }
    const x = parseFloat(parts[0]);
    const y = parseFloat(parts[1]);
    if (isNaN(x) || isNaN(y)) {
      lineErrors.push(`Line ${i + 1}: Invalid number.`);
      continue;
    }
    points.push({ x, y });
  }

  return { points, lineErrors };
}

export default function CustomShapeDialog({ onClose, onCreateShape, editShape, onUpdateShape }: Props) {
  const isEdit = !!editShape;

  // ─── Create mode state (unchanged workflow) ──────────────────────────────
  const [name, setName] = useState(editShape?.name ?? 'Custom Polygon');
  const [coordText, setCoordText] = useState(
    editShape
      ? editShape.points.map(p => `${p.x}, ${p.y}`).join('\n')
      : '0, 0\n100, 0\n100, 50\n50, 50\n50, 100\n0, 100'
  );
  const [submitError, setSubmitError] = useState('');

  // ─── Edit mode state: per-point rows (kept as strings for smooth typing) ─
  const [rows, setRows] = useState<{ x: string; y: string }[]>(
    editShape
      ? editShape.points.map(p => ({ x: String(p.x), y: String(p.y) }))
      : []
  );

  // ─── Point selection (edit mode) ─────────────────────────────────────────
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const anchorRef = useRef<number | null>(null);
  const [copyFormat, setCopyFormat] = useState<CopyFormat>('comma');
  const [copyNotice, setCopyNotice] = useState('');
  const dialogRef = useRef<HTMLDivElement>(null);

  const selectPoint = useCallback((i: number, mode: 'single' | 'toggle' | 'range') => {
    setSelected(prev => {
      if (mode === 'range' && anchorRef.current !== null) {
        const [a, b] = [Math.min(anchorRef.current, i), Math.max(anchorRef.current, i)];
        const next = new Set(prev);
        for (let k = a; k <= b; k++) next.add(k);
        return next;
      }
      anchorRef.current = i;
      if (mode === 'toggle') {
        const next = new Set(prev);
        if (next.has(i)) next.delete(i); else next.add(i);
        return next;
      }
      return new Set([i]);
    });
  }, []);

  const selectAll = useCallback(() => setSelected(new Set(rows.map((_, i) => i))), [rows]);
  const clearSelection = useCallback(() => { setSelected(new Set()); anchorRef.current = null; }, []);

  const selectedText = useCallback(() => formatCoordinates(
    [...selected].sort((a, b) => a - b).filter(i => i < rows.length).map(i => rows[i]),
    copyFormat,
  ), [selected, rows, copyFormat]);

  const flashCopied = useCallback((count: number) => {
    setCopyNotice(`Copied ${count} point${count === 1 ? '' : 's'} to the clipboard`);
    window.setTimeout(() => setCopyNotice(''), 2000);
  }, []);

  const copySelected = useCallback(async () => {
    if (selected.size === 0) return;
    const text = selectedText();
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Fallback for non-secure contexts: hidden textarea + execCommand.
      const area = document.createElement('textarea');
      area.value = text;
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      document.execCommand('copy');
      document.body.removeChild(area);
    }
    flashCopied(selected.size);
  }, [selected, selectedText, flashCopied]);

  // Ctrl/⌘+C: copy the selected points as plain text, unless the user is
  // copying highlighted text inside an input field.
  useEffect(() => {
    if (!isEdit) return;
    const onCopy = (e: ClipboardEvent) => {
      if (selected.size === 0) return;
      const active = document.activeElement as HTMLInputElement | HTMLTextAreaElement | null;
      const inField = active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA');
      const hasTextSelection = inField
        ? (active.selectionStart ?? 0) !== (active.selectionEnd ?? 0)
        : (window.getSelection()?.toString() ?? '') !== '';
      if (hasTextSelection) return;
      if (!dialogRef.current?.contains(active) && active !== document.body) return;
      e.preventDefault();
      e.clipboardData?.setData('text/plain', selectedText());
      flashCopied(selected.size);
    };
    document.addEventListener('copy', onCopy);
    return () => document.removeEventListener('copy', onCopy);
  }, [isEdit, selected, selectedText, flashCopied]);

  const onDialogKeyDown = (e: React.KeyboardEvent) => {
    // Keep app-level shortcuts (Delete, Ctrl+Z, …) from acting on the
    // section behind the dialog; Escape still closes it.
    if (e.key !== 'Escape') e.stopPropagation();
    if (!isEdit) return;
    const target = e.target as HTMLElement;
    const inField = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA';
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a' && !inField) {
      e.preventDefault();
      selectAll();
    }
  };

  // Create mode: parse on every keystroke – cheap, pure, no side-effects
  const { points: parsedPoints, lineErrors } = useMemo(() => parsePoints(coordText), [coordText]);

  // Edit mode: parse rows; invalid cells are reported per row
  const editParsed = useMemo(() => {
    const pts: Point[] = [];
    const badRows = new Set<number>();
    rows.forEach((r, i) => {
      const x = parseFloat(r.x);
      const y = parseFloat(r.y);
      if (r.x.trim() === '' || r.y.trim() === '' || !isFinite(x) || !isFinite(y)) {
        badRows.add(i);
      } else {
        pts.push({ x, y });
      }
    });
    return { points: pts, badRows };
  }, [rows]);

  const activePoints = isEdit ? editParsed.points : parsedPoints;
  const hasInvalidRows = isEdit && editParsed.badRows.size > 0;
  const canApply = activePoints.length >= 3 && !hasInvalidRows && lineErrors.length === 0;

  const handleCreate = () => {
    setSubmitError('');

    if (lineErrors.length > 0) {
      setSubmitError(lineErrors[0]);
      return;
    }
    if (parsedPoints.length < 3) {
      setSubmitError('At least 3 valid coordinate points are required.');
      return;
    }

    // Preserve the exact engineering coordinates entered by the user.
    // The geometry engine calculates the true polygon centroid and section
    // properties from these coordinates; do not replace it with the average
    // of vertex coordinates.
    onCreateShape(name.trim() || 'Custom Shape', parsedPoints.map(p => ({ x: Number(p.x), y: Number(p.y) })));
    onClose();
  };

  const handleApplyEdit = () => {
    setSubmitError('');
    if (!editShape || !onUpdateShape) return;
    if (hasInvalidRows) {
      setSubmitError('Fix the highlighted coordinate cells before applying.');
      return;
    }
    if (editParsed.points.length < 3) {
      setSubmitError('At least 3 valid coordinate points are required.');
      return;
    }
    // Update the existing component in place — the drawing and all section
    // properties recalculate immediately.
    onUpdateShape(editShape.id, name.trim() || editShape.name, editParsed.points.map(p => ({ x: p.x, y: p.y })));
  };

  // Row operations (edit mode)
  const updateRow = (i: number, key: 'x' | 'y', value: string) => {
    setRows(prev => prev.map((r, j) => (j === i ? { ...r, [key]: value } : r)));
  };
  const addRow = () => setRows(prev => [...prev, { x: '0', y: '0' }]);
  const deleteRow = (i: number) => {
    if (rows.length <= 1) return;
    setRows(prev => prev.filter((_, j) => j !== i));
    setSelected(prev => new Set([...prev].filter(k => k !== i).map(k => (k > i ? k - 1 : k))));
  };
  const moveRow = (i: number, dir: -1 | 1) => {
    setRows(prev => {
      const j = i + dir;
      if (j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
    const j = i + dir;
    if (j < 0 || j >= rows.length) return;
    setSelected(prev => new Set([...prev].map(k => (k === i ? j : k === j ? i : k))));
  };

  const previewPoints = activePoints;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)' }}>
      <div
        ref={dialogRef}
        className="panel w-[860px] max-w-[95vw] max-h-[90vh] flex flex-col"
        style={{ background: 'var(--bg-secondary)' }}
        onKeyDown={onDialogKeyDown}
        tabIndex={-1}
      >
        <div className="panel-header flex justify-between items-center">
          <span>{isEdit ? '📐 Edit Coordinates' : '📐 Create Custom Shape (Coordinates)'}</span>
          <button className="text-sm hover:opacity-70" onClick={onClose}>✕</button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 flex gap-4">
          {/* Input side */}
          <div className="flex-1 flex flex-col">
            <div className="mb-3">
              <label className="text-[11px] font-semibold uppercase mb-1 block" style={{ color: 'var(--text-muted)' }}>
                Shape Name
              </label>
              <input
                className="input-field"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Enter shape name"
              />
            </div>

            {!isEdit && (
              <div className="mb-3 flex-1 flex flex-col">
                <label className="text-[11px] font-semibold uppercase mb-1 block" style={{ color: 'var(--text-muted)' }}>
                  Coordinates (X, Y per line)
                </label>
                <textarea
                  className="input-field flex-1 min-h-[180px] font-mono text-xs resize-none"
                  value={coordText}
                  onChange={e => { setCoordText(e.target.value); setSubmitError(''); }}
                  placeholder={"Enter coordinates, one point per line:\n0, 0\n100, 0\n100, 100\n0, 100"}
                />
                <div className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>
                  Formats: &quot;x, y&quot; or &quot;x y&quot; — one pair per line
                </div>
              </div>
            )}

            {isEdit && (
              <div className="mb-3 flex-1 flex flex-col min-h-0">
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11px] font-semibold uppercase" style={{ color: 'var(--text-muted)' }}>
                    Coordinate Points
                  </label>
                  <button className="btn btn-ghost text-[10px] px-2 py-1" onClick={addRow} title="Add a new coordinate point">
                    ＋ Add Point
                  </button>
                </div>
                <div className="flex items-center gap-1 mb-1 flex-wrap">
                  <button className="btn btn-ghost text-[10px] px-2 py-0.5" onClick={selectAll} title="Select all points (Ctrl+A)">Select all</button>
                  <button className="btn btn-ghost text-[10px] px-2 py-0.5" onClick={clearSelection} disabled={selected.size === 0}>Clear</button>
                  <button
                    className="btn btn-primary text-[10px] px-2 py-0.5"
                    onClick={copySelected}
                    disabled={selected.size === 0}
                    style={{ opacity: selected.size === 0 ? 0.5 : 1 }}
                    title="Copy selected coordinates as plain text (Ctrl+C)"
                  >⧉ Copy{selected.size > 0 ? ` (${selected.size})` : ''}</button>
                  <select
                    className="input-field text-[10px] py-0.5 w-auto"
                    value={copyFormat}
                    onChange={e => setCopyFormat(e.target.value as CopyFormat)}
                    title="Clipboard format"
                  >
                    <option value="comma">x, y</option>
                    <option value="tab">x ⇥ y (spreadsheet)</option>
                  </select>
                  <span className="text-[10px] ml-auto" style={{ color: copyNotice ? 'var(--success)' : 'var(--text-muted)' }}>
                    {copyNotice || `${selected.size} selected`}
                  </span>
                </div>
                <div className="flex-1 overflow-y-auto rounded" style={{ border: '1px solid var(--border)', maxHeight: 260 }}>
                  <table className="w-full text-xs font-mono">
                    <thead>
                      <tr style={{ color: 'var(--text-muted)', background: 'var(--bg-primary)' }}>
                        <th className="px-2 py-1 text-left font-semibold w-12">
                          <label className="flex items-center gap-1 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={rows.length > 0 && selected.size === rows.length}
                              ref={el => { if (el) el.indeterminate = selected.size > 0 && selected.size < rows.length; }}
                              onChange={e => (e.target.checked ? selectAll() : clearSelection())}
                              aria-label="Select all points"
                            />
                            #
                          </label>
                        </th>
                        <th className="px-2 py-1 text-left font-semibold">X</th>
                        <th className="px-2 py-1 text-left font-semibold">Y</th>
                        <th className="px-2 py-1 text-center font-semibold w-20">Order</th>
                        <th className="px-2 py-1 text-center font-semibold w-8">✕</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r, i) => {
                        const bad = editParsed.badRows.has(i);
                        const isSel = selected.has(i);
                        return (
                          <tr
                            key={i}
                            style={{
                              borderTop: '1px solid var(--border)',
                              background: bad ? 'rgba(239,68,68,0.08)' : isSel ? 'rgba(34,211,238,0.12)' : undefined,
                              boxShadow: isSel ? 'inset 3px 0 0 #22d3ee' : undefined,
                            }}
                          >
                            <td
                              className="px-2 py-0.5 cursor-pointer select-none whitespace-nowrap"
                              style={{ color: isSel ? '#22d3ee' : 'var(--text-muted)' }}
                              onMouseDown={e => { if (e.shiftKey) e.preventDefault(); }}
                              onClick={e => {
                                selectPoint(i, e.shiftKey ? 'range' : (e.ctrlKey || e.metaKey) ? 'toggle' : 'single');
                                dialogRef.current?.focus();
                              }}
                              title="Click to select · Ctrl/⌘-click to add/remove · Shift-click for a range"
                            >
                              <input
                                type="checkbox"
                                className="mr-1 align-middle pointer-events-none"
                                checked={isSel}
                                readOnly
                                tabIndex={-1}
                                aria-label={`Select point ${i + 1}`}
                              />
                              {i + 1}
                            </td>
                            <td className="px-1 py-0.5">
                              <input
                                className="input-field py-0.5 text-xs"
                                value={r.x}
                                onChange={e => { updateRow(i, 'x', e.target.value); setSubmitError(''); }}
                                style={{ borderColor: bad ? 'var(--danger)' : undefined }}
                                inputMode="decimal"
                              />
                            </td>
                            <td className="px-1 py-0.5">
                              <input
                                className="input-field py-0.5 text-xs"
                                value={r.y}
                                onChange={e => { updateRow(i, 'y', e.target.value); setSubmitError(''); }}
                                style={{ borderColor: bad ? 'var(--danger)' : undefined }}
                                inputMode="decimal"
                              />
                            </td>
                            <td className="px-1 py-0.5">
                              <div className="flex items-center justify-center gap-1">
                                <button
                                  className="px-1 rounded hover:opacity-80"
                                  style={{ color: 'var(--text-secondary)' }}
                                  onClick={() => moveRow(i, -1)}
                                  disabled={i === 0}
                                  title="Move point up (earlier in polygon order)"
                                >▲</button>
                                <button
                                  className="px-1 rounded hover:opacity-80"
                                  style={{ color: 'var(--text-secondary)' }}
                                  onClick={() => moveRow(i, 1)}
                                  disabled={i === rows.length - 1}
                                  title="Move point down (later in polygon order)"
                                >▼</button>
                              </div>
                            </td>
                            <td className="px-1 py-0.5 text-center">
                              <button
                                className="px-1 rounded hover:opacity-80"
                                style={{ color: 'var(--danger)' }}
                                onClick={() => deleteRow(i)}
                                disabled={rows.length <= 1}
                                title="Delete this point"
                              >🗑</button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>
                  Points are connected in order; the polygon closes automatically from the last point back to the first.
                  Select points via the # column or preview nodes (Ctrl/⌘ or Shift for multiple), then Ctrl+C to copy them as plain text.
                </div>
              </div>
            )}

            {/* Errors */}
            {(submitError || lineErrors.length > 0) && (
              <div className="text-xs p-2 rounded mb-3" style={{ background: 'rgba(239,68,68,0.1)', color: 'var(--danger)' }}>
                ⚠️ {submitError || lineErrors[0]}
              </div>
            )}

            {/* Status */}
            <div className="text-[10px] p-2 rounded flex items-center gap-2" style={{ background: 'var(--bg-primary)' }}>
              <span style={{ color: activePoints.length >= 3 && !hasInvalidRows ? 'var(--success)' : 'var(--warning)' }}>
                {activePoints.length >= 3 && !hasInvalidRows ? '✓' : '⚠'}
              </span>
              <span style={{ color: 'var(--text-secondary)' }}>
                {activePoints.length} point{activePoints.length !== 1 ? 's' : ''} valid
                {hasInvalidRows && ` · ${editParsed.badRows.size} invalid cell${editParsed.badRows.size !== 1 ? 's' : ''}`}
                {activePoints.length < 3 && ' — need at least 3 to create a closed section'}
              </span>
            </div>
          </div>

          {/* Preview side */}
          <div className="w-80 flex flex-col">
            <div className="text-[11px] font-semibold uppercase mb-1" style={{ color: 'var(--text-muted)' }}>
              Preview
            </div>
            <CoordinatePreview
              points={previewPoints}
              selected={isEdit ? selected : undefined}
              onSelectPoint={isEdit ? (i, mode) => { selectPoint(i, mode); dialogRef.current?.focus(); } : undefined}
              onClearSelection={isEdit ? clearSelection : undefined}
            />
            <div className="text-[10px] mt-1 text-center font-mono" style={{ color: 'var(--text-muted)' }}>
              {previewPoints.length} node{previewPoints.length !== 1 ? 's' : ''}
              {previewPoints.length >= 3 && ' — ready'}
            </div>
          </div>
        </div>

        <div className="p-4 border-t flex gap-2" style={{ borderColor: 'var(--border)' }}>
          <button className="btn btn-ghost flex-1" onClick={onClose}>
            Cancel
          </button>
          {isEdit ? (
            <button
              className="btn btn-primary flex-1"
              onClick={handleApplyEdit}
              disabled={!canApply}
              style={{ opacity: canApply ? 1 : 0.5 }}
            >
              Apply Changes ({editParsed.points.length} pts)
            </button>
          ) : (
            <button
              className="btn btn-primary flex-1"
              onClick={handleCreate}
              disabled={!canApply}
              style={{ opacity: canApply ? 1 : 0.5 }}
            >
              Create Shape ({parsedPoints.length} pts)
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
