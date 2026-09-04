# Design Specification: Website UI Redesign, Candidate Triage & Category/Date Taxonomy

**Date:** 2026-09-03  
**Status:** Approved for Implementation  
**Target Repository:** `Kuanhao-Chao/DeepGeno.watch`  
**Feature Branch:** `feat/ui-redesign-triage-categories`  

---

## 1. Overview & Objectives

This specification defines the architecture, user experience, and implementation details for three major enhancements to `DeepGeno.watch`:

1. **Comprehensive UI/UX Redesign for Laptop & Mobile**:
   - Overhaul typography, spacing scale, card aesthetics, and responsive layout to achieve high readability and elegance on screens from mobile phones (320px–768px) to laptops and large displays (1024px–1600px+).
   - Introduce comfortable reading containers with optimal line length (65–75ch) for abstracts, crisp metadata tags, fluid responsive gutters, and clear visual hierarchy.

2. **Scanned Paper Candidate Triage System**:
   - Display the **full abstract** for every candidate paper, with individual card expand/collapse toggles and a global "Expand All Abstracts" switch.
   - Provide interactive candidate action controls on each paper card:
     - **`✨ Summarize & Deep Dive`**: Flags candidate for deep-dive technical synthesis.
     - **`🗑️ Discard & Archive`**: Flags candidate as archived/dismissed from the active queue.
     - **`↺ Reset`**: Restores the candidate to unreviewed status.
   - Persist triage decisions in `localStorage` (`deepgeno_triage_decisions:v1`).
   - Introduce a **Floating Triage Action Bar** at the bottom of the screen that tracks selected counts in real time and offers:
     - 1-click **"Copy CLI Commands"** (`gh workflow run summarize.yml -f paper_id=...`).
     - **"Export Triage JSON"** to download the decision batch.
     - Filter toggle to view only "Deep Dive Selected" or "Archived" papers.

3. **Dual Arrangement System (Category & Date)**:
   - Provide an intuitive **Segmented View Switcher**:
     - **"Timeline (By Date)"**: Groups papers into chronological clusters (e.g., *Today · Sep 3, 2026*, *Late August 2026*, *Mid August 2026*).
     - **"By Category"**: Groups papers under structured genomic domains (*DNA Language Models*, *RNA Models*, *Sequence to Function*, *Single-Cell Learning*, *Epigenomics & 3D Genome*, *Protein Models*).
     - **"Standard Explorer"**: The flat list with multi-parameter filter form.
   - A **Sticky Category Pill Bar** at the top of the explorer with 1-click domain filtering and paper count chips.

---

## 2. Architecture & File Structure

```
apps/web/
├── public/
│   └── explorer.js              # Enhanced with view modes, triage state, and date/category groupings
├── src/
│   ├── components/
│   │   ├── PapersExplorer.astro # Updated with view switcher, category pill bar, and triage drawer
│   │   └── PaperRow.astro       # Modern card redesign with triage buttons, full abstract & status tags
│   ├── layouts/
│   │   └── PageLayout.astro     # Responsive container refinements
│   ├── pages/
│   │   ├── index.astro          # Hero and latest section layout refinements
│   │   ├── papers/index.astro   # Full catalog view using new explorer features
│   │   └── reading-list/
│   │       └── index.astro      # Reading list & triage hub with daily survey briefing
│   └── styles/
│       └── global.css           # Modernized design tokens, typography, card layout, and triage styles
```

---

## 3. Detailed Component Specifications

### 3.1 Design System & Typography (`global.css`)
- **Typography Scale**:
  - Headings: `font-family: var(--font-display)` with balanced `letter-spacing: -0.025em` and tighter line heights (`1.15–1.25`).
  - Body & Abstracts: `font-family: var(--font-body)` with `line-height: 1.65` and `max-width: 70ch` to prevent eye strain.
  - Metadata & Badges: `font-family: var(--font-mono)` and uppercase display font for micro-labels.
- **Responsive Layout**:
  - Fluid padding using `clamp()` across containers (`--gutter: clamp(1rem, 4vw, 2.5rem)`).
  - Mobile cards: Clean bordered cards with rounded corners (`var(--radius-md, 8px)`), stacked metadata, and minimum 44px touch targets for buttons.
  - Desktop/Laptop: Multi-column grid with clear alignment between date/venue, title/hook/abstract, and status/action clusters.

### 3.2 Paper Card & Triage Actions (`PaperRow.astro`)
- **Elements**:
  1. **Header / Metadata**: Date formatted clearly (`Sep 3, 2026`), venue/source badge (`bioRxiv`, `Nature`, `arXiv`), and publication link.
  2. **Title & Authors**: Title linking to paper page, with full author list formatted cleanly.
  3. **Editorial Hook**: 1–2 sentence summary of core takeaway.
  4. **Full Abstract Card**:
     - Expandable `<details>` or styled card showing the complete paper abstract.
     - Styled with subtle surface tint, crisp border, and high-readability typography.
  5. **Topic Tags**: Topic chips (`dna-language-model`, `epigenomics`, etc.) with quick-filter links.
  6. **Candidate Triage Controls**:
     - Button: `✨ Deep Dive` (toggles deep-dive candidate flag).
     - Button: `🗑️ Archive` (toggles discard/archive flag).
     - Status Badge: Displays `Deep Dive Queued` (emerald) or `Archived` (muted) when marked.

### 3.3 Explorer & Taxonomy Navigation (`PapersExplorer.astro` & `explorer.js`)
- **Segmented View Switcher**:
  - `[ Timeline (Date) ]` | `[ By Category ]` | `[ Filter & Search ]`
- **Sticky Category Pill Bar**:
  - Horizontal scrollable pill list:
    - *All Topics*
    - *DNA Language Models*
    - *RNA Language Models*
    - *Sequence to Function*
    - *Single-Cell Deep Learning*
    - *Epigenomics & 3D Genome*
    - *Protein Language Models*
    - *Variant Effect Prediction*
  - Active pill highlights with counts.
- **Global Abstract Toggle**:
  - Button: "Expand All Abstracts" / "Collapse All Abstracts".
- **Dynamic Grouping**:
  - When in "Timeline" mode: Client-side JS groups items under date headers (e.g. "Today · Sep 3, 2026", "Late August 2026", "Earlier").
  - When in "By Category" mode: Client-side JS groups items under topic headers with domain icons and counts.

### 3.4 Floating Triage Action Bar (`explorer.js` & `PapersExplorer.astro`)
- **Docked at the bottom of the viewport** (with smooth fade/slide-up when selections exist):
  - Shows counters: `✨ Deep Dive: X` | `🗑️ Archived: Y`.
  - Action 1: **"Copy CLI Commands"** — Copies `gh workflow run summarize.yml -f paper_id=...` commands for all selected papers to clipboard.
  - Action 2: **"Export Triage JSON"** — Generates and downloads `triage-decisions-YYYY-MM-DD.json`.
  - Action 3: **"Filter: Triage Only"** — Shows only papers that have been triaged.
  - Action 4: **"Clear"** — Resets local triage decisions.

---

## 4. Client State Management & Persistence

- State key: `localStorage.getItem('deepgeno_triage_v1')`.
- Schema:
  ```json
  {
    "decisions": {
      "paper-slug-1": { "status": "deep-dive", "updatedAt": "2026-09-03T18:50:00Z" },
      "paper-slug-2": { "status": "archived", "updatedAt": "2026-09-03T18:51:00Z" }
    }
  }
  ```
- Reactivity:
  - Event listeners on triage buttons update `localStorage` and trigger instant CSS class toggles on paper rows.
  - Triage bar counter updates immediately.
  - Filtering respects both URL query params and local triage state filters.

---

## 5. Mobile & Responsive Design Specifics

- **Mobile Viewport (320px – 768px)**:
  - Triage buttons expand to full width or 50/50 split buttons for ergonomic thumb tapping.
  - Horizontal scrolling for category pills with gradient masks indicating scrollability.
  - Floating triage bar becomes a bottom docked drawer with touch-friendly controls.
  - Details/abstract disclosure summary target area padded to ≥44px.
- **Laptop / Large Screen (1024px+)**:
  - 3-column structured grid per paper: [Date & Source] [Title, Authors, Hook, Abstract, Tags] [Editorial Badges & Triage Actions].
  - Sticky header navigation and pill bar remain fixed during scroll.

---

## 6. Verification & Quality Gates

1. **Codebase Integrity**:
   - Full test suite must pass: `npm run check` (typecheck, vitest unit tests, astro build, artifact check, privacy check, deploy dry-run).
2. **Visual & Interaction Verification**:
   - Check rendered pages on mobile (375px), tablet (768px), and laptop (1280px).
   - Test view switcher: Timeline vs Category vs Filter list.
   - Test category pill filtering.
   - Test "Expand/Collapse All Abstracts".
   - Test triage buttons, localStorage persistence across page reloads, and "Copy CLI Commands" functionality.
3. **Zero Security/Privacy Leakage**:
   - No private tokens or private state leaked to public catalog.
