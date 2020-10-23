# vector-tile

This library reads [Mapbox Vector Tiles](https://github.com/mapbox/vector-tile-spec) and allows access to the layers and features.

It is based on [`@mapbox/vector-tile`](https://www.npmjs.com/package/@mapbox/vector-tile) with the following differences:
- this library does not depend on [`@mapbox/point-geometry`](https://www.npmjs.com/package/@mapbox/point-geometry),
- this library uses [`protobuf-ts`](https://github.com/timostamm/protobuf-ts) to decode protos,
- this library is written in [TypeScript](https://www.typescriptlang.org/),
- this library provides `Feature.asPoint()`, `Feature.asLine()`, `Feature.asPolygon()` to make it easier to work with geometries.

## Install

```
npm i --save mapbox-vector-tile
```

## Example

```js
import { VectorTile } from 'mapbox-vector-tile';

// data is either a Buffer or a Uint8Array containing binary data.
const tile = new VectorTile(data);

// Contains a map of all layers
tile.layers;

const landuse = tile.layers.landuse;

// Amount of features in this layer
landuse.length;

// Returns the first feature
landuse.feature(0);
```

## Notes

- 64-bit numbers could be returned as number (the default), string or bigint.
  You can specify the format using the second parameter of `VectorTile`.
- The features id are always returned as a numerical string.

## Changes 

0.3.0 - Oct 22, 2020

- Switch to [protobuf-ts](https://github.com/timostamm/protobuf-ts).
