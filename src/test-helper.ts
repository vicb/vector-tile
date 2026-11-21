import fs from 'node:fs';
import path from 'node:path';
import { expect } from 'vitest';

export const FIXTURES_DIR = path.resolve(import.meta.dirname, 'fixtures');

export function readFixture(name: string): Buffer {
  const file = name.endsWith('.pbf') ? name : `${name}.pbf`;
  return fs.readFileSync(path.join(FIXTURES_DIR, file));
}

export function pushVarint(out: number[], v: number): void {
  let n = v >>> 0;
  while (n >= 0x80) {
    out.push((n & 0x7f) | 0x80);
    n >>>= 7;
  }
  out.push(n);
}

export function lenField(fieldId: number, payload: number[]): number[] {
  const out: number[] = [];
  pushVarint(out, (fieldId << 3) | 2);
  pushVarint(out, payload.length);
  for (let i = 0; i < payload.length; i++) {
    out.push(payload[i]);
  }
  return out;
}

export function strField(fieldId: number, s: string): number[] {
  return lenField(fieldId, Array.from(Buffer.from(s, 'utf8')));
}

export function varintField(fieldId: number, v: number): number[] {
  const out: number[] = [];
  pushVarint(out, (fieldId << 3) | 0);
  pushVarint(out, v);
  return out;
}

export function approximateDeepEqual(a: any, b: any, epsilon: number): [boolean, string] {
  if (typeof a !== typeof b) {
    return [false, 'Different types'];
  }

  if (typeof a === 'number') {
    return [Math.abs(a - b) < epsilon, 'Different numbers'];
  }

  if (a === null || typeof a !== 'object') {
    return [a === b, 'Different objects'];
  }

  const ka = Object.keys(a);
  const kb = Object.keys(b);

  if (ka.length != kb.length) {
    return [false, 'Different keys'];
  }

  ka.sort();
  kb.sort();

  for (let i = 0; i < ka.length; i++) {
    if (ka[i] != kb[i]) {
      return [false, `Different keys ${ka[i]} vs ${kb[i]}`];
    }
    if (!approximateDeepEqual(a[ka[i]], b[ka[i]], epsilon)[0]) {
      return [false, `Different values for key "${ka[i]}": ${a[ka[i]]} vs ${b[ka[i]]}`];
    }
  }

  return [true, 'ok'];
}

declare module 'vitest' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface Assertion<R, T> {
    toApproximateDeepEqual(expected: any, epsilon?: number): R;
  }
}

expect.extend({
  toApproximateDeepEqual(a: any, b: any, epsilon = 1e-6) {
    const [pass, message] = approximateDeepEqual(a, b, epsilon);
    return { pass, message: () => message };
  },
});
