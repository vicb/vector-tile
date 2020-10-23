import fs from 'fs';

import { FeatureType, VectorTile } from '../src/index';

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
  function geoJSONFromFixture(name: string): any {
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
