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
    } else {
      polygon?.push(rings[i]);
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
  const len = ring.length;
  if (len < 3) {
    return 0;
  }
  let sum = 0;
  let p2 = ring[len - 1];
  for (let i = 0; i < len; i++) {
    const p1 = ring[i];
    sum += (p2.x - p1.x) * (p1.y + p2.y);
    p2 = p1;
  }
  return sum;
}

/**
 * Computes the signed area of a 2D ring stored in a flat coordinate array.
 *
 * @param coords - Array-like containing interleaved `[x0, y0, x1, y1, ...]`.
 * @param start - Starting index in `coords`.
 * @param end - Ending index (exclusive) in `coords`.
 * @returns The signed area (positive for CW, negative for CCW in screen coordinates).
 */
export function signedAreaFlat(coords: ArrayLike<number>, start: number, end: number): number {
  if (end - start < 6) {
    return 0;
  }
  let sum = 0;
  let p2x = coords[end - 2];
  let p2y = coords[end - 1];
  for (let i = start; i < end; i += 2) {
    const p1x = coords[i];
    const p1y = coords[i + 1];
    sum += (p2x - p1x) * (p1y + p2y);
    p2x = p1x;
    p2y = p1y;
  }
  return sum;
}

// Pre-allocated singletons to avoid repeated TypedArray allocations for empty and 1-ring polygons (~95% of features).
const EMPTY_UINT32 = new Uint32Array(0);
const SINGLE_POLYGON_END = new Uint32Array([1]);

/**
 * Classifies flat polygon rings into exterior boundaries and interior holes,
 * returning the end indices in `ringEnds` for each polygon.
 *
 * Exterior ring winding direction is inferred from the first non-zero-area ring.
 *
 * @param coords - Array-like containing interleaved `[x0, y0, x1, y1, ...]`.
 * @param ringEnds - Array-like containing the end coordinate indices for each ring.
 * @returns Array of end indices in `ringEnds` marking each classified polygon.
 */
export function classifyRingsFlat(coords: ArrayLike<number>, ringEnds: ArrayLike<number>): Uint32Array {
  const len = ringEnds.length;
  if (len === 0) {
    return EMPTY_UINT32;
  }
  if (len === 1) {
    return SINGLE_POLYGON_END;
  }

  const ends: number[] = [];
  let ccw: boolean | undefined;
  let hasPolygon = false;
  let start = 0;

  for (let i = 0; i < len; i++) {
    const end = ringEnds[i];
    const area = signedAreaFlat(coords, start, end);
    if (area !== 0) {
      if (ccw === undefined) {
        ccw = area < 0;
      }
      if (ccw === area < 0) {
        if (hasPolygon) {
          ends.push(i);
        }
        hasPolygon = true;
      }
    }
    start = end;
  }

  if (hasPolygon) {
    ends.push(len);
  }

  return new Uint32Array(ends);
}
