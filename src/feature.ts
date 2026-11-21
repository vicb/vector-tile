import type { BinaryReader } from '@protobuf-ts/runtime';
import type { Feature as GeoJSONFeature, Geometry as GeoJSONGeometry, Position } from 'geojson';

import { Command, COMMAND_ID_MASK, FeatureTag, WIRE_TYPE_MASK } from './constants';
import { Point } from './point';
import type { FlatGeometry, GeoJSONFeatureGeometry, PropValues } from './types';

/**
 * Mapbox Vector Tile geometry types as defined in the MVT specification.
 */
export const FeatureType = {
  /** Unknown geometry type. */
  UNKNOWN: 0,
  /** Point or MultiPoint geometry. */
  POINT: 1,
  /** LineString or MultiLineString geometry. */
  LINESTRING: 2,
  /** Polygon or MultiPolygon geometry. */
  POLYGON: 3,
} as const;

/**
 * Union of possible MVT feature type values (`0 | 1 | 2 | 3`).
 */
export type FeatureType = (typeof FeatureType)[keyof typeof FeatureType];

const RAD_TO_DEG = 360 / Math.PI;
const MAX_SCRATCH_COORDS = 8192;
const MAX_SCRATCH_ENDS = 1024;
let scratchCoords: number[] | null = [];
let scratchEnds: number[] | null = [];

function releaseScratch(coords: number[], ends: number[]): void {
  if (coords.length <= MAX_SCRATCH_COORDS) {
    scratchCoords = coords;
  }
  if (ends.length <= MAX_SCRATCH_ENDS) {
    scratchEnds = ends;
  }
}

function mapRing<T>(
  coords: number[],
  start: number,
  end: number,
  transform?: (x: number, y: number) => T,
): (Point | T)[] {
  const ring = new Array<Point | T>((end - start) >> 1);
  if (transform) {
    for (let i = start, j = 0; i < end; i += 2, j++) {
      ring[j] = transform(coords[i], coords[i + 1]);
    }
  } else {
    for (let i = start, j = 0; i < end; i += 2, j++) {
      ring[j] = new Point(coords[i], coords[i + 1]);
    }
  }
  return ring;
}

function signedAreaFlat(coords: number[], start: number, end: number): number {
  let sum = 0;
  for (let i = start, j = end - 2; i < end; j = i, i += 2) {
    sum += (coords[j] - coords[i]) * (coords[i + 1] + coords[j + 1]);
  }
  return sum;
}

/**
 * Represents a single feature within a vector tile layer.
 *
 * @typeParam P - Shape of the feature properties object.
 */
export class Feature<P = Record<string, PropValues>> {
  /** Optional identifier of the feature (decoded as a string). */
  readonly id?: string;
  /** Geometry type of the feature (Point, LineString, or Polygon). */
  readonly type: FeatureType = FeatureType.UNKNOWN;
  /** Decoded key-value properties dictionary. */
  readonly properties: P = Object.create(null);

  private geometryOffset = 0;

  constructor(
    private reader: BinaryReader,
    end: number,
    keys: string[],
    values: Array<PropValues>,
    /** Coordinate resolution extent inherited from the layer (e.g. 4096). */
    public readonly extent: number,
  ) {
    while (reader.pos < end) {
      const tag = reader.uint32();
      if (tag == FeatureTag.Id) {
        this.id = reader.uint64().toString();
      } else if (tag == FeatureTag.Tags) {
        const tagsEnd = reader.uint32() + reader.pos;
        const props = this.properties as unknown as Record<string, PropValues>;
        while (reader.pos < tagsEnd) {
          props[keys[reader.uint32()]] = values[reader.uint32()];
        }
      } else if (tag == FeatureTag.Type) {
        this.type = reader.uint32() as FeatureType;
      } else if (tag == FeatureTag.Geometry) {
        this.geometryOffset = reader.pos;
        reader.pos = reader.uint32() + reader.pos;
      } else {
        reader.skip(tag & WIRE_TYPE_MASK);
      }
    }
  }

  private readGeometry(coords: number[], ends: number[]): number {
    if (!this.geometryOffset) {
      throw new Error('feature has no geometry');
    }
    const reader = this.reader;
    reader.pos = this.geometryOffset;

    const end = reader.uint32() + reader.pos;
    let x = 0;
    let y = 0;
    let ci = 0;
    let ei = 0;
    let ringStart = -1;

    while (reader.pos < end) {
      const cmdLen = reader.uint32();
      const cmd = cmdLen & COMMAND_ID_MASK;
      let count = cmdLen >>> 3;
      if (count == 0) {
        continue;
      }

      if (cmd == Command.MoveTo) {
        while (count-- > 0 && reader.pos < end) {
          x += reader.sint32();
          y += reader.sint32();
          if (ringStart >= 0) {
            ends[ei++] = ci;
          }
          ringStart = ci;
          coords[ci++] = x;
          coords[ci++] = y;
        }
      } else if (cmd == Command.LineTo) {
        if (ringStart >= 0) {
          while (count-- > 0 && reader.pos < end) {
            x += reader.sint32();
            y += reader.sint32();
            coords[ci++] = x;
            coords[ci++] = y;
          }
        } else {
          while (count-- > 0 && reader.pos < end) {
            x += reader.sint32();
            y += reader.sint32();
          }
        }
      } else if (cmd == Command.ClosePath) {
        if (ringStart >= 0) {
          const x0 = coords[ringStart];
          const y0 = coords[ringStart + 1];
          while (count-- > 0) {
            coords[ci++] = x0;
            coords[ci++] = y0;
          }
        }
      } else {
        throw new Error(`unknown command ${cmd}`);
      }
    }

    if (ringStart >= 0) {
      ends[ei++] = ci;
    }

    return ei;
  }

  private buildPoints<T>(transform?: (x: number, y: number) => T): (Point | T)[] {
    const coords = scratchCoords || [];
    const ends = scratchEnds || [];
    scratchCoords = scratchEnds = null;
    try {
      const numPoints = this.readGeometry(coords, ends);
      const points = new Array<Point | T>(numPoints);
      let start = 0;
      if (transform) {
        for (let r = 0; r < numPoints; r++) {
          points[r] = transform(coords[start], coords[start + 1]);
          start = ends[r];
        }
      } else {
        for (let r = 0; r < numPoints; r++) {
          points[r] = new Point(coords[start], coords[start + 1]);
          start = ends[r];
        }
      }
      return points;
    } finally {
      releaseScratch(coords, ends);
    }
  }

  private buildRings<T>(transform?: (x: number, y: number) => T): (Point | T)[][] {
    const coords = scratchCoords || [];
    const ends = scratchEnds || [];
    scratchCoords = scratchEnds = null;
    try {
      const numRings = this.readGeometry(coords, ends);
      const lines = new Array<(Point | T)[]>(numRings);
      let start = 0;
      for (let r = 0; r < numRings; r++) {
        const end = ends[r];
        lines[r] = mapRing(coords, start, end, transform);
        start = end;
      }
      return lines;
    } finally {
      releaseScratch(coords, ends);
    }
  }

  private buildPolygons<T>(transform?: (x: number, y: number) => T): (Point | T)[][][] {
    const coords = scratchCoords || [];
    const ends = scratchEnds || [];
    scratchCoords = scratchEnds = null;
    try {
      const numRings = this.readGeometry(coords, ends);
      if (numRings == 0) {
        return [[]];
      }
      if (numRings == 1) {
        return [[mapRing(coords, 0, ends[0], transform)]];
      }

      const polygons: (Point | T)[][][] = [];
      let polygon: (Point | T)[][] | null = null;
      let ccw: boolean | undefined;
      let start = 0;

      for (let r = 0; r < numRings; r++) {
        const end = ends[r];
        const area = signedAreaFlat(coords, start, end);
        if (area != 0) {
          if (ccw === undefined) {
            ccw = area < 0;
          }
          if (ccw === area < 0) {
            if (polygon) {
              polygons.push(polygon);
            }
            polygon = [mapRing(coords, start, end, transform)];
          } else if (polygon) {
            polygon.push(mapRing(coords, start, end, transform));
          }
        }
        start = end;
      }

      if (polygon) {
        polygons.push(polygon);
      }

      return polygons;
    } finally {
      releaseScratch(coords, ends);
    }
  }

  /**
   * Lazily decodes the feature geometry as a flat coordinate buffer.
   *
   * Highly optimized for WebGL buffers and worker serialization with minimal GC allocations.
   *
   * @returns An object with flat `coords` (`[x0, y0, x1, y1, ...]`) and `ends` indices.
   * @throws Error if the feature has no geometry.
   */
  loadFlatGeometry(): FlatGeometry {
    const coords = scratchCoords || [];
    const ends = scratchEnds || [];
    scratchCoords = scratchEnds = null;
    try {
      const numRings = this.readGeometry(coords, ends);
      const numCoords = numRings ? ends[numRings - 1] : 0;
      return {
        coords: coords.slice(0, numCoords),
        ends: ends.slice(0, numRings),
      };
    } finally {
      releaseScratch(coords, ends);
    }
  }

  /**
   * Lazily decodes the feature geometry into rings of Points.
   *
   * @returns Array of rings where each ring is an array of `Point` instances.
   * @throws Error if the feature has no geometry.
   */
  loadGeometry(): Point[][];
  /**
   * Lazily decodes the feature geometry, applying an in-place coordinate transformation callback.
   *
   * @typeParam T - Target coordinate representation type.
   * @param transform - Callback mapping `(x, y)` tile coordinates to transformed vertex values.
   * @returns Array of rings where each ring is an array of transformed vertices `T`.
   * @throws Error if the feature has no geometry.
   */
  loadGeometry<T>(transform: (x: number, y: number) => T): T[][];
  loadGeometry<T>(transform?: (x: number, y: number) => T): (Point | T)[][] {
    return this.buildRings(transform);
  }

  /**
   * Computes and returns the 2D bounding box of the geometry in tile coordinates as `[xMin, yMin, xMax, yMax]`.
   *
   * @returns The bounding box `[xMin, yMin, xMax, yMax]`.
   * @throws Error if the feature has no geometry.
   */
  bbox(): [number, number, number, number] {
    if (!this.geometryOffset) {
      throw new Error('feature has no geometry');
    }

    let xMin = Infinity;
    let xMax = -Infinity;
    let yMin = Infinity;
    let yMax = -Infinity;

    const reader = this.reader;
    reader.pos = this.geometryOffset;

    const end = reader.uint32() + reader.pos;
    let x = 0;
    let y = 0;

    while (reader.pos < end) {
      const cmdLen = reader.uint32();
      const cmd = cmdLen & COMMAND_ID_MASK;
      let count = cmdLen >>> 3;
      if (count == 0) {
        continue;
      }

      if (cmd == Command.MoveTo || cmd == Command.LineTo) {
        while (count-- > 0 && reader.pos < end) {
          x += reader.sint32();
          y += reader.sint32();
          xMax = Math.max(x, xMax);
          xMin = Math.min(x, xMin);
          yMax = Math.max(y, yMax);
          yMin = Math.min(y, yMin);
        }
      } else if (cmd != Command.ClosePath) {
        throw new Error(`unknown command ${cmd}`);
      }
    }

    return [xMin, yMin, xMax, yMax];
  }

  /**
   * Projects and converts the feature to a GeoJSON Feature object in WGS84 coordinates.
   *
   * @typeParam Props - Type of the GeoJSON feature properties. Defaults to `P`.
   * @typeParam Geom - Type of the GeoJSON geometry. Defaults to `GeoJSONFeatureGeometry`.
   * @param x - Tile column (X) in the Web Mercator tile pyramid.
   * @param y - Tile row (Y) in the Web Mercator tile pyramid.
   * @param zoom - Zoom level of the tile.
   * @returns A GeoJSON `Feature` with projected WGS84 coordinates `[longitude, latitude]`.
   */
  toGeoJSON<Props = P, Geom extends GeoJSONGeometry | null = GeoJSONFeatureGeometry>(
    x: number,
    y: number,
    zoom: number,
  ): GeoJSONFeature<Geom, Props> {
    const size = this.extent * Math.pow(2, zoom);
    const x0 = this.extent * x;
    const y0 = this.extent * y;
    const degScale = 360 / size;
    let coordinates: any;
    let type = '';

    const project = (px: number, py: number): Position => {
      const y2 = 180 - (py + y0) * degScale;
      return [(px + x0) * degScale - 180, RAD_TO_DEG * Math.atan(Math.exp((y2 * Math.PI) / 180)) - 90];
    };

    switch (this.type) {
      case FeatureType.POINT:
        type = 'Point';
        coordinates = this.buildPoints(project);
        break;

      case FeatureType.LINESTRING:
        type = 'LineString';
        coordinates = this.buildRings(project);
        break;

      case FeatureType.POLYGON:
        type = 'Polygon';
        coordinates = this.buildPolygons(project);
        break;

      default:
        throw new Error('Unknown feature type');
    }

    if (coordinates.length == 1) {
      coordinates = coordinates[0];
    } else {
      type = 'Multi' + type;
    }

    const result = {
      type: 'Feature',
      geometry: {
        type,
        coordinates,
      },
      properties: this.properties,
    } as unknown as GeoJSONFeature<Geom, Props>;

    if (this.id != null) {
      result.id = this.id;
    }

    return result;
  }

  /**
   * Returns the geometry as points if `type === FeatureType.POINT`, or `null` otherwise.
   *
   * @returns Array of `Point` instances, or `null` if the feature is not a point.
   */
  asPoints(): Point[] | null;
  /**
   * Returns the geometry as transformed points if `type === FeatureType.POINT`, or `null` otherwise.
   *
   * @typeParam T - Target coordinate representation type.
   * @param transform - Callback mapping `(x, y)` tile coordinates to transformed vertex values.
   * @returns Array of transformed coordinates `T`, or `null` if the feature is not a point.
   */
  asPoints<T>(transform: (x: number, y: number) => T): T[] | null;
  asPoints<T>(transform?: (x: number, y: number) => T): (Point | T)[] | null {
    return this.type == FeatureType.POINT ? this.buildPoints(transform) : null;
  }

  /**
   * Returns the geometry as line strings if `type === FeatureType.LINESTRING`, or `null` otherwise.
   *
   * @returns Array of lines (each an array of `Point` instances), or `null` if the feature is not a linestring.
   */
  asLines(): Point[][] | null;
  /**
   * Returns the geometry as transformed line strings if `type === FeatureType.LINESTRING`, or `null` otherwise.
   *
   * @typeParam T - Target coordinate representation type.
   * @param transform - Callback mapping `(x, y)` tile coordinates to transformed vertex values.
   * @returns Array of lines (each an array of transformed coordinates `T`), or `null` if the feature is not a linestring.
   */
  asLines<T>(transform: (x: number, y: number) => T): T[][] | null;
  asLines<T>(transform?: (x: number, y: number) => T): (Point | T)[][] | null {
    return this.type == FeatureType.LINESTRING ? this.buildRings(transform) : null;
  }

  /**
   * Returns the geometry as classified polygons if `type === FeatureType.POLYGON`, or `null` otherwise.
   *
   * Each polygon is an array of rings:
   * - Index 0: Exterior boundary ring.
   * - Index 1+: Interior hole rings.
   *
   * @returns Array of polygons, or `null` if the feature is not a polygon.
   */
  asPolygons(): Point[][][] | null;
  /**
   * Returns the geometry as classified polygons with transformed vertices if `type === FeatureType.POLYGON`, or `null` otherwise.
   *
   * @typeParam T - Target coordinate representation type.
   * @param transform - Callback mapping `(x, y)` tile coordinates to transformed vertex values.
   * @returns Array of polygons, or `null` if the feature is not a polygon.
   */
  asPolygons<T>(transform: (x: number, y: number) => T): T[][][] | null;
  asPolygons<T>(transform?: (x: number, y: number) => T): (Point | T)[][][] | null {
    return this.type == FeatureType.POLYGON ? this.buildPolygons(transform) : null;
  }
}
