'use client';
import React, { useState, useEffect } from 'react';
import type { StoreState } from '@/store/useStore';

interface Props {
  store: StoreState;
  mode: 'save' | 'load' | null;
  onClose: () => void;
}

interface SavedRow {
  id: string;
  name: string;
  description: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
}

export default function SaveLoadDialog({ store, mode, onClose }: Props) {
  const [saved, setSaved] = useState<SavedRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (mode === 'load') {
      setLoading(true);
      fetch('/api/sections')
        .then(r => r.json())
        .then(data => { setSaved(Array.isArray(data) ? data : []); setLoading(false); })
        .catch(() => { setSaved([]); setLoading(false); });
    }
  }, [mode]);

  if (!mode) return null;

  const handleSave = async () => {
    setError('');
    try {
      const res = await fetch('/api/sections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: store.project.id,
          name: store.project.name,
          description: store.project.description,
          projectData: store.project,
          revision: store.project.revision,
        }),
      });
      if (!res.ok) throw new Error('Failed to save');
      onClose();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Save failed';
      setError(msg);
    }
  };

  const handleLoad = async (id: string) => {
    try {
      const res = await fetch(`/api/sections/${id}`);
      const data = await res.json();
      if (data.projectData) {
        store.setProject(data.projectData);
      }
      onClose();
    } catch {
      setError('Failed to load section.');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await fetch(`/api/sections/${id}`, { method: 'DELETE' });
      setSaved(saved.filter(s => s.id !== id));
    } catch {
      setError('Failed to delete.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)' }}>
      <div className="panel w-[600px] max-h-[80vh] flex flex-col" style={{ background: 'var(--bg-secondary)' }}>
        <div className="panel-header flex justify-between items-center">
          <span>{mode === 'save' ? 'Save Section' : 'Open Section'}</span>
          <button className="text-sm" onClick={onClose}>✕</button>
        </div>

        {error && <div className="px-4 py-2 text-xs" style={{ color: 'var(--danger)' }}>{error}</div>}

        {mode === 'save' ? (
          <div className="p-4">
            <div className="mb-3">
              <label className="text-[10px] font-semibold uppercase mb-0.5 block" style={{ color: 'var(--text-muted)' }}>Section Name</label>
              <input className="input-field" value={store.project.name}
                onChange={e => store.setProjectMeta(e.target.value, store.project.description)} />
            </div>
            <div className="mb-4">
              <label className="text-[10px] font-semibold uppercase mb-0.5 block" style={{ color: 'var(--text-muted)' }}>Description</label>
              <textarea className="input-field h-20 resize-none" value={store.project.description}
                onChange={e => store.setProjectMeta(store.project.name, e.target.value)} />
            </div>
            <button className="btn btn-primary w-full" onClick={handleSave}>Save to Database</button>
          </div>
        ) : (
          <div className="flex-1 overflow-auto p-4">
            {loading ? (
              <div className="text-center text-xs py-8" style={{ color: 'var(--text-muted)' }}>Loading...</div>
            ) : saved.length === 0 ? (
              <div className="text-center text-xs py-8" style={{ color: 'var(--text-muted)' }}>No saved sections found.</div>
            ) : (
              saved.map(s => (
                <div key={s.id} className="flex items-center gap-3 py-2 border-b" style={{ borderColor: 'var(--border)' }}>
                  <div className="flex-1">
                    <div className="text-sm font-semibold">{s.name}</div>
                    <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                      Rev {s.revision} · {new Date(s.updatedAt).toLocaleDateString()}
                    </div>
                  </div>
                  <button className="btn btn-primary text-xs" onClick={() => handleLoad(s.id)}>Open</button>
                  <button className="btn btn-ghost text-xs" onClick={() => handleDelete(s.id)}>🗑</button>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
