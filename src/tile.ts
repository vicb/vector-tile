// Mapbox Vector Tiles decoder.
//
// See https://github.com/mapbox/vector-tile-spec.

import { BinaryReader, PbLong, PbULong } from '@protobuf-ts/runtime';

export type LongType = "number" | "string" | "bigint";
export type PropValues = string | number | boolean | bigint | null;

export class Point {
  constructor(public readonly x: number, public readonly y: number) { }
}

// A vector tile.
//
// Contains all the non-empty layers indexed by name.
export class VectorTile {
  // List of non-empty layers.
  readonly layers: { [key: string]: Layer } = {};

  private reader: BinaryReader;

  // The constructor takes a byte buffer.
  constructor(bytes: Uint8Array | Buffer, private longType: LongType = "number") {
    this.reader = new BinaryReader(bytes);
    const end = this.reader.len;
    while (this.reader.pos < end) {
      this.reader.uint32();
      const layer = new Layer(this.reader, this.reader.uint32() + this.reader.pos, this.longType);
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
  private keys: string[] = [];
  private values: Array<PropValues> = [];

  constructor(private reader: BinaryReader, end: number, private longType: LongType) {

    while (reader.pos < end) {
      const [fieldId, wireType] = reader.tag();
      if (fieldId == 15) {
        this.version = reader.uint32();
      } else if (fieldId == 1) {
        this.name = reader.string();
      } else if (fieldId == 5) {
        this.extent = reader.uint32();
      } else if (fieldId == 2) {
        this.featureOffsets.push(reader.pos);
        reader.skip(wireType);
      } else if (fieldId == 3) {
        this.keys.push(reader.string());
      } else if (fieldId == 4) {
        this.values.push(this.decodeValue());
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

  private decodeValue(): PropValues {
    const reader = this.reader;
    const end = reader.uint32() + reader.pos;
    let value: PropValues = null;
    while (reader.pos < end) {
      const [fieldId] = reader.tag();
      if (fieldId == 1) {
        value = reader.string();
      } else if (fieldId == 2) {
        value = reader.float();
      } else if (fieldId == 3) {
        value = reader.double();
      } else if (fieldId == 4) {
        value = this.convertLong(reader.int64());
      } else if (fieldId == 5) {
        value = this.convertLong(reader.uint64());
      } else if (fieldId == 6) {
        value = this.convertLong(reader.sint64());
      } else if (fieldId == 7) {
        value = reader.bool();
      } else {
        value = null;
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
  readonly id?: string;
  readonly type: FeatureType = FeatureType.UNKNOWN;
  readonly properties: { [key: string]: PropValues } = {};

  private geometryOffset = 0;

  constructor(
    private reader: BinaryReader,
    end: number,
    keys: string[],
    values: Array<PropValues>,
    public readonly extent: number,
  ) {
    while (reader.pos < end) {
      const [fieldId, wireType] = reader.tag();
      if (fieldId == 1) {
        this.id = reader.int64().toString();
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
        reader.skip(wireType);
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