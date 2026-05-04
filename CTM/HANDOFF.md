# CTM316 — Color Token Manager · HANDOFF DOCUMENT

> Version: 1.0 · Date: 2026-05-04 · Author: rahil316

---

## Table of Contents

1. [Product Overview](#product-overview)
2. [Architecture](#architecture)
3. [Web App](#web-app)
   - [Index.html](#indexhtml)
   - [Utils.js](#utilsjs)
   - [ClrGen.js](#clrgenjs)
   - [UiGen.js](#uigenjs)
   - [DocGen.js](#docgenjs)
4. [Figma Plugin](#figma-plugin)
   - [scripts.js](#scriptsjs)
   - [ui.html](#uihtml)
5. [Data Model](#data-model)
6. [State Management](#state-management)
7. [Export Formats](#export-formats)
8. [Test Suite](#test-suite)
9. [Known Limitations](#known-limitations)
10. [Ship Checklist](#ship-checklist)

---

## Product Overview

CTM316 is a **Color Token Manager** that generates perceptually-balanced color ramps and semantic design tokens from base hex colors. It ships as two surfaces:

| Surface | Location | Use case |
|---|---|---|
| **Web App** | `CTM/Web_App/` | Full design system authoring, export to CSS/SCSS/CSV/JSON |
| **Figma Plugin** | `CTM/Figma_Plugin/` | Sync generated tokens directly into Figma Variables |

The system takes a list of named base colors and a set of role definitions, then automatically builds light-theme and dark-theme token sets that meet configurable WCAG contrast requirements.

---

## Architecture

```
CTM/
├── Web_App/
│   ├── Index.html          — Shell, Tailwind CDN, CSS design tokens, theme toggle
│   ├── JS/
│   │   ├── Utils.js        — Pure color math (no DOM, no state)
│   │   ├── ClrGen.js       — Color ramp + token generation engine
│   │   ├── UiGen.js        — DOM rendering, sidebar controls, event wiring
│   │   └── DocGen.js       — Export formatters (CSS, SCSS, CSV)
│   └── tests/
│       └── ctm.test.js     — 119-test suite (node --test)
└── Figma_Plugin/
    ├── manifest.json
    ├── scripts.js          — Figma API host (sandboxed, no DOM)
    └── ui.html             — Plugin iframe UI (mirrors Web App UI)
```

**Dependency order** (scripts must load in this sequence):
```
Utils.js → ClrGen.js → UiGen.js → DocGen.js
```

All JS files are plain ES5-compatible scripts (no bundler). They use `module.exports` / `window` dual-export so they work in both Node (tests) and the browser.

---

## Web App

### Index.html

Single-page shell. Responsibilities:
- Loads Tailwind CSS from CDN (`https://cdn.tailwindcss.com`)
- Provides CSS custom properties (design tokens) in `:root` and `body.app-light-mode`
- Hosts the structural HTML: `<header>`, `<aside>` (sidebar), `<main>` (token display)
- Contains the **drag-drop overlay** (`#drop-overlay`) and **import confirm dialog** (`#import-confirm-dialog`)
- Boots the app by calling `initializeColorControls()` on `DOMContentLoaded`
- Wires the light/dark theme toggle (`toggleThemeBtn`)

**Internal `<style>` block:** All rules are functional-only (CSS variables, pseudo-elements, JS-toggled state classes, keyframes, print media). Nothing here can be replaced by Tailwind utility classes.

---

### Utils.js

**Pure color math utilities. No side effects, no DOM, no globals written.**

All functions are exported via `module.exports` and attached to `window` automatically when loaded in a browser.

#### `validHex(hex) → boolean`
Returns `true` if `hex` is a string matching a 3- or 6-character hex pattern (with or without `#`).

#### `normalizeHex(hex) → string | null`
Normalises any valid hex input to uppercase 6-character `#RRGGBB` form. Expands 3-char shorthand. Returns `null` for invalid input.

#### `hexToRgb(hex) → [r, g, b] | null`
Converts a hex color string to an `[r, g, b]` tuple (0–255 each). Returns `null` for invalid input.

#### `rgbToHsl(r, g, b) → [h, s, l] | null`
Converts RGB (0–255) to HSL (`h` 0–360°, `s` 0–100, `l` 0–100). Handles achromatic (grey) case where `max === min`. Returns `null` if any channel is out of range or non-numeric.

#### `hexToHsl(hex) → [h, s, l] | null`
Convenience wrapper: `hexToRgb` → `rgbToHsl`.

#### `hexToHue(hex) → number | null`
Returns only the hue component of a hex color's HSL representation.

#### `hexToSat(hex) → number | null`
Returns only the saturation component.

#### `hexToLum(hex) → number | null`
Returns only the lightness component (HSL "L", not WCAG luminance).

#### `hslToRgb(h, s, l) → [r, g, b] | null`
Converts HSL to RGB. Full branch coverage across all 6 hue sectors (0°–60°, 60°–120°, 120°–180°, 180°–240°, 240°–300°, 300°–360°). Returns `null` for out-of-range inputs.

#### `rgbToHex(r, g, b) → string | null`
Converts 0–255 RGB to `#RRGGBB`. Returns `null` for out-of-range or non-numeric inputs.

#### `hslToHex(h, s, l) → string | null`
Convenience: `hslToRgb` → `rgbToHex`.

#### `relLum(hex) → number | null`
Computes **WCAG 2.1 relative luminance** using gamma-corrected channel weights (`0.2126R + 0.7152G + 0.0722B`). Uses `x / 12.92` for linearisation of channels ≤ 0.03928 and `((x + 0.055) / 1.055)^2.4` otherwise.

#### `contrastRatio(hex1, hex2) → number | null`
Returns the **WCAG 2.1 contrast ratio** `(L_high + 0.05) / (L_low + 0.05)`, rounded to 2 decimal places. Symmetric. Returns `null` for invalid inputs.

#### `contrastRating(hex1, hex2) → "Fail" | "AA Large" | "AA" | "AAA" | null`
Maps a contrast ratio to its WCAG 2.1 tier:
- `< 3` → `"Fail"`
- `3–4.5` → `"AA Large"` (decorative / large text)
- `4.5–7` → `"AA"`
- `≥ 7` → `"AAA"`

#### `seriesMaker(x) → number[]`
Returns `[1, 2, ..., x]`. Used to auto-generate step names when none are supplied.

#### `slugify(str) → string`
Lowercases, trims, strips non-word characters, collapses whitespace/hyphens/underscores to single dashes, strips leading/trailing dashes.

---

### ClrGen.js

**Core generation engine. Stateless computation plus a single in-memory result cache.**

#### `demoConfig` (module-level constant)
The default color scheme loaded at startup. Contains `colors`, `roles`, `themes`, ramp parameters. **Not exported** but referenced globally by UiGen. It is the initial baseline; a frozen snapshot is stored in `UiGen.js` for dirty-checking without mutating this object.

#### `colorRampMaker(hexIn, rampLength, rampType) → string[]`

Generates a color ramp of `rampLength` hex values from the seed color `hexIn`. All ramps are returned **darkest-first (index 0 = darkest)**.

| `rampType` | Algorithm |
|---|---|
| `"Linear"` | Even HSL lightness steps from 0→100 |
| `"Balanced"` | Logarithmic luminance spacing via 30-iteration binary search targeting evenly-spaced WCAG relative luminances |
| `"Balanced (Natural)"` | Same as Balanced but saturation is reduced toward extremes by a power curve (`s *= (1 - |L-50|/50)^1.5 * 0.4`) to simulate natural pigment behavior |
| `"Balanced (Dynamic)"` | Natural + hue rotation: light steps shift toward 60° (warm), dark steps shift toward 240° (cool) |
| `"Symmetric"` | Balanced, then all steps are shifted so the midpoint lands at ≈50% lightness |
| other | Returns `[]` |

#### `variableMaker(config) → { colorRamps, colorTokens, errors }`

Main system generator. Accepts a full config object and returns:

```js
{
  colorRamps: {
    [colorName]: {
      [stepName]: {
        value: "#RRGGBB",
        stepName: "primary-5",
        shortName: "Pr-5",
        contrast: {
          light: { ratio: 4.52, rating: "AA" },
          dark:  { ratio: 11.3, rating: "AAA" },
        }
      }
    }
  },
  colorTokens: {
    light: { [colorName]: { [roleIndex]: { weakest, weak, base, strong, stronger } } },
    dark:  { /* same shape */ }
  },
  errors: { critical: [], warnings: [], notices: [] }
}
```

**Caching:** Uses a JSON hash of all color values, ramp params, role config, and theme backgrounds. Identical inputs return the exact same object reference — safe for `===` comparison.

**Role Mapping Modes:**

| Mode | How base step is chosen |
|---|---|
| `"Contrast Based"` | Scans the ramp in theme-appropriate direction (darkest end for dark theme, lightest for light) to find the first step meeting `role.minContrast`. Falls back to highest-contrast step if none qualify, recording a critical error. |
| `"Manual Base Index"` | Uses `role.baseIndex` (light) or `role.darkBaseIndex` (dark). Both are zero-indexed. |

**Spread:** Each role generates 5 variations offset from the base by `[-2*spread, -spread, 0, +spread, +2*spread]` steps in the direction of increasing contrast. Indices are clamped to `[0, rampLength-1]` with overflow warnings.

**Error Types:**
- `critical` — could not meet minimum contrast target; used best available
- `warnings` — base index clamped; variation index clamped
- `notices` — (reserved, currently unused)

---

### UiGen.js

**DOM rendering, sidebar interaction, and event wiring. Has side effects. No color math.**

#### Module-level globals
| Global | Purpose |
|---|---|
| `window.currentEditableScheme` | Live mutable copy of the color scheme being edited |
| `window.sidebarExpandedState` | Persists expand/collapse state of sidebar sections across re-renders |
| `window.activeSidebarTab` | `"color-groups"` \| `"roles-config"` \| `"basic-settings"` |
| `window.tabListenersSet` | Guards single-registration of the tab click listener |
| `window.globalListenersSet` | Guards single-registration of the export button listener |
| `_initialConfigSnapshot` | Frozen JSON string of `demoConfig` — used by `isCurrentSchemeDirty()` |
| `_pendingImport` | Holds an imported scheme waiting for overwrite confirmation |

#### `getOptimalTextColor(bg) → "black" | "white"`
Returns whichever of black or white has higher contrast against `bg`.

#### `filterErrorsByTheme(errors, theme) → filteredErrors | null`
Returns only the error entries matching `theme` ("light" or "dark"). Returns `null` if filtered result is empty.

#### `displayColorTokens(collection)`
Main render function. Rebuilds the three tab panels (`#panel-colorRamps`, `#panel-tokens-light`, `#panel-tokens-dark`) inside `#rawColorsContainer` using a DocumentFragment for batched DOM insertion. Preserves the currently active tab. Registers the tab-switch click listener once (guarded by `window.tabListenersSet`).

#### `createErrorSection(errors) → HTMLElement`
Renders a collapsible warning/error panel with three sub-sections (Critical / Warnings / Notices). Each item displays color group, role, and variation context badges alongside the message. Wires the collapse toggle.

#### `createRawSection(colorRamps) → string` (returns HTML string)
Generates the HTML for the Raw Colors tab — one card per ramp step showing hex value, step name, and dual contrast pills (light ☀️ / dark 🌙).

#### `createThemeSection(colorTokens, theme) → HTMLElement`
Renders the Light or Dark theme panel. For each color group → role → variation, creates a card showing the token name, hex, reference step, contrast ratio/rating, and an "Adjusted" badge if the variation was clamped.

#### `createColorInputs(colorScheme, onUpdate)`
Rebuilds the sidebar content area based on `window.activeSidebarTab`. Renders:
- `"color-groups"` → `createColorGroupsSection`
- `"roles-config"` → `createRolesSection`
- `"basic-settings"` → system name, weight count, ramp type, role mapping, theme backgrounds

Registers a delegated `input`/`change` listener on `#colorInputs` (once, guarded by `data-hasListener`). All inputs use `data-path` attributes for dot-path routing to `updateColorScheme`. Debounced 350ms.

#### `createColorGroupsSection(colorScheme, hideHeader) → { element, content }`
Builds the Color Groups section with an "+ Add Color" button and one `createColorGroupInput` per color. Calls `displayColorTokens` after add.

#### `createColorGroupInput(group, index, colorScheme) → HTMLElement`
Single color group card with:
- Inline-editable name field
- Short name input
- Color picker + hex text input (synced via `setupColorInputSync`)
- Delete button (removes from `colorScheme.colors`, re-renders)

#### `createRolesSection(colorScheme, onUpdate, hideHeader) → { element, content }`
Builds the Roles section. In **Contrast Based** mode shows: Spread, Short Name, Min Contrast. In **Manual Base Index** mode shows: Spread, Short Name, Base ☀️ (1-indexed), Base 🌙 (1-indexed). Supports "+ Add Role" and per-role delete.

#### `createSection(title, id, hideHeader) → { element, content }`
Creates a collapsible accordion section. State persisted in `window.sidebarExpandedState[id]`. Accessible (`role="button"`, `aria-expanded`, keyboard: Enter/Space).

#### `createInput(path, label, value, type, options) → HTMLElement`
Creates a labeled input (text, number, or select). All inputs carry `data-path` for the delegated update handler.

#### `createColorInput(path, label, value) → HTMLElement`
Creates a labeled color picker + hex text pair, wired via `setupColorInputSync`.

#### `setupColorInputSync(container)`
Finds `.color-picker` and `.color-text` within `container` and cross-syncs them:
- Picker change → updates text (strips `#`, uppercases)
- Text change → updates picker (only when text is a valid 6-char hex)

#### `updateColorScheme(colorScheme, pathParts, value)`
Deep-sets a value in the scheme object via a dot-path array (e.g. `["colors", "0", "value"]`). Coerces numeric strings for `minContrast`, `spread`, and `colorSteps`.

#### `exportColorScheme(colorScheme)`
Triggers a JSON file download of the full scheme. Filename: `color-scheme-{name}-{date}.json`.

#### `importColorScheme(event, onImportSuccess)`
File-input change handler. Delegates to `parseSchemeFile`.

#### `parseSchemeFile(file, onValid)`
Reads and JSON-parses a file. Validates that it has `colors` and `roles` arrays before calling `onValid`.

#### `isCurrentSchemeDirty() → boolean`
Compares `window.currentEditableScheme` against `_initialConfigSnapshot` (a frozen JSON string taken at module load time, immune to mutations from `applyImportedScheme`).

#### `applyImportedScheme(scheme)`
Merges imported scheme into `demoConfig` and resets `window.currentEditableScheme`. Calls `initializeColorControls()` for a full re-render.

#### `handleDroppedFile(file)`
Called for both drag-drop and file-input import. Validates `.json` extension, parses the file, then either applies immediately or shows the overwrite confirmation dialog if `isCurrentSchemeDirty()`.

#### `createMainBtnGroup()`
Renders the header action buttons: Export CSV, Export Config (JSON), Import Config, Export CSS. Wires the import file input.

#### `initializeColorControls()`
App entry point. Deep-clones `demoConfig` into `window.currentEditableScheme`, builds sidebar + main panel, renders the token display, and registers global export button listeners (once, guarded by `window.globalListenersSet`).

---

### DocGen.js

**Export formatters. Pure functions (except `downloadCss` and `downloadCSV` which trigger browser downloads).**

#### `flattenToCss(collection) → { raw, light, dark }`
Converts `variableMaker` output into three dictionaries of CSS variable declarations:
- `raw` — `--{color}-{step}: #RRGGBB` (ramp primitives)
- `light` / `dark` — `--{color}-{role}-{variation}: var(--{color}-{step})` (semantic tokens referencing ramp vars)

#### `generateCss(cssVars) → string`
Assembles a single CSS file string:
1. `:root` block with raw ramp variables
2. `:root, .light, [data-theme="light"]` block with light tokens
3. `@media (prefers-color-scheme: dark) { :root { … } }` + `.dark, [data-theme="dark"]` block with dark tokens

#### `generateSimpleCss(cssVars) → string`
Simplified variant using `.light-theme` / `.dark-theme` class selectors (no media query).

#### `generateSeparateCssFiles(cssVars) → { raw, light, dark }`
Returns three separate CSS file strings.

#### `generateScss(collection) → string`
Generates SCSS output:
- Per-color variable blocks: `$primary-5: #5D10D1`
- `$light-theme: (...)` map
- `$dark-theme: (...)` map
Returns `""` for null or missing `colorRamps`.

#### `downloadCss(scheme)`
Runs `variableMaker` on the scheme, calls `flattenToCss` + `generateCss`, and triggers a `.css` file download. Filename: `{slug(name)}-tokens.css`.

#### `generateCSV({ data, columns }) → string`
Builds a CSV string from an array of row objects. `columns` is `[{ label, path }]` where `path` is a dot-path into each row. Uses `escapeCSV` for RFC-4180 compliance.

#### `escapeCSV(value) → string`
Stringifies the value, doubles internal double-quotes, wraps in quotes if the value contains `,`, `\n`, or `"`.

#### `getValueByPath(obj, path) → any`
Dot-path accessor.

#### `flattenTokensForCsv(collection) → row[]`
Walks `colorTokens.light` and `colorTokens.dark` and emits one row per variation with fields: `theme`, `group`, `role`, `variation`, `value`, `tokenRef`, `tokenName`, `contrastRatio`, `contrastRating`, `isAdjusted`.

#### `downloadCSV(filename, csvString)`
Triggers a browser download. Prepends UTF-8 BOM (`﻿`) for Excel compatibility.

---

## Figma Plugin

### scripts.js

Runs in the Figma plugin sandbox (no DOM access). Communicates with the UI iframe via `figma.ui.postMessage` / `figma.ui.onmessage`.

#### Startup
On load, reads the `__ctm316_config__` Figma string variable and posts a `load-config` message to the UI iframe if found.

#### Message Router (`figma.ui.onmessage`)
| `msg.type` | Handler |
|---|---|
| `"run-creater"` | Translates UI state, runs `variableMaker`, syncs results via `VariableManager.sync` |
| `"check-collections"` | Checks if named collections already exist in the document; returns `collection-check-result` |
| `"resize"` | Resizes the plugin window |
| `"request-processed-data"` | Runs generation and returns CSV / CSS / JSON / SCSS as a string |
| `"cancel"` | Closes the plugin |

#### `translateConfig(appState) → config`
Converts the UI's `appState` object (which uses 1-indexed step numbers and string fields) into the normalized format expected by `variableMaker`.

#### `VariableManager`
Manages Figma Variable CRUD operations:
- **`sync(result, config, scope, appState)`** — creates/updates the raw ramp collection and the contextual token collection. `scope` controls whether to write `"raw"`, `"contextual"`, or `"all"`.
- Internal helpers for creating/finding collections, modes, and variables.

#### `ExportFormatter`
- **`toCSV(result, config)`** — generates a CSV string
- **`toCSS(result, config)`** — generates a CSS string

#### Color math functions
The plugin bundles its own copy of all Utils.js functions (inlined, not imported) to avoid the Figma sandbox's module restrictions.

### ui.html

The Figma plugin UI iframe. It is a self-contained replica of the Web App UI adapted for the plugin context:
- Same sidebar structure (Color Groups / Roles Config / Basic Settings)
- Communicates back to `scripts.js` via `parent.postMessage` / `window.onmessage`
- Adds plugin-specific controls: "Push to Figma" button, collection name inputs, scope selector

---

## Data Model

### Color Scheme (config)

```js
{
  name: "CTM316",              // display name, used in export filenames
  colors: [                    // base color groups
    {
      name: "primary",         // used in token names and CSS var names
      shortName: "Pr",         // used in ramp step short names
      value: "5d10d1",         // 6-char hex (no #)
    }
  ],
  roles: [                     // semantic roles applied per color
    {
      name: "Text",
      shortName: "tx",
      minContrast: "4.5",      // minimum WCAG contrast ratio (Contrast Based mode)
      spread: 2,               // steps between variations
      baseIndex: 10,           // manual base index (Manual Base Index mode, light)
      darkBaseIndex: 10,       // manual base index (dark) — optional
    }
  ],
  colorSteps: 21,              // number of steps per ramp
  rampType: "Balanced",        // ramp generation algorithm
  roleMapping: "Contrast Based", // "Contrast Based" | "Manual Base Index"
  colorStepNames: [],          // [] = auto-generate as [1..colorSteps]
  themes: [
    { name: "light", bg: "FFFFFF" },
    { name: "dark",  bg: "000000" },
  ],
}
```

### Token Structure (per variation)

```js
{
  tknName: "primary-Text-base",
  color: "primary",
  role: "Text",
  variation: "base",           // "weakest" | "weak" | "base" | "strong" | "stronger"
  tknRef: "primary-11",        // the ramp step this token points to
  value: "#5D10D1",
  contrast: { ratio: 4.52, rating: "AA" },
  variationOffset: 0,          // step offset from base (-4 to +4)
  isAdjusted: false,           // true if the offset was clamped due to bounds
  manualBaseIndex: 10,         // only present in Manual Base Index mode
}
```

---

## State Management

```
demoConfig (ClrGen.js)
  └─ deep-cloned at startup
       └─ window.currentEditableScheme  ← live mutable state
            ├─ edited by UiGen inputs (debounced 350ms)
            ├─ replaced by applyImportedScheme()
            └─ read by all export functions

_initialConfigSnapshot (UiGen.js)  ← frozen JSON of original demoConfig
  └─ used ONLY by isCurrentSchemeDirty()

window.sidebarExpandedState  ← persists collapse state across re-renders
window.activeSidebarTab      ← "color-groups" | "roles-config" | "basic-settings"
```

**Important:** `demoConfig` is mutated by `applyImportedScheme` (via `Object.assign`). The `_initialConfigSnapshot` is captured **before any mutation** so `isCurrentSchemeDirty()` reliably detects modifications after import.

---

## Export Formats

| Format | Function | Output |
|---|---|---|
| CSS | `downloadCss(scheme)` | Single file: `:root` raw vars + themed token vars |
| SCSS | `generateScss(collection)` | Variable declarations + `$light-theme` / `$dark-theme` maps |
| JSON | `exportColorScheme(scheme)` | Full scheme config (re-importable) |
| CSV | `downloadCSV` + `flattenTokensForCsv` | One row per token variation, both themes |

---

## Test Suite

**Location:** `CTM/Web_App/tests/ctm.test.js`

**Runner:** Node.js built-in test runner (no dependencies).

```bash
# from CTM/Web_App/
node --test tests/ctm.test.js
```

**Results:** 119 tests, 25 suites, 0 failures.

| Module | Tests | Coverage |
|---|---|---|
| Utils.js | 64 | All exported functions; all conditional branches |
| ClrGen.js | 32 | All 5 ramp types; Contrast Based + Manual modes; caching; edge cases |
| DocGen.js | 23 | All export formatters; CSV escaping edge cases; error paths |

**Note:** UiGen.js is DOM-only and cannot be tested with Node. It is covered by manual browser testing.

---

## Known Limitations

1. **No ramp step name persistence in roles.** If `colorStepNames` is customised and the user later changes `colorSteps`, the names array is discarded and regenerated numerically.
2. **Figma plugin and Web App configs diverge on `colorSteps` default.** Plugin defaults to 23; Web App default (`demoConfig`) uses 21. Keep in sync.
3. **`theme_migrator.js`** in `Web_App/JS/` is a one-time migration utility from an older CSS architecture. It is not loaded by `Index.html` and can be safely deleted after confirming it is no longer needed.
4. **No undo/redo.** All edits are applied in-place to `window.currentEditableScheme`. The only recovery path is importing a saved JSON config.
5. **No persistence between page reloads.** State lives in memory. Users must export JSON to save work.

---

## Ship Checklist

- [x] All internal CSS is functional-only (no cosmetic CSS duplicating Tailwind)
- [x] Tailwind CDN loaded in `Index.html`
- [x] Bug fixed: `isCurrentSchemeDirty()` no longer breaks after import
- [x] Bug fixed: `setTimeout(createMainBtnGroup, 50)` removed — direct call
- [x] Bug fixed: double re-render on Add/Delete color and role removed
- [x] `console.log` removed from `downloadCss`
- [x] 119/119 tests passing (`node --test tests/ctm.test.js`)
- [ ] Verify Figma plugin manifest `version` is bumped before submission
- [ ] Smoke-test Export CSS → paste into project, verify tokens resolve
- [ ] Smoke-test drag-drop import → confirm overwrite dialog shows when scheme is dirty
- [ ] Smoke-test Figma plugin push to Figma Variables
- [ ] Update `demoConfig.colorSteps` to 23 if aligning with Figma plugin default
