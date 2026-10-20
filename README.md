# Countertop Calculator

A private, browser-based workspace for manual countertop takeoffs. React + TypeScript + Vite. No accounts, paid services, AI requests, server, or API keys.

## Use the app

1. Choose **Explore a sample project** to learn with editable example measurements, or **New project**.
2. Give the project a name. Upload PNG, JPEG, or PDF drawings. PDF pages appear individually in the drawing selector. Each file may be up to 25 MB; PDFs up to 30 pages; images up to 40 megapixels.
3. Add individual Straight, L-shape, U-shape, Island, Peninsula, Polygon, Backsplash, or Waterfall pieces. Select the piece to edit its dimensions and drawing reference. All dimensions are in inches; enter `96`, `25.5`, or `25 1/2`.
4. For L / U shapes, enter external X/Y dimensions and independent top (back), left, and right leg depths. The schematic shows the exact orientation. Island, backsplash, waterfall, and polygon dimensions are never supplied silently. Ordinary run depths are labeled assumptions requiring confirmation.
5. Use select to move schematic annotations, hand to pan, and +/- to zoom. Drawing positions are preserved in original image coordinates. An ordinary shape overlay is an illustrative schematic, **not** an inference of image scale. Its position does not establish its physical relationship to another piece.
6. For irregular shapes, select the pen and click vertices around the real boundary in order. Select to drag vertices; double-click a vertex to remove it. Use the ruler to select the endpoints of a known measurement and enter its real length. Apply the scale, then explicitly confirm it. The plan must be flat and uniformly scaled; do not calibrate perspective photos, distorted scans, or drawings marked “not to scale.” A wrong scale produces a wrong area. Scale confirmation resets when vertices change. You can edit exact image coordinates in the polygon panel.
7. In **Review & approve**, confirm whether horizontal pieces are physically separate. For connected / overlapping surfaces, choose shared coordinates and enter each piece's measured X/Y origin in inches. The engine calculates their union. Coordinate axes and orientations must match across drawings. Rectilinear shapes cannot rotate directly: use a properly scaled polygon for rotated pieces. If placement is unknown, leave the project unapproved and obtain measurements. Do not declare overlapping surfaces separate.
8. Resolve all listed problems and approve the project. Any subsequent project edit invalidates approval. Open **Reports** for the approved PDF, or export the active drawing as an annotated PNG. PDFs use the approved project state and list assumptions and separate categories. Original PDF pages are rasterized for annotation; original PDF bytes are not retained.
9. Download **Backup** regularly. Use **Restore backup** on the dashboard on another device. Restored projects receive new IDs and must be reviewed and approved again. Projects are stored only in IndexedDB in the current browser; clearing its data removes them. There is no automatic synchronization. No private drawings belong in this repository.

Horizontal totals include sink and cooktop openings; no cutout deductions are performed. Backsplash and waterfall are separate material categories. Combined material is explicitly labeled. No waste, pricing, joint allowance, or minimum billing is added. This is preliminary measurement / fabrication planning, not a CNC cutting system.

## Publish from your browser — GitHub Pages

No local development installation is required.

1. In Codex, review the changed files and test results. Changes are committed locally in coherent groups; this does not push them or publish a website. Use the available **Create PR** / push action in your Codex interface to send the task branch to `gabrielmarinhmori/countertop-calculator`. If your interface offers a commit step first, complete that step. Open the pull request on GitHub, review **Files changed**, and check the automated build.
2. On GitHub open the repository → **Settings** → **Pages** → **Build and deployment** → **Source** → **GitHub Actions**. You need repository administration permission. If Actions are disabled, enable them in **Settings → Actions → General**. No access token or API key should be placed in the code.
3. Merge the reviewed pull request into **main**. The included workflow runs on pushes to main, validates the geometry tests, builds the site, and deploys the `dist` artifact. Pull requests validate only; they do not deploy. You can also run **Actions → Validate and deploy Pages → Run workflow** on main after enabling Pages.
4. Open **Actions** and select the latest workflow run. Both **build** and **deploy** must be green. Click a failed job to see its logs; a merge alone is not proof of publication. If deploy says Pages is not enabled, complete step 2 and rerun the workflow. Organization policies or private-repository plan restrictions may require an administrator.
5. Only after successful deployment, use the actual link displayed in **Settings → Pages** or the workflow's **github-pages** deployment. No live deployment has been verified during implementation. Vite uses relative asset paths, so repository subpaths work without hardcoding the repository name.
6. Open that same published link on a computer and phone. Create a sample project, upload a drawing, edit dimensions, reload, approve, and download a report. The two devices have separate project storage; transfer a backup explicitly if needed. Test the actual browsers you intend to use. The interface is responsive, but automated mobile validation emulates Chromium, not every mobile browser.

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
- `src/main.tsx`: dashboard, project editor, original-coordinate SVG annotation tools, review and reporting UI.
- `src/storage.ts`: IndexedDB project and drawing persistence; writes are queued by the UI to preserve edit order.
- `src/restore.ts`: allowlisted project backup validation. Approval and confirmations are reset on import.
- `src/reports.ts`: jsPDF reports with explicit pagination between piece blocks, separated totals, assumptions, and annotated drawing pages; PNG canvas export.
- `src/recognition.ts`: future provider boundary and runtime schema validation. No provider is enabled.

Area uses square inches internally; square feet = square inches / 144. L / U outlines describe the actual leg union, including unequal depths; corners are counted once. Shared-position project union prevents connected peninsula overlap from being counted twice. Per-piece areas are gross and may sum to more than a shared union total. Holes from sink / cooktop cutouts are intentionally absent.

**Specification arithmetic correction:** `(96 × 25.5 + 60 × 25.5 − 25.5 × 25.5) / 144 = 23.109375`, displayed as **23.11 sq ft**. The requested example's 23.10 was inconsistent with its formula. Tests preserve the correct mathematical result. The whole-inch L example remains 22.74 sq ft.

## Future AI integration

Implement `RecognitionProvider` via a secure backend / serverless function. API credentials must stay on that backend. Validate its unknown response with `validateSuggestion` before presenting proposals. The schema contains boundaries, raw dimension strings, confidence, and uncertainty — never area totals. A future import UI must present suggestions for explicit editing and confirmation, parse each measurement with the deterministic engine, and reject missing constraints. Do not convert a confidence score into an approved measurement. The current manual review and whole-project approval must remain mandatory.

## Scope and limitations

Implemented: all requested shape families, multiple projects / drawings / PDF pages, editable dimensions / polygon vertices, zoom and pan, separate category totals, shared-coordinate overlap union, approval invalidation, PDF / PNG exports, dashboard management, local storage, backup restore, sample project, deterministic tests, static build, and Pages workflow.

Not implemented: automatic measurement recognition, AI proposals UI, accounts / sync, price / waste calculations, perspective correction, direct rotated rectangle tools, optional sink / cooktop annotation tools, vector-preserving PDF exports, or CNC output. Uploaded drawings cannot determine physical measurements by themselves. The user supplies and verifies all measurements, scale, and surface relationships. IndexedDB capacity and privacy settings vary by browser. Back up important work; this foundation has not been validated for safety-critical fabrication or all browsers. Publishing and live-site verification still require the GitHub steps above.

## DXF import — shared boundaries, categories, and circular arcs

The drawing uploader accepts ASCII `.dxf` files up to 10 MB. All geometry is processed locally, without AI or API keys. Two synthetic examples are included: `public/examples/sample-countertop-inches.dxf` (96 × 25 1/2 inches, 17.00 sq ft) and `public/examples/shared-border-curved-counter.dxf` (a curved counter sharing a white border with a red splash). Customer files are not included in the repository.

1. Export actual-size 2D geometry in model space. Supported: LINE segments, ARC entities, and closed LWPOLYLINE / 2D POLYLINE boundaries, including circular bulges. Open linework can form a region when it joins other edges into a closed face. A split line and a border shared by neighboring pieces no longer require a separate closed polyline per piece.
2. Import one DXF at a time using **Upload drawing**. Confirm inches, feet, millimeters, centimeters, or meters. `$INSUNITS` suggests a unit but does not approve it. Coordinates determine measurements; text dimension labels are not read as geometry.
3. Review the reconstructed regions. The owner's convention is suggested: **white/yellow = countertop boundary, red = back/side splash**. A region using red boundary edges is suggested as splash, including a red panel that borrows a white counter border. These suggestions are not semantic CAD recognition: inspect each region and use its category selector to override Countertop / Back-side splash / Waterfall. Unexpected colors or mixed-color construction edges need manual classification.
4. Click a numbered region in the preview or check its row to include it. No region is selected automatically. Select full physical surfaces, not sink/cooktop openings, borders, or accidental slivers. Very small enclosed regions are flagged, never silently removed or automatically included. All openings remain part of the full countertop surface; do not select an interior opening as another piece.
5. Review processing notes. The importer splits intersections and reuses shared edge fragments when finding bounded faces. Exact/overlapping duplicates are merged. Numerical endpoint cleanup is limited to **0.0000001 source DXF units**, displayed in review; it handles export floating-point dust, not actual missing measurements. Larger gaps remain open. Orange dashed edges are unresolved and contribute no area. A missing required boundary must be corrected in CAD before treating the project as complete.
6. Confirm units, selected regions, category assignments, and warnings. Importing does not approve the project. Each region becomes an independent piece; backsplash/waterfall polygon faces retain their own category and quantity, separate from countertops.
7. Confirm physical placement in project review. Regions from one reconstruction partition the drawing into non-overlapping enclosed faces, but actual material relationships still need your verification. Independent imports have separate display fitting, so they need measured alignment before using shared-coordinate overlap calculations.

Circular areas use the analytical chord-plus-circular-segment formula `r² × (theta − sin(theta)) / 2`, added with orientation to the chord shoelace area. Sampled display vertices do not determine the reported curved area. SVG paths and canvas exports retain circular arcs. Curved CAD boundaries remain read-only in the polygon editor to avoid accidentally converting them to straight chords; edit the original CAD geometry and reimport. The verified scale remains editable, with approval invalidated after edits. Backup/restore preserves arcs and categories while resetting confirmations and approval.

**Current limit:** overlap union involving multiple horizontal surfaces with circular arcs is blocked. It is not approximated with sampled polygons. Choose **separate physical surfaces** only after verifying that the pieces do not overlap. A single curved horizontal piece is supported, and curved splash/waterfall areas stay separate. Arbitrary shared curved unions need a future analytic union implementation.

Unsupported: splines/ellipses, block expansion, 3D/transformed/thick geometry, DWG, arbitrary gap filling, and reading measurement text. Reconstruction is limited to 2,000 source edges per layer and a 50,000-vertex preview; complex drawings should be exported by relevant layers. Parsing/reconstruction runs in a worker with a timeout. Review warnings for omitted geometry; do not assume every detected region is a real piece or that every entity was imported. The original DXF stays on your device; projects store the selected geometry, converted scale, curved boundaries, and a drawing image rather than the original DXF bytes.

## Access control — deferred; public hosting retained

The current site remains public and **has no login**. The owner has chosen to keep GitHub Pages public and implement DXF only for now. A username/password embedded in frontend JavaScript or a localStorage flag would not restrict access to a GitHub Pages site, so neither is implemented. Never commit passwords to this repository or expose them as Vite build variables.

To restrict access to the entire site, use a host with server/edge access control (for example Cloudflare Pages with Cloudflare Access, after configuring the domain and an allowlist of authorized identities). GitHub can remain the source repository. Standard Cloudflare Access uses configured identity/email login rather than an arbitrary shared username/password; an exact shared username/password would need a separate server-side authentication implementation and secret settings. Supabase can authenticate application users, but a frontend login alone does not make public GitHub Pages assets private. A hosting and identity decision will be needed if access control is requested later. DXF processing needs no authentication provider, AI service, or API key.


### QCAD: recommended first export

- Work in model space, at actual size, and confirm **Edit → Drawing Preferences → General → Drawing Unit** is **Inch**. Menu wording can vary by QCAD version.
- Either **R27 [2013] DXF drawing** or **R32 [2018] DXF drawing** can contain the supported entities. Version alone does not determine whether a contour is closed. An actual R32/AC1032 QCAD export in inches has now been exercised through parsing, browser import, category assignment, arc preservation, backup, and PDF generation. R27/AC1027 header parsing also has an automated test. Other entity constructions may still be unsupported.
- A rectangle made from four separate lines can import if the endpoints match exactly and all four lines are on the same layer. Numerical dust is cleaned at the displayed tolerance, duplicate edge fragments are merged, and shared borders are reconstructed. Genuine gaps remain unresolved.
- If a contour cannot import, use QCAD’s **Polyline → Create from Segments** tool to build a closed polyline from the outer boundary, and check the closed state in its property editor. Retain actual geometry; never close an unknown gap by guessing dimensions.
- Keep countertop outer outlines separate from text, paper borders, sink/cooktop cutouts, and construction lines. Select only the intended outer contours in the import review.
- Start with a known **96 × 25 1/2-inch rectangle**. The preview should show **17.00 sq ft**. Confirm **inches** explicitly even if the file header suggests them. If a known length differs, correct the drawing/export units rather than accepting the result.
