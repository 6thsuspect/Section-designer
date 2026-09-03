'use client';
import React, { useState, useMemo } from 'react';
import type { Point } from '@/engine/types';

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
  const deleteRow = (i: number) => setRows(prev => prev.length > 1 ? prev.filter((_, j) => j !== i) : prev);
  const moveRow = (i: number, dir: -1 | 1) => {
    setRows(prev => {
      const j = i + dir;
      if (j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  };

  // SVG viewBox for preview – works for any number of points ≥ 1
  const previewPoints = activePoints;
  const previewViewBox = useMemo(() => {
    if (previewPoints.length === 0) return '-50 -50 100 100';
    const xs = previewPoints.map(p => p.x);
    const ys = previewPoints.map(p => p.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const w = maxX - minX || 100;
    const h = maxY - minY || 100;
    const pad = Math.max(w, h) * 0.15;
    return `${minX - pad} ${minY - pad} ${w + 2 * pad} ${h + 2 * pad}`;
  }, [previewPoints]);

  // Node radius relative to view
  const nodeR = useMemo(() => {
    if (previewPoints.length === 0) return 3;
    const xs = previewPoints.map(p => p.x);
    const ys = previewPoints.map(p => p.y);
    const span = Math.max((Math.max(...xs) - Math.min(...xs)) || 100, (Math.max(...ys) - Math.min(...ys)) || 100);
    return span * 0.02;
  }, [previewPoints]);

  const labelSize = nodeR * 3.5;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)' }}>
      <div className="panel w-[680px] max-h-[85vh] flex flex-col" style={{ background: 'var(--bg-secondary)' }}>
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
                <div className="flex-1 overflow-y-auto rounded" style={{ border: '1px solid var(--border)', maxHeight: 260 }}>
                  <table className="w-full text-xs font-mono">
                    <thead>
                      <tr style={{ color: 'var(--text-muted)', background: 'var(--bg-primary)' }}>
                        <th className="px-2 py-1 text-left font-semibold w-8">#</th>
                        <th className="px-2 py-1 text-left font-semibold">X</th>
                        <th className="px-2 py-1 text-left font-semibold">Y</th>
                        <th className="px-2 py-1 text-center font-semibold w-20">Order</th>
                        <th className="px-2 py-1 text-center font-semibold w-8">✕</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r, i) => {
                        const bad = editParsed.badRows.has(i);
                        return (
                          <tr key={i} style={{ borderTop: '1px solid var(--border)', background: bad ? 'rgba(239,68,68,0.08)' : undefined }}>
                            <td className="px-2 py-0.5" style={{ color: 'var(--text-muted)' }}>{i + 1}</td>
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
          <div className="w-52 flex flex-col">
            <div className="text-[11px] font-semibold uppercase mb-1" style={{ color: 'var(--text-muted)' }}>
              Preview
            </div>
            <div className="flex-1 rounded overflow-hidden" style={{ background: '#0c1222', border: '1px solid var(--border)', minHeight: 200 }}>
              <svg viewBox={previewViewBox} className="w-full h-full" style={{ transform: 'scaleY(-1)' }}>
                {/* Draw filled custom section only when ≥ 3 points */}
                {previewPoints.length >= 3 && (
                  <polygon
                    points={previewPoints.map(p => `${p.x},${p.y}`).join(' ')}
                    fill="rgba(59,130,246,0.2)"
                    stroke="#3b82f6"
                    strokeWidth={nodeR * 0.5}
                    strokeLinejoin="round"
                  />
                )}

                {/* Draw connecting lines when 2 points */}
                {previewPoints.length === 2 && (
                  <line
                    x1={previewPoints[0].x} y1={previewPoints[0].y}
                    x2={previewPoints[1].x} y2={previewPoints[1].y}
                    stroke="#3b82f6" strokeWidth={nodeR * 0.5}
                  />
                )}

                {/* Always draw nodes for every parsed point */}
                {previewPoints.map((p, i) => (
                  <g key={i}>
                    <circle cx={p.x} cy={p.y} r={nodeR} fill="#fbbf24" />
                    <text
                      x={p.x + nodeR * 1.5}
                      y={-(p.y) + labelSize * 0.35}
                      fill="#fbbf24"
                      fontSize={labelSize}
                      fontFamily="monospace"
                      transform="scale(1,-1)"
                    >
                      {i + 1}
                    </text>
                  </g>
                ))}
              </svg>
            </div>
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
