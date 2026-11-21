/** @jest-environment node */
import fs from 'fs';
import type { Feature as GeoJSONFeatureType, MultiPolygon, Polygon } from 'geojson';

import { Coord2D, FeatureType, GeoJSONFeature, Layer, Point, VectorTile } from '../src/index';
import { classifyRings } from '../src/tile';

describe('FeatureType', () => {
  it('is available as a runtime object', () => {
    expect(FeatureType).toEqual({
      UNKNOWN: 0,
      POINT: 1,
      LINESTRING: 2,
      POLYGON: 3,
    });
  });
});

describe('parses vector tile', () => {
  const data = fs.readFileSync(__dirname + '/fixtures/14-8801-5371.vector.pbf');
  const tile = new VectorTile(data);

  it('has all the layers', () => {
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

  it('extracts the tags', () => {
    expect(tile.layers.poi_label.length).toBe(558);

    expect(() => tile.layers.poi_label.feature(1e9)).toThrow();

    const park = tile.layers.poi_label.feature(11);
    expect(park.bbox()).toEqual([3898, 1731, 3898, 1731]);
    expect(park.id).toBe("3000003150561");
    expect(park.properties.name).toBe('Mauerpark');
    expect(park.properties.type).toBe('Park');
    expect(park.type).toBe(FeatureType.POINT);
    expect(park.loadGeometry()).toEqual([[{ x: 3898, y: 1731 }]]);

    const road = tile.layers.road.feature(656);
    expect(road.type).toBe(FeatureType.LINESTRING);
    expect(road.loadGeometry()).toEqual([
      [
        { x: 1988, y: 306 },
        { x: 1808, y: 321 },
        { x: 1506, y: 347 },
      ],
    ]);
  });

  it('converts to GeoJSON', () => {
    expect(tile.layers.poi_label.feature(11).toGeoJSON(8801, 5371, 14)).toEqual({
      type: 'Feature',
      id: "3000003150561",
      properties: {
        localrank: 1,
        maki: 'park',
        name: 'Mauerpark',
        name_de: 'Mauerpark',
        name_en: 'Mauerpark',
        name_es: 'Mauerpark',
        name_fr: 'Mauerpark',
        osm_id: 3000003150561,
        ref: '',
        scalerank: 2,
        type: 'Park',
      },
      geometry: {
        type: 'Point',
        coordinates: [13.402258157730103, 52.543989253806245],
      },
    });

    expect(tile.layers.bridge.feature(0).toGeoJSON(8801, 5371, 14)).toEqual({
      type: 'Feature',
      id: "238162948",
      properties: {
        class: 'service',
        oneway: 0,
        osm_id: 238162948,
        type: 'service',
      },
      geometry: {
        type: 'LineString',
        coordinates: [
          [13.399457931518555, 52.54633484403641],
          [13.399441838264465, 52.54650447852501],
        ],
      },
    });

    expect(tile.layers.building.feature(0).toGeoJSON(8801, 5371, 14)).toEqual({
      type: 'Feature',
      id: "1000267229912",
      properties: {
        osm_id: 1000267229912,
      },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [13.392285704612732, 52.54974045706257],
            [13.392264246940613, 52.549737195107554],
            [13.392248153686523, 52.549737195107554],
            [13.392248153686523, 52.54974045706257],
            [13.392285704612732, 52.54974045706257],
          ],
        ],
      },
    });
  });
});

describe('GeoJSON', () => {
  function geoJSONFromFixture(name: string): GeoJSONFeature {
    const tile = new VectorTile(fs.readFileSync(__dirname + '/fixtures/' + name + '.pbf'));
    return tile.layers.geojson.feature(0).toGeoJSON(0, 0, 0);
  }

  it('supports point', () => {
    expect(geoJSONFromFixture('singleton-multi-point').geometry).toApproximateDeepEqual(
      {
        type: 'Point',
        coordinates: [1, 2],
      },
      0.1,
    );
  });

  it('supports line', () => {
    expect(geoJSONFromFixture('singleton-multi-line').geometry).toApproximateDeepEqual(
      {
        type: 'LineString',
        coordinates: [
          [1, 2],
          [3, 4],
        ],
      },
      0.1,
    );
  });

  it('supports polygon', () => {
    expect(geoJSONFromFixture('singleton-multi-polygon').geometry).toApproximateDeepEqual(
      {
        type: 'Polygon',
        coordinates: [
          [
            [1, 0],
            [0, 0],
            [1, 1],
            [1, 0],
          ],
        ],
      },
      0.1,
    );
  });

  it('supports multi-point', () => {
    expect(geoJSONFromFixture('multi-point').geometry).toApproximateDeepEqual(
      {
        type: 'MultiPoint',
        coordinates: [
          [1, 2],
          [3, 4],
        ],
      },
      0.1,
    );
  });

  it('supports multi-line', () => {
    expect(geoJSONFromFixture('multi-line').geometry).toApproximateDeepEqual(
      {
        type: 'MultiLineString',
        coordinates: [
          [
            [1, 2],
            [3, 4],
          ],
          [
            [5, 6],
            [7, 8],
          ],
        ],
      },
      0.1,
    );
  });

  it('supports multi-polygon', () => {
    expect(geoJSONFromFixture('multi-polygon').geometry).toApproximateDeepEqual(
      {
        type: 'MultiPolygon',
        coordinates: [
          [
            [
              [1, 0],
              [0, 0],
              [1, 1],
              [1, 0],
            ],
          ],
          [
            [
              [-1, -1],
              [-1, 0],
              [0, 0],
              [-1, -1],
            ],
          ],
        ],
      },
      0.1,
    );
  });

  it('supports polygon-with-inner', () => {
    expect(geoJSONFromFixture('polygon-with-inner').geometry).toApproximateDeepEqual(
      {
        type: 'Polygon',
        coordinates: [
          [
            [2, -2],
            [-2, -2],
            [-2, 2],
            [2, 2],
            [2, -2],
          ],
          [
            [-1, 1],
            [-1, -1],
            [1, -1],
            [1, 1],
            [-1, 1],
          ],
        ],
      },
      0.1,
    );
  });

  it('supports stacked-multipolygon', () => {
    expect(geoJSONFromFixture('stacked-multipolygon').geometry).toApproximateDeepEqual(
      {
        type: 'MultiPolygon',
        coordinates: [
          [
            [
              [2, -2],
              [-2, -2],
              [-2, 2],
              [2, 2],
              [2, -2],
            ],
          ],
          [
            [
              [1, -1],
              [-1, -1],
              [-1, 1],
              [1, 1],
              [1, -1],
            ],
          ],
        ],
      },
      0.1,
    );
  });
});

describe('regression', () => {
  it('https://github.com/mapbox/vector-tile-js/issues/15', () => {
    const data = fs.readFileSync(__dirname + '/fixtures/lots-of-tags.vector.pbf');
    const tile = new VectorTile(data);
    expect(() => tile.layers['stuttgart-rails'].feature(0)).not.toThrow();
  });

  it('https://github.com/mapbox/vector-tile-js/issues/1019', () => {
    const data = fs.readFileSync(__dirname + '/fixtures/12-1143-1497.vector.pbf');
    const tile = new VectorTile(data);
    expect(() => tile.layers['water'].feature(1).loadGeometry()).not.toThrow();
  });

  it('https://github.com/mapbox/vector-tile-js/issues/60', () => {
    const data = fs.readFileSync(__dirname + '/fixtures/multipolygon-with-closepath.pbf');
    const tile = new VectorTile(data);
    for (const id in tile.layers) {
      const layer = tile.layers[id];
      for (let i = 0; i < layer.length; i++) {
        expect(() => layer.feature(i).loadGeometry()).not.toThrow();
      }
    }
  });
});

describe('TypeScript types', () => {
  interface ParkProps {
    name: string;
    localrank: number;
  }

  it('provides strongly-typed GeoJSON and generic properties', () => {
    const tile = new VectorTile(fs.readFileSync(__dirname + '/fixtures/14-8801-5371.vector.pbf'));
    const defaultGeo: GeoJSONFeatureType = tile.layers.poi_label.feature(11).toGeoJSON(8801, 5371, 14);
    if (defaultGeo.geometry.type === 'Point') {
      expect(defaultGeo.geometry.coordinates.length).toBe(2);
    } else {
      throw new Error('Expected Point geometry');
    }

    const customGeo = tile.layers.poi_label.feature(11).toGeoJSON<ParkProps>(8801, 5371, 14);
    expect(customGeo.properties.name).toBe('Mauerpark');
    expect(customGeo.properties.localrank).toBe(1);

    const feature = tile.layers.poi_label.feature<ParkProps>(11);
    expect(feature.properties.name).toBe('Mauerpark');
    const inferredGeo = feature.toGeoJSON(8801, 5371, 14);
    expect(inferredGeo.properties.localrank).toBe(1);

    const buildingGeo = tile.layers.building
      .feature<{ osm_id: number }>(0)
      .toGeoJSON<{ osm_id: number }, Polygon | MultiPolygon>(8801, 5371, 14);
    expect(buildingGeo.properties.osm_id).toBe(1000267229912);
    expect(buildingGeo.geometry.type).toBe('Polygon');
    expect(buildingGeo.geometry.coordinates.length).toBe(1);
  });
});

describe('iteration and accessors', () => {
  const data = fs.readFileSync(__dirname + '/fixtures/14-8801-5371.vector.pbf');
  const tile = new VectorTile(data);

  it('iterates layer features via Symbol.iterator and Array.from', () => {
    const layer = tile.layers.bridge;
    const viaIterator = [];
    const it = layer[Symbol.iterator]();
    for (let step = it.next(); !step.done; step = it.next()) {
      viaIterator.push(step.value.id);
    }
    expect(viaIterator.length).toBe(layer.length);

    const viaArrayFrom = Array.from(layer);
    expect(viaArrayFrom.length).toBe(layer.length);
    expect(viaArrayFrom.map((f) => f.id)).toEqual(viaIterator);

    // Re-iterating the same layer starts fresh from index 0
    const poiLayer = tile.layers.poi_label;
    expect(Array.from(poiLayer).length).toBe(poiLayer.length);
    expect(Array.from(poiLayer).length).toBe(poiLayer.length);
  });

  it('provides getLayer with prototype safety and generics', () => {
    interface BridgeProps {
      class: string;
    }

    const bridge = tile.getLayer<BridgeProps>('bridge');
    expect(bridge).toBe(tile.layers.bridge);
    expect(bridge?.feature(0).properties.class).toBe('service');
    expect(tile.getLayer('nonexistent')).toBeUndefined();
    expect(tile.getLayer('toString')).toBeUndefined();
  });
});

function pushVarint(out: number[], v: number): void {
  let n = v >>> 0;
  while (n >= 0x80) {
    out.push((n & 0x7f) | 0x80);
    n >>>= 7;
  }
  out.push(n);
}

function lenField(fieldId: number, payload: number[]): number[] {
  const out: number[] = [];
  pushVarint(out, (fieldId << 3) | 2);
  pushVarint(out, payload.length);
  for (let i = 0; i < payload.length; i++) out.push(payload[i]);
  return out;
}

function strField(fieldId: number, s: string): number[] {
  return lenField(fieldId, Array.from(Buffer.from(s, 'utf8')));
}

function varintField(fieldId: number, v: number): number[] {
  const out: number[] = [];
  pushVarint(out, (fieldId << 3) | 0);
  pushVarint(out, v);
  return out;
}

describe('MVT v2 spec hardening and longType', () => {

  it('defaults version to 1 and extent to 4096 when omitted', () => {
    const featureBytes = [
      ...varintField(3, FeatureType.POINT),
      ...lenField(4, [9, 2, 4]), // MoveTo(1), dx=1, dy=2
    ];
    const layerBytes = [...strField(1, 'pts'), ...lenField(2, featureBytes)];
    const tileBytes = new Uint8Array(lenField(3, layerBytes));

    const tile = new VectorTile(tileBytes);
    const layer = tile.layers.pts;
    expect(layer.version).toBe(1);
    expect(layer.extent).toBe(4096);
    expect(layer.feature(0).loadGeometry()).toEqual([[{ x: 1, y: 2 }]]);
    expect(layer.feature(0).toGeoJSON(0, 0, 0).geometry.type).toBe('Point');
  });

  it('skips unknown/extension fields in Tile, Layer, Value, and Feature', () => {
    const valBytes = [
      ...strField(1, 'ok'),
      ...varintField(99, 12345), // unknown extension on Value
    ];
    const featureBytes = [
      ...varintField(99, 777), // unknown field on Feature
      ...varintField(1, 42), // id
      ...lenField(2, [0, 0]), // tags
      ...varintField(3, FeatureType.POINT),
    ]; // geometry omitted intentionally
    const layerBytes = [
      ...varintField(99, 1), // unknown field on Layer
      ...strField(1, 'ext'),
      ...strField(3, 'k'),
      ...lenField(4, valBytes),
      ...lenField(2, featureBytes),
    ];
    const tileBytes = new Uint8Array([
      ...varintField(99, 5), // unknown field on Tile
      ...lenField(3, layerBytes),
    ]);

    const tile = new VectorTile(tileBytes);
    const feat = tile.layers.ext.feature(0);
    expect(feat.id).toBe('42');
    expect(feat.properties.k).toBe('ok');
    expect(() => feat.loadGeometry()).toThrow('feature has no geometry');
    expect(() => feat.loadFlatGeometry()).toThrow('feature has no geometry');
    expect(() => feat.bbox()).toThrow('feature has no geometry');
    expect(() => feat.toGeoJSON(0, 0, 0)).toThrow('feature has no geometry');
  });

  it('returns null from asPoints/asLines/asPolygons on mismatched types', () => {
    const data = fs.readFileSync(__dirname + '/fixtures/14-8801-5371.vector.pbf');
    const tile = new VectorTile(data);
    const pointFeat = tile.layers.poi_label.feature(11);
    const lineFeat = tile.layers.road.feature(656);
    const polyFeat = tile.layers.building.feature(0);

    expect(pointFeat.asLines()).toBeNull();
    expect(pointFeat.asPolygons()).toBeNull();
    expect(lineFeat.asPoints()).toBeNull();
    expect(lineFeat.asPolygons()).toBeNull();
    expect(polyFeat.asPoints()).toBeNull();
    expect(polyFeat.asLines()).toBeNull();
  });

  it('supports longType number, string, and bigint and unsigned feature ids', () => {
    // 2^53 + 1 = 9007199254740993 in unsigned LEB128
    const bigValVarint = [0x81, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x10];
    // 2^64 - 1 = 18446744073709551615 in unsigned LEB128
    const maxUint64Varint = [0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0x01];

    const valBytes = [(5 << 3) | 0, ...bigValVarint]; // uint_value = field 5
    const featBytes = [(1 << 3) | 0, ...maxUint64Varint, ...lenField(2, [0, 0]), ...varintField(3, FeatureType.POINT)];

    const layerBytes = [...strField(1, 'longs'), ...strField(3, 'n'), ...lenField(4, valBytes), ...lenField(2, featBytes)];
    const tileBytes = new Uint8Array(lenField(3, layerBytes));

    const asString = new VectorTile(tileBytes, 'string').layers.longs.feature(0);
    expect(asString.id).toBe('18446744073709551615');
    expect(asString.properties.n).toBe('9007199254740993');

    const asBigInt = new VectorTile(tileBytes, 'bigint').layers.longs.feature(0);
    expect(typeof asBigInt.properties.n).toBe('bigint');
    expect(String(asBigInt.properties.n)).toBe('9007199254740993');

    expect(() => new VectorTile(tileBytes, 'number')).toThrow();

    const safeValBytes = [...varintField(5, 42)];
    const safeTile = new Uint8Array(
      lenField(3, [...strField(1, 'longs'), ...strField(3, 'n'), ...lenField(4, safeValBytes), ...lenField(2, featBytes)]),
    );
    const asNumber = new VectorTile(safeTile, 'number').layers.longs.feature(0);
    expect(asNumber.properties.n).toBe(42);
  });
});

describe('flat geometry and transform callbacks', () => {
  const tile = new VectorTile(fs.readFileSync(__dirname + '/fixtures/14-8801-5371.vector.pbf'));
  const toTuple = (x: number, y: number): Coord2D => [x, y];

  it('loads flat geometry for point, multi-point, line, multi-line, polygon, polygon-with-inner, multi-polygon, and empty', () => {
    const point = tile.layers.poi_label.feature(11).loadFlatGeometry();
    expect(point).toEqual({ coords: [3898, 1731], ends: [2] });

    const mpTile = new VectorTile(fs.readFileSync(__dirname + '/fixtures/multi-point.pbf'));
    expect(mpTile.layers.geojson.feature(0).loadFlatGeometry().ends).toEqual([2, 4]);

    const road = tile.layers.road.feature(656).loadFlatGeometry();
    expect(road).toEqual({ coords: [1988, 306, 1808, 321, 1506, 347], ends: [6] });

    const mlTile = new VectorTile(fs.readFileSync(__dirname + '/fixtures/multi-line.pbf'));
    expect(mlTile.layers.geojson.feature(0).loadFlatGeometry().ends.length).toBe(2);

    const pwiTile = new VectorTile(fs.readFileSync(__dirname + '/fixtures/polygon-with-inner.pbf'));
    const pwiFlat = pwiTile.layers.geojson.feature(0).loadFlatGeometry();
    expect(pwiFlat.ends).toEqual([10, 20]);

    const mpPolyTile = new VectorTile(fs.readFileSync(__dirname + '/fixtures/multi-polygon.pbf'));
    const mpPolyFlat = mpPolyTile.layers.geojson.feature(0).loadFlatGeometry();
    expect(mpPolyFlat.ends).toEqual([8, 16]);

    // Empty geometry stream
    const emptyTile = new VectorTile(
      new Uint8Array(lenField(3, [...strField(1, 'e'), ...lenField(2, [...varintField(3, FeatureType.POINT), ...lenField(4, [])])])),
    );
    expect(emptyTile.layers.e.feature(0).loadFlatGeometry()).toEqual({ coords: [], ends: [] });
  });

  it('transforms vertices via loadGeometry, asPoints, asLines, and asPolygons', () => {
    const pointFeat = tile.layers.poi_label.feature(11);
    expect(pointFeat.loadGeometry(toTuple)).toEqual([[[3898, 1731]]]);
    expect(pointFeat.asPoints(toTuple)).toEqual([[3898, 1731]]);
    expect(pointFeat.asLines(toTuple)).toBeNull();
    expect(pointFeat.asPolygons(toTuple)).toBeNull();

    const roadFeat = tile.layers.road.feature(656);
    expect(roadFeat.asLines(toTuple)).toEqual([
      [
        [1988, 306],
        [1808, 321],
        [1506, 347],
      ],
    ]);
    expect(roadFeat.asPoints(toTuple)).toBeNull();

    const pwiTile = new VectorTile(fs.readFileSync(__dirname + '/fixtures/polygon-with-inner.pbf'));
    const polyFeat = pwiTile.layers.geojson.feature(0);
    expect(polyFeat.asPolygons(toTuple)).toEqual(
      polyFeat.asPolygons()!.map((poly) => poly.map((ring) => ring.map((p) => [p.x, p.y]))),
    );

    const stackedTile = new VectorTile(fs.readFileSync(__dirname + '/fixtures/stacked-multipolygon.pbf'));
    const stackedFeat = stackedTile.layers.geojson.feature(0);
    expect(stackedFeat.asPolygons(toTuple)).toEqual(
      stackedFeat.asPolygons()!.map((poly) => poly.map((ring) => ring.map((p) => [p.x, p.y]))),
    );
  });

  it('is re-entrant and exception-safe across nested geometry calls', () => {
    const f1 = tile.layers.road.feature(656);
    const f2 = tile.layers.building.feature(0);

    const nestedBboxes: number[][] = [];
    const result = f1.loadGeometry((x, y) => {
      nestedBboxes.push(f2.bbox());
      expect(f2.loadGeometry().length).toBeGreaterThan(0);
      return `${x},${y}`;
    });
    expect(result).toEqual([['1988,306', '1808,321', '1506,347']]);
    expect(nestedBboxes.length).toBe(3);

    expect(() =>
      f1.loadGeometry(() => {
        throw new Error('boom');
      }),
    ).toThrow('boom');

    // Subsequent geometry calls still return clean results
    expect(f1.loadGeometry()).toEqual([
      [
        { x: 1988, y: 306 },
        { x: 1808, y: 321 },
        { x: 1506, y: 347 },
      ],
    ]);
    expect(f2.bbox()).toEqual(f2.bbox());
  });

  it('throws on FeatureType.UNKNOWN in toGeoJSON', () => {
    const unknownTile = new VectorTile(
      new Uint8Array(lenField(3, [...strField(1, 'u'), ...lenField(2, varintField(3, FeatureType.UNKNOWN))])),
    );
    expect(() => unknownTile.layers.u.feature(0).toGeoJSON(0, 0, 0)).toThrow('Unknown feature type');
  });
});

describe('upstream bug fixes', () => {
  it('does not mutate prototypes via a "__proto__" layer name or property key', () => {
    const featBytes = [
      ...varintField(1, 1),
      ...lenField(2, [0, 0]),
      ...varintField(3, FeatureType.POINT),
      ...lenField(4, [9, 0, 0]),
    ];
    const valBytes = strField(1, 'evil');
    const layerBytes = [
      ...varintField(15, 2),
      ...strField(1, '__proto__'),
      ...lenField(2, featBytes),
      ...strField(3, '__proto__'),
      ...lenField(4, valBytes),
      ...varintField(5, 4096),
    ];
    const tile = new VectorTile(new Uint8Array(lenField(3, layerBytes)));

    expect(Object.getPrototypeOf(tile.layers)).toBeNull();
    const layer = tile.layers['__proto__'];
    expect(layer).toBeInstanceOf(Layer);
    expect(tile.getLayer('__proto__')).toBe(layer);
    expect(layer.name).toBe('__proto__');

    const feature = layer.feature(0);
    expect(Object.getPrototypeOf(feature.properties)).toBeNull();
    expect(feature.properties['__proto__']).toBe('evil');
    expect(({} as Record<string, unknown>).evil).toBeUndefined();
  });

  it('supports CCW exterior polygon rings with CW holes', () => {
    // Outer CCW: (0,0)->(0,10)->(10,10)->(10,0)->(0,0)
    // Inner CW:  (2,2)->(8,2)->(8,8)->(2,8)->(2,2)
    const geom = [9, 0, 0, 26, 0, 20, 20, 0, 0, 19, 15, 9, 15, 4, 26, 12, 0, 0, 12, 11, 0, 15];
    const featBytes = [...varintField(3, FeatureType.POLYGON), ...lenField(4, geom)];
    const layerBytes = [...strField(1, 'ccw'), ...lenField(2, featBytes), ...varintField(5, 4096)];
    const tile = new VectorTile(new Uint8Array(lenField(3, layerBytes)));
    const feature = tile.layers.ccw.feature(0);

    const polys = feature.asPolygons((x, y): Coord2D => [x, y]);
    expect(polys).toEqual([
      [
        [
          [0, 0],
          [0, 10],
          [10, 10],
          [10, 0],
          [0, 0],
        ],
        [
          [2, 2],
          [8, 2],
          [8, 8],
          [2, 8],
          [2, 2],
        ],
      ],
    ]);

    const geo = feature.toGeoJSON(0, 0, 0);
    expect(geo.geometry.type).toBe('Polygon');
    expect((geo.geometry as Polygon).coordinates.length).toBe(2);

    const ptRings = feature.loadGeometry();
    expect(classifyRings(ptRings)).toEqual(feature.asPolygons());
    expect(classifyRings([[new Point(0, 0)]])).toEqual([[[new Point(0, 0)]]]);
  });

  it('skips zero-count geometry commands', () => {
    // MoveTo(count=0) -> 0, MoveTo(count=1) (3, 4) -> 9, 6, 8
    const featBytes = [...varintField(1, 1), ...varintField(3, FeatureType.POINT), ...lenField(4, [0, 9, 6, 8])];
    const layerBytes = [...strField(1, 'layer'), ...lenField(2, featBytes), ...varintField(5, 4096)];
    const tile = new VectorTile(new Uint8Array(lenField(3, layerBytes)));
    const feature = tile.layers.layer.feature(0);

    expect(feature.loadGeometry()).toEqual([[{ x: 3, y: 4 }]]);
    expect(feature.loadFlatGeometry()).toEqual({ coords: [3, 4], ends: [2] });
    expect(feature.bbox()).toEqual([3, 4, 3, 4]);
  });

  it('throws on unknown non-zero geometry commands', () => {
    // cmd=3, count=1 -> (1 << 3) | 3 = 11
    const featBytes = [...varintField(3, FeatureType.POINT), ...lenField(4, [11])];
    const layerBytes = [...strField(1, 'layer'), ...lenField(2, featBytes)];
    const tile = new VectorTile(new Uint8Array(lenField(3, layerBytes)));
    const feature = tile.layers.layer.feature(0);

    expect(() => feature.loadGeometry()).toThrow('unknown command 3');
    expect(() => feature.loadFlatGeometry()).toThrow('unknown command 3');
    expect(() => feature.bbox()).toThrow('unknown command 3');
  });

  it('ClosePath creates a distinct Point instance for the closing vertex', () => {
    const tile = new VectorTile(fs.readFileSync(__dirname + '/fixtures/14-8801-5371.vector.pbf'));
    const building = tile.layers.building.feature(0).loadGeometry();
    expect(building).toEqual([
      [
        { x: 2039, y: -32 },
        { x: 2035, y: -31 },
        { x: 2032, y: -31 },
        { x: 2032, y: -32 },
        { x: 2039, y: -32 },
      ],
    ]);
    expect(building[0][0]).not.toBe(building[0][4]);
    (building[0][0] as { x: number; y: number }).x = 1;
    (building[0][0] as { x: number; y: number }).y = 2;
    expect(building[0][4]).toEqual({ x: 2039, y: -32 });
  });

  it('handles Value messages with only unknown fields or trailing unknown fields without hanging', () => {
    const unknownOnlyVal = strField(99, 'only-unknown');
    const wrappedVal = [...varintField(98, 123), ...strField(1, 'kept'), ...strField(99, 'trailing')];
    const featBytes = [
      ...varintField(1, 1),
      ...lenField(2, [0, 0, 1, 1]),
      ...varintField(3, FeatureType.POINT),
      ...lenField(4, [9, 0, 0]),
    ];
    const layerBytes = [
      ...strField(1, 'vals'),
      ...strField(3, 'a'),
      ...strField(3, 'b'),
      ...lenField(4, unknownOnlyVal),
      ...lenField(4, wrappedVal),
      ...lenField(2, featBytes),
    ];
    const tile = new VectorTile(new Uint8Array(lenField(3, layerBytes)));
    const feature = tile.layers.vals.feature(0);
    expect(feature.properties.a).toBeNull();
    expect(feature.properties.b).toBe('kept');
  });

  it('handles empty tile, empty layer, and empty feature', () => {
    const emptyTile = new VectorTile(new Uint8Array(0));
    expect(Object.keys(emptyTile.layers)).toEqual([]);

    const emptyLayerTile = new VectorTile(new Uint8Array(lenField(3, strField(1, 'empty'))));
    expect(emptyLayerTile.layers.empty).toBeUndefined();

    const emptyFeatLayer = new Uint8Array(lenField(3, [...strField(1, 'l'), ...lenField(2, [])]));
    const feat = new VectorTile(emptyFeatLayer).layers.l.feature(0);
    expect(feat.type).toBe(FeatureType.UNKNOWN);
    expect(Object.keys(feat.properties)).toEqual([]);
    expect(() => feat.loadGeometry()).toThrow('feature has no geometry');
  });

  it('throws a clear error for a feature with no geometry (issue #39)', () => {
    const featBytes = [...varintField(1, 1), ...varintField(3, FeatureType.POINT)];
    const layerBytes = [...strField(1, 'layer'), ...lenField(2, featBytes), ...varintField(5, 4096)];
    const feature = new VectorTile(new Uint8Array(lenField(3, layerBytes))).layers.layer.feature(0);

    expect(() => feature.loadGeometry()).toThrow('feature has no geometry');
    expect(() => feature.loadFlatGeometry()).toThrow('feature has no geometry');
    expect(() => feature.bbox()).toThrow('feature has no geometry');
    expect(() => feature.toGeoJSON(0, 0, 0)).toThrow('feature has no geometry');
    expect(() => feature.asPoints()).toThrow('feature has no geometry');
    expect(feature.asLines()).toBeNull();
    expect(feature.asPolygons()).toBeNull();
  });
});

// Custom matchers

function approximateDeepEqual(a: any, b: any, epsilon: number): [boolean, string] {
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
      console.error(a[ka[i]], b[ka[i]]);
      return [false, `Different values for key "${ka[i]}": ${a[ka[i]]} vs ${b[ka[i]]}`];
    }
  }

  return [true, 'ok'];
}

declare global {
  namespace jest {
    interface Matchers<R> {
      toApproximateDeepEqual(expected: any, epsilon: number): R;
    }
  }
}

expect.extend({
  toApproximateDeepEqual: (a: any, b: any, epsilon = 1e-6): jest.CustomMatcherResult => {
    const [pass, message] = approximateDeepEqual(a, b, epsilon);
    return { pass, message: () => message };
  },
});
