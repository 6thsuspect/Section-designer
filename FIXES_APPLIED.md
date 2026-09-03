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

## Round 2 – Features & Fixes (this release)

### Custom shape editing (Edit Coordinates)
- `CustomShapeDialog` now supports an edit mode: view all points, modify X/Y,
  add/delete points, reorder points (▲/▼), and Apply.
- Edits update the existing `custom-shape`/`polygon` component in place via
  `updateComponent` — the drawing and all section properties recalculate
  immediately. No duplicate geometry is created.
- Entry points: Geometry tab "Edit Coordinates" button and the ✏️ button on
  custom-shape items in the Components panel.
- Invalid cells are highlighted per row; ≥ 3 valid points are enforced.

### Section dragging / cursor synchronization
- Root cause: `svgToWorld` assumed the SVG viewBox filled the element rect,
  but `preserveAspectRatio="xMidYMid meet"` letterboxes it — producing a
  cursor offset of up to ~387 world units on a typical non-square canvas.
- The transform now uses the true uniform scale + centering offsets, and pan
  deltas use the same scale. Zoom-at-cursor is exact as well.
- Pointer events with pointer capture keep drags tracking outside the canvas;
  each drag produces a single undo entry (`pushUndoSnapshot` + history:false).

### Resizable panels
- Left panel, right panel, and bottom panel are resizable via edge handles
  (col/row resize cursors, pointer capture, min/max clamps). Collapse toggles
  and the default layout are unchanged.

### Extended section properties
- `SectionProperties` extended with: It, Iu, Iv, iu, iv, Wu±, Wv±, Wpl,u,
  Wpl,v, au±, av±, u/v extremes, and equal-area axes yP, zP, uP, vP.
- All computed from geometry in `geometry.ts`: principal-frame extremes from
  transformed outlines; plastic moduli and equal-area axes via signed strip
  integration (even-odd chords, add/subtract components); It from exact
  closed forms (circle/hollow circle/ellipse), the classic rectangle series
  (and rectangle decompositions for I/T/L/channel, Bredt for tubes), and the
  A⁴/(40·Ip) solid-section approximation for arbitrary polygons.
- Fixed `rotateInertia`: it used the axis-rotation formula while all call
  sites pass the shape's CCW rotation, mirroring Ixy and hence the principal
  angle for rotated components. Verified against ground-truth vertex
  integration.
- Properties panel shows the full Y-Z / U-V property list with
  Symbol | Name | Value | Unit.

### PDF report
- Logo in the header (rasterized from `public/logo.svg` at export time),
  metadata block, section drawing now shows principal U/V axes, per-component
  vertex coordinate tables, and the complete 28-property table with symbols
  and units. Existing components/trace/stress sections preserved.

### DXF export (empty-file fix)
- Files were version-less and used LWPOLYLINE (R14+), so strict viewers read
  them as R12 and dropped every entity — empty drawings.
- The generator now emits an R12-compatible file: `$ACADVER AC1009`,
  `$EXTMIN/$EXTMAX` (zoom extents works on open), an LTYPE table for
  CONTINUOUS/CENTER/DASHDOT, and POLYLINE/VERTEX/SEQEND boundaries.
  Validated with `ezdxf` (audit: 0 errors).

### Interactive XLSX
- Workbook rebuilt formula-driven: editable vertex table (Input Geometry) →
  per-component shoelace formulas (Component Calculations) → composite
  parallel-axis assembly (Section Properties) → principal-frame u/v vertex
  transform for the U/V moduli (Principal Coordinates).
- Editing any X/Y input recalculates A, centroid, Iy/Iz/Iyz, α, Iu/Iv,
  radii of gyration, Wu±/Wv±, au±/av± natively in Excel. `fullCalcOnLoad`
  is set; inputs are amber-shaded; panes frozen; units throughout.
- Documented limitation (Notes sheet): Wpl,u/v and yP/zP/uP/vP need a
  numeric root-solve that is impractical in native formulas, so those six
  values are exported as computed by the app and annotated.
- Formula chain machine-verified against the app engine (Python `formulas`).

### Dark / Light mode
- Toolbar toggle (sun/moon) switches the existing theme variables instantly.
- All app settings persist in `localStorage` (`section-designer-settings`)
  and are restored on load; Settings dialog stays in sync.

### AutoCAD-style rectangular selection
- Left-drag on empty canvas draws a selection rectangle: right-to-left =
  Crossing (dashed green, inside-or-touching), left-to-right = Window (solid
  blue, fully inside). Live W×H readout; Esc cancels; plain click still
  deselects; locked components are not selectable.
- Multi-select supported: store keeps `selectedIds` (primary selection
  semantics unchanged), Delete removes the whole selection in one undo step.
- Pan (middle / Shift+drag) and component dragging are unaffected.

### Logo / branding
- `public/logo.svg` is the single replaceable brand asset used by the
  toolbar, About dialog, favicon (`layout.tsx` metadata) and the PDF header.
  Replace the file to rebrand — no code changes required.

### Regression & validation
- Engine verification suite (`scripts/verify-properties.mts`, 77 checks):
  rectangle hand-values (A, centroid, I, radii, moduli, plastic moduli,
  equal-area axes), symmetric I-section (Iyz≈0, α≈0), asymmetric triangle
  (principal invariants vs Monte-Carlo ∫v²dA), rotated rectangle, sections
  with holes, circle torsion, equal-leg angle (α≈45°, Iuv≈0). All pass.
- `tsc --noEmit` clean; `next build` succeeds (needs `DATABASE_URL` env as
  before); lint unchanged from the pre-existing baseline.

## Important note
The source package could not be fully dependency-built in the sandbox because `npm install` did not complete within the available environment. The source changes were applied directly to the supplied project. Run `npm install` and then `npm run typecheck` / `npm run build` locally before deployment.

