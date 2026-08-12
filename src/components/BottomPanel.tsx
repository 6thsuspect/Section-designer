'use client';
import React, { useState } from 'react';
import type { StoreState } from '@/store/useStore';
import type { CalcTrace } from '@/engine/types';

type Tab = 'trace' | 'qa';

interface Props {
  store: StoreState;
  collapsed: boolean;
  onToggle: () => void;
}

export default function BottomPanel({ store, collapsed, onToggle }: Props) {
  const [tab, setTab] = useState<Tab>('trace');

  if (collapsed) {
    return (
      <div
        className="h-8 flex items-center px-3 gap-4 cursor-pointer border-t"
        style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)' }}
        onClick={onToggle}
      >
        <span className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>
          ▲ Calculation Trace · QA
        </span>
        {store.qaMessages.filter(m => m.level === 'error').length > 0 && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold" style={{ background: 'rgba(239,68,68,0.2)', color: 'var(--danger)' }}>
            {store.qaMessages.filter(m => m.level === 'error').length} errors
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col border-t" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)', height: '280px' }}>
      {/* Tab bar */}
      <div className="flex items-center gap-0 px-2 border-b" style={{ borderColor: 'var(--border)' }}>
        {([
          ['trace', 'Calculation Trace'],
          ['qa', 'QA'],
        ] as [Tab, string][]).map(([key, label]) => (
          <button
            key={key}
            className="px-3 py-2 text-xs font-semibold transition-colors"
            style={{
              color: tab === key ? 'var(--accent)' : 'var(--text-muted)',
              borderBottom: tab === key ? '2px solid var(--accent)' : '2px solid transparent',
            }}
            onClick={() => setTab(key)}
          >
            {label}
            {key === 'qa' && store.qaMessages.length > 0 && (
              <span className="ml-1 px-1 py-0 text-[9px] rounded-full" style={{
                background: store.qaMessages.some(m => m.level === 'error') ? 'rgba(239,68,68,0.2)' : 'rgba(245,158,11,0.2)',
                color: store.qaMessages.some(m => m.level === 'error') ? 'var(--danger)' : 'var(--warning)',
              }}>
                {store.qaMessages.length}
              </span>
            )}
          </button>
        ))}
        <div className="flex-1" />
        <button className="text-xs px-2 py-1 rounded" style={{ color: 'var(--text-muted)' }} onClick={onToggle}>▼ Collapse</button>
      </div>

      <div className="flex-1 overflow-auto">
        {tab === 'trace' && <CalcTraceView trace={store.calcTrace} />}
        {tab === 'qa' && <QAView store={store} />}
      </div>
    </div>
  );
}

// ─── Calculation Trace ────────────────────────────────────────────────────

function CalcTraceView({ trace }: { trace: CalcTrace | null }) {
  if (!trace) {
    return <div className="p-4 text-xs text-center" style={{ color: 'var(--text-muted)' }}>No calculations yet. Add components to see the trace.</div>;
  }

  return (
    <div className="p-3 font-mono text-xs">
      <div className="font-bold text-sm mb-2" style={{ color: 'var(--accent)' }}>{trace.title}</div>

      {/* Component details */}
      {trace.children && trace.children.length > 0 && (
        <div className="mb-3">
          <div className="text-[10px] font-bold uppercase mb-1" style={{ color: 'var(--text-muted)' }}>Component Details</div>
          <div className="flex gap-3 flex-wrap">
            {trace.children.map((child, i) => (
              <TraceBlock key={i} trace={child} />
            ))}
          </div>
        </div>
      )}

      {/* Main results */}
      <div className="text-[10px] font-bold uppercase mb-1" style={{ color: 'var(--text-muted)' }}>Results</div>
      <table className="w-full">
        <tbody>
          {trace.steps.map((step, i) => (
            <tr key={i} className="border-b" style={{ borderColor: 'rgba(51,65,85,0.3)' }}>
              <td className="py-1 pr-3" style={{ color: 'var(--text-secondary)' }}>{step.label}</td>
              <td className="py-1 pr-3" style={{ color: 'var(--text-muted)' }}>{step.formula}</td>
              {step.substitution && <td className="py-1 pr-3" style={{ color: 'var(--text-muted)' }}>{step.substitution}</td>}
              <td className="py-1 pr-2 font-bold" style={{ color: 'var(--text-primary)' }}>{step.result}</td>
              <td className="py-1" style={{ color: 'var(--text-muted)' }}>{step.unit}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TraceBlock({ trace }: { trace: CalcTrace }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="rounded p-2 min-w-[200px]" style={{ background: 'var(--bg-primary)', border: '1px solid var(--border)' }}>
      <div className="flex items-center gap-1 cursor-pointer mb-1" onClick={() => setExpanded(!expanded)}>
        <span className="text-[10px]">{expanded ? '▼' : '▶'}</span>
        <span className="text-[11px] font-semibold" style={{ color: 'var(--accent)' }}>{trace.title}</span>
      </div>
      {expanded && trace.steps.map((step, i) => (
        <div key={i} className="flex justify-between gap-2 text-[10px] py-0.5">
          <span style={{ color: 'var(--text-secondary)' }}>{step.label}</span>
          <span style={{ color: 'var(--text-primary)' }}>{step.result} {step.unit}</span>
        </div>
      ))}
    </div>
  );
}

// ─── QA View ──────────────────────────────────────────────────────────────

function QAView({ store }: { store: StoreState }) {
  if (store.qaMessages.length === 0) {
    return (
      <div className="p-4 text-center" style={{ color: 'var(--text-muted)' }}>
        <div className="text-xl mb-1">✅</div>
        <div className="text-xs">No issues detected.</div>
      </div>
    );
  }

  return (
    <div className="p-3">
      {store.qaMessages.map((msg, i) => (
        <div key={i} className="flex items-start gap-2 py-1.5 border-b text-xs" style={{ borderColor: 'rgba(51,65,85,0.3)' }}>
          <span className="shrink-0 mt-0.5">
            {msg.level === 'error' ? '🔴' : msg.level === 'warning' ? '🟡' : 'ℹ️'}
          </span>
          <div>
            <span className="font-semibold uppercase text-[10px] mr-2" style={{
              color: msg.level === 'error' ? 'var(--danger)' : msg.level === 'warning' ? 'var(--warning)' : 'var(--accent)',
            }}>
              {msg.level} · {msg.category}
            </span>
            <span style={{ color: 'var(--text-secondary)' }}>{msg.message}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
