# Section Designer

**Draw. Analyse. Design.**

Section Designer is a web-based structural engineering tool for
creating, analysing, and documenting arbitrary cross-sections. It is
intended for engineers who need quick section-property calculations,
custom coordinate-defined geometry, standard steel sections, stress
analysis, and engineering report exports.

> **Status:** Active development\
> **Application type:** Web application\
> **Primary stack:** Next.js + React + TypeScript + Tailwind CSS

------------------------------------------------------------------------

## Features

### Section creation

Create sections using:

-   Rectangle
-   Circle
-   Triangle
-   Polygon
-   Custom coordinate-defined shape
-   I-section
-   T-section
-   L-section
-   Channel
-   Box section
-   Hollow circle
-   Hollow rectangle
-   Ellipse
-   Standard Indian steel sections

Components can be:

-   Added to the section
-   Subtracted as cut-outs
-   Positioned using X/Y coordinates
-   Rotated
-   Renamed
-   Hidden/locked
-   Duplicated

### Custom coordinate geometry

The Custom Shape tool allows arbitrary sections to be defined by ordered
X-Y coordinates.

Example:

``` text
0,0
1000,0
1000,500
500,500
500,1000
0,1000
```

The entered coordinates are preserved as supplied. The geometry engine
then calculates the actual polygon centroid and section properties.

Custom shapes are represented as a dedicated `custom-shape` component
type while using the polygon geometry engine for the mathematical
calculations.

### Canvas navigation and CG reference

-   Mouse-wheel zoom follows the AutoCAD convention: wheel up zooms in and
    wheel down zooms out, anchored at the mouse cursor.
-   Zooming and panning only change the viewport; model dimensions and
    engineering coordinates are not scaled or modified.
-   With **CG → 0** enabled, all components are translated together so the
    composite centre of gravity sits at the global origin, without changing
    dimensions, rotations, or relative spacing.
-   Section properties are always computed about the centroidal axes,
    regardless of whether the toggle is enabled.

### Canvas selection (AutoCAD-style)

| Action | Result |
|---|---|
| Drag **left → right** on empty canvas | **Window** (blue, solid): selects only objects lying *completely* inside |
| Drag **right → left** | **Crossing** (green, dashed): selects objects inside *or* touching/intersecting the box |
| Click an object | Selects it (5 px pick-box makes thin plates and nodes easy to hit; locked objects can be selected but not moved) |
| Click empty canvas | Clears the selection |
| Ctrl/⌘ + click or drag | Adds to / toggles the selection |
| Esc | Cancels an in-progress selection window |

While dragging, the window displays live with its mode, size and the number of objects it will select, and those objects are highlighted in cyan. Combined sections are tested against their true outer/void rings (a window inside a void selects nothing). Locked, hidden and parent-managed (bolt deduction) objects are skipped by window/crossing selection. Dragging any selected object moves the whole selection with one snapped delta. Pan (middle button or Shift+drag), wheel zoom, OSNAP and Alt free-drag are unchanged.

## Edit Coordinates dialog

-   Select coordinate points via the **#** column or by clicking preview
    nodes: click for one, **Ctrl/⌘-click** to add/remove, **Shift-click** for
    a range, **Ctrl+A** or the header checkbox for all.
-   **Ctrl+C** (or **⧉ Copy**) copies the selected points to the clipboard as
    plain text, one point per line — `x, y` or tab-separated for spreadsheets
    — ready to paste into any other application.
-   Preview: **mouse-wheel zoom** anchored at the cursor, **drag to pan**,
    **⤢ Fit** to fit the complete section (stays fitted while editing until
    you zoom or pan), and **🏷 Labels** on/off for point numbers (selected
    points always show their coordinates). These only change the preview;
    the section geometry is never modified.

### Combine Shapes / Uncombine

-   Select two or more shapes (Ctrl/⌘-click on the canvas, Ctrl/⌘/Shift-click
    in the component tree, or a window selection) and click **⊕ Combine**.
-   Additive shapes are boolean-unioned into one `custom-shape` whose
    coordinates form a **single continuous closed boundary**. Overlaps are
    counted once. Internal voids (e.g. a box made of four plates) are joined to
    the outer boundary by a zero-width keyhole bridge, so the boundary stays a
    single loop and area/inertia equal outer − void exactly. The bridge is not
    drawn on the canvas.
-   **Remove Overlapping Portion**: subtractive members — cut-outs and the
    bolt-hole deductions of selected plates — are removed from the parent
    plate material by boolean difference. Only the overlapping area is
    removed (cut-out area outside the material is ignored and reported), so
    the boundary contains only the actual remaining material and area, CG and
    all section properties are recalculated from it. Cut-outs fully inside the
    material become voids; cut-outs that split a plate (e.g. full-thickness
    bolt deductions) leave several pieces, which are still joined into one
    closed coordinate loop by zero-width bridges.
-   Combined sections created by earlier versions that still carry separate
    cut-outs show a **✂ Remove Overlapping Portion** button in the Properties
    panel that applies the same operation.
-   Shapes must be connected (overlapping or sharing an edge — OSNAP helps)
    and share one material; otherwise Combine explains why it cannot proceed.
    Circles/ellipses are represented by 256-segment boundaries when combined.
-   **⊟ Uncombine** (component tree or Properties panel) restores the last
    uncombined state exactly: every original shape with its id, position,
    rotation, dimensions, material, bolt-hole deductions and other settings.
    Combined sections can be combined again; Uncombine reverts one level.
-   **Delete Cutout**: click an interior void of a combined section on the
    canvas (it highlights in red) and press **Delete**, or use 🗑 in the
    *Cut-outs & Voids* list of the Properties panel. The void is filled, the
    single closed boundary is rebuilt from the remaining rings, and section
    properties are recalculated; the outer boundary, other voids, position and
    rotation are unchanged. Subtractive cut-outs (e.g. bolt-hole deductions)
    from earlier versions can be selected and deleted the same way. Uncombine
    still restores the original shapes.

### Object Snap (OSNAP)

-   Toggle with the **OSNAP** toolbar button or **F3** (as in AutoCAD). The
    setting is remembered and shown in the canvas status bar.
-   While dragging a component with OSNAP on, its endpoints, midpoints, centre
    and quadrants snap to the nearest **endpoint**, **midpoint**, **centre**,
    **quadrant**, **edge** (nearest point / face contact) or **node** (global
    origin) of other visible components, within a 12 px aperture.
-   An AutoCAD-style marker (□ endpoint, △ midpoint, ○ centre, ◇ quadrant,
    ⊗ node, ⧖ nearest) and a label appear at the snap point.
-   Hold **Alt** while dragging to move freely for that drag; with OSNAP
    off, objects always move freely.

### Rectangular bolt-hole deductions

Bolt holes are modelled as net-section rectangular reductions (not circular
cut-outs) on an individual rectangular plate:

-   **Deduction depth = bolt-hole diameter**, **deduction width = parent plate
    thickness** (the smaller plate dimension).
-   Set the **number** of holes and the full sequence along the plate length:
    `Edge-1 → H1 → H2 → H3 → … → Edge-2`
    -   **Edge-1**: start face (local bottom for vertical plates, left for
        horizontal plates) to the centre of H1.
    -   **H(n) → H(n+1)**: individual spacing between consecutive holes.
    -   **Edge-2**: centre of the last hole to the end face.
-   Edge-1 + ΣH + Edge-2 always equals the plate length. Choose which edge is
    **held** when the plate length changes; the other is recalculated
    automatically. Edge-2 can also be typed directly.
-   Choose how edits behave: **Shift following holes** (holes after the edited
    one keep their spacings and move with it) or **Move this hole only** (the
    next gap absorbs the change, so every other hole stays where it is).
-   Adding a hole appends it at the last spacing; removing one keeps the
    spacings of the remaining holes. Older projects saved with equal spacing
    keep their hole positions.
-   Each deduction is an associated `subtract` rectangle, so area, inertia,
    moduli, stresses, reports, and exports reflect the net section.
-   **Grouped** (default): deductions are collapsed beneath the parent plate
    and follow its size, position, and rotation automatically.
-   **Ungroup** (Properties panel or the `⊞ n` badge in the component tree):
    deductions become separate, freely editable shapes still linked to the
    plate. **Group** again to snap them back to the parametric pattern.
-   Validation reports overlapping holes (spacing < diameter), Edge-1/Edge-2
    smaller than the hole radius, and patterns that exceed the plate length
    (with the overrun amount).

### CG origin toggle

The **CG → 0** toolbar toggle moves the composite centroid to the global
origin `(0,0)` and keeps it aligned while geometry is edited. Turn it off to
work in absolute coordinates; the C.G. marker shows the live centroid.

### Section properties

The application calculates:

-   Area
-   Centroid X
-   Centroid Y
-   Moment of inertia `Ix`
-   Moment of inertia `Iy`
-   Product of inertia `Ixy`
-   Radius of gyration `rx`
-   Radius of gyration `ry`
-   Section modulus about X
-   Section modulus about Y
-   Principal moments of inertia
-   Principal axis angle
-   Bounding dimensions

### Stress analysis

The application supports combined:

-   Axial force `P`
-   Moment about X `Mx`
-   Moment about Y `My`

and calculates:

-   Maximum compression
-   Maximum tension
-   Stress at a selected point
-   Neutral axis angle
-   Neutral axis intercept

### Engineering calculation trace

Calculation steps can be exposed with:

-   Formula
-   Substitution
-   Result
-   Unit

This is intended to make the numerical calculation process easier to
review.

### Standard steel sections

The project includes standard steel-section data such as:

-   ISMB
-   ISHB
-   Other section families included in the standard-section database

Standard-section properties include:

-   Area
-   Mass
-   Depth
-   Width
-   Web thickness
-   Flange thickness
-   `Ix`
-   `Iy`
-   `Zx`
-   `Zy`
-   `rx`
-   `ry`

### Import / Export

Supported project and engineering exports include:

  Format   Purpose
  -------- -------------------------------
  JSON     Editable project/section file
  DXF      CAD geometry
  PDF      Engineering report
  Excel    Calculation workbook
  CSV      Tabular section data

The JSON format includes a schema version so that project files can be
evolved safely.

### PDF reports

PDF export is intended to include:

-   Project information
-   Section drawing
-   Component information
-   Section properties
-   Calculation information
-   Engineering results

The PDF exporter uses `jsPDF` and `jspdf-autotable`.

### DXF import and export

ASCII DXF drawings can be imported directly for section-property
calculations. The importer supports:

-   Closed `LWPOLYLINE` and R12 `POLYLINE` boundaries
-   `CIRCLE` and full `ELLIPSE` entities
-   Closed loops assembled from individual `LINE` and `ARC` entities
-   Polyline bulge arcs, discretized at a maximum 10° increment
-   Drawing units from `$INSUNITS`, with a manual unit override
-   Automatic openings from nested contours or layers named `CUTOUT`,
    `HOLE`, `VOID`, or `OPENING`

Open geometry and unsupported annotation entities are skipped and reported
before import. Binary DXF files must first be saved as ASCII DXF.

DXF export produces CAD-compatible geometry using layers such as:

-   `SECTION`
-   `CUTOUT`
-   `DIMENSIONS`
-   `TEXT`
-   `CENTERLINE`
-   `AXIS`

Custom coordinate-defined sections are exported using their actual
geometry.

### Excel export

Excel export creates a workbook containing calculation and
section-property information and is intended for engineering review and
sharing.

### JSON project files

Projects can be exported and imported using a structured JSON format.

A project contains:

``` text
Project
├── Metadata
├── Units
├── Components
│   ├── Geometry
│   ├── Position
│   ├── Rotation
│   └── Boolean operation
├── Materials
├── Loads
└── Revision information
```

------------------------------------------------------------------------

## Engineering calculation approach

The geometry engine treats a section as a collection of component
geometries with Boolean operations.

Each component has:

``` text
operation = add
```

or:

``` text
operation = subtract
```

For additive components, the area and section properties contribute
positively.

For subtractive components, the corresponding area and inertia
contributions are treated as negative contributions.

For arbitrary polygon/custom geometry, the calculation engine uses
coordinate-based polygon equations to determine:

-   Signed area
-   Centroid
-   Second moments of area
-   Product of inertia

The section-level properties are then assembled from the individual
component contributions.

### Important engineering note

This software is intended as an engineering calculation and drafting
aid. Results should be independently reviewed and checked against the
applicable design standard, project requirements, and an established
engineering calculation method before being used for final design or
construction.

------------------------------------------------------------------------

## Technology stack

### Frontend

-   [Next.js](https://nextjs.org/)
-   [React](https://react.dev/)
-   TypeScript
-   Tailwind CSS

### Engineering / calculation

-   TypeScript geometry engine
-   Coordinate-based polygon calculations
-   Component-based section-property calculations

### Export

-   `jsPDF`
-   `jspdf-autotable`
-   `ExcelJS`
-   File Saver
-   DXF text generation

### Data

-   Drizzle ORM
-   PostgreSQL support
-   Local project JSON format

------------------------------------------------------------------------

## Project structure

``` text
section-src/
├── src/
│   ├── app/
│   │   ├── page.tsx
│   │   ├── layout.tsx
│   │   └── globals.css
│   │
│   ├── components/
│   │   ├── Canvas.tsx
│   │   ├── ComponentsPanel.tsx
│   │   ├── CustomShapeDialog.tsx
│   │   ├── ExportMenu.tsx
│   │   ├── ImportDialog.tsx
│   │   ├── PropertiesPanel.tsx
│   │   ├── SaveLoadDialog.tsx
│   │   ├── SettingsDialog.tsx
│   │   └── ...
│   │
│   ├── engine/
│   │   ├── geometry.ts
│   │   ├── exporters.ts
│   │   ├── standardSections.ts
│   │   ├── types.ts
│   │   └── qa.ts
│   │
│   ├── store/
│   │   └── useStore.ts
│   │
│   └── db/
│       ├── index.ts
│       └── schema.ts
│
├── package.json
├── tsconfig.json
├── next.config.ts
├── postcss.config.mjs
├── eslint.config.mjs
└── README.md
```

------------------------------------------------------------------------

## Getting started

### Requirements

Install:

-   Node.js 20+ recommended
-   npm
-   Git

Check your installation:

``` bash
node --version
npm --version
```

### Clone the repository

``` bash
git clone https://github.com/YOUR_USERNAME/section-analysis.git
cd section-analysis
```

Replace `YOUR_USERNAME/section-analysis` with the actual GitHub
repository URL.

### Install dependencies

``` bash
npm install
```

### Run the development server

``` bash
npm run dev
```

Open:

``` text
http://localhost:3000
```

### Type check

``` bash
npm run typecheck
```

### Lint

``` bash
npm run lint
```

### Production build

``` bash
npm run build
```

### Start production server

``` bash
npm run start
```

------------------------------------------------------------------------

## Development workflow

A recommended workflow is:

``` bash
npm install
npm run typecheck
npm run lint
npm run build
npm run dev
```

Run `npm run typecheck` after changes to the engineering engine, store,
or export system.

------------------------------------------------------------------------

## Custom Shape workflow

The custom-shape implementation follows this flow:

``` text
User enters coordinates
        ↓
Coordinate validation
        ↓
Point[]
        ↓
Custom Shape component
        ↓
Geometry engine
        ↓
Polygon area / centroid / inertia
        ↓
Section-level properties
        ↓
Canvas + PDF + DXF + Excel
```

The custom-shape component should not calculate the centroid by simply
averaging vertex coordinates. The geometry engine calculates the actual
area-weighted polygon centroid.

------------------------------------------------------------------------

## Boolean operations

Each component supports:

``` text
ADD
SUBTRACT
```

Example:

``` text
Outer rectangle
      +
Inner rectangle
      -
      =
Hollow rectangular section
```

The same principle can be used for:

-   Holes
-   Cut-outs
-   Openings
-   Compound sections

------------------------------------------------------------------------

## Units

Supported length units include:

-   mm
-   cm
-   m
-   inch
-   ft

The engineering engine stores numerical geometry values and
converts/display them according to the selected project unit system.

------------------------------------------------------------------------

## File format

Section projects use a versioned JSON structure.

Example:

``` json
{
  "schemaVersion": "1.0",
  "application": "Section Designer",
  "applicationVersion": "1.0.0",
  "exportedAt": "2026-08-13T00:00:00.000Z",
  "project": {
    "id": "...",
    "name": "Example Section",
    "description": "Example project",
    "units": "mm",
    "components": [],
    "materials": [],
    "createdAt": "...",
    "updatedAt": "...",
    "revision": 1
  }
}
```

When changing the JSON schema, update the schema version and maintain
backwards-compatible import handling where practical.

------------------------------------------------------------------------

## QA and validation

The project contains a QA engine for identifying issues related to:

-   Geometry
-   Calculation
-   Engineering checks

QA messages are classified as:

``` text
error
warning
info
```

This should be expanded as the engineering calculation library grows.

------------------------------------------------------------------------

## Known limitations

This project is under active development. Depending on the current
version, some advanced engineering features may still require additional
validation.

Potential areas for future development include:

-   More standard-section databases
-   Advanced Boolean polygon clipping
-   Better treatment of multiple intersecting components
-   More complete DXF entities and hatching
-   Dimension styles in DXF
-   Advanced PDF drawing annotations
-   More detailed Excel calculation formulas
-   Additional stress-result visualization
-   Section classification checks
-   Code-specific design checks
-   More comprehensive automated engineering test cases
-   Automated regression tests against benchmark sections

------------------------------------------------------------------------

## Verification and testing

For every significant geometry-engine change, test at least:

1.  Rectangle
2.  Circle
3.  Triangle
4.  Symmetric I-section
5.  L-section
6.  Hollow rectangle
7.  Arbitrary custom polygon
8.  Additive compound section
9.  Section with a subtractive hole
10. Rotated component

For custom coordinates, compare:

-   Area
-   Centroid
-   `Ix`
-   `Iy`
-   `Ixy`

against an independently verified calculation.

------------------------------------------------------------------------

## Recent fixes

The current corrected source includes fixes for:

### PDF export

-   Correct `jspdf-autotable` integration
-   TypeScript-safe access to table positioning
-   Improved PDF export error reporting

### DXF export

-   Improved LWPOLYLINE generation
-   Coordinate validation
-   Duplicate-point protection
-   Section/cutout layers
-   Improved coordinate handling

### Custom Shape

-   Dedicated `custom-shape` component type
-   Removed React state timing/race-condition issue
-   Preserved user-entered coordinates
-   Removed incorrect vertex-average coordinate shifting
-   Uses the geometry engine for the actual polygon centroid

------------------------------------------------------------------------

## Contributing

Contributions are welcome.

Before submitting a pull request:

``` bash
npm run typecheck
npm run lint
npm run build
```

When modifying engineering calculations, include:

-   Calculation method
-   Formula/reference
-   Test case
-   Expected result
-   Actual result
-   Explanation of any intentional change in behaviour

Avoid changing engineering formulas solely to make a visual result match
an expected value without validating the underlying calculation.

------------------------------------------------------------------------

## Engineering disclaimer

This software is provided as an engineering calculation aid and is not a
substitute for professional engineering judgement.

The user is responsible for:

-   Verifying input data
-   Verifying units
-   Checking geometry
-   Reviewing calculated properties
-   Confirming applicable design standards
-   Independently validating critical results
-   Obtaining appropriate professional approval before construction or
    fabrication

The authors and contributors are not responsible for design decisions
made solely from unverified software output.

------------------------------------------------------------------------

## Author

**Arvind Singh Rawat**\
Bridge Design Engineer

Structural engineering focus:

-   RCC structures
-   PSC structures
-   Steel structures
-   Bridge design
-   Structural analysis
-   Engineering calculation automation

LinkedIn: https://www.linkedin.com/in/arvindrawat400/\
Email: arvindrawat400@gmail.com

------------------------------------------------------------------------

## License

Add the project's intended open-source license before publishing the
repository.

For example, if you choose MIT, add a `LICENSE` file containing the
official MIT License text and update this section accordingly.

Until a license is explicitly added, the repository should not be
assumed to grant permission to redistribute or commercially reuse the
source code.

------------------------------------------------------------------------

## Roadmap

### Geometry

-   [ ] Robust polygon Boolean operations
-   [ ] Multi-hole sections
-   [ ] Arc and curved custom geometry
-   [ ] Fillets and chamfers
-   [ ] More standard sections

### Analysis

-   [ ] Full biaxial stress visualization
-   [ ] Interaction diagrams
-   [ ] Section classification
-   [ ] Plastic section properties
-   [ ] Warping/torsional properties
-   [ ] More advanced material handling

### CAD

-   [ ] DXF dimensions
-   [ ] DXF text styles
-   [ ] DXF hatching
-   [ ] Layer customization
-   [ ] Improved AutoCAD compatibility

### Reporting

-   [ ] More detailed PDF drawings
-   [ ] Calculation references
-   [ ] Custom report templates
-   [ ] Company/project information
-   [ ] Engineering sign-off section

### Testing

-   [ ] Automated geometry regression tests
-   [ ] Export tests
-   [ ] JSON schema tests
-   [ ] Standard-section benchmark tests
-   [ ] Browser end-to-end tests

------------------------------------------------------------------------

## Versioning

Use semantic versioning where practical:

``` text
MAJOR.MINOR.PATCH
```

Example:

``` text
1.0.0
1.1.0
1.1.1
1.1.2
```

Engineering calculation changes should be documented clearly in the
changelog because they may affect previously generated results.

------------------------------------------------------------------------

## Acknowledgement

Built as a practical engineering productivity tool for structural
engineers who need fast, transparent, and reusable section-property
calculations.
