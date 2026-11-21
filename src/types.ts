import type {
  Feature as GeoJSONFeature,
  LineString as GeoJSONLineString,
  MultiLineString as GeoJSONMultiLineString,
  MultiPoint as GeoJSONMultiPoint,
  MultiPolygon as GeoJSONMultiPolygon,
  Point as GeoJSONPoint,
  Polygon as GeoJSONPolygon,
} from 'geojson';

/**
 * Representation format for 64-bit integer values decoded from protobuf messages.
 * - `"number"`: Converts to JavaScript `number` (safe up to 2^53 - 1).
 * - `"string"`: Converts to decimal string representation without precision loss.
 * - `"bigint"`: Converts to native JavaScript `bigint`.
 */
export type LongType = 'number' | 'string' | 'bigint';

/**
 * Permitted primitive types for decoded vector tile feature property values.
 */
export type PropValues = string | number | boolean | bigint;

/**
 * A 2-element coordinate pair `[x, y]` representing a 2D point or vertex.
 */
export type Coord2D = [number, number];

/**
 * Flat representation of decoded feature geometries for high-performance processing and minimal GC allocation.
 */
export interface FlatGeometry {
  /** Flat array of alternating x and y coordinates: `[x0, y0, x1, y1, ...]`. */
  readonly coords: number[];
  /** Array of end indices in `coords` marking the end of each ring or component. */
  readonly ends: number[];
}

/**
 * Supported GeoJSON geometry types produced by `Feature.toGeoJSON()`.
 */
export type GeoJSONFeatureGeometry =
  GeoJSONPoint | GeoJSONMultiPoint | GeoJSONLineString | GeoJSONMultiLineString | GeoJSONPolygon | GeoJSONMultiPolygon;

/**
 * Re-export of standard GeoJSON `Feature` type.
 */
export type { GeoJSONFeature };
