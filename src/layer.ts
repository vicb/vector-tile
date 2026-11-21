import type { BinaryReader, PbLong, PbULong } from '@protobuf-ts/runtime';

import { LayerTag, ValueTag, WIRE_TYPE_MASK } from './constants';
import { Feature } from './feature';
import type { LongType, PropValues } from './types';

/**
 * Represents a single layer within a Mapbox Vector Tile.
 *
 * Implements `Iterable<Feature<P>>`, allowing direct iteration with `for..of` or `Array.from()`.
 *
 * @typeParam P - Shape of the feature properties object within this layer.
 */
export class Layer<P = Record<string, PropValues>> implements Iterable<Feature<P>> {
  /** Name of the layer. */
  readonly name: string = '';
  /** Vector tile specification version of the layer (typically 2). */
  readonly version: number = 1;
  /** Tile coordinate extent (grid resolution, typically 4096). */
  readonly extent: number = 4096;
  /** Number of features in the layer. */
  readonly length: number;

  private featureOffsets: number[] = [];
  private keys: string[] = [];
  private values: Array<PropValues> = [];

  constructor(
    private reader: BinaryReader,
    end: number,
    private longType: LongType,
  ) {
    while (reader.pos < end) {
      const tag = reader.uint32();
      if (tag == LayerTag.Features) {
        const featLenPos = reader.pos;
        const featLen = reader.uint32();
        if (reader.pos + featLen > end) {
          throw new Error('feature extends past layer end');
        }
        this.featureOffsets.push(featLenPos);
        reader.pos = featLen + reader.pos;
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

  /**
   * Returns the feature at the specified index.
   *
   * @typeParam FP - Override for the feature property type.
   * @param index - 0-based index of the feature in this layer.
   * @throws Error if the index is out of bounds (`< 0` or `>= length`).
   * @returns The decoded Feature instance.
   */
  feature<FP = P>(index: number): Feature<FP> {
    if (!Number.isInteger(index) || index < 0 || index >= this.length) {
      throw new Error('out of bounds');
    }
    this.reader.pos = this.featureOffsets[index];
    const end = this.reader.uint32() + this.reader.pos;
    return new Feature<FP>(this.reader, end, this.keys, this.values, this.extent);
  }

  /**
   * Returns an iterator over all features in the layer.
   */
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
      case 'number':
        return long.toNumber();
      case 'string':
        return long.toString();
      case 'bigint':
        return long.toBigInt();
    }
  }
}
