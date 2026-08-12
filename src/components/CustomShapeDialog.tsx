'use client';
import React, { useState, useMemo } from 'react';
import type { Point } from '@/engine/types';

interface Props {
  onClose: () => void;
  onCreateShape: (name: string, points: Point[]) => void;
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

export default function CustomShapeDialog({ onClose, onCreateShape }: Props) {
  const [name, setName] = useState('Custom Polygon');
  const [coordText, setCoordText] = useState('0, 0\n100, 0\n100, 50\n50, 50\n50, 100\n0, 100');
  const [submitError, setSubmitError] = useState('');

  // Parse on every keystroke – cheap, pure, no side-effects
  const { points: parsedPoints, lineErrors } = useMemo(() => parsePoints(coordText), [coordText]);

  const canCreate = parsedPoints.length >= 3 && lineErrors.length === 0;

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

  // SVG viewBox for preview – works for any number of points ≥ 1
  const previewViewBox = useMemo(() => {
    if (parsedPoints.length === 0) return '-50 -50 100 100';
    const xs = parsedPoints.map(p => p.x);
    const ys = parsedPoints.map(p => p.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const w = maxX - minX || 100;
    const h = maxY - minY || 100;
    const pad = Math.max(w, h) * 0.15;
    return `${minX - pad} ${minY - pad} ${w + 2 * pad} ${h + 2 * pad}`;
  }, [parsedPoints]);

  // Node radius relative to view
  const nodeR = useMemo(() => {
    if (parsedPoints.length === 0) return 3;
    const xs = parsedPoints.map(p => p.x);
    const ys = parsedPoints.map(p => p.y);
    const span = Math.max((Math.max(...xs) - Math.min(...xs)) || 100, (Math.max(...ys) - Math.min(...ys)) || 100);
    return span * 0.02;
  }, [parsedPoints]);

  const labelSize = nodeR * 3.5;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)' }}>
      <div className="panel w-[620px] max-h-[85vh] flex flex-col" style={{ background: 'var(--bg-secondary)' }}>
        <div className="panel-header flex justify-between items-center">
          <span>📐 Create Custom Shape (Coordinates)</span>
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

            {/* Errors */}
            {(submitError || lineErrors.length > 0) && (
              <div className="text-xs p-2 rounded mb-3" style={{ background: 'rgba(239,68,68,0.1)', color: 'var(--danger)' }}>
                ⚠️ {submitError || lineErrors[0]}
              </div>
            )}

            {/* Status */}
            <div className="text-[10px] p-2 rounded flex items-center gap-2" style={{ background: 'var(--bg-primary)' }}>
              <span style={{ color: parsedPoints.length >= 3 ? 'var(--success)' : 'var(--warning)' }}>
                {parsedPoints.length >= 3 ? '✓' : '⚠'}
              </span>
              <span style={{ color: 'var(--text-secondary)' }}>
                {parsedPoints.length} point{parsedPoints.length !== 1 ? 's' : ''} parsed
                {parsedPoints.length < 3 && ' — need at least 3 to create a closed section'}
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
                {parsedPoints.length >= 3 && (
                  <polygon
                    points={parsedPoints.map(p => `${p.x},${p.y}`).join(' ')}
                    fill="rgba(59,130,246,0.2)"
                    stroke="#3b82f6"
                    strokeWidth={nodeR * 0.5}
                    strokeLinejoin="round"
                  />
                )}

                {/* Draw connecting lines when 2 points */}
                {parsedPoints.length === 2 && (
                  <line
                    x1={parsedPoints[0].x} y1={parsedPoints[0].y}
                    x2={parsedPoints[1].x} y2={parsedPoints[1].y}
                    stroke="#3b82f6" strokeWidth={nodeR * 0.5}
                  />
                )}

                {/* Always draw nodes for every parsed point */}
                {parsedPoints.map((p, i) => (
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
              {parsedPoints.length} node{parsedPoints.length !== 1 ? 's' : ''}
              {parsedPoints.length >= 3 && ' — ready'}
            </div>
          </div>
        </div>

        <div className="p-4 border-t flex gap-2" style={{ borderColor: 'var(--border)' }}>
          <button className="btn btn-ghost flex-1" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary flex-1"
            onClick={handleCreate}
            disabled={!canCreate}
            style={{ opacity: canCreate ? 1 : 0.5 }}
          >
            Create Shape ({parsedPoints.length} pts)
          </button>
        </div>
      </div>
    </div>
  );
}
