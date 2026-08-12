'use client';
import React, { useState } from 'react';
import type { StoreState } from '@/store/useStore';
import type { LengthUnit } from '@/engine/types';
import { fmt, fmtSci } from '@/engine/geometry';

interface Props {
  store: StoreState;
}

export default function PropertiesPanel({ store }: Props) {
  const [tab, setTab] = useState<'properties' | 'geometry' | 'settings'>('properties');
  const selectedComp = store.project.components.find(c => c.id === store.selectedComponentId);

  return (
    <div className="flex flex-col h-full">
      {/* Tab selector */}
      <div className="flex border-b" style={{ borderColor: 'var(--border)' }}>
        <button
          className={`flex-1 py-2 text-xs font-semibold text-center`}
          style={{ color: tab === 'properties' ? 'var(--accent)' : 'var(--text-muted)', borderBottom: tab === 'properties' ? '2px solid var(--accent)' : '2px solid transparent' }}
          onClick={() => setTab('properties')}
        >
          Properties
        </button>
        <button
          className={`flex-1 py-2 text-xs font-semibold text-center`}
          style={{ color: tab === 'geometry' ? 'var(--accent)' : 'var(--text-muted)', borderBottom: tab === 'geometry' ? '2px solid var(--accent)' : '2px solid transparent' }}
          onClick={() => setTab('geometry')}
        >
          Geometry
        </button>
        <button
          className={`flex-1 py-2 text-xs font-semibold text-center`}
          style={{ color: tab === 'settings' ? 'var(--accent)' : 'var(--text-muted)', borderBottom: tab === 'settings' ? '2px solid var(--accent)' : '2px solid transparent' }}
          onClick={() => setTab('settings')}
        >
          Settings
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {tab === 'properties' ? (
          <SectionPropertiesView store={store} />
        ) : tab === 'geometry' ? (
          selectedComp ? <GeometryEditor store={store} comp={selectedComp} /> : (
            <div className="p-4 text-center text-xs" style={{ color: 'var(--text-muted)' }}>
              Select a component to edit its geometry.
            </div>
          )
        ) : (
          <SettingsView store={store} />
        )}
      </div>
    </div>
  );
}

function SettingsView({ store }: { store: StoreState }) {
  const units: LengthUnit[] = ['mm', 'cm', 'm', 'inch', 'ft'];

  return (
    <div>
      <div className="panel-header">Project Settings</div>
      
      {/* Project Name */}
      <div className="p-2">
        <label className="text-[10px] font-semibold uppercase mb-0.5 block" style={{ color: 'var(--text-muted)' }}>Project Name</label>
        <input
          className="input-field"
          value={store.project.name}
          onChange={e => store.setProjectMeta(e.target.value, store.project.description)}
        />
      </div>

      {/* Description */}
      <div className="p-2">
        <label className="text-[10px] font-semibold uppercase mb-0.5 block" style={{ color: 'var(--text-muted)' }}>Description</label>
        <textarea
          className="input-field h-16 resize-none"
          value={store.project.description}
          onChange={e => store.setProjectMeta(store.project.name, e.target.value)}
        />
      </div>

      <div className="panel-header">Coordinate System</div>

      {/* Units */}
      <div className="p-2">
        <label className="text-[10px] font-semibold uppercase mb-1 block" style={{ color: 'var(--text-muted)' }}>Length Units</label>
        <div className="flex gap-1 flex-wrap">
          {units.map(u => (
            <button
              key={u}
              className={`px-2 py-1 text-xs rounded font-semibold ${store.project.units === u ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => store.setUnits(u)}
            >
              {u}
            </button>
          ))}
        </div>
      </div>

      {/* Origin info */}
      <div className="p-2">
        <label className="text-[10px] font-semibold uppercase mb-1 block" style={{ color: 'var(--text-muted)' }}>Origin</label>
        <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>
          <div className="flex justify-between py-0.5">
            <span>X = 0</span>
            <span>Y = 0</span>
          </div>
          <div className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>
            Components are positioned relative to this origin. Drag components on canvas to reposition.
          </div>
        </div>
      </div>

      {/* Centroid position */}
      {store.properties && store.properties.area > 0 && (
        <div className="p-2">
          <label className="text-[10px] font-semibold uppercase mb-1 block" style={{ color: 'var(--text-muted)' }}>Calculated Centroid</label>
          <div className="text-xs font-mono" style={{ color: 'var(--text-primary)' }}>
            <div className="flex justify-between py-0.5">
              <span>X̄ =</span>
              <span>{fmt(store.properties.centroidX)} {store.project.units}</span>
            </div>
            <div className="flex justify-between py-0.5">
              <span>Ȳ =</span>
              <span>{fmt(store.properties.centroidY)} {store.project.units}</span>
            </div>
          </div>
        </div>
      )}

      <div className="panel-header">Project Info</div>
      <div className="p-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
        <div className="flex justify-between py-0.5">
          <span>Components</span>
          <span>{store.project.components.length}</span>
        </div>
        <div className="flex justify-between py-0.5">
          <span>Revision</span>
          <span>{store.project.revision}</span>
        </div>
        <div className="flex justify-between py-0.5">
          <span>Created</span>
          <span>{new Date(store.project.createdAt).toLocaleDateString()}</span>
        </div>
        <div className="flex justify-between py-0.5">
          <span>Modified</span>
          <span>{new Date(store.project.updatedAt).toLocaleDateString()}</span>
        </div>
      </div>
    </div>
  );
}

function SectionPropertiesView({ store }: { store: StoreState }) {
  const p = store.properties;
  if (!p || store.project.components.length === 0) {
    return (
      <div className="p-4 text-center" style={{ color: 'var(--text-muted)' }}>
        <div className="text-2xl mb-2">📊</div>
        <div className="text-xs">Add components to see section properties.</div>
      </div>
    );
  }

  const unit = store.project.units;

  return (
    <div>
      <div className="panel-header">Section Properties</div>
      <PropRow label="Area (A)" value={`${fmt(p.area)} ${unit}²`} />
      <PropRow label="Centroid X̄" value={`${fmt(p.centroidX)} ${unit}`} />
      <PropRow label="Centroid Ȳ" value={`${fmt(p.centroidY)} ${unit}`} />

      <div className="panel-header">Moment of Inertia</div>
      <PropRow label="Ix" value={`${fmtSci(p.Ix)} ${unit}⁴`} />
      <PropRow label="Iy" value={`${fmtSci(p.Iy)} ${unit}⁴`} />
      <PropRow label="Ixy" value={`${fmtSci(p.Ixy)} ${unit}⁴`} />

      <div className="panel-header">Radius of Gyration</div>
      <PropRow label="rx" value={`${fmt(p.rx)} ${unit}`} />
      <PropRow label="ry" value={`${fmt(p.ry)} ${unit}`} />

      <div className="panel-header">Section Modulus</div>
      <PropRow label="Zx (top)" value={`${fmtSci(p.Zx_top)} ${unit}³`} />
      <PropRow label="Zx (bottom)" value={`${fmtSci(p.Zx_bottom)} ${unit}³`} />
      <PropRow label="Zy (left)" value={`${fmtSci(p.Zy_left)} ${unit}³`} />
      <PropRow label="Zy (right)" value={`${fmtSci(p.Zy_right)} ${unit}³`} />

      <div className="panel-header">Principal Axes</div>
      <PropRow label="Imax" value={`${fmtSci(p.Imax)} ${unit}⁴`} />
      <PropRow label="Imin" value={`${fmtSci(p.Imin)} ${unit}⁴`} />
      <PropRow label="θ principal" value={`${fmt(p.principalAngle)}°`} />

      <div className="panel-header">Extreme Fibers</div>
      <PropRow label="y max" value={`${fmt(p.yMax)} ${unit}`} />
      <PropRow label="y min" value={`${fmt(p.yMin)} ${unit}`} />
      <PropRow label="x max" value={`${fmt(p.xMax)} ${unit}`} />
      <PropRow label="x min" value={`${fmt(p.xMin)} ${unit}`} />

      {/* Stress results */}
      {store.stressResult && (
        <>
          <div className="panel-header">Stress Results</div>
          <PropRow label="Max Compression" value={`${fmt(store.stressResult.maxCompression)} MPa`} highlight="danger" />
          <PropRow label="Max Tension" value={`${fmt(store.stressResult.maxTension)} MPa`} highlight="success" />
          <PropRow label="NA Angle" value={`${fmt(store.stressResult.neutralAxisAngle)}°`} />
        </>
      )}
    </div>
  );
}

function PropRow({ label, value, highlight }: { label: string; value: string; highlight?: 'success' | 'danger' }) {
  return (
    <div className="prop-row">
      <span className="prop-label">{label}</span>
      <span className="prop-value" style={highlight === 'danger' ? { color: 'var(--danger)' } : highlight === 'success' ? { color: 'var(--success)' } : undefined}>
        {value}
      </span>
    </div>
  );
}

function GeometryEditor({ store, comp }: { store: StoreState; comp: import('@/engine/types').SectionComponent }) {
  const g = comp.geometry;

  const update = (geo: Partial<import('@/engine/types').ComponentGeometry>) => {
    store.updateComponent(comp.id, { geometry: { ...comp.geometry, ...geo } });
  };

  const updatePos = (pos: Partial<import('@/engine/types').Point>) => {
    store.updateComponent(comp.id, { position: { ...comp.position, ...pos } });
  };

  return (
    <div>
      <div className="panel-header">{comp.name}</div>

      {/* Name */}
      <div className="p-2">
        <label className="text-[10px] font-semibold uppercase mb-0.5 block" style={{ color: 'var(--text-muted)' }}>Name</label>
        <input
          className="input-field"
          value={comp.name}
          onChange={e => store.updateComponent(comp.id, { name: e.target.value })}
        />
      </div>

      {/* Position */}
      <div className="panel-header">Position</div>
      <div className="p-2 grid grid-cols-2 gap-2">
        <NumInput label="X" value={comp.position.x} onChange={v => updatePos({ x: v })} />
        <NumInput label="Y" value={comp.position.y} onChange={v => updatePos({ y: v })} />
        <NumInput label="Rotation (°)" value={comp.rotation} onChange={v => store.updateComponent(comp.id, { rotation: v })} />
      </div>

      {/* Type-specific geometry */}
      <div className="panel-header">Dimensions ({store.project.units})</div>
      <div className="p-2 grid grid-cols-2 gap-2">
        {(comp.type === 'rectangle' || comp.type === 'box' || comp.type === 'hollow-rectangle') && (
          <>
            <NumInput label="Width" value={g.width ?? 0} onChange={v => update({ width: v })} />
            <NumInput label="Height" value={g.height ?? 0} onChange={v => update({ height: v })} />
          </>
        )}
        {comp.type === 'box' && (
          <NumInput label="Wall Thickness" value={g.wallThickness ?? 0} onChange={v => update({ wallThickness: v })} />
        )}
        {comp.type === 'hollow-rectangle' && (
          <>
            <NumInput label="Inner Width" value={g.innerWidth ?? 0} onChange={v => update({ innerWidth: v })} />
            <NumInput label="Inner Height" value={g.innerHeight ?? 0} onChange={v => update({ innerHeight: v })} />
          </>
        )}
        {comp.type === 'circle' && (
          <NumInput label="Radius" value={g.radius ?? 0} onChange={v => update({ radius: v })} />
        )}
        {comp.type === 'hollow-circle' && (
          <>
            <NumInput label="Outer Radius" value={g.outerRadius ?? 0} onChange={v => update({ outerRadius: v })} />
            <NumInput label="Inner Radius" value={g.innerRadius ?? 0} onChange={v => update({ innerRadius: v })} />
          </>
        )}
        {comp.type === 'ellipse' && (
          <>
            <NumInput label="Major Axis" value={g.majorAxis ?? 0} onChange={v => update({ majorAxis: v })} />
            <NumInput label="Minor Axis" value={g.minorAxis ?? 0} onChange={v => update({ minorAxis: v })} />
          </>
        )}
        {(comp.type === 'i-section') && (
          <>
            <NumInput label="Flange Width" value={g.flangeWidth ?? 0} onChange={v => update({ flangeWidth: v })} />
            <NumInput label="Flange Thickness" value={g.flangeThickness ?? 0} onChange={v => update({ flangeThickness: v })} />
            <NumInput label="Web Height" value={g.webHeight ?? 0} onChange={v => update({ webHeight: v })} />
            <NumInput label="Web Thickness" value={g.webThickness ?? 0} onChange={v => update({ webThickness: v })} />
            <NumInput label="Bot. Flange W" value={g.bottomFlangeWidth ?? g.flangeWidth ?? 0} onChange={v => update({ bottomFlangeWidth: v })} />
            <NumInput label="Bot. Flange T" value={g.bottomFlangeThickness ?? g.flangeThickness ?? 0} onChange={v => update({ bottomFlangeThickness: v })} />
          </>
        )}
        {comp.type === 't-section' && (
          <>
            <NumInput label="Flange Width" value={g.flangeWidth ?? 0} onChange={v => update({ flangeWidth: v })} />
            <NumInput label="Flange Thickness" value={g.flangeThickness ?? 0} onChange={v => update({ flangeThickness: v })} />
            <NumInput label="Web Height" value={g.webHeight ?? 0} onChange={v => update({ webHeight: v })} />
            <NumInput label="Web Thickness" value={g.webThickness ?? 0} onChange={v => update({ webThickness: v })} />
          </>
        )}
        {comp.type === 'l-section' && (
          <>
            <NumInput label="Leg Width" value={g.legWidth ?? 0} onChange={v => update({ legWidth: v })} />
            <NumInput label="Leg Height" value={g.legHeight ?? 0} onChange={v => update({ legHeight: v })} />
            <NumInput label="Thickness" value={g.thickness ?? 0} onChange={v => update({ thickness: v })} />
          </>
        )}
        {comp.type === 'channel' && (
          <>
            <NumInput label="Flange Width" value={g.flangeWidth ?? 0} onChange={v => update({ flangeWidth: v })} />
            <NumInput label="Flange Thickness" value={g.flangeThickness ?? 0} onChange={v => update({ flangeThickness: v })} />
            <NumInput label="Web Height" value={g.webHeight ?? 0} onChange={v => update({ webHeight: v })} />
            <NumInput label="Web Thickness" value={g.webThickness ?? 0} onChange={v => update({ webThickness: v })} />
          </>
        )}
      </div>

      {/* Operation */}
      <div className="panel-header">Operation</div>
      <div className="p-2 flex gap-2">
        <button
          className={`btn flex-1 text-xs ${comp.operation === 'add' ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => store.updateComponent(comp.id, { operation: 'add' })}
        >
          ＋ Add
        </button>
        <button
          className={`btn flex-1 text-xs ${comp.operation === 'subtract' ? 'btn-danger' : 'btn-ghost'}`}
          onClick={() => store.updateComponent(comp.id, { operation: 'subtract' })}
        >
          − Subtract
        </button>
      </div>
    </div>
  );
}

function NumInput({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <label className="text-[10px] font-semibold uppercase mb-0.5 block" style={{ color: 'var(--text-muted)' }}>{label}</label>
      <input
        type="number"
        className="input-field"
        value={value}
        onChange={e => onChange(parseFloat(e.target.value) || 0)}
        step="any"
      />
    </div>
  );
}
