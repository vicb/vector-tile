import { BinaryWriter } from '@protobuf-ts/runtime';
import { describe, expect, it } from 'vitest';

import { FeatureType } from './feature';
import { lenField, readFixture, strField, varintField } from './test-helper';
import { VectorTile } from './tile';

describe('Layer', () => {
  const data = readFixture('14-8801-5371.vector.pbf');
  const tile = new VectorTile(data);
  const landuse = tile.layers.landuse;

  it('exposes layer metadata', () => {
    expect(landuse.name).toBe('landuse');
    expect(landuse.version).toBe(1);
    expect(landuse.extent).toBe(4096);
    expect(landuse.length).toBeGreaterThan(0);
  });

  it('defaults version to 1 and extent to 4096 when omitted in MVT payload', () => {
    const featBytes = [
      ...varintField(3, FeatureType.POINT),
      ...lenField(4, [9, 2, 4]), // MoveTo(1), dx=1, dy=2
    ];
    const layerBytes = [...strField(1, 'pts'), ...lenField(2, featBytes)];
    const tileBytes = new Uint8Array(lenField(3, layerBytes));

    const customTile = new VectorTile(tileBytes);
    const layer = customTile.layers.pts;
    expect(layer.version).toBe(1);
    expect(layer.extent).toBe(4096);
  });

  it('retrieves features by index with bounds checking', () => {
    const f0 = landuse.feature(0);
    expect(f0).toBeDefined();

    expect(() => landuse.feature(-1)).toThrow('out of bounds');
    expect(() => landuse.feature(landuse.length)).toThrow('out of bounds');
    expect(() => landuse.feature(99999)).toThrow('out of bounds');
    expect(() => landuse.feature(NaN)).toThrow('out of bounds');
    expect(() => landuse.feature(1.5)).toThrow('out of bounds');
  });

  it('rejects features whose declared length extends past the layer boundary', () => {
    // Declares feature length = 100 bytes, but layer only contains 2 bytes
    const malformedLayer = [
      ...strField(1, 'bad_layer'),
      (2 << 3) | 2, // tag 2 (Features), wire type 2 (length-delimited)
      100, // declared length 100
      0,
      0, // only 2 bytes payload
    ];
    expect(() => new VectorTile(new Uint8Array(lenField(3, malformedLayer)))).toThrow('feature extends past layer end');
  });

  it('implements Iterable for direct for..of iteration and Array.from', () => {
    let count = 0;
    for (const f of landuse) {
      expect(f).toBeDefined();
      count++;
    }
    expect(count).toBe(landuse.length);

    const arr = Array.from(landuse);
    expect(arr.length).toBe(landuse.length);
    expect(arr[0].type).toBe(landuse.feature(0).type);

    const iterator = landuse[Symbol.iterator]();
    const first = iterator.next();
    expect(first.done).toBe(false);
    expect(first.value).toBeDefined();

    // Iterate to end
    for (let i = 1; i < landuse.length; i++) {
      iterator.next();
    }
    const end = iterator.next();
    expect(end.done).toBe(true);
    expect(end.value).toBeUndefined();
  });

  it('decodes all protobuf Value types including bool and long representations', () => {
    const makeValueTile = (valPayload: number[], longType: 'number' | 'string' | 'bigint' = 'number') => {
      const featBytes = [
        ...varintField(1, 1),
        ...lenField(2, [0, 0]), // tag 0 -> key 0 ('prop'), val 0
        ...varintField(3, FeatureType.POINT),
        ...lenField(4, [9, 0, 0]),
      ];
      const layerBytes = [
        ...strField(1, 'valtest'),
        ...strField(3, 'prop'),
        ...lenField(4, valPayload),
        ...lenField(2, featBytes),
      ];
      return new VectorTile(new Uint8Array(lenField(3, layerBytes)), longType).layers.valtest.feature(0).properties;
    };

    // bool true (tag 56) and false
    expect(makeValueTile([...varintField(7, 1)]).prop).toBe(true);
    expect(makeValueTile([...varintField(7, 0)]).prop).toBe(false);

    // string (tag 10)
    expect(makeValueTile(strField(1, 'hello world')).prop).toBe('hello world');

    // float (tag 21)
    const floatWriter = new BinaryWriter();
    floatWriter.tag(2, 5).float(1.5);
    expect(makeValueTile(Array.from(floatWriter.finish()))).toMatchObject({ prop: 1.5 });

    // double (tag 25)
    const doubleWriter = new BinaryWriter();
    doubleWriter.tag(3, 1).double(1234.5678);
    expect(makeValueTile(Array.from(doubleWriter.finish()))).toMatchObject({ prop: 1234.5678 });

    // int64 (tag 32)
    const intWriter = new BinaryWriter();
    intWriter.tag(4, 0).int64(-42);
    const intBytes = Array.from(intWriter.finish());
    expect(makeValueTile(intBytes, 'number').prop).toBe(-42);
    expect(makeValueTile(intBytes, 'string').prop).toBe('-42');
    expect(makeValueTile(intBytes, 'bigint').prop).toBe(-42n);

    // uint64 (tag 40)
    const uintWriter = new BinaryWriter();
    uintWriter.tag(5, 0).uint64(9007199254740991);
    const uintBytes = Array.from(uintWriter.finish());
    expect(makeValueTile(uintBytes, 'number').prop).toBe(9007199254740991);
    expect(makeValueTile(uintBytes, 'string').prop).toBe('9007199254740991');
    expect(makeValueTile(uintBytes, 'bigint').prop).toBe(9007199254740991n);

    // sint64 (tag 48)
    const sintWriter = new BinaryWriter();
    sintWriter.tag(6, 0).sint64(-100);
    const sintBytes = Array.from(sintWriter.finish());
    expect(makeValueTile(sintBytes, 'number').prop).toBe(-100);
    expect(makeValueTile(sintBytes, 'string').prop).toBe('-100');
    expect(makeValueTile(sintBytes, 'bigint').prop).toBe(-100n);
  });

  it('throws on unknown-only Value messages while preserving values with extension fields', () => {
    const unknownOnlyVal = strField(99, 'only-unknown');
    const featA = [
      ...varintField(1, 1),
      ...lenField(2, [0, 0]),
      ...varintField(3, FeatureType.POINT),
      ...lenField(4, [9, 0, 0]),
    ];
    const unknownTileBytes = new Uint8Array(
      lenField(3, [...strField(1, 'vals'), ...strField(3, 'a'), ...lenField(4, unknownOnlyVal), ...lenField(2, featA)]),
    );
    expect(() => new VectorTile(unknownTileBytes)).toThrow('unknown feature value');

    const wrappedVal = [...varintField(98, 123), ...strField(1, 'kept'), ...strField(99, 'trailing')];
    const wrappedTileBytes = new Uint8Array(
      lenField(3, [...strField(1, 'vals'), ...strField(3, 'b'), ...lenField(4, wrappedVal), ...lenField(2, featA)]),
    );
    const feature = new VectorTile(wrappedTileBytes).layers.vals.feature(0);
    expect(feature.properties.b).toBe('kept');
  });

  it('prevents prototype pollution via __proto__ property keys', () => {
    const featBytes = [
      ...varintField(1, 1),
      ...lenField(2, [0, 0]), // key index 0 ('__proto__'), val index 0 ('polluted')
      ...varintField(3, FeatureType.POINT),
      ...lenField(4, [9, 0, 0]),
    ];
    const layerBytes = [
      ...strField(1, 'test_layer'),
      ...strField(3, '__proto__'),
      ...lenField(4, strField(1, 'polluted')),
      ...lenField(2, featBytes),
    ];
    const tileBytes = new Uint8Array(lenField(3, layerBytes));

    const feature = new VectorTile(tileBytes).layers.test_layer.feature(0);
    expect(feature.properties.__proto__).toBe('polluted');
    expect(({} as any).polluted).toBeUndefined();
  });

  it('safely skips unknown wire tags on layer messages', () => {
    const featBytes = [...varintField(1, 1), ...varintField(3, FeatureType.POINT), ...lenField(4, [9, 0, 0])];
    const layerBytes = [
      ...strField(1, 'custom_layer'),
      ...varintField(99, 12345), // unknown varint tag
      ...strField(98, 'unknown string'), // unknown len field
      ...lenField(2, featBytes),
    ];
    const tile = new VectorTile(new Uint8Array(lenField(3, layerBytes)));
    expect(tile.layers.custom_layer).toBeDefined();
    expect(tile.layers.custom_layer.length).toBe(1);
  });
});
