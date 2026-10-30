import type { DrawingEntity } from './cad';
import type { Point } from './types';

export const sameCadPoint = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y) <= 1e-8;
export function uniqueCadVertices(points: Point[]): Point[] {
  return points.length > 2 && sameCadPoint(points[0], points.at(-1)!)
    ? points.slice(0, -1)
    : points;
}
/** Legacy repeated-endpoint paths remain readable; new closed paths store unique vertices. */
export function isClosedCadPath(entity: DrawingEntity): boolean {
  return (
    entity.kind === 'polyline' &&
    (entity.closed === true ||
      (entity.points.length > 2 && sameCadPoint(entity.points[0], entity.points.at(-1)!)))
  );
}
export function cadPathPoints(entity: DrawingEntity): Point[] {
  return isClosedCadPath(entity)
    ? [...uniqueCadVertices(entity.points), entity.points[0]]
    : entity.points;
}
