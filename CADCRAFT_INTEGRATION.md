# CADCraft reference → native Section Designer CAD

## Scope and decision

Reference: [storytold/cadcraft](https://github.com/storytold/cadcraft), inspected at
`f8b09e92e55e869a0c5199f9f447e487fde0aeda` (2026-10-30).
Reviewed the README, roadmap, Rust workspace, command registry, drawing/modify
specifications, fillet geometry, browser host bridge, release assets and licenses.

The user selected **native, progressive TypeScript integration**, not an embedded
WebAssembly workspace. This keeps one SVG canvas, project, section model and shared
undo/redo history. **This increment is not full CADCraft parity.** It adds 21 tested
commands to the previous 39, for 60 registered native commands. Existing commands
also have narrower option coverage than their CADCraft counterparts.

The official Rust/egui engine, its UI and its complete command implementations are
not bundled. The browser release was examined as an alternative, but downloading
its release asset was blocked by this environment; native integration does not
depend on that bundle or any new production dependency.

## Reference inventory

[`docs/cadcraft-command-inventory.json`](docs/cadcraft-command-inventory.json)
records 426 unique literal upstream `CommandSpec::new` registrations found before
Rust test modules. Each entry includes a source file/line and a name-based native
mapping or `not-ported` status. This static scan may omit macro-generated or dynamic
commands and does not establish that an upstream command works or that all its
options are supported here. Native name matches are explicitly labelled
`native-command-with-documented-limits`, never “full parity”.

Regenerate against a checked-out reference revision:

```sh
npm run inventory:cadcraft -- /path/to/cadcraft
```

The inventory is documentation, **not** an application command registry. Unported
commands do not appear in HELP/autocomplete and are not exposed as placeholder tools.

## Working native additions in this increment

| Command | Implemented behavior and limits |
| --- | --- |
| XLINE / XL | Infinite construction line through two points, clipped to the visible canvas for display only. |
| RAY | Semi-infinite construction line from base through a second point. |
| CIRCLED / CIRCLE.CD | Native section circle from center and diameter. `CIRCLE` accepts `D` after its center. |
| CIRCLE2P / CIRCLE.2P | Native section circle from diameter endpoints. `CIRCLE` accepts `2P` at its first prompt. |
| CIRCLE3P / CIRCLE.3P | Native circumcircle through three non-collinear points. `CIRCLE` accepts `3P`. |
| DONUT / DO / DOUGHNUT | Native annular section from inside/outside diameters and center; zero inside diameter creates a solid circle. |
| SPLINE / SPL | Catmull–Rom fit-point curve sampled at 24 segments per span and stored as a draft polyline. Enter finishes; Close makes a closed **draft**, not a section. This is not a NURBS/control-vertex editor. |
| TEXT / DT / DTEXT | Plain draft text with insertion, height and rotation. Quote text to type spaces. |
| MTEXT / MT / T | Plain multiline draft text; `\n` separates lines. No rich formatting, column layout, wrapping or font manager. |
| OFFSET / O | Retain original and create parallel copy of one two-point draft line or concentric copy of a native section circle/rectangle. Pick the side. Rectangles retain rotation. Other contours are rejected, not silently approximated. |
| TRIM / TR | Shorten one selected two-point draft line against an infinite cutting line supplied by two points; third pick identifies the part to remove. No quick-trim, fence or arbitrary curve cutting yet. |
| EXTEND / EX | Extend one selected two-point draft line to an infinite boundary supplied by two points; third pick selects the endpoint. A boundary on the shortening side fails safely. |
| FILLET / F | Two selected two-point draft lines, radius, and a kept-side pick for each line. Trim/extend both lines and add a tessellated circular fillet in one undo operation. Radius must not consume either kept line. Arc/circle/polyline fillets remain pending. |
| CHAMFER / CHA | Two selected two-point draft lines, distances from intersection, and two kept-side picks. Trim/extend and add the chamfer segment atomically. |
| JOIN / J | Join selected finite connected draft paths into one polyline, accepting reversed endpoints. Gaps, branches and incompatible selection fail without deletion. |
| EXPLODE / X | Split selected finite compound draft paths into straight segments (up to 5000). Sampled arcs/splines become their sampled segments. Never deletes section material. |
| BREAK / BR | Remove an interval between two on-segment points on one selected two-point draft line. Off-line/out-of-range points are rejected. |
| LENGTHEN / LEN | Set selected two-point draft line's total length, choosing which endpoint changes. |
| ARRAY / AR / ARRAYRECT | Rectangular copies of unlocked selection: rows, columns, signed column/row spacing. Counts include originals; at most 1000 resulting selected objects. |
| ARRAYPOLAR / ARP | Rotated copies about a center; item count includes original. Full 360° avoids duplicate last item; partial sweeps include both ends. |
| OVERKILL | Remove exact duplicate selected finite draft paths (including reversed coordinate order). Does not deduplicate structural material or repair near-coincident geometry. |

## Command workflow improvements

- Empty Enter/Space at idle repeats the last entered registered command. No project
  history entry is created until a geometry-changing command completes.
- Right-click in CAD mode acts as Enter. Outside CAD mode the browser/application
  interaction is unchanged.
- Absolute coordinates accept CADCraft-style `#x,y` as well as `x,y`.
- When a point is requested and a previous point exists, move the cursor to establish
  a direction and enter a length (with optional unit suffix) for direct-distance input.
- Added familiar `RECTANG` and `A` aliases alongside existing names.
- TEXT/MTEXT content can be quoted: Space stays a literal space until the closing
  quote; Enter completes the input. Other command prompts retain Space-as-Enter.

## Selection, persistence and engineering safety

Preselect modification targets with canvas click/Ctrl-click, window selection,
SELECT, or the component panel. Kept-side picks for FILLET/CHAMFER follow selection
order. Existing locked/associated-component restrictions remain in force.

All transforms are pure, validated project operations. One completed command is
committed once through the existing store and is undone/redone with the other
application operations. Errors and cancellation do not partially modify a drawing.

Construction lines store two finite anchors but render out to the full visible
viewport at every pan/zoom. Zoom extents uses their anchors rather than attempting
to fit infinity. Text and construction lines are drafting-only. New native circles,
annuli and rectangle offsets are real section components: adding one intentionally
adds section material, exactly like adding the same shape with existing tools.

JSON/database saves preserve the new entities. JSON import validates their metadata.
DXF exports construction lines as XLINE/RAY and plain text as rotated TEXT records.
Splines and fillet arcs remain tessellated polylines in DXF; original fit/control
metadata is not retained. Engineering/MIDAS reports remain section-only. No DWG
support or lossless external-CAD roundtrip is claimed.

The mode remains OFF by default. Turning it OFF hides its UI/listeners, cancels
pending input and restores the previous canvas/layout/grid/snaps; completed geometry
and existing section tools are preserved.

## Remaining native integration roadmap

| Area | Remaining work; not exposed as implemented |
| --- | --- |
| Drawing depth | NURBS splines/control points, polyline bulges/widths, tangent circles, remaining arc/ellipse/rectangle variants, point styles. |
| Modify depth | General curve/contour offsets, cutting-boundary object selection, quick/fence trim, curve fillets, block explode, polyline editing, align and near-geometry cleanup. |
| Layers/properties | Persistent layers, isolation/freeze/lock/plot state, by-layer colors/lineweights/linetypes and corresponding commands. |
| Precision | Intersection/tangent/perpendicular snaps, object-snap tracking, more polar increments, dynamic-input options and full transparent commands. |
| Annotation | Dimension styles and associativity, remaining DIM variants, rich MTEXT/fonts, leaders and tables. |
| Hatch/blocks | Pick-point boundary solving with islands, pattern/gradient hatch, block definitions/insertion, attributes, groups and external references. |
| Layouts/files | Paper-space viewports, plot configurations, expanded DXF entity import/export and DWG. Existing section PDF/DXF/JSON/MCT exports remain available. |
| Parametrics/3D | Constraint solver, parameters/expressions, UCS and 3D geometry/modeling. This remains a 2D section application. |
| Automation/platform | Scripts, JSON/MCP APIs, localization and desktop-only integrations. |

Future batches must extend entity serialization, rendering, selection, exports and
regression coverage together; copying command names alone does not count as a port.
CADCraft itself documents pre-alpha limitations. Its roadmap claims and feature
names are not assumed to be guaranteed functional behavior in this app.

## Verification and licensing

`npm run test:cad` includes successful execution coverage for every newly registered
command, geometry/validation tests, existing command tests, and full-application
jsdom tests for prompts, text, circle variants, trims/extensions, corner operations,
join/explode, direct-distance input, cancellation, shared undo and mode isolation.
These are DOM/math tests, not a real-browser visual or frame-rate benchmark.

See `third_party/cadcraft/LICENSE-MIT` and `third_party/cadcraft/NOTICE.md` for reference
credit. No CADCraft logo, branded image, proprietary AutoCAD asset, compiled Rust
engine or external font is copied into the application.
