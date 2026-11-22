# Changelog

All notable changes to this project will be documented in this file.

## 1.1.0

- Added direct geographic coordinate accessors `Feature.toGeoPoints(x, y, zoom)`, `Feature.toGeoLines(x, y, zoom)`, and `Feature.toGeoPolygons(x, y, zoom)` returning WGS84 coordinates without GeoJSON wrapper allocations.
- Added fast geographic bounding box accessor `Feature.geoBbox(x, y, zoom)` returning `[minLon, minLat, maxLon, maxLat]` in $O(1)$ time by projecting bounding corners.
- Cached bounding box (`_bbox`) during geometry decoding (`readGeometry()`), enabling instant $O(1)$ `bbox()` and `geoBbox()` lookups after calling `loadGeometry`, `loadFlatGeometry`, `as*`, or `toGeo*`.
- Refactored `toGeoJSON()` to delegate internally to direct geographic coordinate accessors.
- Fixed `buildPolygons()` / `asPolygons()` to return an empty array `[]` instead of `[[]]` when a polygon feature contains no rings.

## 1.0.0

- Added generic property types for `VectorTile.getLayer<P>()`, `Layer.feature<P>()`, and `Feature.toGeoJSON<P>()`.
- Exported runtime `FeatureType` object alongside TypeScript union types.
- Made `Layer` iterable with `for (const feature of layer)` and `Array.from()`.
- Added inline coordinate transform callbacks `(x, y) => T` to geometry accessors (`loadGeometry`, `asPoints`, `asLines`, `asPolygons`).
- Added `Feature.loadFlatGeometry()` returning packed coordinates for WebGL and worker buffers.
- Hardened spec compliance and validation: layer bounds verification, integer index checks, bounded `ClosePath` commands, and prototype pollution protection.
- Reduced GC pressure with zero-`Point` GeoJSON projection, cached bounding boxes, and scratch buffer recycling.
- Optimized polygon area and bounding box calculations for CPU and register reuse.
- Migrated build and test toolchain to Vite (pure ESM output) and Vitest.
- Reorganized codebase into focused modules with colocated unit tests in `src/`.

## 0.3.0 - Oct 22, 2020

- Switch to [protobuf-ts](https://github.com/timostamm/protobuf-ts).
