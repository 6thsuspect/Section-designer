# Optional AutoCAD-style drawing mode

Use **AutoCAD Mode ON/OFF** in the top toolbar. It is **OFF on startup**; this is an
AutoCAD-inspired interface, not an Autodesk product or an AutoCAD file interpreter.

## Isolation and layout

- ON reveals a shortcut strip and command window immediately below the canvas.
  The existing results panel is hidden (not unmounted) to reclaim drawing space.
- OFF cancels incomplete input, removes all CAD UI/shortcuts, restores the previous
  viewport/grid/OSNAP state, and reveals the original results panel at its prior size.
  Completed geometry is never deleted by a mode change.
- Drag the command window's top edge to resize, or focus the separator and use
  Up/Down. Use **−/+** to collapse/expand and **Float/Dock** to move it between the
  canvas bottom and a floating lower-right window. Free dragging to arbitrary
  positions is not implemented. History is scrollable, color-coded and bounded.
- The existing SVG viewport has no drawing-sheet edge. Wheel zoom is cursor-anchored;
  middle-button or Shift+left drag pans. Fit includes both section and draft geometry.
  CAD `ZOOM` also provides Extents, In, Out and Reset. Coordinate entry is guarded
  to ±1e12 for numerical safety; wheel zoom retains the existing precision guards.

## Command workflow

Enter a command or alias, then answer the displayed prompts one at a time. Examples:

```text
REC
0,0
100,50

CIRCLE
50,50
25

LINE
0,0
@100<45
@50,0
[Enter to finish]
```

- Coordinates: absolute `x,y`, planar `x,y,0`, relative `@dx,dy`, polar `@distance<angle`.
  X points right, Y up, angles are counterclockwise degrees. Nonzero Z is rejected.
- Lengths default to project units. Explicit `mm`, `cm`, `m`, `inch`/`in`, `ft` suffixes
  are converted, e.g. `@1m,25mm`. Angles/counts/scale factors reject length suffixes.
- While a point is requested, click the canvas or type a coordinate. Circle/polygon
  radius and ellipse semi-axes can also be picked on the canvas. Previews do not
  mutate the project. ORTHO/POLAR/grid SNAP constrain **mouse** input; explicit
  typed coordinates are authoritative.
- Selection-window corners (including SELECT and STRETCH window/CP acquisition)
  follow the actual cursor, bypassing drawing ORTHO/POLAR/grid/object snaps.
  Selection never toggles those settings; ORTHO resumes for drawing or modify
  displacement points after selection. Idle Window/Crossing drags remain free.
- LINE/PLINE: continue adding points; `Undo` removes the last pending point;
  `Close`/`C` or snapping to the first point closes the path exactly. The initial
  endpoint gets a green square snap marker, even with ORTHO enabled. Confirmed
  vertices draw solid; only the next segment is rubber-banded. Enter or Escape
  finishes confirmed LINE/PLINE geometry as an open path (at least two points).
  CANCEL or switching mode off discards the pending path. Each completed command is one shared undo operation.
- Space submits the current command or parameter just like Enter, including finishing
  an open path. This applies only to CAD command input, not other application fields.
- Typing command initials opens a selectable suggestion list showing full command
  names, aliases and help. Click a row or use Up/Down and Enter/Space; exact aliases
  take priority, and partial names accept the first match. Tab cycles completions.
  Up/Down recalls submitted inputs when no suggestions are open. HELP lists only
  implemented commands, aliases and parameter conventions. Clear clears output.
- F3 toggles OSNAP, F7 grid, F8 ortho, F10 45° polar tracking while CAD is ON.
  Function keys leave other text inputs alone. Existing Ctrl+Z/Y work outside
  text editing; command input retains native text undo. Use UNDO/REDO or the
  shortcut strip for project history while typing. SAVE/OPEN and Ctrl+S/O in the
  command window use the existing dialogs.
- CAD point picking snaps to endpoints/vertices, midpoints, centers and nearest
  outline edges. GRIDSPACING controls grid and grid-snap spacing. Intersection
  snaps and configurable polar increments are not included in this increment.

## Implemented commands

| Category | Commands / aliases |
| --- | --- |
| Drawing | LINE/L, PLINE/PL, RECTANGLE/REC, CIRCLE/C, ELLIPSE/EL, POLYGON/POL, ARC, POINT/PO |
| Modification | MOVE/M, COPY/CO, ROTATE/RO, SCALE/SC, STRETCH/S, MIRROR/MI, ERASE/E, BOUNDARY/BO |
| Selection / measurement | SELECT (ALL, NONE, ID or WINDOW + corners), LIST, AREA, DIST, ID, DIM (DIMLINEAR/DLI), DIMALIGNED/DAL |
| View / precision | ZOOM/Z, PAN (drawing-space displacement), GRID, GRIDSPACING, OSNAP, ORTHO, SNAP, POLAR, UNITS |
| Project / utility | UNDO/U, REDO, REGEN, SAVE, OPEN, HELP, CANCEL/ESC |

ELLIPSE uses a center followed by horizontal and vertical **semi-axis** lengths.
POLYGON uses side count, center and circumradius; its first vertex is on +X.
ARC uses start, a point on the arc, then end, and is approximated by up to 256
segments per revolution. MIRROR retains originals and creates polygonal copies
(curves are tessellated); MOVE/COPY/ROTATE/SCALE preserve analytic primitives.
AREA reports each selected component's area and approximate outline perimeter,
not the boolean union of the selection.

## Stretch and dimension workflow

- **STRETCH / S:** enter two crossing-window corners, a base point, then the
  destination (or `@dx,dy` displacement from the base). Alternatively type `CP`
  at the first prompt, pick/type polygon vertices, then Enter to finish selection
  before specifying base and destination. `U` undoes a polygon vertex. Vertices
  on or inside the crossing area move; vertices outside stay put. Fully enclosed objects translate.
  Partially stretched rectangles/triangles become editable custom-shape polygons.
  Partial stretching supports coordinate-defined plates, multi-ring custom sections,
  combined plate groups and draft line/polyline vertices. Shared plate edges are
  split at their junctions so a web endpoint on a flange edge belongs to both
  boundaries. Combined groups are rebuilt from updated source plates, preserving
  their IDs and nesting; Uncombine returns the latest stretched coordinates.
  Curved/hollow analytic primitives and arcs must be fully enclosed to translate;
  associated components still require the existing component tools. Empty windows,
  zero displacement and self-crossing results fail without changing the project.
  Green vertex markers show the actual selected mask. The blue geometry preview
  uses the same pure operation as confirmation, leaving originals untouched;
  Escape cancels. Confirmation is one shared undo/redo step.
- **SCALE / SC:** select objects, specify a base point and a positive factor.
- **DIM / DIMLINEAR / DLI:** two extension origins, then the dimension-line
  location. Placement chooses horizontal or vertical measurement.
- **DIMALIGNED / DAL:** the same prompts, measuring true distance along the segment.
- Dimensions show extension lines, a dimension line, end ticks and a measured label,
  with a live placement preview. They are selectable/draggable, support shared
  undo/redo and transforms, and persist in JSON/database saves. DXF exports their
  visible line/text primitives on the DIMENSIONS layer, not editable native DXF
  DIMENSION records. They are **non-associative** annotations: moving a separately
  dimensioned object does not automatically move its dimension origins. They never
  contribute engineering area or stiffness or appear in MIDAS boundaries/reports.

## Data and engineering safety

- Rectangles, circles, ellipses, regular polygons and **BOUNDARY-converted PLINEs** are ordinary
  section components: existing mouse editing, properties, boolean operations,
  JSON, PDF, Excel, CSV, DXF and MIDAS exports apply normally. Self-crossing closed
  PLINE boundaries are rejected. Existing CG-origin alignment, if enabled,
  continues to control the section reference frame.
- Lines, open/closed polylines, arcs and points are CAD entities in the same
  project and undo snapshots. They are selectable, draggable, and command-editable,
  including after mode changes. A valid closed LINE/PLINE loop automatically
  becomes one filled closed polyline with a stored `region: { fill: "solid", area }`.
  AREA/LIST reports its geometric area in project units squared. Open paths and
  invalid/self-intersecting loops are never filled. Fill uses the canvas theme;
  the original boundary remains the snapping/editing geometry.
  CAD regions contribute **no engineering area or stiffness** until explicitly
  converted with BOUNDARY or Combine. JSON/database saves preserve the region;
  DXF writes the closed boundary on DRAFT plus SOLID fill triangles on SD_REGION_FILL.
- PLINE/PL/POLYLINE always creates one shared-model polyline entity. A closed
  path stores `closed: true` and unique vertices; rendering/snapping supplies the
  closing edge. JSON retains closure and DXF POLYLINE exports flag 70=1.
  Closing LINE also creates one closed polyline region rather than disconnected
  segments. JOIN recognizes a closed chain of separately created draft segments
  and creates the same filled region. Existing valid legacy repeated-endpoint
  paths are recognized too; self-crossing legacy paths retain only their outline.
  Existing saved closed section components are not migrated or duplicated.
- Combine accepts valid closed CAD regions alongside existing section plates.
  It uses the same source-plate model, preserving IDs and only a provenance tag
  (not a duplicate drawing). Uncombine restores those sources as filled CAD paths
  with their latest coordinates and recalculated area, so OFFSET/TRIM and other
  draft-path commands still work afterward. Open/invalid paths cannot be combined.
- BOUNDARY converts one selected, closed draft path into a section component.
  This explicit conversion replaces the earlier automatic PLINE-to-section step,
  preserving editable CAD paths without accidentally adding engineering area.
- OFFSET supports straight-edge open/closed polylines with mitered joins, retaining
  the source. Collapsed, reversed or self-crossing offsets are rejected. TRIM
  supports a line cutting a polyline, with a picked side to remove. A trimmed
  closed polyline becomes one open polyline with the same ID (no artificial
  closing edge). Cuts leaving multiple disconnected chains are rejected; split
  complex paths first. EXPLODE includes the closing edge.
- Locked components are excluded from modifications. A stretch that would detach
  a connected locked plate is rejected. Associated bolt deductions still require
  the existing component tools. Parent-only boundary edits (such as Delete Void)
  must be uncombined before STRETCH/transform, rather than silently restoring
  stale source material.
- Combined plate groups support MOVE/COPY/ROTATE/SCALE/MIRROR with synchronized
  sources; copies receive new group and source IDs. OFFSET/TRIM retain their
  documented draft-path/analytic-section target limits; their algorithms are unchanged.
- The optional combined source frame preserves parent movement/rotation when
  uncombining. Older saved groups recover their original frame on demand; JSON
  preserves the new metadata without a schema migration.
- Old projects need no migration: `drawingEntities` is optional. JSON import validates
  new draft paths and rejects malformed points, unsupported kinds and duplicate IDs.

## Native CADCraft-style expansion

A first native integration batch now adds construction lines/rays, circle variants,
fit-point splines, plain text, donuts, offsets, line trim/extend, line fillet/chamfer,
join/explode, break/lengthen, rectangular/polar arrays and exact draft deduplication.
Blank Enter/Space repeats commands, right-click acts as Enter, `#x,y` is accepted,
and direct-distance input follows the current cursor direction.

See [CADCRAFT_INTEGRATION.md](CADCRAFT_INTEGRATION.md) for exact supported options,
limits, source credit and the remaining layers/blocks/hatch/annotation/layout/3D
roadmap. This remains progressive native integration, not full CADCraft parity.
Unported commands such as HATCH are absent from the runtime registry and suggestions.

## Files and verification

- `src/engine/cad.ts`: registry, coordinate/unit parsing, geometry creation,
  three-point arcs, immutable transformations and geometric validation.
- `src/components/CadCommands.tsx`: command sessions, project/view adapters,
  sequential prompts, history/autocomplete, shortcut strip and resizable panel.
- `src/components/CadDimension.tsx`: shared linear/aligned annotation rendering.
- `src/components/Canvas.tsx`: optional mouse point interception, cached snap
  geometry, previews and drafting path selection/dragging.
- `src/app/page.tsx`, `src/components/Toolbar.tsx`: optional mode and layout restoration.
- `src/store/useStore.ts`: extend existing single/batch deletion to draft entities.
- `src/engine/types.ts`, `src/engine/exporters.ts`: optional draft persistence,
  import validation and DXF output without changing section-property calculations.
- `scripts/verify-cad.mts`: parsing/math/geometry/export tests.
- `scripts/verify-cad-ui.tsx`: full application mounted in jsdom; mode isolation,
  keyboard and mouse input, prompts, validation recovery, drawing, modification,
  undo/redo, cancellation, fit, collapse, resize and floating controls.

The `test:cad` suite now also runs `scripts/verify-cad-extended.mts`.

Run `npm run test:cad`, `npm run test:engineering`, `npm run test:midas`, and
`npm run typecheck`. The production build requires the existing `DATABASE_URL`
configuration; build-time route collection was checked with a dummy local URL,
not a live database. jsdom tests exercise DOM behavior, not real-browser rendering
or a large-drawing frame-rate benchmark.

Targeted lint passes for the new command engine, UI, tests and canvas integration.
Full-project lint still reports pre-existing hook issues in `SaveLoadDialog.tsx`
and `useStore.ts`, plus the existing font warning in `layout.tsx`.

## Closed CAD-region fill and editing

Fill and area are derived from the single canonical boundary on creation,
transforms, STRETCH, OFFSET, JOIN, direct canvas edits and JSON load/save. TRIM or
EXPLODE that opens a boundary removes its region metadata; it does not leave a
stale fill. STRETCH previews the changed region without altering the original.
Undo/Redo restores geometry, area and group provenance together.

R12 DXF has no HATCH entity: filled CAD regions export non-overlapping SOLID
triangles plus their editable closed POLYLINE and FILLMODE=1. On reimport, this
application uses the authoritative outline and ignores only its own SD_REGION_FILL
triangles, avoiding duplicate area. Imported closed boundaries become ordinary
filled section components, following the existing DXF import workflow. Combined
section holes export true outer/void rings instead of self-touching keyhole bridges;
validated legacy bridge-encoded section files remain importable.
