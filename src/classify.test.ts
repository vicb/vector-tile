import { describe, expect, it } from 'vitest';

import { classifyRings, classifyRingsFlat, signedArea, signedAreaFlat } from './classify';
import { Point } from './point';

describe('classifyRings and signedArea', () => {
  // In screen coordinates (Y downwards), clockwise ring has positive signedArea:
  const cwOuter = [new Point(0, 0), new Point(10, 0), new Point(10, 10), new Point(0, 10), new Point(0, 0)];

  const ccwHole1 = [new Point(1, 1), new Point(1, 4), new Point(4, 4), new Point(4, 1), new Point(1, 1)];

  const ccwHole2 = [new Point(6, 6), new Point(6, 9), new Point(9, 9), new Point(9, 6), new Point(6, 6)];

  const cwOuter2 = [new Point(20, 20), new Point(30, 20), new Point(30, 30), new Point(20, 30), new Point(20, 20)];

  const flatCwOuter = [0, 0, 10, 0, 10, 10, 0, 10, 0, 0];
  const flatCcwHole1 = [1, 1, 1, 4, 4, 4, 4, 1, 1, 1];
  const flatCcwHole2 = [6, 6, 6, 9, 9, 9, 9, 6, 6, 6];
  const flatCwOuter2 = [20, 20, 30, 20, 30, 30, 20, 30, 20, 20];

  it('computes signed area correctly (CW > 0, CCW < 0 in screen coords, colinear == 0)', () => {
    expect(signedArea(cwOuter)).toBeGreaterThan(0);
    expect(signedArea(ccwHole1)).toBeLessThan(0);
    expect(signedArea([])).toBe(0);
    expect(signedArea([new Point(0, 0), new Point(1, 1), new Point(2, 2)])).toBe(0);

    expect(signedAreaFlat(flatCwOuter, 0, flatCwOuter.length)).toBeGreaterThan(0);
    expect(signedAreaFlat(flatCcwHole1, 0, flatCcwHole1.length)).toBeLessThan(0);
    expect(signedAreaFlat([], 0, 0)).toBe(0);
    expect(signedAreaFlat([0, 0, 1, 1, 2, 2], 0, 6)).toBe(0);
    expect(signedAreaFlat(new Float64Array(flatCwOuter), 0, flatCwOuter.length)).toBeGreaterThan(0);
  });

  it('handles empty rings and single ring', () => {
    expect(classifyRings([])).toEqual([[]]);
    expect(classifyRings([cwOuter])).toEqual([[cwOuter]]);

    expect(classifyRingsFlat([], [])).toEqual(new Uint32Array(0));
    expect(classifyRingsFlat(flatCwOuter, [flatCwOuter.length])).toEqual(new Uint32Array([1]));
  });

  it('classifies exterior ring with multiple interior holes', () => {
    const polygons = classifyRings([cwOuter, ccwHole1, ccwHole2]);
    expect(polygons.length).toBe(1);
    expect(polygons[0].length).toBe(3);
    expect(polygons[0][0]).toBe(cwOuter);
    expect(polygons[0][1]).toBe(ccwHole1);
    expect(polygons[0][2]).toBe(ccwHole2);

    const flatCoords = [...flatCwOuter, ...flatCcwHole1, ...flatCcwHole2];
    const ringEnds = [flatCwOuter.length, flatCwOuter.length + flatCcwHole1.length, flatCoords.length];
    const polyEnds = classifyRingsFlat(flatCoords, ringEnds);
    expect(polyEnds).toEqual(new Uint32Array([3]));
  });

  it('classifies multiple exterior polygons', () => {
    const polygons = classifyRings([cwOuter, ccwHole1, cwOuter2]);
    expect(polygons.length).toBe(2);
    expect(polygons[0]).toEqual([cwOuter, ccwHole1]);
    expect(polygons[1]).toEqual([cwOuter2]);

    const flatCoords = [...flatCwOuter, ...flatCcwHole1, ...flatCwOuter2];
    const ringEnds = [flatCwOuter.length, flatCwOuter.length + flatCcwHole1.length, flatCoords.length];
    const polyEnds = classifyRingsFlat(flatCoords, ringEnds);
    expect(polyEnds).toEqual(new Uint32Array([2, 3]));
  });

  it('supports CCW exterior polygons with CW holes', () => {
    const ccwOuter = [new Point(0, 0), new Point(0, 10), new Point(10, 10), new Point(10, 0), new Point(0, 0)];
    const cwHole = [new Point(1, 1), new Point(4, 1), new Point(4, 4), new Point(1, 4), new Point(1, 1)];
    const ccwOuter2 = [new Point(20, 20), new Point(20, 30), new Point(30, 30), new Point(30, 20), new Point(20, 20)];

    const polygons = classifyRings([ccwOuter, cwHole, ccwOuter2]);
    expect(polygons.length).toBe(2);
    expect(polygons[0]).toEqual([ccwOuter, cwHole]);
    expect(polygons[1]).toEqual([ccwOuter2]);

    const flatCcwOuter = [0, 0, 0, 10, 10, 10, 10, 0, 0, 0];
    const flatCwHole = [1, 1, 4, 1, 4, 4, 1, 4, 1, 1];
    const flatCcwOuter2 = [20, 20, 20, 30, 30, 30, 30, 20, 20, 20];
    const flatCoords = [...flatCcwOuter, ...flatCwHole, ...flatCcwOuter2];
    const ringEnds = [flatCcwOuter.length, flatCcwOuter.length + flatCwHole.length, flatCoords.length];
    const polyEnds = classifyRingsFlat(flatCoords, ringEnds);
    expect(polyEnds).toEqual(new Uint32Array([2, 3]));
  });

  it('skips zero-area rings during classification', () => {
    const zeroRing = [new Point(0, 0), new Point(1, 1), new Point(2, 2)];
    const polygons = classifyRings([cwOuter, zeroRing, ccwHole1]);
    expect(polygons.length).toBe(1);
    expect(polygons[0]).toEqual([cwOuter, ccwHole1]);

    const flatZeroRing = [0, 0, 1, 1, 2, 2];
    const flatCoords = [...flatCwOuter, ...flatZeroRing, ...flatCcwHole1];
    const ringEnds = [flatCwOuter.length, flatCwOuter.length + flatZeroRing.length, flatCoords.length];
    const polyEnds = classifyRingsFlat(flatCoords, ringEnds);
    expect(polyEnds).toEqual(new Uint32Array([3]));
  });
});
