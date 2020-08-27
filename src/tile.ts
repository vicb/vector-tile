// Mapbox Vector Tiles decoder.
//
// See https://github.com/mapbox/vector-tile-spec.

import { Reader } from 'protobufjs/minimal';

export class Point {
  constructor(public readonly x: number, public readonly y: number) {}
}

// A vector tile.
//
// Contains all the non-empty layers indexed by name.
export class VectorTile {
  // List of non-empty layers.
  readonly layers: { [key: string]: Layer } = {};

  private reader: Reader;

  // The constructor takes a byte buffer.
  constructor(bytes: Uint8Array | Buffer) {
    this.reader = Reader.create(bytes);
    const end = this.reader.len;
    while (this.reader.pos < end) {
      this.reader.uint32();
      const layer = new Layer(this.reader, this.reader.uint32() + this.reader.pos);
      if (layer.length) {
        this.layers[layer.name] = layer;
      }
    }
  }
}

// A layer of a vector tile.
export class Layer {
  readonly name: string = '';
  readonly version: number = 0;
  readonly extent: number = 0;
  readonly length: number;

  private featureOffsets: number[] = [];
  private reader: Reader;
  private keys: string[] = [];
  private values: Array<string | number | boolean | null> = [];

  constructor(reader: Reader, end: number) {
    this.reader = reader;

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
        reader.skipType(tag & 0x7);
      } else if (fieldId == 3) {
        this.keys.push(reader.string());
      } else if (fieldId == 4) {
        this.values.push(this.decodeValue(reader));
      }
    }

    this.length = this.featureOffsets.length;
  }

  // Returns the features at the given `index`.
  feature(index: number): Feature {
    if (index < 0 || index >= this.featureOffsets.length) {
      throw new Error('out of bounds');
    }
    this.reader.pos = this.featureOffsets[index];
    const end = this.reader.uint32() + this.reader.pos;
    return new Feature(this.reader, end, this.keys, this.values, this.extent);
  }

  private decodeValue(reader: Reader): string | number | boolean | null {
    const end = reader.uint32() + reader.pos;
    let value: string | number | boolean | null = null;
    while (reader.pos < end) {
      const tag = reader.uint32() >>> 3;
      if (tag == 1) {
        value = reader.string();
      } else if (tag == 2) {
        value = reader.float();
      } else if (tag == 3) {
        value = reader.double();
      } else if (tag == 4) {
        value = longToNumber(reader.int64() as Long);
      } else if (tag == 5) {
        value = longToNumber(reader.uint64() as Long);
      } else if (tag == 6) {
        value = longToNumber(reader.sint64() as Long);
      } else if (tag == 7) {
        value = reader.bool();
      } else {
        value = null;
      }
    }
    return value;
  }
}

export const enum FeatureType {
  UNKNOWN = 0,
  POINT = 1,
  LINESTRING = 2,
  POLYGON = 3,
}

const enum Command {
  MoveTo = 1,
  LineTo = 2,
  ClosePath = 7,
}

// A feature in a layer.
export class Feature {
  readonly id?: number;
  readonly type: FeatureType = FeatureType.UNKNOWN;
  readonly properties: { [key: string]: string | number | boolean | null } = {};

  private geometryOffset = 0;
  private reader: Reader;

  constructor(
    reader: Reader,
    end: number,
    keys: string[],
    values: Array<string | number | boolean | null>,
    public readonly extent: number,
  ) {
    this.reader = reader;
    while (reader.pos < end) {
      const tag = reader.uint32();
      const fieldId = tag >> 3;
      if (fieldId == 1) {
        this.id = longToNumber(reader.int64() as Long);
      } else if (fieldId == 2) {
        const end = reader.uint32() + reader.pos;
        while (reader.pos < end) {
          const key = keys[reader.uint32()];
          const value = values[reader.uint32()];
          this.properties[key] = value;
        }
      } else if (fieldId == 3) {
        this.type = reader.uint32();
      } else if (fieldId == 4) {
        this.geometryOffset = reader.pos;
        reader.skipType(tag & 0x7);
      }
    }
  }

  // Lazily loads the geometry.
  loadGeometry(): Point[][] {
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
    this.reader.pos = this.geometryOffset;

    const end = this.reader.uint32() + this.reader.pos;
    let command = 0;
    let count = 0;
    let x = 0;
    let y = 0;
    let xMin = Number.MAX_SAFE_INTEGER;
    let xMax = Number.MIN_SAFE_INTEGER;
    let yMin = Number.MAX_SAFE_INTEGER;
    let yMax = Number.MIN_SAFE_INTEGER;

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
  toGeoJSON(x: number, y: number, zoom: number): unknown {
    const size = this.extent * Math.pow(2, zoom);
    const x0 = this.extent * x;
    const y0 = this.extent * y;
    let coordinates: any;
    let type = '';

    const project = (points: Point[]): Array<[number, number]> => {
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

      case 3:
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

    const result: any = {
      type: 'Feature',
      geometry: {
        type,
        coordinates,
      },
      properties: this.properties,
    };

    if (this.id != null) {
      result.id = this.id;
    }

    return result;
  }

  // Returns a list of points or null if the type is not POINT.
  asPoints(): Point[] | null {
    const points = this.loadGeometry().map((points: Point[]) => points[0]);
    return this.type == FeatureType.POINT ? points : null;
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

// Convert a long to a number.
function longToNumber(long: Long | number): number {
  if (typeof long === 'number') {
    return long;
  }
  if (long.gt(Number.MAX_SAFE_INTEGER)) {
    throw new globalThis.Error('Value is larger than Number.MAX_SAFE_INTEGER');
  }
  return long.toNumber();
}
