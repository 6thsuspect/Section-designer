'use client';
import React, { useState } from 'react';
import type { StoreState } from '@/store/useStore';
import type { ComponentType, SectionComponent } from '@/engine/types';

const COMPONENT_TYPES: { type: ComponentType; label: string; icon: string }[] = [
  { type: 'rectangle', label: 'Rectangle', icon: '▬' },
  { type: 'circle', label: 'Circle', icon: '●' },
  { type: 'triangle', label: 'Triangle', icon: '▲' },
  { type: 'i-section', label: 'I-Section', icon: 'Ⅰ' },
  { type: 't-section', label: 'T-Section', icon: 'T' },
  { type: 'l-section', label: 'L-Section', icon: 'L' },
  { type: 'channel', label: 'Channel', icon: 'C' },
  { type: 'box', label: 'Box', icon: '□' },
  { type: 'hollow-circle', label: 'Hollow Circle', icon: '◎' },
  { type: 'hollow-rectangle', label: 'Hollow Rect', icon: '▢' },
  { type: 'ellipse', label: 'Ellipse', icon: '⬮' },
];

interface Props {
  store: StoreState;
  onOpenCustomShape: () => void;
  /** Open the coordinate editor for a custom-shape/polygon component */
  onEditCoordinates?: (comp: SectionComponent) => void;
}

export default function ComponentsPanel({ store, onOpenCustomShape, onEditCoordinates }: Props) {
  const [showAdd, setShowAdd] = useState(false);
  const [combineError, setCombineError] = useState<string | null>(null);
  const selectedCombined = store.project.components.find(c =>
    store.selectedIds.length === 1 && c.id === store.selectedIds[0] && c.combinedFrom?.length);
  const canCombine = store.selectedIds.length >= 2;

  // Ctrl/⌘/Shift-click toggles a row in the multi-selection (for Combine).
  const handleRowSelect = (id: string, event: React.MouseEvent) => {
    setCombineError(null);
    if (event.ctrlKey || event.metaKey || event.shiftKey) {
      const ids = store.selectedIds.includes(id)
        ? store.selectedIds.filter(x => x !== id)
        : [...store.selectedIds, id];
      store.selectComponents(ids);
    } else {
      store.selectComponent(id);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Add Component Section */}
      <div className="panel-header flex items-center justify-between">
        <span>Components</span>
        <button
          className="w-5 h-5 rounded flex items-center justify-center text-xs font-bold hover:opacity-80"
          style={{ background: 'var(--accent)' }}
          onClick={() => setShowAdd(!showAdd)}
        >
          {showAdd ? '×' : '+'}
        </button>
      </div>

      {showAdd && (
        <div className="p-2 border-b" style={{ borderColor: 'var(--border)' }}>
          <div className="grid grid-cols-3 gap-1 mb-2">
            {COMPONENT_TYPES.map(ct => (
              <button
                key={ct.type}
                className="flex flex-col items-center gap-0.5 p-1.5 rounded text-xs hover:bg-opacity-20 transition-colors"
                style={{ color: 'var(--text-secondary)' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-tertiary)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                onClick={() => { store.addComponent(ct.type); setShowAdd(false); }}
              >
                <span className="text-base leading-none">{ct.icon}</span>
                <span className="text-[10px] leading-tight text-center">{ct.label}</span>
              </button>
            ))}
          </div>
          {/* Custom Shape Button */}
          <button
            className="w-full py-2 px-3 rounded text-xs font-semibold flex items-center justify-center gap-2 btn-ghost"
            style={{ border: '1px dashed var(--border)' }}
            onClick={() => { onOpenCustomShape(); setShowAdd(false); }}
          >
            <span>📐</span>
            <span>Custom Shape (Coordinates)</span>
          </button>
        </div>
      )}

      {/* Combine / Uncombine */}
      {(canCombine || selectedCombined) && (
        <div className="p-2 border-b space-y-1" style={{ borderColor: 'var(--border)' }}>
          {canCombine && (
            <button
              className="btn btn-primary w-full text-xs"
              onClick={() => setCombineError(store.combineShapes(store.selectedIds))}
              title="Merge the selected connected/overlapping shapes into one closed-coordinate section"
            >
              ⊕ Combine {store.selectedIds.length} Shapes
            </button>
          )}
          {selectedCombined && (
            <button
              className="btn btn-ghost w-full text-xs"
              style={{ border: '1px solid var(--border)' }}
              onClick={() => setCombineError(store.uncombineShape(selectedCombined.id))}
              title="Restore the original shapes exactly as they were before combining"
            >
              ⊟ Uncombine
            </button>
          )}
          {combineError && <div className="text-[10px]" style={{ color: 'var(--danger)' }}>{combineError}</div>}
        </div>
      )}

      {/* Component Tree */}
      <div className="flex-1 overflow-y-auto">
        {store.project.components.length === 0 ? (
          <div className="p-4 text-center" style={{ color: 'var(--text-muted)' }}>
            <div className="text-2xl mb-2">📐</div>
            <div className="text-xs">No components yet.</div>
            <div className="text-xs mt-1">Click + to add a section component.</div>
          </div>
        ) : (
          store.project.components
            // Grouped deductions are collapsed into their parent plate row.
            // Combined-section cut-outs are collapsed into the combined row.
            .filter(comp => !comp.managedByParent)
            .map(comp => (
            <ComponentTreeItem
              key={comp.id}
              comp={comp}
              selected={store.selectedIds.includes(comp.id)}
              onSelect={event => handleRowSelect(comp.id, event)}
              onDelete={() => store.deleteComponent(comp.id)}
              onDuplicate={() => store.duplicateComponent(comp.id)}
              onToggleVisible={() => store.updateComponent(comp.id, { visible: !comp.visible })}
              onToggleLocked={() => store.updateComponent(comp.id, { locked: !comp.locked })}
              onToggleOperation={() => store.updateComponent(comp.id, { operation: comp.operation === 'add' ? 'subtract' : 'add' })}
              onEditCoordinates={onEditCoordinates ? () => onEditCoordinates(comp) : undefined}
              deductionCount={store.project.components.filter(child => child.parentId === comp.id && child.associationKind === 'bolt-deduction').length}
              onToggleGroup={comp.type === 'rectangle' && comp.geometry.boltDeductions
                ? () => store.updateComponent(comp.id, {
                    geometry: {
                      ...comp.geometry,
                      boltDeductions: { ...comp.geometry.boltDeductions!, enabled: true, grouped: !comp.geometry.boltDeductions!.grouped },
                    },
                  })
                : undefined}
            />
          ))
        )}
      </div>
    </div>
  );
}

function ComponentTreeItem({ comp, selected, onSelect, onDelete, onDuplicate, onToggleVisible, onToggleLocked, onToggleOperation, onEditCoordinates, deductionCount, onToggleGroup }: {
  comp: SectionComponent;
  selected: boolean;
  onSelect: (event: React.MouseEvent) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onToggleVisible: () => void;
  onToggleLocked: () => void;
  onToggleOperation: () => void;
  onEditCoordinates?: () => void;
  deductionCount: number;
  onToggleGroup?: () => void;
}) {
  const isDeduction = comp.associationKind === 'bolt-deduction';
  const grouped = comp.geometry.boltDeductions?.grouped ?? true;
  return (
    <div
      className="flex items-center gap-1 px-2 py-1.5 cursor-pointer border-l-2 transition-colors"
      style={{
        borderColor: selected ? 'var(--accent)' : 'transparent',
        background: selected ? 'rgba(59,130,246,0.1)' : 'transparent',
        paddingLeft: isDeduction ? 20 : 8,
      }}
      onClick={onSelect}
    >
      <button
        className="w-4 h-4 rounded text-[10px] flex items-center justify-center shrink-0"
        style={{
          background: comp.operation === 'add' ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)',
          color: comp.operation === 'add' ? 'var(--success)' : 'var(--danger)',
        }}
        onClick={e => { e.stopPropagation(); onToggleOperation(); }}
        title={comp.operation === 'add' ? 'Add (click to subtract)' : 'Subtract (click to add)'}
      >
        {comp.operation === 'add' ? '+' : '−'}
      </button>

      <span 
        className="flex-1 text-xs truncate" 
        style={{ 
          opacity: comp.visible ? 1 : 0.4,
          fontStyle: comp.locked ? 'italic' : 'normal',
        }}
      >
        {isDeduction && <span style={{ color: 'var(--text-muted)' }}>└ </span>}
        {comp.locked && '🔒 '}{comp.name}
        {comp.combinedFrom && comp.combinedFrom.length > 0 && (
          <span className="ml-1 text-[9px] px-1 rounded" style={{ color: 'var(--success)', background: 'rgba(34,197,94,0.12)' }} title={`Combined from ${comp.combinedFrom.length} shapes — select and Uncombine to restore`}>
            ⊕{comp.combinedFrom.length}
          </span>
        )}
      </span>

      {onToggleGroup && deductionCount > 0 && (
        <button
          className="text-[9px] px-1 rounded shrink-0"
          style={{ color: 'var(--accent)', background: 'rgba(59,130,246,0.12)' }}
          onClick={e => { e.stopPropagation(); onToggleGroup(); }}
          title={grouped
            ? `${deductionCount} grouped bolt-hole deduction(s) — click to ungroup into separate shapes`
            : `${deductionCount} ungrouped deduction shape(s) — click to regroup with plate`}
        >
          {grouped ? `⊞ ${deductionCount}` : `⧉ ${deductionCount}`}
        </button>
      )}

      {onEditCoordinates && (comp.type === 'custom-shape' || comp.type === 'polygon') && (
        <button
          className="w-4 h-4 text-[10px] opacity-50 hover:opacity-100 shrink-0"
          onClick={e => { e.stopPropagation(); onEditCoordinates(); }}
          title="Edit coordinates"
        >
          ✏️
        </button>
      )}
      <button 
        className="w-4 h-4 text-[10px] opacity-50 hover:opacity-100 shrink-0" 
        onClick={e => { e.stopPropagation(); onToggleLocked(); }} 
        title={comp.locked ? 'Unlock (Unfreeze)' : 'Lock (Freeze)'}
        style={{ color: comp.locked ? 'var(--warning)' : 'inherit' }}
      >
        {comp.locked ? '🔒' : '🔓'}
      </button>
      <button 
        className="w-4 h-4 text-[10px] opacity-50 hover:opacity-100 shrink-0" 
        onClick={e => { e.stopPropagation(); onToggleVisible(); }} 
        title="Toggle visibility"
      >
        {comp.visible ? '👁' : '🚫'}
      </button>
      <button 
        className="w-4 h-4 text-[10px] opacity-50 hover:opacity-100 shrink-0" 
        onClick={e => { e.stopPropagation(); onDuplicate(); }} 
        title="Duplicate"
      >
        📋
      </button>
      <button 
        className="w-4 h-4 text-[10px] opacity-50 hover:opacity-100 shrink-0" 
        onClick={e => { e.stopPropagation(); onDelete(); }} 
        title="Delete"
      >
        🗑
      </button>
    </div>
  );
}
