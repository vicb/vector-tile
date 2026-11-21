// Mapbox Vector Tiles decoder.
//
// See https://github.com/mapbox/vector-tile-spec.

import { BinaryReader, PbLong, PbULong } from '@protobuf-ts/runtime';
import type {
  Feature as GeoJSONFeature,
  Geometry as GeoJSONGeometry,
  LineString as GeoJSONLineString,
  MultiLineString as GeoJSONMultiLineString,
  MultiPoint as GeoJSONMultiPoint,
  MultiPolygon as GeoJSONMultiPolygon,
  Point as GeoJSONPoint,
  Polygon as GeoJSONPolygon,
  Position,
} from 'geojson';

export type LongType = "number" | "string" | "bigint";
export type PropValues = string | number | boolean | bigint;
export type Coord2D = [number, number];

export interface FlatGeometry {
  readonly coords: number[];
  readonly ends: number[];
}

export type GeoJSONFeatureGeometry =
  | GeoJSONPoint
  | GeoJSONMultiPoint
  | GeoJSONLineString
  | GeoJSONMultiLineString
  | GeoJSONPolygon
  | GeoJSONMultiPolygon;

export type { GeoJSONFeature };

export class Point {
  constructor(public readonly x: number, public readonly y: number) { }
}

let textDecoder: TextDecoder | undefined;

const WIRE_TYPE_MASK = 0x7;
const COMMAND_ID_MASK = 0x7;

const WireType = {
  Varint: 0,
  Bit64: 1,
  LengthDelimited: 2,
  Bit32: 5,
} as const;

const TileTag = {
  Layers: (3 << 3) | WireType.LengthDelimited, // 26
} as const;

const LayerTag = {
  Name: (1 << 3) | WireType.LengthDelimited, // 10
  Features: (2 << 3) | WireType.LengthDelimited, // 18
  Keys: (3 << 3) | WireType.LengthDelimited, // 26
  Values: (4 << 3) | WireType.LengthDelimited, // 34
  Extent: (5 << 3) | WireType.Varint, // 40
  Version: (15 << 3) | WireType.Varint, // 120
} as const;

const ValueTag = {
  String: (1 << 3) | WireType.LengthDelimited, // 10
  Float: (2 << 3) | WireType.Bit32, // 21
  Double: (3 << 3) | WireType.Bit64, // 25
  Int: (4 << 3) | WireType.Varint, // 32
  UInt: (5 << 3) | WireType.Varint, // 40
  SInt: (6 << 3) | WireType.Varint, // 48
  Bool: (7 << 3) | WireType.Varint, // 56
} as const;

const FeatureTag = {
  Id: (1 << 3) | WireType.Varint, // 8
  Tags: (2 << 3) | WireType.LengthDelimited, // 18
  Type: (3 << 3) | WireType.Varint, // 24
  Geometry: (4 << 3) | WireType.LengthDelimited, // 34
} as const;

// A vector tile.
//
// Contains all the non-empty layers indexed by name.
export class VectorTile {
  // List of non-empty layers.
  readonly layers: { [key: string]: Layer } = Object.create(null);

  // The constructor takes a byte buffer.
  constructor(bytes: Uint8Array, longType: LongType = "number") {
    const reader = new BinaryReader(
      bytes,
      textDecoder || (textDecoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true })),
    );
    const end = reader.len;
    while (reader.pos < end) {
      const tag = reader.uint32();
      if (tag == TileTag.Layers) {
        const layer = new Layer(reader, reader.uint32() + reader.pos, longType);
        if (layer.length) {
          this.layers[layer.name] = layer;
        }
      } else {
        reader.skip(tag & WIRE_TYPE_MASK);
      }
    }
  }

  getLayer<P = Record<string, PropValues>>(name: string): Layer<P> | undefined {
    return this.layers[name] as unknown as Layer<P> | undefined;
  }
}

// A layer of a vector tile.
export class Layer<P = Record<string, PropValues>> implements Iterable<Feature<P>> {
  readonly name: string = '';
  readonly version: number = 1;
  readonly extent: number = 4096;
  readonly length: number;

  private featureOffsets: number[] = [];
  private keys: string[] = [];
  private values: Array<PropValues> = [];

  constructor(private reader: BinaryReader, end: number, private longType: LongType) {
    while (reader.pos < end) {
      const tag = reader.uint32();
      if (tag == LayerTag.Features) {
        this.featureOffsets.push(reader.pos);
        reader.pos = reader.uint32() + reader.pos;
      } else if (tag == LayerTag.Name) {
        this.name = reader.string();
      } else if (tag == LayerTag.Keys) {
        this.keys.push(reader.string());
      } else if (tag == LayerTag.Values) {
        this.values.push(this.decodeValue());
      } else if (tag == LayerTag.Extent) {
        this.extent = reader.uint32();
      } else if (tag == LayerTag.Version) {
        this.version = reader.uint32();
      } else {
        reader.skip(tag & WIRE_TYPE_MASK);
      }
    }

    this.length = this.featureOffsets.length;
  }

  // Returns the features at the given `index`.
  feature<FP = P>(index: number): Feature<FP> {
    if (index < 0 || index >= this.length) {
      throw new Error('out of bounds');
    }
    this.reader.pos = this.featureOffsets[index];
    const end = this.reader.uint32() + this.reader.pos;
    return new Feature<FP>(this.reader, end, this.keys, this.values, this.extent);
  }

  [Symbol.iterator](): Iterator<Feature<P>> {
    let index = 0;
    return {
      next: (): IteratorResult<Feature<P>> =>
        index < this.length ? { value: this.feature(index++), done: false } : { value: undefined, done: true },
    };
  }

  private decodeValue(): PropValues {
    const reader = this.reader;
    const end = reader.uint32() + reader.pos;
    let value: PropValues | null = null;
    while (reader.pos < end) {
      const tag = reader.uint32();
      switch (tag) {
        case ValueTag.String:
          value = reader.string();
          break;
        case ValueTag.Float:
          value = reader.float();
          break;
        case ValueTag.Double:
          value = reader.double();
          break;
        case ValueTag.Int:
          value = this.convertLong(reader.int64());
          break;
        case ValueTag.UInt:
          value = this.convertLong(reader.uint64());
          break;
        case ValueTag.SInt:
          value = this.convertLong(reader.sint64());
          break;
        case ValueTag.Bool:
          value = reader.bool();
          break;
        default:
          reader.skip(tag & WIRE_TYPE_MASK);
      }
    }
    if (value === null) {
      throw new Error('unknown feature value');
    }
    return value;
  }

  private convertLong(long: PbULong | PbLong): string | number | bigint {
    switch (this.longType) {
      case "number":
        return long.toNumber();
      case "string":
        return long.toString();
      case "bigint":
        return long.toBigInt();
    }
  }
}

export const FeatureType = {
  UNKNOWN: 0,
  POINT: 1,
  LINESTRING: 2,
  POLYGON: 3,
} as const;

export type FeatureType = (typeof FeatureType)[keyof typeof FeatureType];

const enum Command {
  MoveTo = 1,
  LineTo = 2,
  ClosePath = 7,
}

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

// A feature in a layer.
export class Feature<P = Record<string, PropValues>> {
  readonly id?: string;
  readonly type: FeatureType = FeatureType.UNKNOWN;
  readonly properties: P = Object.create(null);

  private geometryOffset = 0;

  constructor(
    private reader: BinaryReader,
    end: number,
    keys: string[],
    values: Array<PropValues>,
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

  // Lazily loads the geometry as a flat coordinate buffer.
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

  // Lazily loads the geometry.
  loadGeometry(): Point[][];
  loadGeometry<T>(transform: (x: number, y: number) => T): T[][];
  loadGeometry<T>(transform?: (x: number, y: number) => T): (Point | T)[][] {
    return this.buildRings(transform);
  }

  // Returns the bounding box of a geometry as `[xMin, yMin, xMax, yMax]`.
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

  // Returns a GeoJSON representation of the feature. 
  // x, y, and zoom refer to the tile coordinates.
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

  // Returns a list of points or null if the type is not POINT.
  asPoints(): Point[] | null;
  asPoints<T>(transform: (x: number, y: number) => T): T[] | null;
  asPoints<T>(transform?: (x: number, y: number) => T): (Point | T)[] | null {
    return this.type == FeatureType.POINT ? this.buildPoints(transform) : null;
  }

  // Returns a list of lines or null if the type is not LINESTRING.
  asLines(): Point[][] | null;
  asLines<T>(transform: (x: number, y: number) => T): T[][] | null;
  asLines<T>(transform?: (x: number, y: number) => T): (Point | T)[][] | null {
    return this.type == FeatureType.LINESTRING ? this.buildRings(transform) : null;
  }

  // Returns a list of polygons or null if the type is not POLYGON.
  //
  // Each polygon could be composed of one or more rings:
  // - The first ring is the exterior ring,
  // - following rings are interior rings (=holes).
  asPolygons(): Point[][][] | null;
  asPolygons<T>(transform: (x: number, y: number) => T): T[][][] | null;
  asPolygons<T>(transform?: (x: number, y: number) => T): (Point | T)[][][] | null {
    return this.type == FeatureType.POLYGON ? this.buildPolygons(transform) : null;
  }
}

// Converts a list of rings to a list of polygons.
// Exterior ring orientation is inferred from the first non-zero-area ring.
export function classifyRings(rings: Point[][]): Point[][][] {
  const len = rings.length;

  if (len <= 1) {
    return [rings];
  }

  const polygons: Point[][][] = [];
  let polygon: Point[][] | null = null;
  let ccw: boolean | undefined;

  for (let i = 0; i < len; i++) {
    const area = signedArea(rings[i]);
    if (area == 0) {
      continue;
    }

    if (ccw === undefined) {
      ccw = area < 0;
    }

    if (ccw === area < 0) {
      if (polygon) {
        polygons.push(polygon);
      }
      polygon = [rings[i]];
    } else if (polygon) {
      polygon.push(rings[i]);
    }
  }

  if (polygon) {
    polygons.push(polygon);
  }

  return polygons;
}

// Return the signed area of the polygon.
function signedArea(ring: Point[]) {
  let sum = 0;
  for (let i = 0, len = ring.length, j = len - 1; i < len; j = i++) {
    const point1 = ring[i];
    const point2 = ring[j];
    sum += (point2.x - point1.x) * (point1.y + point2.y);
  }
  return sum;
}