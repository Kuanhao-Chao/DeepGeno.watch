# Website UI Redesign, Candidate Triage & Category/Date Arrangement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Overhaul the website UI for mobile and laptop readability, display complete abstracts for candidates with interactive triage actions ("Summarize & Deep Dive" vs "Discard & Archive"), and provide dual arrangement by category and chronological date clusters.

**Architecture:** Client-reactive vanilla TypeScript/JavaScript (`explorer.js`) integrated into Astro SSG components (`PapersExplorer.astro`, `PaperRow.astro`). Manages local triage persistence in `localStorage`, dynamic grouping headers (Timeline vs Category), sticky topic pill filtering, and a floating triage drawer for batch CLI command generation and JSON export.

**Tech Stack:** Astro 5, TypeScript, Vanilla Web Standards (Web Components / DOM APIs, LocalStorage, Clipboard API), CSS Modern Features (Subgrid, Container Queries, Fluid Clamp, Variables).

**Spec:** `docs/superpowers/specs/2026-09-03-website-ui-redesign-candidate-triage-design.md`

## Global Constraints

- **Strict Validation**: All paper data must continue strictly adhering to `PublicPaperSchema` (version 2.0).
- **Zero Heavy Runtime Dependencies**: Vanilla JS and standard CSS only; no heavy external frontend frameworks.
- **Privacy & Security**: All candidate triage actions are strictly client-side. Zero sensitive tokens or private state leaked to public catalog.
- **Verification**: `npm run check` (typecheck, vitest unit tests, astro build, artifact check, privacy check, deploy dry-run) must pass cleanly at every stage.

---

### Task 1: Design System & Responsive Typography Tokens (`apps/web/src/styles/global.css`)

**Files:**
- Modify: `apps/web/src/styles/global.css:1-250`

**Interfaces:**
- Consumes: CSS variables in `:root` and `@media (prefers-color-scheme: dark)`.
- Produces: Enhanced typography scale, card surface variables (`--color-surface-hover`, `--color-accent-badge`, `--fs-abstract`), segmented switch styles, category pill bar styles, and floating triage drawer styles.

- [ ] **Step 1: Inspect and prepare CSS tokens**
Verify current CSS token definitions and additions needed for segmented switches, category pill bar, abstracts, and triage status indicators.

- [ ] **Step 2: Update `global.css` with responsive design tokens and component styling**
Add tokens and CSS rules for:
  - `.segmented-switcher`: pill button group for view switching (Timeline, By Category, Search).
  - `.category-pills`: sticky horizontal scrollable category navigation bar with counts.
  - `.abstract-panel`: readable abstract container with optimized line length (`max-width: 72ch`), comfortable line-height (`1.68`), and subtle border.
  - `.triage-btn-group`: responsive button group for `Deep Dive` and `Archive` actions.
  - `.triage-badge`: visual tags (`Deep Dive Queued`, `Archived`).
  - `.triage-drawer`: floating bottom action bar with smooth transitions and backdrop blur.
  - Responsive layout media queries (`@media (max-width: 48rem)` and `@media (max-width: 32rem)`).

- [ ] **Step 3: Verify build and formatting**
Run: `npm run build`
Expected: Static build completes with no CSS syntax errors.

- [ ] **Step 4: Commit design system updates**
```bash
git add apps/web/src/styles/global.css
git commit -m "style: modernize design tokens, responsive typography, and triage styles"
```

---

### Task 2: Enhanced Paper Card & Interactive Triage Actions (`apps/web/src/components/PaperRow.astro`)

**Files:**
- Modify: `apps/web/src/components/PaperRow.astro:1-229`

**Interfaces:**
- Consumes: `PaperEntry` from `../lib/papers`.
- Produces: Rendered paper row with:
  - `data-slug={data.slug}`
  - `data-title={data.title}`
  - `data-category={data.topics[0] || data.tags[0]}`
  - Expandable full abstract section with readable card styling.
  - Candidate triage controls:
    - Button: `✨ Deep Dive` (`data-triage-action="deep-dive"`)
    - Button: `🗑️ Archive` (`data-triage-action="archived"`)
    - Button: `↺ Reset` (`data-triage-action="reset"`)
  - Triage badge placeholder (`data-triage-badge`) for live client status rendering.

- [ ] **Step 1: Update `PaperRow.astro` markup and styling**
Enhance `PaperRow.astro` to include:
  - Clear date and venue chips in the card header.
  - Prominent article title and full authors list.
  - Distinct hook styling and full abstract section with formatted `<details>` or styled container.
  - Action button cluster with `✨ Deep Dive` and `🗑️ Archive`.
  - Dynamic status indicator for triage state.
  - Mobile card layout adjustments (stacked metadata, ergonomic thumb-tap targets).

- [ ] **Step 2: Verify typecheck and build**
Run: `npm run typecheck && npm run build`
Expected: PASS with 0 errors.

- [ ] **Step 3: Commit PaperRow component updates**
```bash
git add apps/web/src/components/PaperRow.astro
git commit -m "feat(web): add interactive triage controls and responsive layout to PaperRow"
```

---

### Task 3: Taxonomy Navigation, Segmented Switcher & Floating Triage Drawer (`apps/web/src/components/PapersExplorer.astro`)

**Files:**
- Modify: `apps/web/src/components/PapersExplorer.astro:1-240`

**Interfaces:**
- Consumes: `PaperEntry[]`, `tags`, `uniqueValues`.
- Produces:
  - View switcher control (`data-view-switcher`): "Timeline (By Date)", "By Category", "Filter & Search".
  - Sticky category filter bar (`data-category-bar`): pill buttons for topics with live counts.
  - Abstract visibility toggle (`data-toggle-all-abstracts`): "Expand All Abstracts" / "Collapse All Abstracts".
  - Floating triage drawer (`data-triage-bar`):
    - Real-time counters: `Deep Dive (N)`, `Archived (N)`.
    - "Copy CLI Commands" button (`data-triage-copy-cli`).
    - "Export Triage JSON" button (`data-triage-export-json`).
    - "Show Triage Only" toggle (`data-triage-filter-only`).
    - "Clear" button (`data-triage-clear`).

- [ ] **Step 1: Update `PapersExplorer.astro` template and styles**
Add markup for:
  - Top control bar with View Mode Switcher and "Expand All Abstracts" button.
  - Sticky category pills bar generated from available topics and tags.
  - Floating triage drawer HTML docked at viewport bottom.
  - Responsive styles ensuring zero overlap with paper content.

- [ ] **Step 2: Verify typecheck and build**
Run: `npm run typecheck && npm run build`
Expected: PASS with 0 errors.

- [ ] **Step 3: Commit PapersExplorer component updates**
```bash
git add apps/web/src/components/PapersExplorer.astro
git commit -m "feat(web): add view mode switcher, sticky category bar, and triage drawer to PapersExplorer"
```

---

### Task 4: Client-Side Interactive Controller (`apps/web/public/explorer.js`)

**Files:**
- Modify: `apps/web/public/explorer.js:1-103`

**Interfaces:**
- Consumes: DOM elements from `PapersExplorer.astro` and `PaperRow.astro`.
- Produces:
  - Triage state management (`localStorage` key: `deepgeno_triage_v1`).
  - Triage actions handler: updates local storage, toggles row visual classes, updates floating triage bar counters.
  - "Copy CLI Commands" clipboard handler: formats `gh workflow run summarize.yml -f paper_id=...` commands for all `deep-dive` selected papers.
  - "Export Triage JSON" handler: creates downloadable Blob with structured triage decisions.
  - Global "Expand / Collapse All Abstracts" handler.
  - Category pill 1-click filtering synced with existing search form and URL query params.
  - Dynamic View Mode Manager:
    - `timeline`: Inserts sticky/divider date headings ("Today · Sep 3, 2026", "Late August 2026", "Earlier").
    - `category`: Groups items by primary topic with category section headers.
    - `search`: Standard query/filter view.

- [ ] **Step 1: Implement enhanced `explorer.js` logic**
Write the comprehensive client controller handling:
  - Initial state hydration from `localStorage`.
  - Event delegation for triage buttons (`deep-dive`, `archived`, `reset`).
  - View mode switching with DOM grouping logic.
  - Category pill active state toggling and filtering.
  - Clipboard copy with toast notification ("Copied N commands to clipboard!").
  - JSON file download.
  - Global abstract disclosure expand/collapse.

- [ ] **Step 2: Verify client script and build**
Run: `npm run check`
Expected: PASS with 0 errors, static artifacts checked.

- [ ] **Step 3: Commit explorer client controller**
```bash
git add apps/web/public/explorer.js
git commit -m "feat(web): implement client triage state, dynamic grouping, and export actions in explorer.js"
```

---

### Task 5: Reading List & Editorial Polish (`apps/web/src/pages/reading-list/index.astro`, `apps/web/src/pages/papers/index.astro`)

**Files:**
- Modify: `apps/web/src/pages/reading-list/index.astro:1-208`
- Modify: `apps/web/src/pages/papers/index.astro:1-16`

**Interfaces:**
- Consumes: `getPapers()`, `PapersExplorer`.
- Produces:
  - Refined `/reading-list/` page featuring:
    - Daily Survey Briefing with responsive theme cards.
    - Default triage mode highlighted for candidate paper review.
    - Live counters of candidate papers awaiting editorial decisions.
  - Polished `/papers/` catalog page.

- [ ] **Step 1: Polish `reading-list/index.astro` and `papers/index.astro`**
Update page headers, copy, and layout to guide the user into triaging scanned paper candidates and exploring by date or category.

- [ ] **Step 2: Verify typecheck and build**
Run: `npm run check`
Expected: PASS with 0 errors.

- [ ] **Step 3: Commit page improvements**
```bash
git add apps/web/src/pages/reading-list/index.astro apps/web/src/pages/papers/index.astro
git commit -m "feat(web): polish reading list triage hub and catalog pages"
```

---

### Task 6: Comprehensive Verification & Quality Gates

**Files:**
- Test / Verify all touched files.

**Interfaces:**
- Consumes: Test runners, linters, and build pipelines.
- Produces: Passing test reports, verified responsive layout, and deployment dry-run.

- [ ] **Step 1: Run full check suite**
Run: `npm run check`
Expected: 
  - `astro check`: 0 errors, 0 warnings.
  - `tsc`: 0 errors.
  - `vitest`: 219/219 tests pass.
  - `astro build`: 19 pages generated cleanly.
  - `artifact:check`: Pass.
  - `privacy`: Pass.
  - `deploy:dry-run`: Pass.

- [ ] **Step 2: Commit any final test or formatting adjustments**
```bash
git add -A
git commit -m "chore: format and verify UI redesign and candidate triage system"
```
