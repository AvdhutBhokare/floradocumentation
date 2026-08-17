# Flora Documentation GIS Manager

A desktop-first GIS + spreadsheet tool for reviewing flora/tree survey data
exported from **Epic Collect**, cross-referencing it against KML zone
boundaries, and filling in missing tree locations — all fully synchronized
between an interactive map and an editable spreadsheet.

This is **not** a field data collection app. It's the desk/laptop review
step that comes *after* Epic Collect: import → visualize → find gaps → fix
→ export.

---

## Quick start

```bash
npm install
npm run dev
```

Then open the printed `http://localhost:5173` URL. On first run the app is
empty — either:

- Click **Import Excel** and choose a real Epic Collect export, or
- Try the bundled sample data in `public/sample-data/`:
  `Flora_Survey_Sample.csv` (48 trees, including a few intentionally invalid
  rows to see validation in action) and `Flora_Survey_Sample_Zones.kml`
  (4 zones — one fully undocumented, one half-empty, to demonstrate the
  "find missing areas" workflow).

## Other scripts

```bash
npm run build     # type-check + production build to dist/
npm run preview   # serve the production build locally
npm test          # run the automated test suite (57 tests)
npm run lint      # oxlint
```

## Requirements

Node.js 18+ (developed and tested against Node 22). No backend/server is
required — everything runs client-side in the browser, including Excel/KML
parsing and file export.

---

## Everyday workflow

1. **New Project** (Settings menu) → name it, e.g. `Flora Survey - Site A`.
2. **Import Excel** — pick the file exported from Epic Collect. You'll get
   a preview screen showing row counts, detected column mappings (editable
   if auto-detection guessed wrong), and a breakdown of valid / invalid /
   missing coordinates before anything is committed.
3. **Import KML** — upload your zone/site boundary file. Boundaries render
   as colored polygons on the map.
4. Use the **Zones** panel (left sidebar) to review zone-by-zone. Click a
   zone to fly the map to it; toggle **Review Mode** to dim everything else
   while you inspect one zone at a time. Mark each zone
   `Not Reviewed → Needs Data → Reviewed → Completed` as you go.
5. Where you see a gap between the zone boundary and existing tree markers,
   click **+ Add Tree** (top-left of the map), then click the map at the
   missing location. A form opens pre-filled with the exact coordinates —
   fill in species/height/status and save. The marker and the spreadsheet
   row appear immediately, with no page reload.
6. You can also paste coordinates or whole rows (tab-separated, as copied
   from Excel/Google Sheets) directly into the spreadsheet at the bottom.
7. Drag any marker to correct its position — the spreadsheet updates
   automatically. Edit any spreadsheet cell — the marker updates
   automatically. They are two views of the same underlying record, never
   separate copies.
8. **Export → Export Excel** when done. The exported file contains every
   original column from your Epic Collect export (nothing is ever dropped,
   even columns the app doesn't otherwise use) plus every addition/edit you
   made in this session.

Your project (trees, zones, review status) autosaves to the browser's
IndexedDB as you work and reloads automatically if you refresh or reopen
the tab.

---

## Architecture

```
src/
├── components/
│   ├── Map/            Leaflet map, marker clustering, zone polygons, popups
│   ├── Spreadsheet/     AG Grid editable grid
│   ├── Dashboard/       Stats strip
│   ├── ZonePanel/       Zone list, review status, filters, search
│   ├── TreeForm/        Add/Edit tree modal
│   ├── Import/          Excel & KML import modals (preview, column mapping)
│   ├── Layout/          Header/toolbar
├── services/
│   ├── excel/           Import parsing, fuzzy column detection, export
│   ├── kml/              KML → GeoJSON parsing
│   ├── gis/              Point-in-polygon zone detection, bounds
│   └── persistence/     IndexedDB read/write
├── store/               Zustand store (single source of truth) + selectors
├── types/               TreeRecord and related domain types
├── utils/               Coordinate validation, ID generation
└── __tests__/           Vitest unit + integration tests
```

**Single source of truth (Section 48 of the original spec):** every tree is
one `TreeRecord` living in the Zustand store. The map and the spreadsheet
both render *from* that array — neither keeps its own copy. Editing a cell
calls `updateTree()`; dragging a marker calls `updateTreeCoordinates()`;
both mutate the same record, so there's nothing to keep in sync because
there was only ever one thing.

**Performance at scale (target: 10,000+ records):** the map does **not**
render one React `<Marker>` per tree. `TreeMarkerLayer` manages a
`leaflet.markercluster` group imperatively, diffs the tree array against
existing Leaflet marker instances on each update (add/move/re-icon/remove
only what changed), and applies adds/removes in **batches** via the
cluster group's `addLayers`/`removeLayers` APIs rather than one call per
marker — with thousands of markers, one-at-a-time calls each recompute the
cluster spatial index and visibly stall the map.

Undo/redo history snapshots are **reference-based**, not deep clones. This
is only safe because no code path mutates a `TreeRecord` object in place —
see "A bug this fixed" below for the one place that used to.

Confirmed in `src/__tests__/performance.test.ts`, which imports 10,000
rows and performs edits, an undo/redo burst, a bulk paste, and a
delete-one-of-10,000 regression check, all under generous time budgets.

**Tree IDs** (`TREE-0001`, …) are generated once and never derived from row
position, so they stay stable through sorting, filtering, and editing.

---

## A bug this fixed: "deleting one marker removed all of them"

Two things were compounding:

1. **Removing a Leaflet marker from a cluster group while its popup was
   open** can corrupt the cluster's internal spatial index, which makes
   the whole layer appear to empty out. `TreeMarkerLayer` now always
   closes a marker's popup before removing it.
2. **AG Grid's default cell editing mutates row data in place.** Since the
   grid's `rowData` is the exact same `TreeRecord` objects held in the
   Zustand store, that mutation was landing on live store state *before*
   the undo snapshot for that edit was taken — silently corrupting undo
   history for every spreadsheet cell edit, not just deletes. Every
   editable column now uses a non-mutating `valueSetter`; the store is the
   only writer. See the comment on `defaultColDef` in `Spreadsheet.tsx`
   and the regression test in `store.test.ts`.

Clustering was also restored — an earlier revision had it removed, which
"fixed" the crash but made the map slow well before 10,000 markers.

---

## Base maps

Street tiles are OpenStreetMap. Satellite works out of the box too — it
defaults to Esri World Imagery (free, no key required), configured in
`src/config/baseMapTiles.ts`. To point it at a different provider instead
(Mapbox, MapTiler, Google Maps Platform, etc.), copy `.env.example` to
`.env` and set:

```
VITE_SATELLITE_TILE_URL=https://your-provider/{z}/{x}/{y}.jpg?key=YOUR_KEY
VITE_SATELLITE_TILE_ATTRIBUTION=© Your Provider © OpenStreetMap contributors
```

Never commit a real API key. `.env` is already gitignored.

---

## Known dependency advisory

`npm audit` will report a high-severity advisory for the `xlsx` (SheetJS)
package. The maintainers stopped publishing patched versions to the public
npm registry (patches are distributed via their own CDN instead, which
this environment's network policy doesn't allow fetching from). Since this
app only ever parses files *you* choose to open, on your own machine, with
no server in between, the practical exposure is low — but if you want the
patched build, you can manually replace the `xlsx` package with the
version hosted at `https://cdn.sheetjs.com` per SheetJS's own instructions.

---

## A second bug this fixed: "the location cannot be edited"

This turned out to be a direct consequence of the *previous* fix above —
the non-mutating `valueSetter` protected undo history, but AG Grid
re-reads a cell's value from `params.data` **after** calling `valueSetter`
to decide what changed. A setter that never writes to `params.data` makes
AG Grid conclude nothing changed and silently drop the edit — for every
column, not just coordinates.

The real fix: let AG Grid mutate `params.data` normally again (required
for edits to register at all), and instead protect undo history using the
pre-edit value AG Grid *already* hands over in `onCellValueChanged`'s
`e.oldValue` — captured internally before any mutation happens, regardless
of what the grid does to the object afterward. This is `updateTreeField` /
`updateTreeExtraField` in `useFloraStore.ts`; `Spreadsheet.tsx`'s
`onCellValueChanged` now uses those instead of the generic `updateTree`.
Regression coverage is in `store.test.ts`.

Also added this session: a "Tree location updated" confirmation toast when
a marker is dragged (`components/Common/Toast.tsx`), matching the
original spec. KML import, spreadsheet fill-down (Ctrl+D), row duplication
(Ctrl+Shift+D), and Excel-style bulk paste were already implemented from
earlier in the project — see the in-app "⌨ Shortcuts" button in the
spreadsheet toolbar and the checklist screen in the Import KML dialog.

---

## Marker drag safety: double-click to unlock

Markers are **not draggable by default**. Panning, zooming, and clicking
around the map — even near a marker — can never move a tree by accident.
To reposition one (e.g. correcting GPS drift that put it outside its KML
zone), double-click it: it glows amber and shows a "drag now" tooltip.
Drag it, and it re-locks itself the instant you drop it. If you
double-click to unlock and change your mind, clicking anywhere else on the
map (or pressing Escape) locks it back down without moving anything. Only
one marker is ever unlocked at a time.

This is `TreeMarkerLayer.tsx` (`unlockMarkerForDrag` / `lockUnlockedMarker`)
— it relies on a specific Leaflet behavior (a marker created with
`draggable: false` still gets a working `.dragging` handler once added to
the map, so `.enable()`/`.disable()` are safe to call later), which is
pinned down directly against the real library in
`markerDragLock.test.ts` rather than just asserted in a comment.

---

## Testing notes

`npm test` runs 67 tests covering coordinate validation, KML
latitude/longitude ordering (this is the single easiest thing to get
backwards when converting KML → app coordinates, so it's tested
explicitly), fuzzy Excel column detection, Tree ID stability, a full
Excel import → edit → export round trip (verifying no source columns are
ever lost), point-in-polygon zone detection, store undo/redo (including
the AG-Grid-mutation-safe edit path described above) and map↔spreadsheet
sync behavior, and performance/correctness at a 10,000-record scale
(import, single edits, undo/redo bursts, bulk paste, and a regression test
that deleting one tree only ever removes that one tree).

There is currently no browser-driven end-to-end test (e.g. Playwright) in
this environment — an attempt to headlessly drive AG Grid's real edit
pipeline in jsdom ran into grid-internal timing issues specific to that
harness, so instead the fix is verified at the store level (where the
actual undo-correctness guarantee lives) plus a full read of AG Grid's
source to confirm the mechanism. `npm run build` and the dev server were
used to confirm every component compiles and transforms cleanly. A manual
pass through the workflow above on your machine — in particular, editing
a few latitude/longitude cells and confirming the marker moves — is still
worth doing before relying on this for the full 450-acre survey.
