import { describe, expect, it } from 'vitest';

import { Point } from './point';

describe('Point', () => {
  it('stores x and y coordinates', () => {
    const pt = new Point(10, -25);
    expect(pt.x).toBe(10);
    expect(pt.y).toBe(-25);
  });

  it('preserves floating-point coordinates', () => {
    const pt = new Point(123.456, 789.012);
    expect(pt.x).toBeCloseTo(123.456);
    expect(pt.y).toBeCloseTo(789.012);
  });
});
