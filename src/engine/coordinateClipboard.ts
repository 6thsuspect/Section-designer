export type CopyFormat = 'comma' | 'tab';

/**
 * Plain-text coordinate data for the clipboard: one point per line as
 * "x, y" (or "x<TAB>y" for spreadsheets). Values are copied exactly as
 * entered, in polygon order.
 */
export function formatCoordinates(
  points: { x: string | number; y: string | number }[],
  format: CopyFormat,
): string {
  const sep = format === 'tab' ? '\t' : ', ';
  return points.map(p => `${String(p.x).trim()}${sep}${String(p.y).trim()}`).join('\n');
}
