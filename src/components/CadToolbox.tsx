'use client';
import React, { useState } from 'react';
import { CAD_COMMANDS } from '@/engine/cad';

const groups = [
  {
    name: 'Draw',
    commands:
      'LINE PLINE RECTANGLE CIRCLE CIRCLED CIRCLE2P CIRCLE3P ELLIPSE POLYGON ARC POINT XLINE RAY SPLINE DONUT',
  },
  {
    name: 'Modify',
    commands:
      'MOVE COPY ROTATE SCALE MIRROR STRETCH OFFSET TRIM EXTEND FILLET CHAMFER JOIN EXPLODE BREAK LENGTHEN ARRAY ARRAYPOLAR OVERKILL ERASE BOUNDARY',
  },
  { name: 'Annotate & measure', commands: 'TEXT MTEXT DIM DIMALIGNED DIST ID AREA LIST' },
  { name: 'View & precision', commands: 'ZOOM PAN GRID OSNAP ORTHO SNAP POLAR GRIDSPACING' },
  {
    name: 'Project & utilities',
    commands: 'SELECT UNDO REDO UNITS REGEN SAVE OPEN HELP CANCEL',
  },
];

// Original, conventional CAD line-work symbols; no proprietary product artwork.
const paths: Record<string, string> = {
  LINE: 'M4 20 20 4 M2 18h4v4H2z M18 2h4v4h-4z',
  PLINE: 'M3 19 9 6l7 10 5-12 M1 17h4v4H1z M7 4h4v4H7z M14 14h4v4h-4z',
  RECTANGLE: 'M3 5h18v14H3z M1 3h4v4H1z M19 17h4v4h-4z',
  CIRCLE: 'M20 12a8 8 0 1 1-16 0 8 8 0 1 1 16 0 M9 12h6 M12 9v6',
  CIRCLED: 'M20 12a8 8 0 1 1-16 0 8 8 0 1 1 16 0 M3 17 21 7',
  CIRCLE2P: 'M20 12a8 8 0 1 1-16 0 8 8 0 1 1 16 0 M3 12h18 M3 10v4 M21 10v4',
  CIRCLE3P: 'M20 12a8 8 0 1 1-16 0 8 8 0 1 1 16 0 M3 10h3v3H3z M18 10h3v3h-3z M10 3h3v3h-3z',
  ELLIPSE: 'M22 12a10 6 0 1 1-20 0 10 6 0 1 1 20 0 M8 12h8',
  POLYGON: 'M12 2 22 9l-4 12H6L2 9z',
  ARC: 'M3 19A15 15 0 0 1 21 4 M1 17h4v4H1z M19 2h4v4h-4z',
  POINT: 'M12 3v18 M3 12h18 M15 12a3 3 0 1 1-6 0 3 3 0 1 1 6 0',
  XLINE: 'M2 22 22 2 M3 16v5h5 M16 3h5v5',
  RAY: 'M3 20 21 2 M16 3h5v5 M1 18h4v4H1z',
  SPLINE: 'M2 19C5-2 9 2 12 12s7 13 10-8 M1 17h3v3H1z M20 2h3v3h-3z',
  DONUT: 'M22 12a10 10 0 1 1-20 0 10 10 0 1 1 20 0 M17 12a5 5 0 1 1-10 0 5 5 0 1 1 10 0',
  MOVE: 'M12 2v20 M2 12h20 M8 6l4-4 4 4 M8 18l4 4 4-4 M6 8l-4 4 4 4 M18 8l4 4-4 4',
  COPY: 'M3 3h12v12H3z M9 9h12v12H9z',
  ROTATE: 'M20 9a8 8 0 1 0 0 8 M20 3v6h-6 M10 12h4 M12 10v4',
  SCALE: 'M3 13h8v8H3z M3 9V3h18v18h-6 M12 12l8-8 M15 4h5v5',
  MIRROR: 'M12 2v20 M8 5 2 19h6z M16 5l6 14h-6z',
  STRETCH: 'M2 6h9v12H2z M15 6h7v12h-7 M6 3v18 M10 12h12 M18 8l4 4-4 4',
  OFFSET: 'M2 20V5h14 M7 20V10h14 M12 20v-5h9',
  TRIM: 'M3 8h18 M8 2v20 M13 12l8 8 M21 12l-8 8',
  EXTEND: 'M3 4h18 M8 22V4 M5 9l3-5 3 5 M13 14h8',
  FILLET: 'M3 21V11a8 8 0 0 1 8-8h10',
  CHAMFER: 'M3 21V11l8-8h10',
  JOIN: 'M2 6h7v12H2 M22 6h-7v12h7 M7 12h10 M10 9l-3 3 3 3 M14 9l3 3-3 3',
  EXPLODE:
    'M8 8 3 3 M3 7V3h4 M16 8l5-5 M17 3h4v4 M8 16l-5 5 M3 17v4h4 M16 16l5 5 M17 21h4v-4 M9 9h6v6H9z',
  BREAK: 'M2 18 9 11 M15 5l7-7 M9 7l6 6 M12 4l6 6',
  LENGTHEN: 'M2 17h20 M17 13l5 4-5 4 M2 4v6 M2 7h12 M10 3l4 4-4 4',
  ARRAY:
    'M2 2h5v5H2z M10 2h5v5h-5z M18 2h5v5h-5z M2 10h5v5H2z M10 10h5v5h-5z M18 10h5v5h-5z M2 18h5v5H2z M10 18h5v5h-5z M18 18h5v5h-5z',
  ARRAYPOLAR: 'M10 1h4v4h-4z M19 10h4v4h-4z M10 19h4v4h-4z M1 10h4v4H1z M8 8l8 8 M16 8l-8 8',
  OVERKILL: 'M3 4h14v14H3z M7 8h14v14H7z M9 14l4 4 8-11',
  ERASE: 'M3 14 13 4l8 8-9 9H9z M8 9l8 8 M12 21h10',
  BOUNDARY: 'M2 2h20v20H2z M6 6h12v12H6z M6 12h12 M12 6v12',
  TEXT: 'M3 4h18 M12 4v17 M8 21h8 M3 4v4 M21 4v4',
  MTEXT: 'M3 3h14 M10 3v12 M6 15h8 M3 19h18 M3 23h14',
  DIM: 'M3 2v19 M21 2v19 M3 15h18 M7 11l-4 4 4 4 M17 11l4 4-4 4',
  DIMALIGNED: 'M2 14 9 21 M15 1l8 8 M6 18 19 5 M6 13v5h5 M14 5h5v5',
  DIST: 'M2 17 17 2l5 5L7 22z M7 12l3 3 M11 8l3 3 M15 4l3 3',
  ID: 'M12 2v20 M2 12h20 M3 3h6 M3 3v6 M21 21h-6 M21 21v-6',
  AREA: 'M3 3h18v18H3z M3 9l6-6 M3 15 15 3 M3 21 21 3 M9 21 21 9 M15 21l6-6',
  LIST: 'M7 3h14v18H7z M10 7h8 M10 12h8 M10 17h8 M2 7h1 M2 12h1 M2 17h1',
  ZOOM: 'M16 10a6 6 0 1 1-12 0 6 6 0 1 1 12 0 M15 15l7 7 M7 10h6 M10 7v6',
  PAN: 'M7 11V6a2 2 0 0 1 4 0v5-7a2 2 0 0 1 4 0v7-5a2 2 0 0 1 4 0v8l2-3 2 2-5 9H9l-6-8 2-2 2 2',
  GRID: 'M3 3h18v18H3z M9 3v18 M15 3v18 M3 9h18 M3 15h18',
  OSNAP: 'M4 4h16v16H4z M8 12h8 M12 8v8 M1 12h3 M20 12h3 M12 1v3 M12 20v3',
  ORTHO: 'M4 3v17h17 M4 14h6v6',
  SNAP: 'M3 3h2v2H3z M11 3h2v2h-2z M19 3h2v2h-2z M3 11h2v2H3z M11 11h2v2h-2z M19 11h2v2h-2z M3 19h2v2H3z M11 19h2v2h-2z M19 19h2v2h-2z',
  POLAR: 'M3 21h18 M3 21V3 M3 21 19 5 M3 12a9 9 0 0 1 9 9',
  GRIDSPACING: 'M3 3h18v10H3z M9 3v10 M15 3v10 M3 19h18 M7 16l-4 3 4 3 M17 16l4 3-4 3',
  SELECT: 'M4 2v18l5-5 4 7 4-2-4-7h7z',
  UNDO: 'M9 4 3 10l6 6 M3 10h11a7 7 0 0 1 7 7v3',
  REDO: 'M15 4l6 6-6 6 M21 10H10a7 7 0 0 0-7 7v3',
  UNITS: 'M2 7h20v10H2z M6 7v5 M10 7v3 M14 7v5 M18 7v3',
  REGEN: 'M20 8a9 9 0 0 0-15-3L2 8 M2 3v5h5 M4 16a9 9 0 0 0 15 3l3-3 M22 21v-5h-5',
  SAVE: 'M3 3h15l3 3v15H3z M7 3v6h10V3 M7 21v-8h10v8',
  OPEN: 'M2 20V5h7l3 3h10 M2 20l4-9h17l-4 9z',
  HELP: 'M21 12a9 9 0 1 1-18 0 9 9 0 1 1 18 0 M9 8a3 3 0 0 1 6 0c0 3-3 2-3 6 M12 17v1',
  CANCEL: 'M5 5l14 14 M19 5 5 19',
};

export default function CadToolbox({
  onCommand,
  activeCommand,
}: {
  onCommand: (command: string) => void;
  activeCommand?: string;
}) {
  const [open, setOpen] = useState(true);
  const [search, setSearch] = useState('');
  const query = search.trim().toUpperCase();
  const matches = CAD_COMMANDS.filter(
    (c) => !query || `${c.name} ${c.aliases.join(' ')} ${c.help}`.toUpperCase().includes(query),
  );
  return (
    <section
      data-cad-ui
      aria-label="CAD command toolbox"
      className="flex flex-col shrink-0 min-h-0 border-t"
      style={{
        borderColor: 'var(--border)',
        background: 'var(--bg-secondary)',
        ...(open ? { height: 'min(320px, 45%)' } : {}),
      }}
    >
      <button
        type="button"
        className="panel-header flex items-center justify-between shrink-0 w-full"
        aria-expanded={open}
        aria-controls="cad-toolbox-commands"
        onClick={() => setOpen(!open)}
      >
        <span>
          CAD Toolbox{' '}
          <span className="text-[10px] font-normal opacity-60">
            {CAD_COMMANDS.length} commands
          </span>
        </span>
        <span aria-hidden="true">{open ? '−' : '+'}</span>
      </button>
      {open && (
        <div id="cad-toolbox-commands" className="flex flex-col min-h-0 flex-1">
          <div className="p-2 shrink-0">
            <input
              type="search"
              className="input w-full text-xs"
              placeholder="Search commands or aliases…"
              aria-label="Search CAD commands"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="overflow-y-auto min-h-0 flex-1 px-2 pb-2">
            {groups.map((group) => {
              const names = group.commands.split(' ');
              const commands = matches.filter(
                (c) =>
                  names.includes(c.name) ||
                  (group.name === 'Project & utilities' &&
                    !groups.some((g) => g.commands.split(' ').includes(c.name))),
              );
              if (!commands.length) return null;
              return (
                <div key={group.name} role="group" aria-label={group.name} className="mb-2">
                  <div
                    className="text-[10px] uppercase tracking-wide font-semibold py-1"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    {group.name}
                  </div>
                  <div className="grid grid-cols-3 gap-1">
                    {commands.map((command) => (
                      <button
                        key={command.name}
                        type="button"
                        data-cad-command={command.name}
                        aria-label={`Run ${command.name}`}
                        aria-pressed={activeCommand === command.name}
                        title={`${command.name}${command.aliases.length ? ` (${command.aliases.join(', ')})` : ''}\n${command.help}`}
                        onClick={() => onCommand(command.name)}
                        className="flex flex-col items-center justify-center gap-1 rounded p-1.5 min-w-0 border transition-colors hover:brightness-125 focus-visible:outline-2 focus-visible:outline-offset-1"
                        style={{
                          color:
                            activeCommand === command.name
                              ? 'var(--accent)'
                              : 'var(--text-secondary)',
                          borderColor:
                            activeCommand === command.name ? 'var(--accent)' : 'var(--border)',
                          background: 'var(--bg-primary)',
                        }}
                      >
                        <svg
                          width="20"
                          height="20"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden="true"
                        >
                          <path d={paths[command.name] ?? paths.HELP} />
                        </svg>
                        <span className="text-[9px] leading-tight max-w-full truncate">
                          {command.name}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
            {!matches.length && (
              <p className="text-xs py-3" style={{ color: 'var(--text-muted)' }}>
                No matching commands.
              </p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
