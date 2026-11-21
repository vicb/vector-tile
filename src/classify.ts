import type { Point } from './point';

/**
 * Converts a flat list of polygon rings into structured polygon hierarchies (exterior rings with interior holes).
 *
 * Exterior ring winding direction is inferred from the first non-zero-area ring.
 *
 * @param rings - Array of coordinate rings.
 * @returns Array of polygons, where each polygon is an array of rings (outer ring first, followed by holes).
 */
export function classifyRings(rings: Point[][]): Point[][][] {
  const len = rings.length;

  if (len <= 1) {
    return [rings];
  }

  const polygons: Point[][][] = [];
  let polygon: Point[][] | null = null;
  let ccw: boolean | undefined;

  for (let i = 0; i < len; i++) {
    const area = signedArea(rings[i]);
    if (area == 0) {
      continue;
    }

    if (ccw === undefined) {
      ccw = area < 0;
    }

    if (ccw === area < 0) {
      if (polygon) {
        polygons.push(polygon);
      }
      polygon = [rings[i]];
    } else if (polygon) {
      polygon.push(rings[i]);
    }
  }

  if (polygon) {
    polygons.push(polygon);
  }

  return polygons;
}

/**
 * Returns the signed area of a 2D polygon ring.
 *
 * @param ring - Array of Points forming a closed ring.
 * @returns The signed area (positive for CW, negative for CCW).
 */
export function signedArea(ring: Point[]): number {
  let sum = 0;
  for (let i = 0, len = ring.length, j = len - 1; i < len; j = i++) {
    const point1 = ring[i];
    const point2 = ring[j];
    sum += (point2.x - point1.x) * (point1.y + point2.y);
  }
  return sum;
}
