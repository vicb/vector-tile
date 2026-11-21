import { describe, expect, it } from 'vitest';

import { FeatureType } from './feature';
import { lenField, readFixture, strField, varintField } from './test-helper';
import { VectorTile } from './tile';

describe('VectorTile', () => {
  const data = readFixture('14-8801-5371.vector.pbf');
  const tile = new VectorTile(data);

  it('has all the layers from the fixture tile', () => {
    expect(Object.keys(tile.layers)).toEqual([
      'landuse',
      'waterway',
      'water',
      'barrier_line',
      'building',
      'landuse_overlay',
      'tunnel',
      'road',
      'bridge',
      'place_label',
      'water_label',
      'poi_label',
      'road_label',
      'waterway_label',
    ]);
  });

  it('instantiates from both Uint8Array and Buffer', () => {
    const fromBuf = new VectorTile(data);
    const fromU8 = new VectorTile(new Uint8Array(data));
    expect(Object.keys(fromBuf.layers)).toEqual(Object.keys(fromU8.layers));
  });

  it('retrieves layers safely with getLayer', () => {
    const landuse = tile.getLayer<{ class: string }>('landuse');
    expect(landuse).toBeDefined();
    expect(landuse?.name).toBe('landuse');
    expect(landuse?.length).toBe(tile.layers.landuse.length);

    expect(tile.getLayer('nonexistent')).toBeUndefined();
    expect(tile.getLayer('__proto__')).toBeUndefined();
    expect(tile.getLayer('toString')).toBeUndefined();
    expect(tile.getLayer('constructor')).toBeUndefined();
  });

  it('handles empty tile and empty layer', () => {
    const emptyTile = new VectorTile(new Uint8Array(0));
    expect(Object.keys(emptyTile.layers)).toEqual([]);

    const emptyLayerTile = new VectorTile(new Uint8Array(lenField(3, strField(1, 'empty'))));
    expect(emptyLayerTile.layers.empty).toBeUndefined();
  });

  it('skips unknown protobuf tags in Tile payload', () => {
    const featBytes = [...varintField(1, 1), ...varintField(3, FeatureType.POINT), ...lenField(4, [9, 0, 0])];
    const layerBytes = [...strField(1, 'roads'), ...varintField(5, 4096), ...lenField(2, featBytes)];
    const tileWithUnknownTags = new Uint8Array([
      ...varintField(99, 12345),
      ...lenField(3, layerBytes),
      ...lenField(98, [1, 2, 3]),
    ]);

    const parsed = new VectorTile(tileWithUnknownTags);
    expect(parsed.layers.roads).toBeDefined();
    expect(parsed.layers.roads.name).toBe('roads');
  });

  it('propagates longType to layers', () => {
    const tileNumber = new VectorTile(data, 'number');
    const tileString = new VectorTile(data, 'string');
    const tileBigInt = new VectorTile(data, 'bigint');

    expect(tileNumber.layers.road).toBeDefined();
    expect(tileString.layers.road).toBeDefined();
    expect(tileBigInt.layers.road).toBeDefined();
  });
});
