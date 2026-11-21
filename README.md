# vector-tile

This library reads [Mapbox Vector Tiles](https://github.com/mapbox/vector-tile-spec) and allows access to layers and features.

It is based on [`@mapbox/vector-tile`](https://www.npmjs.com/package/@mapbox/vector-tile) with the following improvements:

- **Zero-Point & Flat Geometry**: Provides `loadFlatGeometry()` and zero-`Point` `toGeoJSON()` to drastically reduce object allocations and GC pressure.
- **Modern TypeScript & Generics**: Strongly typed `Feature<Props>`, `Layer<Props>`, and `toGeoJSON<Props>()` integrating with `@types/geojson`.
- **Runtime `FeatureType`**: Exposes `FeatureType` as both a runtime object (`FeatureType.POLYGON === 3`) and TypeScript type.
- **Convenience Geometry Accessors**: Built-in `asPoints()`, `asLines()`, and `asPolygons()` with support for inline coordinate transform callbacks `(x, y) => T`.
- **Iterable Layers**: `Layer` implements `Iterable<Feature>` for natural `for (const feature of layer)` loops.
- **Uses `@protobuf-ts/runtime`**: High-performance protobuf decoding.
- **Pure ESM**: Built with Vite and tested with Vitest.

## Install

```sh
pnpm add mapbox-vector-tile
# or npm i mapbox-vector-tile
```

## Example

```ts
import { VectorTile, FeatureType } from 'mapbox-vector-tile';

// data is a Uint8Array containing binary MVT protobuf data
const tile = new VectorTile(data);

// Safely get a strongly-typed layer
const landuse = tile.getLayer<{ class: string }>('landuse');

if (landuse) {
  // Iterate features directly
  for (const feature of landuse) {
    if (feature.type === FeatureType.POLYGON) {
      // Get polygons classified with outer rings and inner holes
      const polygons = feature.asPolygons();

      // Or convert directly to GeoJSON with typed properties
      const geojson = feature.toGeoJSON(tileX, tileY, zoom);
    }
  }
}
```

## Notes

- 64-bit numbers can be returned as `number` (the default), `string`, or `bigint`. Specify via the second parameter of `VectorTile`.
- Feature IDs default to numerical strings.

## Changelog

See [CHANGELOG.md](./CHANGELOG.md) for full revision history.
