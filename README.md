# Countertop Calculator

A browser-based workspace with device-local drawing storage for countertop takeoffs. React + TypeScript + Vite. No accounts, paid services, AI requests, server, or API keys.

## Use the app

1. Enter the shared password on the basic access screen, then choose **Explore a sample project** to learn with editable example measurements, or **New project**.
2. Give the project a name. Upload PNG, JPEG, or PDF drawings. PDF pages appear individually in the drawing selector. Each file may be up to 25 MB; PDFs up to 30 pages; images up to 40 megapixels.
3. Add individual Straight, L-shape, U-shape, Island, Peninsula, Polygon, Backsplash, or Waterfall pieces. Select the piece to edit its dimensions and drawing reference. All dimensions are in inches; enter `96`, `25.5`, or `25 1/2`.
4. For L / U shapes, enter external X/Y dimensions and independent top (back), left, and right leg depths. The schematic shows the exact orientation. Island, backsplash, waterfall, and polygon dimensions are never supplied silently. Ordinary run depths are labeled editable assumptions.
5. Use select to move schematic annotations, hand to pan, and +/- to zoom. Drawing positions are preserved in original image coordinates. An ordinary shape overlay is an illustrative schematic, **not** an inference of image scale. For the cutting estimate, touching schematic edges are treated as a shared cut; place schematics carefully. This does not infer the scale of the uploaded background image.
6. For irregular shapes, select the pen and click vertices around the real boundary in order. Keep the pen tool active to drag vertices; double-click a vertex to remove it. Normal selection moves whole pieces. Use the ruler to select the endpoints of a known measurement and enter its real length. Apply the scale, then explicitly confirm it. The plan must be flat and uniformly scaled; do not calibrate perspective photos, distorted scans, or drawings marked “not to scale.” A wrong scale produces a wrong area. Scale confirmation resets when vertices change. You can edit exact image coordinates in the polygon panel.
7. Click **Export PDF** to download immediately. There is no project approval screen. Invalid/missing dimensions, invalid geometry, or an unconfirmed polygon scale produce an error instead of an incorrect PDF. The PDF contains total area, countertops, backsplash, any waterfall area, estimated linear cutting length, polished edge length, and drawings without app-added names or dimensions. Labels embedded in an uploaded image remain part of that image.
8. Download **Backup** regularly. Use **Restore backup** on another device. Restored polygons need their physical scale reconfirmed; there is no whole-project approval step. Storage is local IndexedDB; clearing browser data removes projects. No private drawings belong in this repository.

Horizontal totals include sink and cooktop openings; no cutout deductions are performed. Backsplash and waterfall are separate material categories. Combined material is explicitly labeled. No waste, pricing, joint allowance, or minimum billing is added. This is preliminary measurement / fabrication planning, not a CNC cutting system.

## Publish from your browser — GitHub Pages

No local development installation is required.

1. In Codex, review the changed files and test results. Changes are committed locally in coherent groups; this does not push them or publish a website. Use the available **Create PR** / push action in your Codex interface to send the task branch to `gabrielmarinhmori/countertop-calculator`. If your interface offers a commit step first, complete that step. Open the pull request on GitHub, review **Files changed**, and check the automated build.
2. On GitHub open the repository → **Settings** → **Pages** → **Build and deployment** → **Source** → **GitHub Actions**. You need repository administration permission. If Actions are disabled, enable them in **Settings → Actions → General**. No access token or API key should be placed in the code.
3. Merge the reviewed pull request into **main**. The included workflow runs on pushes to main, validates the geometry tests, builds the site, and deploys the `dist` artifact. Pull requests validate only; they do not deploy. You can also run **Actions → Validate and deploy Pages → Run workflow** on main after enabling Pages.
4. Open **Actions** and select the latest workflow run. Both **build** and **deploy** must be green. Click a failed job to see its logs; a merge alone is not proof of publication. If deploy says Pages is not enabled, complete step 2 and rerun the workflow. Organization policies or private-repository plan restrictions may require an administrator.
5. Only after successful deployment, use the actual link displayed in **Settings → Pages** or the workflow's **github-pages** deployment. No live deployment has been verified during implementation. Vite uses relative asset paths, so repository subpaths work without hardcoding the repository name.
6. Open that same published link on a computer and phone. Create a sample project, upload a drawing, edit dimensions, reload and download a report. The two devices have separate project storage; transfer a backup explicitly if needed. Test the actual browsers you intend to use. The interface is responsive, but automated mobile validation emulates Chromium, not every mobile browser.

## Development in Codex Cloud

Use the existing isolated checkout; a Git worktree is unnecessary.

```sh
cd /workspace/countertop-calculator
npm ci --cache /tmp/countertop-npm
npm test
npm run build
npm run dev -- --port 5173
```

Node 24 is used in CI. No environment variables or credentials are needed by the application. `npm ci` respects the committed lockfile. A static host serves `dist/`; it requires no backend and uses no client-side URL routes.

### Browser checks

```sh
# On this cloud machine, Chromium is already installed:
CHROMIUM_PATH=/usr/bin/chromium npm run test:e2e
# Elsewhere, install the Playwright-managed browser first:
npx playwright install chromium
npm run test:e2e
```

The browser suite starts Vite automatically when necessary. It covers PDF page rendering, approvals, downloads, IndexedDB persistence, invalidation, and narrow-screen layout. CI currently runs unit tests and the production build; browser tests can be run with the commands above. Browser downloads may require network access to Playwright's distribution hosts. Do not disable TLS verification to install them.

## Calculation architecture

- `src/engine.ts`: standalone dimension parsing, shape polygons, validation, shoelace area, union, totals, and approval fingerprint. Decimal.js keeps parsing and arithmetic at higher precision. Polygon-clipping performs union using double-precision coordinates; this is not exact rational computational geometry. Display rounding occurs only at the end, to two decimal places.
- `src/files.ts`: validated local uploads, PDF.js worker and page rasterization, image decoding. All drawing processing stays in the browser. PDF rendering uses a bundled worker. No third-party font or AI request is required.
- `src/main.tsx`: dashboard, project editor, original-coordinate SVG annotation tools and direct PDF UI.
- `src/storage.ts`: IndexedDB project and drawing persistence; writes are queued by the UI to preserve edit order.
- `src/restore.ts`: allowlisted project backup validation. Approval and confirmations are reset on import.
- `src/reports.ts`: compact jsPDF export with category totals, linear cutting estimate, and drawing-only canvases (including manual schematics).
- `src/recognition.ts`: future provider boundary and runtime schema validation. No provider is enabled.

Area uses square inches internally; square feet = square inches / 144. L / U outlines describe the actual leg union, including unequal depths; corners are counted once. Shared-position project union prevents connected peninsula overlap from being counted twice. Per-piece areas are gross and may sum to more than a shared union total. Holes from sink / cooktop cutouts are intentionally absent.

**Specification arithmetic correction:** `(96 × 25.5 + 60 × 25.5 − 25.5 × 25.5) / 144 = 23.109375`, displayed as **23.11 sq ft**. The requested example's 23.10 was inconsistent with its formula. Tests preserve the correct mathematical result. The whole-inch L example remains 22.74 sq ft.

## Future AI integration

Implement `RecognitionProvider` via a secure backend / serverless function. API credentials must stay on that backend. Validate its unknown response with `validateSuggestion` before presenting proposals. The schema contains boundaries, raw dimension strings, confidence, and uncertainty — never area totals. A future import UI must present suggestions for explicit editing and confirmation, parse each measurement with the deterministic engine, and reject missing constraints. Do not convert a confidence score into an approved measurement. Any future recognition workflow must allow measurement and scale review; the current PDF export has no whole-project approval requirement.

## Scope and limitations

Implemented: all requested shape families, multiple projects / drawings / PDF pages, editable dimensions / polygon vertices, zoom and pan, separate category totals, shared-coordinate overlap union, direct PDF export, dashboard management, local storage, backup restore, sample project, deterministic tests, static build, and Pages workflow.

Not implemented: automatic measurement recognition, AI proposals UI, accounts / sync, price / waste calculations, perspective correction, direct rotated rectangle tools, optional sink / cooktop annotation tools, vector-preserving PDF exports, or CNC output. Uploaded drawings cannot determine physical measurements by themselves. The user supplies and verifies all measurements, scale, and surface relationships. IndexedDB capacity and privacy settings vary by browser. Back up important work; this foundation has not been validated for safety-critical fabrication or all browsers. Publishing and live-site verification still require the GitHub steps above.

## DXF import — shared boundaries, categories, and circular arcs

The drawing uploader accepts ASCII `.dxf` files up to 10 MB. All geometry is processed locally, without AI or API keys. Two synthetic examples are included: `public/examples/sample-countertop-inches.dxf` (96 × 25 1/2 inches, 17.00 sq ft) and `public/examples/shared-border-curved-counter.dxf` (a curved counter sharing a white border with a red splash). Customer files are not included in the repository.

1. Export actual-size 2D geometry in model space. Supported: LINE segments, ARC entities, and closed LWPOLYLINE / 2D POLYLINE boundaries, including circular bulges. Open linework can form a region when it joins other edges into a closed face. A split line and a border shared by neighboring pieces no longer require a separate closed polyline per piece.
2. Import one DXF at a time using **Upload drawing**. Confirm inches, feet, millimeters, centimeters, or meters. `$INSUNITS` suggests a unit but does not approve it. Coordinates determine measurements; text dimension labels are not read as geometry.
3. Review the reconstructed regions. The owner's convention is suggested: **white/yellow = countertop boundary, red = back/side splash**. A region using red boundary edges is suggested as splash, including a red panel that borrows a white counter border. These suggestions are not semantic CAD recognition: inspect each region and use its category selector to override Countertop / Back-side splash / Waterfall. Unexpected colors or mixed-color construction edges need manual classification.
4. Click a numbered region in the preview or check its row to include it. No region is selected automatically. Select full physical surfaces, not sink/cooktop openings, borders, or accidental slivers. Very small enclosed regions are flagged, never silently removed or automatically included. All openings remain part of the full countertop surface; do not select an interior opening as another piece.
5. Review processing notes. The importer splits intersections and reuses shared edge fragments when finding bounded faces. Exact/overlapping duplicates are merged. Numerical endpoint cleanup is limited to **0.0000001 source DXF units**, displayed in review; it handles export floating-point dust, not actual missing measurements. Larger gaps remain open. Orange dashed edges are unresolved and contribute no area. A missing required boundary must be corrected in CAD before treating the project as complete.
6. Confirm units, selected regions, category assignments, and warnings. Importing does not approve the project. Each region becomes an independent piece; backsplash/waterfall polygon faces retain their own category and quantity, separate from countertops.
7. Check the selected regions and their placement before export. Contact cuts merge only within each drawing; independent imports have unrelated coordinate systems. Area totals sum the selected surfaces.

Circular areas use the analytical chord-plus-circular-segment formula `r² × (theta − sin(theta)) / 2`, added with orientation to the chord shoelace area. Sampled display vertices do not determine the reported curved area. SVG paths and canvas exports retain circular arcs. Curved CAD boundaries remain read-only in the polygon editor to avoid accidentally converting them to straight chords; edit the original CAD geometry and reimport. The verified scale remains editable. Backup/restore preserves arcs, categories and polished edge markings while resetting scale confirmation.

**Current limit:** overlap union involving multiple horizontal surfaces with circular arcs is blocked. It is not approximated with sampled polygons. Choose **separate physical surfaces** only after verifying that the pieces do not overlap. A single curved horizontal piece is supported, and curved splash/waterfall areas stay separate. Arbitrary shared curved unions need a future analytic union implementation.

Unsupported: splines/ellipses, block expansion, 3D/transformed/thick geometry, DWG, arbitrary gap filling, and reading measurement text. Reconstruction is limited to 2,000 source edges per layer and a 50,000-vertex preview; complex drawings should be exported by relevant layers. Parsing/reconstruction runs in a worker with a timeout. Review warnings for omitted geometry; do not assume every detected region is a real piece or that every entity was imported. The original DXF stays on your device; projects store the selected geometry, converted scale, curved boundaries, and a drawing image rather than the original DXF bytes.

## Basic password screen on GitHub Pages

The owner explicitly chose a basic password barrier for casual visitors while retaining GitHub Pages. **The site, application code, and verifier remain public. This is not secure authentication or authorization.** A technical visitor can bypass the screen or attack the verifier offline. It does not encrypt IndexedDB projects or prevent another user of the same browser profile from opening local data. Do not reuse an important password or treat drawings as protected by this gate. Real restricted access requires a server/edge access-control layer, which is not implemented.

The initial password is the shared password the owner previously supplied; no username is required. Its plaintext is not included in the repository. `public/access-gate.json` contains a salted PBKDF2-SHA256 verifier (310,000 iterations), checked in the browser through Web Crypto. HTTPS is required except for supported localhost development. The app is loaded after a match. The tab remembers entry for four hours across reloads; **Lock workspace** clears this tab's entry immediately. Changing the published verifier makes prior tab entries invalid on their next reload. These are convenience behaviors of a client-side barrier, not security guarantees.

### Change the shared password entirely in your browser

1. Open the deployed site's `gate-settings.html` page (append `gate-settings.html` to the site address ending in `/`). This public tool cannot change the deployed site by itself.
2. Enter and confirm a new shared password, then click **Download new access settings**. Calculation happens in your browser; the password is not sent to a service or included in the downloaded JSON. The verifier itself is deliberately public.
3. In your GitHub repository open `public/access-gate.json` → **Edit this file**. Open the downloaded JSON with a browser tab or text viewer, copy its complete contents, and replace that file's contents. Commit through a new branch / pull request, then merge after checks pass. Alternatively, use GitHub **Add file → Upload files** from the `public` directory to replace `access-gate.json`.
4. Wait for the Pages deployment to succeed. Reload the app and use the new password. The settings generator does not publish changes; only repository changes and deployment do that. Never paste the plaintext password into repository files, issues, comments, or the workflow.

The functional browser suite mocks a disabled gate to test the editor independently. Dedicated access-screen tests exercise incorrect/correct password entry, tab recall, relocking, failed settings fetch, expired entries, and the browser-only verifier generator with synthetic test passwords.

### QCAD: recommended first export

- Work in model space, at actual size, and confirm **Edit → Drawing Preferences → General → Drawing Unit** is **Inch**. Menu wording can vary by QCAD version.
- Either **R27 [2013] DXF drawing** or **R32 [2018] DXF drawing** can contain the supported entities. Version alone does not determine whether a contour is closed. An actual R32/AC1032 QCAD export in inches has now been exercised through parsing, browser import, category assignment, arc preservation, backup, and PDF generation. R27/AC1027 header parsing also has an automated test. Other entity constructions may still be unsupported.
- A rectangle made from four separate lines can import if the endpoints match exactly and all four lines are on the same layer. Numerical dust is cleaned at the displayed tolerance, duplicate edge fragments are merged, and shared borders are reconstructed. Genuine gaps remain unresolved.
- If a contour cannot import, use QCAD’s **Polyline → Create from Segments** tool to build a closed polyline from the outer boundary, and check the closed state in its property editor. Retain actual geometry; never close an unknown gap by guessing dimensions.
- Keep countertop outer outlines separate from text, paper borders, sink/cooktop cutouts, and construction lines. Select only the intended outer contours in the import review.
- Start with a known **96 × 25 1/2-inch rectangle**. The preview should show **17.00 sq ft**. Confirm **inches** explicitly even if the file header suggests them. If a known length differs, correct the drawing/export units rather than accepting the result.

## Faster DXF selection and renaming

In DXF review, **Select all** includes every detected region; **Clear selection** unchecks them all. You can deselect individual regions afterward. Bulk selection does not confirm categories, units, or processing warnings and does not approve anything. Small slivers and cutout regions can be included by Select all: review and remove them if they are not physical material.

Double-click a region's name to rename it before import. After import, double-click a name in the piece list or its drawing label. The existing **Piece name** field remains available for mobile/keyboard editing. Names remain editable without any export approval step.

## Persistent backsplash drawing tool

1. Open **Backsplash tool** in the drawing viewer's upper-right toolbar. You do not need to select a piece first. Enter **Backsplash height (inches)**, such as `4`, `5`, or `5 1/2`; no height is applied silently.
2. Every valid measured horizontal countertop in the active drawing has highlighted edges. Click edges on any of those pieces, or focus an edge and press Enter/Space. Missing dimensions / unverified image scales do not supply measurements. You can select different pieces or switch drawings while the tool remains active.
3. Keep clicking to create more panels. The tool stays active after each addition and after a duplicate-edge warning. Click **OK**, press Escape, select another drawing tool, or leave the workspace to stop. Repeating an edge that already has a linked panel does not create another panel.
4. Straight-edge panels are drawn as filled rectangles outside the source boundary, using the entered physical height at the source's drawing scale. Curved edges display an unfolded rectangular elevation near the arc, with a connector to that arc. They use developed arc length, not the chord. These are schematic vertical faces, not horizontal material footprints or CNC layouts. Automatic view/export bounds include panels that extend outside the original image.
5. Each panel has its own piece, name, height, quantity, and category. Area remains `measured edge length × height × quantity / 144`, separate from countertop square footage. No waste or joint allowances are added. Height is editable in the panel's details; inherited length/drawing reference remain linked.
6. Editing source dimensions refreshes linked panel lengths, drawings, and totals, without requiring approval. Removing the source or changing its edge topology blocks export; delete and recreate affected linked panels on the correct edge. Backup/restore preserves the relationships.

PDF drawing pages show the same filled panels and curved-edge connectors as the workspace. Independently drawn/imported splash regions are not automatically matched to generated panels; review existing material before adding another panel on an already represented edge. Visual overlaps between unfolded elevations are not material-union calculations. Curved panel manufacturability, arbitrary vertical profiles, and fabrication miters still need manual review.

## Change a piece category after import

Select a piece and use **Piece details → Surface category** to choose **Countertop**, **Back / side splash**, or **Waterfall**. The existing dimensions and curved geometry are retained; category totals are recalculated from unrounded areas. Changing category recalculates the PDF immediately; no project approval step is required.

A linked vertical panel may be reclassified as waterfall while retaining its measured source edge. Converting it to countertop detaches the vertical-panel link and makes it an independent rectangular surface requiring placement review. If a source countertop is reclassified as a vertical category, dependent linked panels become invalid rather than silently using a non-countertop source; delete/recreate those panels or restore their source category.

## Simplified slab planning

Open **Slab planning** in a project, separately from the drawing workspace. Enter the actual slab length/width in inches; fractional input is supported. Optional spacing and per-side edge trim are zero when blank and are shown explicitly. Select physical fabrication pieces, including the desired countertops, splashes, and waterfalls, then click **Calculate slab layout**. Quantities create separate instances. All selected pieces are assumed to use the same material/thickness and all stock slabs have the same dimensions. Exclude unrelated material batches.

The planner tries three deterministic greedy rectangle-packing orders (area, longest side, and height), using a free-rectangle best-short-side-fit heuristic, and chooses the layout with the fewest slabs among those attempts. It is **not a globally optimal nesting solver**. Rotation is limited to 0° / 90° and may be disabled globally or locked per piece for directional grain. A lock applies to all quantity instances of that piece.

Every piece reserves its axis-aligned bounding rectangle. The green solid outline is the actual geometry, and the dashed rectangle is reserved space. Circular bounds include cardinal arc extrema rather than relying on sampled display vertices. L/U cutouts, concavities, and other empty space inside a reserved envelope are not reused; this conservative version may need more slabs than professional irregular-shape nesting. It never presents a rectangle's area as the actual irregular piece area.

The results show slab count for that suggested layout, true selected material square footage, an area-only lower bound, and per-slab material utilization. The lower bound ignores spacing and shape/placement constraints and is not a promise that the pieces fit that many slabs. Oversized or rotation-locked pieces appear as **unplaced**, and the plan is prominently labeled incomplete; the displayed slab count does not cover the entire job. Overlapping shared-coordinate calculation shapes must be split into real fabrication pieces before planning. Unverified geometry cannot supply slab measurements.

Settings and piece selections persist in the project and in backups. Layouts are derived rather than saved: recalculate after changes or reopening this section. Slab layouts remain preliminary and do not affect measurement export. The module does not alter area-report totals or add billing waste.

Limits: 200 individual pieces per plan; no arbitrary-angle rotation, true polygon/curve nesting, vein/book matching, seam design, defects, different stock sizes, remnants inventory, manual placement, slab-layout PDF export, tool paths, or cut-sequence validation. Spacing is a planning allowance rather than a machine-specific saw-kerf model. Review the result with the actual slabs and fabrication constraints before purchasing or cutting material.

### Linear cutting estimate

Workspace and PDF show the union length of coincident cutting segments within each drawing. Countertop/splash and side-splash contact edges count once, including partial, vertical and horizontal contact. Unrelated drawings are never merged. Circular edges use analytical arc length and coincident arcs also merge. Quantities are retained. Cuts merge only between touching boundaries with material on opposite sides; overlapping copies on the same side remain separate. Gaps are not bridged. Linked straight backsplash panels share their base cut with the parent. Curved backsplash elevations are unfolded schematics, not a shared curved blade cut. This geometric estimate excludes overcut, kerf, lead-in, machine travel and cut sequencing. It depends on drawing placement, not an optimized slab layout. Manual schematics use their displayed position at two drawing pixels per inch. Invalid geometry blocks export, without an approval screen. Slab planning remains preliminary and unchanged.

### Polished edges

Activate **Polished edge tool** in the drawing toolbar and click edges on any measured piece, including backsplash. Each click toggles its finish marking; the tool stays active until **OK**, Escape or another tool. Green highlights remain visible after leaving the tool. Workspace and PDF show total polished length in feet and inches, multiplied by piece quantity. This is an independent finish metric, not added to square footage or cutting length, and has no price rate attached. Arc finishes use analytical length, not chords. Changed outline topology requires edge reselection.

DXF pure green (ACI 3 / RGB #00FF00), including resolved layer colors, initializes polished edges. Green can be the boundary itself or a duplicate/partial line coincident with a boundary, even on a separate finish layer. It does not change the surface category. Duplicate reconstruction preserves green finish metadata and red splash categorization. Detached green lines do not identify a piece edge; select the boundary manually after import if needed. Finish markings persist through edits, browser storage and backups. Example: `public/examples/polished-countertop-inches.dxf`.

### Undo, arrangement and touch zoom

The drawing toolbar includes **Undo** and **Redo**. Use Command/Ctrl + Z to undo, Command/Ctrl + Shift + Z (or Ctrl + Y) to redo. The current open project keeps up to 60 edit snapshots in memory. A drag is one undo step; vertices, dimensions, categories and finish edits also use this history. Opening/reloading a project resets history; saved backups remain the way to recover work across sessions. Typing fields keep normal browser text undo. Zoom, pan and selection do not change measurements and are not undo steps.

Choose **Move pieces** to drag any measured piece, including CAD polygons and arcs. Shift-click pieces (or rows) to add/remove them from a group; dragging a selected piece moves the group. On mobile, use **Multi-select** to choose pieces, turn it off, and drag the group. Open the independent **Rotation tool**, enter a signed degree value and click **Rotate selected** to rotate about the selection's bounds. Lengths, quantities, physical areas, arc metadata, scale confirmation and polished edge indices are retained. Rotations and positions persist in browser storage, backups and PDF drawings.

Arrow keys move the selection by **1 inch**; Shift + arrow moves **2 inches**. These are physical increments using confirmed CAD scale, not screen pixels, and do not apply snapping. Groups with different drawing scales should be nudged separately. Inputs retain their normal arrow-key behavior.

Toggle **Snap magnet** to enable/disable snapping while dragging. Within about 10 screen pixels, moving endpoints snap to stationary endpoints or straight boundary segments in the active drawing. A group retains its relative placement. This assists contact placement rather than adding a machining allowance or an automatic slab nest.

Linked backsplashes follow their source when the source moves or rotates. Selecting both does not apply the transformation twice. Moving/rotating a linked splash on its own makes it an independent measured polygon in the same surface category; its former source will no longer move it. Placing its edge against a counter still participates in shared-cut calculation. Undo restores the link. DXF arrangement renders selected measured geometry rather than leaving the original raster contour behind; uploaded photos/PDFs remain reference backgrounds.

On the drawing canvas, spread/pinch two fingers to zoom and move their midpoint to pan. The gesture preserves the point between the fingers and does not edit pieces. Zoom buttons remain available. Touch behavior is covered in emulated Chromium; check the published app on the phones/tablets you use.

### Drawing arrangement controls

Normal selection and **Move pieces** both drag whole pieces, including CAD polygons. Tap/click the background to clear the piece selection. Rotation has its own toolbar button and panel, independent of movement. Polygon vertex handles are available only with the pen tool, preventing corner drags in selection mode from deforming a piece.

Piece names, dimensions and area text are hidden in the workspace by default. Toggle **Show piece labels** to show/hide them. This view toggle does not add labels to PDF exports or erase text embedded in uploaded reference images.

Pinch the computer trackpad over the canvas to zoom around the cursor (Ctrl-wheel pinch events and Safari gesture events). Two-finger scrolling pans the drawing. Mobile pinch zoom and the zoom buttons remain available; these view changes do not edit project measurements or undo history.

Use **Drawing slabs** to add multiple gray slabs to the active drawing, each with its own length and width in inches. They are background references, independent of the preliminary Slab planning module. Slabs use the active CAD drawing's confirmed scale, or the manual schematic scale of 2 pixels per inch. Drag an exposed slab area to position it; the panel can edit dimensions or delete each slab. They stay behind piece geometry and uploaded reference images, extend the view/PDF bounds, persist in storage/backups, and participate in undo. They appear in PDF drawings but are excluded from square footage, linear cut and polished-edge totals. They do not perform nesting, capacity checks or manufacturing optimization.

The snap magnet prioritizes nearby endpoints in both axes over a shorter edge-only snap. A backsplash whose base already touches the countertop can therefore snap its corner into alignment with the countertop's end. Away from endpoints it still snaps to straight edge segments, and a selected group keeps its relative positions.
