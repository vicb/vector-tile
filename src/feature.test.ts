import type { MultiPolygon, Polygon } from 'geojson';
import { describe, expect, it } from 'vitest';

import { FeatureType } from './feature';
import { Point } from './point';
import { lenField, readFixture, strField, varintField } from './test-helper';
import { VectorTile } from './tile';
import type { Coord2D } from './types';

describe('Feature and FeatureType', () => {
  it('exposes FeatureType as a runtime object and enum', () => {
    expect(FeatureType).toEqual({
      UNKNOWN: 0,
      POINT: 1,
      LINESTRING: 2,
      POLYGON: 3,
    });
  });

  const data = readFixture('14-8801-5371.vector.pbf');
  const tile = new VectorTile(data);

  it('extracts feature properties and geometry', () => {
    const poi = tile.layers.poi_label;
    expect(poi.length).toBe(558);

    const park = poi.feature(11);
    expect(park.bbox()).toEqual([3898, 1731, 3898, 1731]);
    expect(park.id).toBe('3000003150561');
    expect(park.properties.name).toBe('Mauerpark');
    expect(park.properties.type).toBe('Park');
    expect(park.type).toBe(FeatureType.POINT);
    expect(park.loadGeometry()).toEqual([[{ x: 3898, y: 1731 }]]);

    const road = tile.layers.road;
    expect(road.length).toBe(686);

    const roadFeat = road.feature(656);
    expect(roadFeat.type).toBe(FeatureType.LINESTRING);
    expect(roadFeat.loadGeometry()).toEqual([
      [
        { x: 1988, y: 306 },
        { x: 1808, y: 321 },
        { x: 1506, y: 347 },
      ],
    ]);
    expect(roadFeat.bbox()).toEqual([1506, 306, 1988, 347]);
    // Verifies bbox caching returns the exact same reference
    expect(roadFeat.bbox()).toBe(roadFeat.bbox());
  });

  it('supports strongly typed properties and generics with toGeoJSON', () => {
    interface ParkProps {
      name: string;
      localrank: number;
    }
    const layer = tile.getLayer<ParkProps>('poi_label')!;
    const feature = layer.feature(11);

    const typedProp: string = feature.properties.name;
    expect(typedProp).toBe('Mauerpark');

    const geojson = feature.toGeoJSON<ParkProps>(8801, 5371, 14);
    const geoName: string = geojson.properties.name;
    expect(geoName).toBe('Mauerpark');
    expect(geojson.properties.localrank).toBe(1);

    const inferredGeo = feature.toGeoJSON(8801, 5371, 14);
    expect(inferredGeo.properties.localrank).toBe(1);

    const buildingGeo = tile.layers.building
      .feature<{ osm_id: number }>(0)
      .toGeoJSON<{ osm_id: number }, Polygon | MultiPolygon>(8801, 5371, 14);
    expect(buildingGeo.properties.osm_id).toBe(1000267229912);
    expect(buildingGeo.geometry.type).toBe('Polygon');
    expect(buildingGeo.geometry.coordinates.length).toBe(1);
  });

  function geoJSONFromFixture(name: string) {
    const fixtureTile = new VectorTile(readFixture(name));
    return fixtureTile.layers.geojson.feature(0).toGeoJSON(0, 0, 0);
  }

  it('converts point, line, and polygon fixtures to GeoJSON accurately', () => {
    expect(geoJSONFromFixture('singleton-multi-point').geometry).toApproximateDeepEqual(
      {
        type: 'Point',
        coordinates: [1, 2],
      },
      0.1,
    );

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

  it('converts features from full vector tile to GeoJSON', () => {
    expect(tile.layers.poi_label.feature(11).toGeoJSON(8801, 5371, 14)).toEqual({
      type: 'Feature',
      id: '3000003150561',
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
      id: '238162948',
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
      id: '1000267229912',
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

  it('handles regression cases (issues #15, #1019, #60)', () => {
    const lotsOfTags = new VectorTile(readFixture('lots-of-tags.vector.pbf'));
    expect(() => lotsOfTags.layers['stuttgart-rails'].feature(0)).not.toThrow();

    const edgePbf = new VectorTile(readFixture('12-1143-1497.vector.pbf'));
    expect(() => edgePbf.layers.water.feature(1).loadGeometry()).not.toThrow();

    const closePathPbf = new VectorTile(readFixture('multipolygon-with-closepath.pbf'));
    for (const id in closePathPbf.layers) {
      const layer = closePathPbf.layers[id];
      for (let i = 0; i < layer.length; i++) {
        expect(() => layer.feature(i).loadGeometry()).not.toThrow();
      }
    }
  });

  it('provides specialized accessors: asPoints, asLines, and asPolygons', () => {
    const roadFeature = tile.layers.road.feature(656);
    expect(roadFeature.asPoints()).toBeNull();
    expect(roadFeature.asPolygons()).toBeNull();
    const lines = roadFeature.asLines();
    expect(lines).not.toBeNull();
    expect(lines!.length).toBe(1);
    expect(lines![0].length).toBe(3);
    expect(lines![0][0]).toBeInstanceOf(Point);
    expect(lines![0][0]).toEqual({ x: 1988, y: 306 });

    const mpTile = new VectorTile(readFixture('multi-point.pbf'));
    const pts = mpTile.layers.geojson.feature(0).asPoints();
    expect(pts).not.toBeNull();
    expect(pts!.length).toBe(2);
    expect(pts![0]).toBeInstanceOf(Point);

    const pwiTile = new VectorTile(readFixture('polygon-with-inner.pbf'));
    const polyFeature = pwiTile.layers.geojson.feature(0);
    expect(polyFeature.asPoints()).toBeNull();
    expect(polyFeature.asLines()).toBeNull();
    const polygons = polyFeature.asPolygons();
    expect(polygons).not.toBeNull();
    expect(polygons!.length).toBe(1);
    expect(polygons![0].length).toBe(2); // Outer + inner
  });

  it('provides direct geographic coordinate accessors: toGeoPoints, toGeoLines, and toGeoPolygons', () => {
    // Point feature
    const poiFeat = tile.layers.poi_label.feature(11);
    expect(poiFeat.type).toBe(FeatureType.POINT);
    expect(poiFeat.toGeoLines(8801, 5371, 14)).toBeNull();
    expect(poiFeat.toGeoPolygons(8801, 5371, 14)).toBeNull();
    const geoPoints = poiFeat.toGeoPoints(8801, 5371, 14);
    expect(geoPoints).not.toBeNull();
    expect(geoPoints).toEqual([[13.402258157730103, 52.543989253806245]]);

    // LineString feature
    const bridgeFeat = tile.layers.bridge.feature(0);
    expect(bridgeFeat.type).toBe(FeatureType.LINESTRING);
    expect(bridgeFeat.toGeoPoints(8801, 5371, 14)).toBeNull();
    expect(bridgeFeat.toGeoPolygons(8801, 5371, 14)).toBeNull();
    const geoLines = bridgeFeat.toGeoLines(8801, 5371, 14);
    expect(geoLines).not.toBeNull();
    expect(geoLines).toEqual([
      [
        [13.399457931518555, 52.54633484403641],
        [13.399441838264465, 52.54650447852501],
      ],
    ]);

    // Polygon feature
    const buildingFeat = tile.layers.building.feature(0);
    expect(buildingFeat.type).toBe(FeatureType.POLYGON);
    expect(buildingFeat.toGeoPoints(8801, 5371, 14)).toBeNull();
    expect(buildingFeat.toGeoLines(8801, 5371, 14)).toBeNull();
    const geoPolys = buildingFeat.toGeoPolygons(8801, 5371, 14);
    expect(geoPolys).not.toBeNull();
    expect(geoPolys).toEqual([
      [
        [
          [13.392285704612732, 52.54974045706257],
          [13.392264246940613, 52.549737195107554],
          [13.392248153686523, 52.549737195107554],
          [13.392248153686523, 52.54974045706257],
          [13.392285704612732, 52.54974045706257],
        ],
      ],
    ]);

    // Multi-polygon with inner ring
    const pwiTile = new VectorTile(readFixture('polygon-with-inner.pbf'));
    const pwiFeat = pwiTile.layers.geojson.feature(0);
    const pwiPolys = pwiFeat.toGeoPolygons(0, 0, 0);
    expect(pwiPolys).not.toBeNull();
    expect(pwiPolys!.length).toBe(1);
    expect(pwiPolys![0].length).toBe(2);
  });

  it('supports in-place coordinate transform callbacks', () => {
    const roadFeature = tile.layers.road.feature(656);
    const transformed = roadFeature.loadGeometry((x, y) => [x * 2, y * 2] as Coord2D);
    expect(transformed).toEqual([
      [
        [3976, 612],
        [3616, 642],
        [3012, 694],
      ],
    ]);

    const transformedLines = roadFeature.asLines((x, y) => `${x},${y}`);
    expect(transformedLines).toEqual([['1988,306', '1808,321', '1506,347']]);

    const mpTile = new VectorTile(readFixture('multi-point.pbf'));
    const ptFeature = mpTile.layers.geojson.feature(0);
    const transformedPts = ptFeature.asPoints((x, y) => ({ px: x, py: y }));
    expect(transformedPts).toEqual([
      { px: 2059, py: 2025 },
      { px: 2082, py: 2002 },
    ]);

    const pwiTile = new VectorTile(readFixture('polygon-with-inner.pbf'));
    const polyFeature = pwiTile.layers.geojson.feature(0);
    const transformedPolys = polyFeature.asPolygons((x, y) => [x, y] as Coord2D);
    expect(transformedPolys![0][0][0]).toEqual([2071, 2071]);
  });

  it('provides loadFlatGeometry returning packed coordinates without point allocations', () => {
    const roadFeature = tile.layers.road.feature(656);
    const flat = roadFeature.loadFlatGeometry();
    expect(flat.coords).toEqual([1988, 306, 1808, 321, 1506, 347]);
    expect(flat.ends).toEqual([6]);

    const pwiTile = new VectorTile(readFixture('polygon-with-inner.pbf'));
    const polyFlat = pwiTile.layers.geojson.feature(0).loadFlatGeometry();
    expect(polyFlat.ends.length).toBe(2);
    expect(polyFlat.coords.length).toBe(polyFlat.ends[1]);
  });

  it('is re-entrant and exception-safe across nested geometry decodes', () => {
    const roadFeature = tile.layers.road.feature(656);
    const nested = roadFeature.loadGeometry((x, y) => {
      const inner = roadFeature.loadGeometry();
      return { x, y, innerLen: inner[0].length };
    });
    expect(nested[0][0].innerLen).toBe(3);
  });

  it('caches bbox during readGeometry', () => {
    const feat = tile.layers.road.feature(656);
    // @ts-expect-error private property access for test
    expect(feat._bbox).toBeUndefined();
    feat.loadGeometry();
    // @ts-expect-error private property access for test
    expect(feat._bbox).toEqual([1506, 306, 1988, 347]);
    expect(feat.bbox()).toEqual([1506, 306, 1988, 347]);
  });

  it('handles empty and missing geometry error conditions', () => {
    const emptyFeatLayer = new Uint8Array(lenField(3, [...strField(1, 'l'), ...lenField(2, [])]));
    const feat = new VectorTile(emptyFeatLayer).layers.l.feature(0);
    expect(feat.type).toBe(FeatureType.UNKNOWN);
    expect(() => feat.loadGeometry()).toThrow('feature has no geometry');
    expect(() => feat.loadFlatGeometry()).toThrow('feature has no geometry');
    expect(() => feat.bbox()).toThrow('feature has no geometry');
    expect(() => feat.toGeoJSON(0, 0, 0)).toThrow('Unknown feature type');
    expect(feat.asPoints()).toBeNull();
    expect(feat.asLines()).toBeNull();
    expect(feat.asPolygons()).toBeNull();

    const noGeomBytes = [...varintField(1, 1), ...varintField(3, FeatureType.POINT)];
    const noGeomLayerBytes = [...strField(1, 'layer'), ...lenField(2, noGeomBytes), ...varintField(5, 4096)];
    const noGeomFeat = new VectorTile(new Uint8Array(lenField(3, noGeomLayerBytes))).layers.layer.feature(0);
    expect(() => noGeomFeat.loadGeometry()).toThrow('feature has no geometry');
    expect(() => noGeomFeat.loadFlatGeometry()).toThrow('feature has no geometry');
    expect(() => noGeomFeat.bbox()).toThrow('feature has no geometry');
    expect(() => noGeomFeat.toGeoJSON(0, 0, 0)).toThrow('feature has no geometry');
    expect(() => noGeomFeat.asPoints()).toThrow('feature has no geometry');
    expect(noGeomFeat.asLines()).toBeNull();
    expect(noGeomFeat.asPolygons()).toBeNull();
  });

  it('skips zero-count geometry commands and throws on unknown commands', () => {
    const zeroCountCmd = (0 << 3) | 1; // count=0, cmd=MoveTo(1)
    const validMoveTo = (1 << 3) | 1; // count=1, cmd=MoveTo(1)
    const featBytes = [
      ...varintField(1, 1),
      ...varintField(3, FeatureType.LINESTRING),
      ...varintField(99, 42), // unknown field in Feature message
      ...lenField(4, [zeroCountCmd, validMoveTo, 2, 4]),
    ];
    const layerBytes = [...strField(1, 'layer'), ...lenField(2, featBytes)];
    const tile = new VectorTile(new Uint8Array(lenField(3, layerBytes)));
    const feature = tile.layers.layer.feature(0);
    expect(feature.loadGeometry()).toEqual([[{ x: 1, y: 2 }]]);
    expect(feature.bbox()).toEqual([1, 2, 1, 2]);

    const unknownCmdBytes = [
      ...varintField(1, 1),
      ...varintField(3, FeatureType.LINESTRING),
      ...lenField(4, [(1 << 3) | 3]), // cmd 3 unknown
    ];
    const badTile = new VectorTile(
      new Uint8Array(lenField(3, [...strField(1, 'layer'), ...lenField(2, unknownCmdBytes)])),
    );
    const badFeat = badTile.layers.layer.feature(0);
    expect(() => badFeat.loadGeometry()).toThrow('unknown command 3');
    expect(() => badFeat.loadFlatGeometry()).toThrow('unknown command 3');
    expect(() => badFeat.bbox()).toThrow('unknown command 3');

    // Polygon feature with empty geometry stream returning []
    const emptyPolyBytes = [...varintField(1, 1), ...varintField(3, FeatureType.POLYGON), ...lenField(4, [])];
    const emptyPolyTile = new VectorTile(
      new Uint8Array(lenField(3, [...strField(1, 'layer'), ...lenField(2, emptyPolyBytes)])),
    );
    expect(emptyPolyTile.layers.layer.feature(0).asPolygons()).toEqual([]);
  });

  it('creates distinct Point instance for ClosePath closing vertex', () => {
    const building = tile.layers.building.feature(0).loadGeometry();
    expect(building[0][0]).not.toBe(building[0][4]);
    expect(building[0][0]).toEqual(building[0][4]);

    // ClosePath with large count is bounded to single closing vertex
    const moveTo = (1 << 3) | 1;
    const lineTo = (1 << 3) | 2;
    const largeClosePath = (9999 << 3) | 7; // count=9999, cmd=ClosePath(7)
    const polyFeatBytes = [
      ...varintField(1, 1),
      ...varintField(3, FeatureType.POLYGON),
      ...lenField(4, [moveTo, 2, 4, lineTo, 6, 8, largeClosePath]),
    ];
    const polyTile = new VectorTile(
      new Uint8Array(lenField(3, [...strField(1, 'layer'), ...lenField(2, polyFeatBytes)])),
    );
    const ring = polyTile.layers.layer.feature(0).loadGeometry()[0];
    expect(ring.length).toBe(3); // start + lineTo + 1 closePath vertex
    expect(ring[2]).toEqual(ring[0]);
  });

  it('returns Infinity sentinels from bbox() on explicit empty geometry stream', () => {
    const featBytes = [...varintField(3, FeatureType.POINT), ...lenField(4, [])];
    const layerBytes = [...strField(1, 'layer'), ...lenField(2, featBytes)];
    const feature = new VectorTile(new Uint8Array(lenField(3, layerBytes))).layers.layer.feature(0);
    expect(feature.bbox()).toEqual([Infinity, Infinity, -Infinity, -Infinity]);
  });

  it('handles LineTo with no preceding MoveTo gracefully', () => {
    const lineToOnly = (1 << 3) | 2; // count=1, cmd=LineTo(2)
    const featBytes = [
      ...varintField(1, 1),
      ...varintField(3, FeatureType.LINESTRING),
      ...lenField(4, [lineToOnly, 2, 4]),
    ];
    const layerBytes = [...strField(1, 'layer'), ...lenField(2, featBytes)];
    const feature = new VectorTile(new Uint8Array(lenField(3, layerBytes))).layers.layer.feature(0);
    expect(feature.loadGeometry()).toEqual([]);
    expect(feature.loadFlatGeometry()).toEqual({ coords: [], ends: [] });
  });
});
