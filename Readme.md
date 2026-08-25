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

### DXF export

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
1.1.3
```

Engineering calculation changes should be documented clearly in the
changelog because they may affect previously generated results.

------------------------------------------------------------------------

## Acknowledgement

Built as a practical engineering productivity tool for structural
engineers who need fast, transparent, and reusable section-property
calculations.
