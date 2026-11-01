import { v4 as uuid } from 'uuid';
import type { ImportResult } from './exporters';
import type { LengthUnit, Point, SectionProject } from './types';
import { validateCadRegion } from './cadRegion';
import { uniqueCadVertices } from './cadPath';
import { keyholeAll, signedArea } from './combine';
import { segmentsIntersect } from './geometry';

export interface MidasSectionChoice {
  number: number;
  name: string;
  error?: string;
}
export interface MidasImportResult extends ImportResult {
  sections: MidasSectionChoice[];
  detectedUnit?: LengthUnit;
}
interface RecordSection {
  header: string[];
  lines: string[];
  unit?: LengthUnit;
  unitError?: string;
}
const units: Record<string, LengthUnit> = {
  MM: 'mm',
  CM: 'cm',
  M: 'm',
  IN: 'inch',
  INCH: 'inch',
  FT: 'ft',
};
function numbers(line: string): number[] {
  const tokens = line
    .replace(/\\\s*$/, '')
    .replace(/,\s*$/, '')
    .split(',')
    .map((s) => s.trim());
  if (tokens.some((s) => !/^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eEdD][+-]?\d+)?$/.test(s))) {
    throw new Error('Invalid numeric data in section definition.');
  }
  const result = tokens.map((s) => Number(s.replace(/[dD]/, 'E')));
  if (result.some((n) => !Number.isFinite(n)))
    throw new Error('Section contains non-finite values.');
  return result;
}
function inside(p: Point, ring: Point[]): boolean {
  let result = false;
  ring.forEach((a, i) => {
    const b = ring[(i + 1) % ring.length];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x)
      result = !result;
  });
  return result;
}
function boundaries(record: RecordSection): Point[][] {
  const h = record.header;
  if (h[1]?.toUpperCase() !== 'VALUE' || h[12]?.toUpperCase() !== 'GEN' || h.length !== 15) {
    throw new Error(
      'Only non-tapered VALUE / GEN polygon sections are supported; PSC, composite, database and tapered sections are not supported.',
    );
  }
  const rows: number[][] = [];
  const polygons: { type: string; values: number[] }[] = [];
  for (const line of record.lines) {
    const polygon = /^(OPOLY|IPOLY)\s*=\s*(.*)$/i.exec(line);
    if (polygon) {
      polygons.push({ type: polygon[1].toUpperCase(), values: numbers(polygon[2]) });
    } else if (/^[\d+.-]/.test(line)) {
      if (polygons.length) polygons[polygons.length - 1].values.push(...numbers(line));
      else rows.push(numbers(line));
    } else
      throw new Error(
        'Unsupported or malformed section data (only OPOLY/IPOLY boundaries are supported).',
      );
  }
  if (rows.length !== 3 || rows.some((row, i) => row.length !== [6, 10, 8][i])) {
    throw new Error(
      'Expected three stiffness/property rows (6, 10 and 8 values) before the polygon boundaries.',
    );
  }
  if (polygons[0]?.type !== 'OPOLY' || polygons.slice(1).some((p) => p.type !== 'IPOLY')) {
    throw new Error('Expected one OPOLY outer boundary followed by optional IPOLY openings.');
  }
  const rings = polygons.map((polygon, i) => {
    if (polygon.values.length % 2)
      throw new Error('Polygon coordinates must be complete X,Y pairs.');
    const points: Point[] = [];
    for (let k = 0; k < polygon.values.length; k += 2)
      points.push({ x: polygon.values[k], y: polygon.values[k + 1] });
    const ring = uniqueCadVertices(points);
    validateCadRegion(ring);
    return signedArea(ring) > 0 === (i === 0) ? ring : ring.reverse();
  });
  for (let i = 1; i < rings.length; i++) {
    if (!inside(rings[i][0], rings[0]))
      throw new Error('Every IPOLY opening must be strictly inside OPOLY.');
    for (let j = 0; j < i; j++) {
      if (
        rings[i].some((a, k) =>
          rings[j].some((b, n) =>
            segmentsIntersect(
              a,
              rings[i][(k + 1) % rings[i].length],
              b,
              rings[j][(n + 1) % rings[j].length],
            ),
          ),
        )
      ) {
        throw new Error('Polygon boundaries intersect or touch.');
      }
      if (j > 0 && (inside(rings[i][0], rings[j]) || inside(rings[j][0], rings[i])))
        throw new Error('IPOLY openings cannot overlap or contain one another.');
    }
  }
  return rings;
}

/** Import one general polygon section; never combine unrelated MIDAS sections. */
export function importMidasMCT(
  text: string,
  fileName = 'Section.mct',
  sectionNumber?: number,
  unitOverride?: LengthUnit,
): MidasImportResult {
  const choices: MidasSectionChoice[] = [];
  try {
    const records: RecordSection[] = [];
    let command = '';
    let current: RecordSection | undefined;
    let unit: LengthUnit | undefined;
    let unitError: string | undefined;
    for (const raw of text.replace(/^\uFEFF/, '').split(/\r\n|\n|\r/)) {
      const line = raw.split(';')[0].trim();
      if (!line) continue;
      if (line.startsWith('*')) {
        command = line.toUpperCase();
        current = undefined;
        continue;
      }
      if (command === '*UNIT') {
        const label = line.split(',')[1]?.trim().toUpperCase();
        unit = units[label];
        unitError = unit
          ? undefined
          : `Unsupported MIDAS length unit: ${label || '(missing)'}.`;
      } else if (command === '*SECT-PSCVALUE') {
        const header = /^SECT\s*=\s*(.*)$/i.exec(line);
        if (header) {
          current = {
            header: header[1].split(',').map((s) => s.trim()),
            lines: [],
            unit,
            unitError,
          };
          records.push(current);
        } else if (current) current.lines.push(line);
        else throw new Error('Section data appears before a SECT definition.');
      }
    }
    if (!records.length)
      throw new Error(
        'No *SECT-PSCVALUE section definitions found. Import a MIDAS general VALUE section with OPOLY/IPOLY boundaries.',
      );
    const seen = new Set<number>();
    const parsed = records.map((record) => {
      const number = Number(record.header[0]);
      if (!Number.isSafeInteger(number) || number < 1 || seen.has(number))
        throw new Error('Section numbers must be unique positive safe integers.');
      seen.add(number);
      const choice: MidasSectionChoice = {
        number,
        name: record.header[2] || `Section ${number}`,
      };
      choices.push(choice);
      try {
        if (record.unitError) throw new Error(record.unitError);
        return { record, choice, rings: boundaries(record) };
      } catch (error) {
        choice.error = error instanceof Error ? error.message : 'Invalid section.';
        return { record, choice };
      }
    });
    const selected =
      sectionNumber === undefined
        ? (parsed.find((p) => !p.choice.error) ?? parsed[0])
        : parsed.find((p) => p.choice.number === sectionNumber);
    if (!selected) throw new Error('The selected MIDAS section was not found.');
    if (!selected.rings || selected.choice.error) throw new Error(selected.choice.error);
    const { record, choice, rings } = selected;
    const now = new Date().toISOString();
    const project: SectionProject = {
      id: uuid(),
      name: choice.name,
      sectionNumber: choice.number,
      description: `Imported section ${choice.number} from ${fileName}`,
      units: unitOverride ?? record.unit ?? 'mm',
      components: [
        {
          id: uuid(),
          name: choice.name,
          type: 'custom-shape',
          geometry: { points: keyholeAll(rings), rings },
          position: { x: 0, y: 0 },
          rotation: 0,
          operation: 'add',
          visible: true,
          locked: false,
          materialId: 'steel-default',
        },
      ],
      materials: [
        {
          id: 'steel-default',
          name: 'Structural Steel',
          E: 200000,
          density: 7850,
          grade: 'Fe 410',
          color: '#60a5fa',
        },
      ],
      loads: { P: 0, Mx: 0, My: 0 },
      createdAt: now,
      updatedAt: now,
      revision: 1,
    };
    const warnings = [
      'Geometry imported in MIDAS local Y/Z coordinates as app X/Y. Properties are recalculated from the boundaries; MIDAS stiffness values, member offsets, loads and material assignments are not imported. Default steel is assigned; review material properties before design.',
    ];
    if (!record.unit && !unitOverride)
      warnings.push(
        'No *UNIT length unit declared; millimetres assumed. Confirm the coordinate unit.',
      );
    if (records.length > 1)
      warnings.push(
        `This file contains ${records.length} sections. Only the selected section is imported.`,
      );
    return { success: true, project, sections: choices, detectedUnit: record.unit, warnings };
  } catch (error) {
    return {
      success: false,
      sections: choices,
      error: error instanceof Error ? error.message : 'Failed to import MIDAS section.',
    };
  }
}
