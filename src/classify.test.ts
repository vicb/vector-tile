import { describe, expect, it } from 'vitest';

import { classifyRings, signedArea } from './classify';
import { Point } from './point';

describe('classifyRings and signedArea', () => {
  // In screen coordinates (Y downwards), clockwise ring has positive signedArea:
  const cwOuter = [new Point(0, 0), new Point(10, 0), new Point(10, 10), new Point(0, 10), new Point(0, 0)];

  const ccwHole1 = [new Point(1, 1), new Point(1, 4), new Point(4, 4), new Point(4, 1), new Point(1, 1)];

  const ccwHole2 = [new Point(6, 6), new Point(6, 9), new Point(9, 9), new Point(9, 6), new Point(6, 6)];

  const cwOuter2 = [new Point(20, 20), new Point(30, 20), new Point(30, 30), new Point(20, 30), new Point(20, 20)];

  it('computes signed area correctly (CW > 0, CCW < 0 in screen coords, colinear == 0)', () => {
    expect(signedArea(cwOuter)).toBeGreaterThan(0);
    expect(signedArea(ccwHole1)).toBeLessThan(0);
    expect(signedArea([])).toBe(0);
    expect(signedArea([new Point(0, 0), new Point(1, 1), new Point(2, 2)])).toBe(0);
  });

  it('handles empty rings and single ring', () => {
    expect(classifyRings([])).toEqual([[]]);
    expect(classifyRings([cwOuter])).toEqual([[cwOuter]]);
  });

  it('classifies exterior ring with multiple interior holes', () => {
    const polygons = classifyRings([cwOuter, ccwHole1, ccwHole2]);
    expect(polygons.length).toBe(1);
    expect(polygons[0].length).toBe(3);
    expect(polygons[0][0]).toBe(cwOuter);
    expect(polygons[0][1]).toBe(ccwHole1);
    expect(polygons[0][2]).toBe(ccwHole2);
  });

  it('classifies multiple exterior polygons', () => {
    const polygons = classifyRings([cwOuter, ccwHole1, cwOuter2]);
    expect(polygons.length).toBe(2);
    expect(polygons[0]).toEqual([cwOuter, ccwHole1]);
    expect(polygons[1]).toEqual([cwOuter2]);
  });

  it('supports CCW exterior polygons with CW holes', () => {
    const ccwOuter = [new Point(0, 0), new Point(0, 10), new Point(10, 10), new Point(10, 0), new Point(0, 0)];
    const cwHole = [new Point(1, 1), new Point(4, 1), new Point(4, 4), new Point(1, 4), new Point(1, 1)];
    const ccwOuter2 = [new Point(20, 20), new Point(20, 30), new Point(30, 30), new Point(30, 20), new Point(20, 20)];

    const polygons = classifyRings([ccwOuter, cwHole, ccwOuter2]);
    expect(polygons.length).toBe(2);
    expect(polygons[0]).toEqual([ccwOuter, cwHole]);
    expect(polygons[1]).toEqual([ccwOuter2]);
  });

  it('skips zero-area rings during classification', () => {
    const zeroRing = [new Point(0, 0), new Point(1, 1), new Point(2, 2)];
    const polygons = classifyRings([cwOuter, zeroRing, ccwHole1]);
    expect(polygons.length).toBe(1);
    expect(polygons[0]).toEqual([cwOuter, ccwHole1]);
  });
});
