# vector-tile

This library reads [Mapbox Vector Tiles](https://github.com/mapbox/vector-tile-spec) and allows access to the layers and features.

It is based on [`@mapbox/vector-tile`](https://www.npmjs.com/package/@mapbox/vector-tile) with the following differences:
- this library does not depend on [`@mapbox/point-geometry`](https://www.npmjs.com/package/@mapbox/point-geometry),
- this library uses [`protobufjs`](https://www.npmjs.com/package/protobufjs) to decode protos. It is the same as what [`ts-proto`](https://www.npmjs.com/package/ts-proto) uses to enable code sharing,
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
