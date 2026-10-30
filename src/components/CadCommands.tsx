'use client';
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { StoreState } from '@/store/useStore';
import type { Point } from '@/engine/types';
import {
  CAD_COMMANDS,
  findCadCommand,
  cadPrompt,
  parseCadValue,
  cadCreate,
  transformCadSelection,
  cadAllPoints,
  arcPoints,
  stretchCad,
  makeCadDimension,
  dimensionGeometry,
  type CadSession,
  type CadValue,
} from '@/engine/cad';
import { executeCadExtended, isExtendedCadCommand, fitCadSpline } from '@/engine/cadExtended';
import { cadNumber } from '@/engine/cad';
import { computeComponentProps } from '@/engine/geometry';

type View = { x: number; y: number; w: number; h: number };
export interface CadOptions {
  enabled: boolean;
  store: StoreState;
  view: View;
  setView: React.Dispatch<React.SetStateAction<View>>;
  grid: boolean;
  setGrid: React.Dispatch<React.SetStateAction<boolean>>;
  osnap: boolean;
  setOsnap: React.Dispatch<React.SetStateAction<boolean>>;
  save: () => void;
  open: () => void;
}
export function useCad(options: CadOptions) {
  const [session, setSession] = useState<CadSession | null>(null);
  const [history, setHistory] = useState<{ text: string; kind: string }[]>([
    {
      text: 'CAD ready. HELP lists implemented commands. Lengths use project units; angles are CCW degrees. Open geometry is drafting-only.',
      kind: 'prompt',
    },
  ]);
  const [ortho, setOrtho] = useState(false),
    [polar, setPolar] = useState(false),
    [snap, setSnap] = useState(false),
    [spacing, setSpacing] = useState(10);
  const [hover, setHover] = useState<Point | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const current = useRef(options);
  useLayoutEffect(() => {
    current.current = options;
  });
  const sessionRef = useRef(session);
  const repeatCommand = useRef('');
  const log = (text: string, kind = 'prompt') =>
    setHistory((h) => [...h.slice(-499), { text, kind }]);
  const cancel = () => {
    setSession(null);
    sessionRef.current = null;
    setHover(null);
    log('Command cancelled; incomplete geometry discarded.');
  };
  const commit = (project: StoreState['project']) =>
    current.current.store.setProject({ ...project, updatedAt: new Date().toISOString() });
  const execute = (name: string, values: CadValue[], close = false) => {
    const o = current.current,
      s = o.store,
      p = s.project;
    const point = values[0] as Point;
    const drafts = p.drawingEntities ?? [];
    if (isExtendedCadCommand(name))
      commit(executeCadExtended(p, s.selectedIds, name, values, close));
    else if (
      [
        'LINE',
        'PLINE',
        'RECTANGLE',
        'CIRCLE',
        'ELLIPSE',
        'POLYGON',
        'ARC',
        'POINT',
        'DIM',
        'DIMALIGNED',
      ].includes(name)
    )
      commit(cadCreate(p, name, values, close));
    else if (name === 'STRETCH') commit(stretchCad(p, values));
    else if (['MOVE', 'COPY', 'ROTATE', 'SCALE', 'MIRROR'].includes(name))
      commit(transformCadSelection(p, s.selectedIds, name, values));
    else if (name === 'UNDO') s.undo();
    else if (name === 'REDO') s.redo();
    else if (name === 'REGEN') s.recalculate();
    else if (name === 'SAVE') o.save();
    else if (name === 'OPEN') o.open();
    else if (name === 'HELP') {
      CAD_COMMANDS.forEach((c) =>
        log(`${c.name}${c.aliases.length ? ' (' + c.aliases.join(', ') + ')' : ''} — ${c.help}`),
      );
      return;
    } else if (name === 'DIST') {
      const b = values[1] as Point;
      log(
        `Distance: ${Math.hypot(b.x - point.x, b.y - point.y).toPrecision(10)} ${p.units}; ΔX=${b.x - point.x}, ΔY=${b.y - point.y}`,
        'success',
      );
      return;
    } else if (name === 'ID') {
      log(`X=${point.x}, Y=${point.y}, Z=0 ${p.units}`, 'success');
      return;
    } else if (name === 'GRIDSPACING') setSpacing(values[0] as number);
    else if (name === 'UNITS') {
      const unit = String(values[0]).toLowerCase();
      if (!['mm', 'cm', 'm', 'inch', 'ft'].includes(unit))
        throw new Error('Choose mm, cm, m, inch or ft.');
      s.setUnits(unit as typeof p.units);
      log('Unit label changed; existing coordinates were not rescaled.');
    } else if (['GRID', 'OSNAP', 'ORTHO', 'SNAP', 'POLAR'].includes(name)) {
      const input = String(values[0]).toUpperCase();
      if (!['ON', 'OFF', 'TOGGLE', ''].includes(input))
        throw new Error('Choose ON, OFF or Toggle.');
      const toggle = (v: boolean) => (input === 'ON' ? true : input === 'OFF' ? false : !v);
      if (name === 'GRID') o.setGrid(toggle);
      if (name === 'OSNAP') o.setOsnap(toggle);
      if (name === 'ORTHO') setOrtho(toggle);
      if (name === 'SNAP') setSnap(toggle);
      if (name === 'POLAR') setPolar(toggle);
    } else if (name === 'SELECT') {
      if (values.length === 3) {
        const a = values[1] as Point,
          b = values[2] as Point;
        const inside = (pt: Point) =>
          pt.x >= Math.min(a.x, b.x) &&
          pt.x <= Math.max(a.x, b.x) &&
          pt.y >= Math.min(a.y, b.y) &&
          pt.y <= Math.max(a.y, b.y);
        s.selectComponents([
          ...p.components
            .filter((c) => c.visible && computeComponentProps(c).outline.every(inside))
            .map((c) => c.id),
          ...drafts.filter((e) => e.points.every(inside)).map((e) => e.id),
        ]);
      } else {
        const input = String(values[0]);
        if (input.toUpperCase() === 'ALL')
          s.selectComponents([
            ...p.components.filter((c) => c.visible).map((c) => c.id),
            ...drafts.map((e) => e.id),
          ]);
        else if (input.toUpperCase() === 'NONE') s.selectComponents([]);
        else if ([...p.components, ...drafts].some((c) => c.id === input))
          s.selectComponents([input]);
        else throw new Error('Use ALL, NONE, WINDOW or a valid ID (LIST shows IDs).');
      }
    } else if (name === 'ERASE') {
      const ids = s.selectedIds;
      if (!ids.length) throw new Error('Select objects first.');
      if (p.components.some((c) => ids.includes(c.id) && (c.combinedFrom || c.parentId)))
        throw new Error('Use the existing Delete / Delete Cutout tools for associated components.');
      commit({
        ...p,
        components: p.components.filter((c) => !ids.includes(c.id) || c.locked),
        drawingEntities: drafts.filter((e) => !ids.includes(e.id)),
      });
      s.selectComponents([]);
    } else if (name === 'BOUNDARY') {
      const selected = drafts.filter((e) => s.selectedIds.includes(e.id));
      if (selected.length !== 1) throw new Error('Select exactly one closed draft polyline.');
      const pts = selected[0].points,
        first = pts[0],
        last = pts[pts.length - 1];
      if (pts.length < 4 || first.x !== last.x || first.y !== last.y)
        throw new Error('Selected draft path must be closed.');
      const points = pts.slice(0, -1);
      // Reuse closed-polyline validation before committing.
      const next = cadCreate(p, 'PLINE', points, true);
      commit({ ...next, drawingEntities: drafts.filter((e) => e.id !== selected[0].id) });
    } else if (name === 'LIST' || name === 'AREA') {
      const comps = p.components.filter((c) => s.selectedIds.includes(c.id));
      const selected = drafts.filter((c) => s.selectedIds.includes(c.id));
      if (!comps.length && !selected.length) throw new Error('Select objects first.');
      comps.forEach((c) => {
        const cp = computeComponentProps(c),
          pts = cp.outline;
        const perimeter = pts.reduce((sum, a, i) => {
          const b = pts[(i + 1) % pts.length];
          return sum + Math.hypot(b.x - a.x, b.y - a.y);
        }, 0);
        log(
          `${c.name} [${c.id}] ${c.type}: area=${cp.area.toPrecision(10)} ${p.units}², outline perimeter≈${perimeter.toPrecision(10)} ${p.units}, position=${c.position.x},${c.position.y}`,
          'success',
        );
      });
      selected.forEach((e) =>
        log(
          e.kind === 'dimension'
            ? `${e.dimensionStyle} dimension [${e.id}]: ${dimensionGeometry(e).label} ${p.units}; non-associative annotation, no section area.`
            : `${e.kind} [${e.id}] ${e.points.length} vertices; drafting geometry, no section area.`,
          'success',
        ),
      );
      return;
    } else if (name === 'ZOOM') {
      const input = String(values[0]).toUpperCase();
      if (['EXTENTS', 'E'].includes(input)) {
        const points = cadAllPoints(p);
        if (!points.length) throw new Error('Nothing to fit.');
        let minX = Infinity,
          maxX = -Infinity,
          minY = Infinity,
          maxY = -Infinity;
        points.forEach((pt) => {
          minX = Math.min(minX, pt.x);
          maxX = Math.max(maxX, pt.x);
          minY = Math.min(minY, pt.y);
          maxY = Math.max(maxY, pt.y);
        });
        const size = Math.max(maxX - minX, maxY - minY, 1) * 1.25;
        o.setView({ x: (minX + maxX - size) / 2, y: (-minY - maxY - size) / 2, w: size, h: size });
      } else if (['RESET', 'R'].includes(input)) o.setView({ x: -400, y: -400, w: 800, h: 800 });
      else if (['IN', 'I', 'OUT', 'O'].includes(input)) {
        const factor = ['IN', 'I'].includes(input) ? 0.5 : 2;
        o.setView((v) => ({
          x: v.x + (v.w * (1 - factor)) / 2,
          y: v.y + (v.h * (1 - factor)) / 2,
          w: v.w * factor,
          h: v.h * factor,
        }));
      } else throw new Error('Choose Extents, In, Out or Reset.');
    } else if (name === 'PAN') o.setView((v) => ({ ...v, x: v.x - point.x, y: v.y + point.y }));
    else throw new Error('Command is not implemented.');
    log(`${name} completed.`, 'success');
  };
  const submit = (input: string) => {
    if (!current.current.enabled) return;
    const text = input.trim();
    log(text || '↵', 'input');
    try {
      if (['CANCEL', 'ESC'].includes(text.toUpperCase())) {
        cancel();
        return;
      }
      const active = sessionRef.current;
      if (!active) {
        const c = findCadCommand(text || repeatCommand.current);
        if (!text && !repeatCommand.current) {
          log('Enter a command or HELP.');
          return;
        }
        if (!c) throw new Error('Unknown command. HELP lists only implemented commands.');
        repeatCommand.current = c.name;
        if (!c.prompts.length) execute(c.name, []);
        else {
          const next = { command: c, values: [] };
          setSession(next);
          sessionRef.current = next;
          log(cadPrompt(next));
        }
        return;
      }
      if (active.command.name === 'CIRCLE') {
        const variant =
          active.values.length === 0 && ['2P', '3P'].includes(text.toUpperCase())
            ? `CIRCLE${text.toUpperCase()}`
            : active.values.length === 1 && ['D', 'DIAMETER'].includes(text.toUpperCase())
              ? 'CIRCLED'
              : null;
        if (variant) {
          const next = {
            command: findCadCommand(variant)!,
            values: variant === 'CIRCLED' ? active.values : [],
          };
          setSession(next);
          sessionRef.current = next;
          log(cadPrompt(next));
          return;
        }
      }
      const path = ['LINE', 'PLINE', 'SPLINE'].includes(active.command.name);
      if (path && ['UNDO', 'U'].includes(text.toUpperCase())) {
        const next = { ...active, values: active.values.slice(0, -1) };
        setSession(next);
        sessionRef.current = next;
        log(cadPrompt(next));
        return;
      }
      if (path && (!text || ['CLOSE', 'C'].includes(text.toUpperCase()))) {
        execute(active.command.name, active.values, !!text);
        setSession(null);
        sessionRef.current = null;
        setHover(null);
        return;
      }
      if (!text && !['GRID', 'OSNAP', 'ORTHO', 'SNAP', 'POLAR'].includes(active.command.name))
        throw new Error('A value is required. Escape cancels.');
      let pointText = text;
      const lastPoint = active.values.filter((v) => typeof v === 'object').at(-1) as
        Point | undefined;
      if (
        active.command.types[Math.min(active.values.length, active.command.types.length - 1)] ===
          'point' &&
        lastPoint &&
        hover &&
        !/[,<@#]/.test(text)
      ) {
        const length = cadNumber(text, current.current.store.project.units);
        const dx = hover.x - lastPoint.x,
          dy = hover.y - lastPoint.y,
          distance = Math.hypot(dx, dy);
        if (distance < 1e-10)
          throw new Error('Move the cursor to specify a direction before direct-distance input.');
        pointText = `${lastPoint.x + (dx * length) / distance},${lastPoint.y + (dy * length) / distance}`;
      }
      const value = parseCadValue(active, pointText, current.current.store.project.units);
      if (
        active.command.name === 'SELECT' &&
        String(value).toUpperCase() === 'WINDOW' &&
        active.values.length === 0
      ) {
        const c = {
          ...active.command,
          prompts: ['Window:', 'First corner:', 'Opposite corner:'],
          types: ['text', 'point', 'point'] as ('text' | 'point')[],
        };
        const next = { command: c, values: [value] };
        setSession(next);
        sessionRef.current = next;
        log(cadPrompt(next));
        return;
      }
      const values = [...active.values, value];
      if (!path && values.length === active.command.prompts.length) {
        execute(active.command.name, values);
        setSession(null);
        sessionRef.current = null;
        setHover(null);
      } else {
        const next = { ...active, values };
        setSession(next);
        sessionRef.current = next;
        log(cadPrompt(next));
      }
    } catch (error) {
      log(error instanceof Error ? error.message : String(error), 'error');
    }
  };
  const run = (text: string) => {
    if (sessionRef.current) cancel();
    submit(text);
    inputRef.current?.focus();
  };
  const api = useRef({ submit, cancel, execute });
  useLayoutEffect(() => {
    api.current = { submit, cancel, execute };
  });
  useEffect(() => {
    if (!options.enabled) return;
    const key = (e: KeyboardEvent) => {
      const target = e.target instanceof HTMLElement ? e.target : null;
      const editing =
        !!target && (target.matches('input,textarea,select') || target.isContentEditable);
      const inCad = !!target?.closest('[data-cad-ui]');
      if (editing && !inCad) return;
      if (inCad && (e.ctrlKey || e.metaKey) && ['s', 'o'].includes(e.key.toLowerCase())) {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (e.key.toLowerCase() === 's') current.current.save();
        else current.current.open();
        return;
      }
      if (['F3', 'F7', 'F8', 'F10'].includes(e.key) && !e.shiftKey) {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (e.key === 'F3') current.current.setOsnap((v) => !v);
        if (e.key === 'F7') current.current.setGrid((v) => !v);
        if (e.key === 'F8') setOrtho((v) => !v);
        if (e.key === 'F10') setPolar((v) => !v);
      } else if (
        !editing &&
        e.key === 'Delete' &&
        current.current.store.project.drawingEntities?.some((entity) =>
          current.current.store.selectedIds.includes(entity.id),
        )
      ) {
        e.preventDefault();
        e.stopImmediatePropagation();
        try {
          api.current.execute('ERASE', []);
        } catch (error) {
          log(error instanceof Error ? error.message : String(error), 'error');
        }
      } else if (e.key === 'Escape' && sessionRef.current && !inCad) {
        e.preventDefault();
        e.stopImmediatePropagation();
        api.current.cancel();
      } else if (!editing && !e.ctrlKey && !e.metaKey && !e.altKey && /^[a-z]$/i.test(e.key)) {
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
  }, [options.enabled]);
  const base = session?.values.filter((v) => typeof v === 'object').at(-1) as Point | undefined;
  const radiusInput =
    !!session &&
    ['CIRCLE', 'ELLIPSE', 'POLYGON'].includes(session.command.name) &&
    typeof session.values.at(-1) !== 'undefined' &&
    session.command.types[session.values.length] === 'positive';
  const pointInput =
    radiusInput ||
    (!!session &&
      session.command.types[Math.min(session.values.length, session.command.types.length - 1)] ===
        'point');
  const constrain = (p: Point) => {
    let pt = snap
      ? { x: Math.round(p.x / spacing) * spacing, y: Math.round(p.y / spacing) * spacing }
      : p;
    if (base && (ortho || polar)) {
      const dx = pt.x - base.x,
        dy = pt.y - base.y;
      if (ortho)
        pt = Math.abs(dx) >= Math.abs(dy) ? { x: pt.x, y: base.y } : { x: base.x, y: pt.y };
      else {
        const r = Math.hypot(dx, dy),
          angle = (Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * Math.PI) / 4;
        pt = { x: base.x + r * Math.cos(angle), y: base.y + r * Math.sin(angle) };
      }
    }
    return pt;
  };
  let preview: Point[] = (session?.values.filter((v) => typeof v === 'object') as Point[]) ?? [];
  if (pointInput && hover) {
    if (session?.command.name === 'RECTANGLE' && base)
      preview = [base, { x: hover.x, y: base.y }, hover, { x: base.x, y: hover.y }, base];
    else if (radiusInput && base && session) {
      const name = session.command.name;
      const rx =
        name === 'ELLIPSE'
          ? session.values.length === 1
            ? Math.abs(hover.x - base.x)
            : (session.values[1] as number)
          : Math.hypot(hover.x - base.x, hover.y - base.y);
      const ry =
        name === 'ELLIPSE' ? (session.values.length === 1 ? rx : Math.abs(hover.y - base.y)) : rx;
      const count = name === 'POLYGON' ? (session.values[0] as number) : 64;
      preview = Array.from({ length: count + 1 }, (_, i) => ({
        x: base.x + rx * Math.cos((i * 2 * Math.PI) / count),
        y: base.y + ry * Math.sin((i * 2 * Math.PI) / count),
      }));
    } else if (session?.command.name === 'ARC' && preview.length === 2) {
      try {
        preview = arcPoints(preview[0], preview[1], hover);
      } catch {
        preview = [...preview, hover];
      }
    } else preview = [...preview, hover];
  }
  if (session?.command.name === 'SPLINE' && preview.length >= 2) {
    try {
      preview = fitCadSpline(preview);
    } catch {
      /* Keep the last valid fit preview. */
    }
  }
  let dimensionPreview = null;
  if (
    session &&
    ['DIM', 'DIMALIGNED'].includes(session.command.name) &&
    session.values.length === 2 &&
    hover
  ) {
    try {
      dimensionPreview = makeCadDimension(
        session.command.name,
        session.values[0] as Point,
        session.values[1] as Point,
        hover,
      );
    } catch {
      /* Keep prompting until the dimension direction is valid. */
    }
  }
  return {
    dimensionPreview,
    session,
    history,
    setHistory,
    submit,
    run,
    cancel,
    inputRef,
    ortho,
    polar,
    snap,
    spacing,
    preview,
    pointInput,
    constrain,
    base,
    hover,
    setHover,
    radiusInput,
    pick: (p: Point) => {
      const pt = constrain(p);
      if (radiusInput && base) {
        const radius =
          session?.command.name === 'ELLIPSE'
            ? session.values.length === 1
              ? Math.abs(pt.x - base.x)
              : Math.abs(pt.y - base.y)
            : Math.hypot(pt.x - base.x, pt.y - base.y);
        submit(String(radius));
      } else submit(`${pt.x},${pt.y}`);
      inputRef.current?.focus();
    },
  };
}
export type CadApi = ReturnType<typeof useCad>;
export function CadPanel({ cad, options }: { cad: CadApi; options: CadOptions }) {
  const { inputRef, session: activeSession } = cad;
  const [text, setText] = useState(''),
    [collapsed, setCollapsed] = useState(false),
    [height, setHeight] = useState(170),
    [floating, setFloating] = useState(false);
  const [entered, setEntered] = useState<string[]>([]),
    [index, setIndex] = useState(-1),
    [suggestion, setSuggestion] = useState(0);
  const completion = useRef<string[]>([]);
  const [activeSuggestion, setActiveSuggestion] = useState(-1);
  const historyRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    historyRef.current?.scrollTo(0, historyRef.current.scrollHeight);
  }, [cad.history]);
  const suggestions =
    !cad.session && text
      ? CAD_COMMANDS.filter(
          (c) =>
            c.name.startsWith(text.toUpperCase()) ||
            c.aliases.some((a) => a.startsWith(text.toUpperCase())),
        ).sort(
          (a, b) =>
            Number(b.name === text.toUpperCase() || b.aliases.includes(text.toUpperCase())) -
            Number(a.name === text.toUpperCase() || a.aliases.includes(text.toUpperCase())),
        )
      : [];
  const colors: Record<string, string> = {
    prompt: 'var(--text-secondary)',
    input: 'var(--text-primary)',
    success: '#22c55e',
    error: '#f87171',
  };
  return (
    <>
      <div
        data-cad-ui
        className="flex items-center gap-1 px-2 py-1 border-y flex-wrap shrink-0"
        style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)' }}
      >
        <span className="text-[10px] font-bold mr-1">CAD</span>
        {[
          'LINE',
          'PLINE',
          'RECTANGLE',
          'CIRCLE',
          'ARC',
          'POLYGON',
          'MOVE',
          'COPY',
          'ROTATE',
          'SCALE',
          'STRETCH',
          'OFFSET',
          'TRIM',
          'FILLET',
          'JOIN',
          'DIM',
          'DIMALIGNED',
          'ERASE',
          'UNDO',
          'REDO',
        ].map((name) => (
          <button
            key={name}
            className="btn btn-ghost text-[10px] !px-1 !py-0.5"
            title={findCadCommand(name)?.help}
            onClick={() => cad.run(name)}
          >
            {name}
          </button>
        ))}
        <button
          className="btn btn-ghost text-[10px]"
          onClick={() => {
            cad.run('ZOOM');
            cad.submit('Extents');
          }}
        >
          Fit
        </button>
        <button
          className="btn btn-ghost text-[10px]"
          onClick={() => {
            cad.run('ZOOM');
            cad.submit('Reset');
          }}
        >
          Reset
        </button>
        {(['GRID', 'OSNAP', 'ORTHO', 'SNAP', 'POLAR'] as const).map((name, i) => (
          <button
            key={name}
            aria-pressed={[options.grid, options.osnap, cad.ortho, cad.snap, cad.polar][i]}
            className={`btn text-[10px] ${[options.grid, options.osnap, cad.ortho, cad.snap, cad.polar][i] ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => {
              cad.run(name);
              cad.submit('Toggle');
            }}
          >
            {name}
          </button>
        ))}
      </div>
      <section
        data-cad-ui
        aria-label="CAD command window"
        className={`shrink-0 flex flex-col border-t font-mono text-xs ${floating ? 'fixed bottom-10 right-6 z-40 w-[min(680px,90vw)] shadow-xl' : ''}`}
        style={{
          height: collapsed ? 30 : height,
          background: 'var(--bg-secondary)',
          borderColor: 'var(--border)',
        }}
      >
        {!collapsed && (
          <div
            role="separator"
            aria-label="Resize command window"
            aria-orientation="horizontal"
            tabIndex={0}
            className="h-1 cursor-ns-resize shrink-0 hover:bg-blue-500"
            onKeyDown={(e) => {
              if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                e.preventDefault();
                setHeight((h) =>
                  Math.max(
                    110,
                    Math.min(window.innerHeight * 0.55, h + (e.key === 'ArrowUp' ? 20 : -20)),
                  ),
                );
              }
            }}
            onPointerDown={(e) => {
              const start = e.clientY,
                size = height,
                element = e.currentTarget;
              element.setPointerCapture(e.pointerId);
              element.onpointermove = (event) =>
                setHeight(
                  Math.max(110, Math.min(window.innerHeight * 0.55, size + start - event.clientY)),
                );
              element.onpointerup = () => {
                element.onpointermove = null;
                element.onpointerup = null;
              };
            }}
          />
        )}
        <header className="flex items-center px-2 gap-2 h-6 shrink-0">
          <strong className="flex-1">
            Command {cad.session ? '· ' + cad.session.command.name : ''}
          </strong>
          <button title="Clear output history" onClick={() => cad.setHistory([])}>
            Clear
          </button>
          <button onClick={() => setFloating((v) => !v)}>{floating ? 'Dock' : 'Float'}</button>
          <button
            aria-label={collapsed ? 'Expand command window' : 'Collapse command window'}
            onClick={() => setCollapsed((v) => !v)}
          >
            {collapsed ? '+' : '−'}
          </button>
        </header>
        {!collapsed && (
          <>
            <div
              ref={historyRef}
              className="overflow-auto flex-1 px-2"
              role="log"
              aria-live="polite"
            >
              {cad.history.map((h, i) => (
                <div key={i} style={{ color: colors[h.kind], overflowWrap: 'anywhere' }}>
                  {h.kind === 'input' ? '> ' : ''}
                  {h.text}
                </div>
              ))}
            </div>
            <form
              className="relative border-t px-2 py-1"
              style={{ borderColor: 'var(--border)' }}
              onSubmit={(e) => {
                e.preventDefault();
                if (text) setEntered((h) => [...h.slice(-99), text]);
                const chosen = !activeSession
                  ? activeSuggestion >= 0
                    ? (suggestions[activeSuggestion]?.name ?? text)
                    : (findCadCommand(text)?.name ?? suggestions[0]?.name ?? text)
                  : text;
                cad.submit(chosen);
                setActiveSuggestion(-1);
                setText('');
                setIndex(-1);
                setSuggestion(0);
                completion.current = [];
              }}
            >
              {suggestions.length > 0 && (
                <div
                  id="cad-command-suggestions"
                  role="listbox"
                  aria-label="Command suggestions"
                  className="absolute bottom-full left-2 right-2 max-h-56 overflow-auto rounded border shadow-xl z-50 py-1"
                  style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)' }}
                >
                  {suggestions.map((command, i) => (
                    <button
                      type="button"
                      role="option"
                      id={`cad-suggestion-${i}`}
                      aria-selected={i === Math.max(0, activeSuggestion)}
                      key={command.name}
                      className="w-full px-3 py-1.5 text-left flex flex-col gap-0.5"
                      style={{
                        background:
                          i === Math.max(0, activeSuggestion) ? 'var(--bg-tertiary)' : undefined,
                      }}
                      onMouseDown={(e) => e.preventDefault()}
                      onMouseEnter={() => setActiveSuggestion(i)}
                      onClick={() => {
                        cad.run(command.name);
                        setText('');
                        setActiveSuggestion(-1);
                        completion.current = [];
                      }}
                    >
                      <span className="font-semibold">
                        {command.name}
                        {command.aliases.length ? ` (${command.aliases.join(', ')})` : ''}
                      </span>
                      <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                        {command.help}
                      </span>
                    </button>
                  ))}
                </div>
              )}
              <label className="block text-[10px]" htmlFor="cad-command-input">
                {activeSession ? cadPrompt(activeSession) : 'Command:'}
              </label>
              <input
                id="cad-command-input"
                ref={inputRef}
                value={text}
                autoComplete="off"
                role="combobox"
                aria-autocomplete="list"
                aria-expanded={suggestions.length > 0}
                aria-controls="cad-command-suggestions"
                aria-activedescendant={
                  suggestions.length ? `cad-suggestion-${Math.max(0, activeSuggestion)}` : undefined
                }
                spellCheck={false}
                className="w-full bg-transparent outline-none"
                placeholder={
                  cad.session
                    ? 'Enter value or click canvas · Esc cancels'
                    : 'Type command · HELP · Tab completes'
                }
                onChange={(e) => {
                  setText(e.target.value);
                  setSuggestion(0);
                  setActiveSuggestion(-1);
                  completion.current = [];
                }}
                onKeyDown={(e) => {
                  if (e.nativeEvent.isComposing) return;
                  if (
                    (e.key === ' ' || e.code === 'Space') &&
                    !(
                      activeSession &&
                      ['TEXT', 'MTEXT'].includes(activeSession.command.name) &&
                      activeSession.values.length === 3 &&
                      text.startsWith('"') &&
                      (text.length === 1 || !text.endsWith('"'))
                    ) &&
                    !e.ctrlKey &&
                    !e.metaKey &&
                    !e.altKey
                  ) {
                    e.preventDefault();
                    e.currentTarget.form?.requestSubmit();
                    return;
                  }
                  if (suggestions.length && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
                    e.preventDefault();
                    setActiveSuggestion((i) =>
                      e.key === 'ArrowDown'
                        ? (i + 1) % suggestions.length
                        : i <= 0
                          ? suggestions.length - 1
                          : i - 1,
                    );
                    return;
                  }
                  if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                    e.preventDefault();
                    const next =
                      e.key === 'ArrowUp'
                        ? Math.min(index + 1, entered.length - 1)
                        : Math.max(-1, index - 1);
                    setIndex(next);
                    setText(next < 0 ? '' : (entered[entered.length - 1 - next] ?? ''));
                  }
                  if (e.key === 'Tab' && (suggestions.length || completion.current.length)) {
                    e.preventDefault();
                    if (!completion.current.length)
                      completion.current = suggestions.map((c) => c.name);
                    setText(completion.current[suggestion % completion.current.length]);
                    setSuggestion(suggestion + 1);
                    setActiveSuggestion(-1);
                  }
                  if (e.key === 'Escape') {
                    e.preventDefault();
                    cad.cancel();
                    setText('');
                  }
                }}
              />
              <div className="text-[10px] truncate" style={{ color: 'var(--text-muted)' }}>
                {suggestions.length
                  ? suggestions.map((c) => c.name).join(' · ')
                  : (activeSession?.command.help ??
                    'Absolute x,y · Relative @dx,dy · Polar @length<angle · 2D Z=0')}
              </div>
            </form>
          </>
        )}
      </section>
    </>
  );
}
