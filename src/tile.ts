import { BinaryReader } from '@protobuf-ts/runtime';

import { TileTag, WIRE_TYPE_MASK } from './constants';
import { Layer } from './layer';
import type { LongType, PropValues } from './types';

let textDecoder: TextDecoder | undefined;

/**
 * Represents a decoded Mapbox Vector Tile (MVT).
 *
 * Contains all non-empty layers parsed from the protobuf payload.
 */
export class VectorTile {
  /** Map of non-empty layers indexed by layer name. */
  readonly layers: { [key: string]: Layer } = Object.create(null);

  /**
   * Decodes a vector tile from a binary protobuf buffer.
   *
   * @param bytes - The raw vector tile protobuf byte buffer.
   * @param longType - How to decode 64-bit integers (`"number"`, `"string"`, or `"bigint"`). Defaults to `"number"`.
   */
  constructor(bytes: Uint8Array, longType: LongType = 'number') {
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

  /**
   * Retrieves a layer by name, safely typed with the specified feature property interface.
   *
   * @typeParam P - Shape of the feature properties object for this layer.
   * @param name - The name of the layer.
   * @returns The matching Layer instance, or `undefined` if the layer does not exist.
   */
  getLayer<P = Record<string, PropValues>>(name: string): Layer<P> | undefined {
    return this.layers[name] as unknown as Layer<P> | undefined;
  }
}
