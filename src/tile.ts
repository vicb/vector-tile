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
export type PropValues = string | number | boolean | bigint | null;

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

// A vector tile.
//
// Contains all the non-empty layers indexed by name.
export class VectorTile {
  // List of non-empty layers.
  readonly layers: { [key: string]: Layer } = {};

  // The constructor takes a byte buffer.
  constructor(bytes: Uint8Array, longType: LongType = "number") {
    const reader = new BinaryReader(bytes);
    const end = reader.len;
    while (reader.pos < end) {
      const tag = reader.uint32();
      if (tag >>> 3 == 3) {
        const layer = new Layer(reader, reader.uint32() + reader.pos, longType);
        if (layer.length) {
          this.layers[layer.name] = layer;
        }
      } else {
        reader.skip(tag & 7);
      }
    }
  }

  getLayer<P = Record<string, PropValues>>(name: string): Layer<P> | undefined {
    return Object.prototype.hasOwnProperty.call(this.layers, name)
      ? (this.layers[name] as unknown as Layer<P>)
      : undefined;
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
      const fieldId = tag >>> 3;
      if (fieldId == 15) {
        this.version = reader.uint32();
      } else if (fieldId == 1) {
        this.name = reader.string();
      } else if (fieldId == 5) {
        this.extent = reader.uint32();
      } else if (fieldId == 2) {
        this.featureOffsets.push(reader.pos);
        reader.skip(tag & 7);
      } else if (fieldId == 3) {
        this.keys.push(reader.string());
      } else if (fieldId == 4) {
        this.values.push(this.decodeValue());
      } else {
        reader.skip(tag & 7);
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
    let value: PropValues = null;
    while (reader.pos < end) {
      const tag = reader.uint32();
      switch (tag >>> 3) {
        case 1:
          value = reader.string();
          break;
        case 2:
          value = reader.float();
          break;
        case 3:
          value = reader.double();
          break;
        case 4:
          value = this.convertLong(reader.int64());
          break;
        case 5:
          value = this.convertLong(reader.uint64());
          break;
        case 6:
          value = this.convertLong(reader.sint64());
          break;
        case 7:
          value = reader.bool();
          break;
        default:
          reader.skip(tag & 7);
      }
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

// A feature in a layer.
export class Feature<P = Record<string, PropValues>> {
  readonly id?: string;
  readonly type: FeatureType = FeatureType.UNKNOWN;
  readonly properties: P = {} as P;

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
      const fieldId = tag >>> 3;
      if (fieldId == 1) {
        this.id = reader.uint64().toString();
      } else if (fieldId == 2) {
        const tagsEnd = reader.uint32() + reader.pos;
        const props = this.properties as unknown as Record<string, PropValues>;
        while (reader.pos < tagsEnd) {
          props[keys[reader.uint32()]] = values[reader.uint32()];
        }
      } else if (fieldId == 3) {
        this.type = reader.uint32() as FeatureType;
      } else if (fieldId == 4) {
        this.geometryOffset = reader.pos;
        reader.skip(tag & 7);
      } else {
        reader.skip(tag & 7);
      }
    }
  }

  // Lazily loads the geometry.
  loadGeometry(): Point[][] {
    if (!this.geometryOffset) {
      return [];
    }
    this.reader.pos = this.geometryOffset;

    const end = this.reader.uint32() + this.reader.pos;
    let command = 1;
    let length = 0;
    let x = 0;
    let y = 0;
    const lines: Point[][] = [];
    let line: Point[] | null = null;

    while (this.reader.pos < end) {
      if (length <= 0) {
        const commandLen = this.reader.uint32();
        command = commandLen & 0x7;
        length = commandLen >>> 3;
      }

      --length;

      if (command == Command.MoveTo || command == Command.LineTo) {
        x += this.reader.sint32();
        y += this.reader.sint32();

        if (command == Command.MoveTo) {
          if (line) {
            lines.push(line);
          }
          line = [];
        }

        line?.push(new Point(x, y));
      } else if (command == Command.ClosePath) {
        if (line) {
          line.push(new Point(line[0].x, line[0].y));
        }
      }
    }

    if (line) {
      lines.push(line);
    }

    return lines;
  }

  // Returns the bounding box of a geometry as `[xMin, yMin, xMax, yMax]`.
  bbox(): [number, number, number, number] {
    let xMin = Number.MAX_SAFE_INTEGER;
    let xMax = Number.MIN_SAFE_INTEGER;
    let yMin = Number.MAX_SAFE_INTEGER;
    let yMax = Number.MIN_SAFE_INTEGER;

    if (!this.geometryOffset) {
      return [xMin, yMin, xMax, yMax];
    }

    this.reader.pos = this.geometryOffset;

    const end = this.reader.uint32() + this.reader.pos;
    let command = 0;
    let count = 0;
    let x = 0;
    let y = 0;

    while (this.reader.pos < end) {
      if (count <= 0) {
        const commandInteger = this.reader.uint32();
        command = commandInteger & 0x7;
        count = commandInteger >>> 3;
      }

      --count;

      if (command == Command.MoveTo || command == Command.LineTo) {
        x += this.reader.sint32();
        y += this.reader.sint32();
        xMax = Math.max(x, xMax);
        xMin = Math.min(x, xMin);
        yMax = Math.max(y, yMax);
        yMin = Math.min(y, yMin);
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
    let coordinates: any;
    let type = '';

    const project = (points: Point[]): Position[] => {
      return points.map((point) => {
        const y2 = 180 - ((point.y + y0) * 360) / size;
        return [((point.x + x0) * 360) / size - 180, (360 / Math.PI) * Math.atan(Math.exp((y2 * Math.PI) / 180)) - 90];
      });
    };

    switch (this.type) {
      case FeatureType.POINT:
        type = 'Point';
        coordinates = project(this.asPoints()!);
        break;

      case FeatureType.LINESTRING:
        type = 'LineString';
        coordinates = this.asLines()!.map((line) => project(line));
        break;

      case FeatureType.POLYGON:
        type = 'Polygon';
        coordinates = this.asPolygons()!;
        coordinates.forEach((rings: Point[][], polygonIndex: number) => {
          rings.forEach((ring: Point[], ringIndex: number) => {
            coordinates[polygonIndex][ringIndex] = project(ring);
          });
        });
        break;
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
  asPoints(): Point[] | null {
    return this.type == FeatureType.POINT ? this.loadGeometry().map((points: Point[]) => points[0]) : null;
  }

  // Returns a list of lines or null if the type is not LINESTRING.
  asLines(): Point[][] | null {
    return this.type == FeatureType.LINESTRING ? this.loadGeometry() : null;
  }

  // Returns a list of polygons or null if the type is not POLYGON.
  //
  // Each polygon could be composed of one or more rings:
  // - The first ring is the exterior ring,
  // - following rings are interior rings (=holes).
  asPolygons(): Point[][][] | null {
    return this.type == FeatureType.POLYGON ? classifyRings(this.loadGeometry()) : null;
  }
}

// Converts a list of rings to a list of polygons.
// Exterior rings are detected when the area is positive.
export function classifyRings(rings: Point[][]): Point[][][] {
  const len = rings.length;

  if (len <= 1) {
    return [rings];
  }

  const polygons: Point[][][] = [];
  let polygon: Point[][] | null = null;

  for (let i = 0; i < len; i++) {
    const area = signedArea(rings[i]);
    if (area == 0) {
      continue;
    }

    if (area > 0) {
      if (polygon) {
        polygons.push(polygon);
      }
      polygon = [rings[i]];
    } else {
      polygon?.push(rings[i]);
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