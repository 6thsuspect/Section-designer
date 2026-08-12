# Section Designer – Export & Custom Shape Fixes

## Applied fixes

### PDF export
- Updated `jspdf-autotable` integration to use the supported `autoTable(doc, options)` API.
- Removed reliance on `doc.autoTable` plugin mutation.
- Improved PDF export error reporting.

### DXF export
- Added a dedicated `CUTOUT` layer for subtractive components.
- Hardened LWPOLYLINE generation against duplicate/invalid points.
- Increased coordinate precision to 6 decimals.
- Added a minimum text height so small sections do not generate zero-size annotations.
- Corrected overall dimension coordinates so component outlines and dimensions use the same world coordinate system without double-applying the centroid.
- Improved DXF error reporting.

### Custom coordinate shape
- Added a dedicated `custom-shape` component type.
- Custom coordinate shapes use the existing polygon mathematics internally, but are no longer stored/displayed as the generic `polygon` component type.
- Removed the React state race condition caused by `addComponent()` followed by `setTimeout()` and a stale `store.project` lookup.
- Added `addCustomShape()` to the store so the component is created atomically.
- Preserved the exact coordinates entered by the user.
- Removed the previous incorrect vertex-average centering. The geometry engine now calculates the true polygon centroid from the supplied coordinates.
- QA validation and geometry dispatch support both legacy `polygon` and new `custom-shape` components.

## Important note
The source package could not be fully dependency-built in the sandbox because `npm install` did not complete within the available environment. The source changes were applied directly to the supplied project. Run `npm install` and then `npm run typecheck` / `npm run build` locally before deployment.
