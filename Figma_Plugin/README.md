# ctm316 Figma Token Orchestrator

A powerful, modular Figma plugin designed to orchestrate complex color systems with ease. It allows designers to generate mathematically perfect color ramps (Raw Tokens) and intelligently map them to thematic variations (Contextual Tokens) based on accessibility standards.

## 🚀 Key Features

- **Mathematical Ramps**: Generate 1–50 color weights using Logarithmic, Linear, or Exponential distribution.
- **Contrast-Aware Mapping**: Automatically find the ideal "Base" weight for roles (Text, Action, Surface) by targeting specific WCAG contrast ratios.
- **Thematic Modes**: Support for multi-mode systems (Light & Dark) using Figma's native Variable modes.
- **Modular Architecture**: Business logic is centralized in the backend (`code.js`), keeping the UI thread thin and responsive.
- **Smart Imports**: Drag-and-drop JSON configuration with safety-first overwrite checks.
- **Universal Exports**: Export your token system as Production-ready **CSS Variables**, **CSV lists**, or **JSON configurations**.

---

## 🛠 Architectural Overview

The plugin is split into two main layers:

### 1. Frontend (`ui.html`)
The presentation layer built with Tailwind CSS. It manages:
- **Real-time State**: Handles the `appState` which tracks color groups, roles, and system settings.
- **UI Engine**: Dynamically renders cards for every group and role.
- **Contrast Previews**: Provides instant WCAG rating feedback in the editor.
- **File Interactivity**: Manages the Drag & Drop overlay and Browser-side file downloads.

### 2. Backend (`code.js`)
The core processing engine built on the Figma Plugin API. It manages:
- **Color Logic Engine**: Performs HSL/RGB math and luminance distribution.
- **Variable Manager**: Handles the heavy lifting of recursive CRUD operations in the Figma document.
- **Formatters**: Converts abstract token objects into final CSS/CSV/JSON strings.

---

## 📖 Core Methods & Functions

### **Color Logic Engine (`ColorEngine.process`)**
The heart of the system. It takes the UI's `tokenState` and performs:
1. **Ramp Generation**: Scales a seed color into N weights.
2. **Contextual Mapping**: Logic that finds the "Center Weight" for a role (e.g., finding the first weight that hits 4.5:1 contrast) and then maps surrounding variations (Darkest -> Lightest) based on a defined "Spread/Gap".

### **Variable Manager (`VariableManager`)**
- `sync(processedData, scope)`: Orchestrates the creation of collections (`_raw` and `contextual`) and variables. It uses a cache-first approach to update existing variables instead of duplicating them.
- `upsertVariables()`: Ensures variables exist and updates their mode values. Supports **Variable Aliasing** (linking Contextual tokens to Raw tokens).

### **Mathematical Utilities (`ColorUtils`)**
- `colorStepsMaker()`: Generates hex ramps using geometric distribution.
- `contrastRatio()`: Calculates the WCAG 2.1 contrast between two hex colors.
- `relLum()`: Computes relative luminance using the standard sRGB formula.

### **Export Formatters (`ExportFormatter`)**
- `toCSS()`: Iterates through the processed data to build a `:root` CSS file with clean semantic naming.
- `toCSV()`: Flattens the ramp data for spreadsheet use.

---

## 📥 Import / Export Schema

The plugin uses a standardized JSON schema for portability:

```json
{
  "systemName": "My Design System",
  "clrGroups": [
    { "id": "g1", "name": "Brand", "shortName": "Br", "value": "#0064D5" }
  ],
  "roles": {
    "text": { "name": "Text", "gaps": 2, "minContrast": "4.5" }
  }
}
```

---

## 🔧 Installation & Usage

1. Open a Figma file.
2. Run **ctm316**.
3. Define your **Color Groups** (Seed colors) and **Theme Roles**.
4. Adjust **Settings** for ramp distribution and variation counts.
5. Click **Run** to generate Figma Variables or **Export** to take them into your codebase.

---

*Built with precision for professional design systems.*
