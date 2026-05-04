/**
 * FIGMA COLOR SYSTEM GENERATOR
 * Organization:
 * 1. UI Initialization
 * 2. Message Router
 * 3. Config Translator  (appState → reference engine format)
 * 4. Export Formatters  (CSV / CSS / JSON / SCSS)
 * 5. Figma Variable API (CRUD – _color_Ramps + tokens collections)
 * 6. Color Ramp Maker   (Linear / Balanced / Symmetric)
 * 7. Color System Generator (variableMaker – ramps + semantic tokens)
 * 8. Color Math Utilities  (WCAG-correct conversions from Utils.js)
 */

// 1. UI INITIALIZATION
figma.showUI(__html__, { width: 424, height: 720, themeColors: true });

// Load saved config from Figma on startup
(async () => {
  try {
    const vars = await figma.variables.getLocalVariablesAsync("STRING");
    const cfgVar = vars.find((v) => v.name === "__ctm316_config__");
    if (cfgVar) {
      const modeId = Object.keys(cfgVar.valuesByMode)[0];
      const savedConfigStr = cfgVar.valuesByMode[modeId];
      if (typeof savedConfigStr === "string") {
        figma.ui.postMessage({ type: "load-config", state: JSON.parse(savedConfigStr) });
      }
    }
  } catch (_) {}
})();

// 2. MESSAGE ROUTER
figma.ui.onmessage = async (msg) => {
  try {
    switch (msg.type) {
      case "run-creater": {
        const config = translateConfig(msg.state);
        const result = variableMaker(config);
        await VariableManager.sync(result, config, msg.scope || "all", msg.state);
        break;
      }

      case "check-collections": {
        const cols = await figma.variables.getLocalVariableCollectionsAsync();
        const names = [msg.colorName, msg.contextualName].filter(Boolean);
        const existing = names.filter((n) => cols.some((c) => c.name === n));
        figma.ui.postMessage({ type: "collection-check-result", existing });
        break;
      }

      case "resize":
        figma.ui.resize(msg.width, msg.height);
        break;

      case "request-processed-data": {
        const config = translateConfig(msg.state);
        const result = variableMaker(config);
        let content = "";
        if (msg.exportType === "json") content = JSON.stringify({ config, colorRamps: result.colorRamps, colorTokens: result.colorTokens, errors: result.errors }, null, 2);
        else if (msg.exportType === "csv") content = ExportFormatter.toCSV(result, config);
        else if (msg.exportType === "css") content = ExportFormatter.toCSS(result, config);
        else if (msg.exportType === "scss") content = generateScss(result, config);
        figma.ui.postMessage({ type: "processed-data-response", content, exportType: msg.exportType });
        break;
      }

      case "cancel":
        figma.closePlugin();
        break;
    }
  } catch (err) {
    console.error("Plugin Error:", err);
    figma.ui.postMessage({ type: "error", message: err.message || "Unknown error" });
  }
};

// 3. CONFIG TRANSLATOR: Converts appState (UI format) into the format expected by variableMaker.
function translateConfig(appState) {
  const count = Math.max(1, parseInt(appState.colorSteps) || 23);

  // Weight (step) names
  const userWeightNames = appState.colorStepNames && appState.colorStepNames.trim() ? appState.colorStepNames.split(",").map((n) => n.trim()) : null;
  let stepNames = null;
  if (userWeightNames && userWeightNames.length > 0) {
    const names = userWeightNames.slice();
    while (names.length < count) names.push(String(names.length + 1));
    stepNames = names.slice(0, count);
  }

  // Role variation display names (maps to the 5 fixed reference keys)
  const userVarNames = (appState.roleStepNames || "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
  const defaultVarNames = ["weakest", "weak", "base", "strong", "stronger"];
  const roleStepNames = defaultVarNames.map((def, i) => userVarNames[i] || def);

  // themes array → light/dark backgrounds
  const themes = appState.themes || [{ bg: "FFFFFF" }, { bg: "000000" }];

  return {
    name: appState.name || "ctm316",
    colors: (appState.colors || []).map((g) => ({
      name: g.name,
      shortName: g.shortName,
      value: g.value,
    })),
    roles: (appState.roles || []).map((role) => ({
      name: role.name,
      shortName: role.shortName || role.name.substring(0, 2).toLowerCase(),
      minContrast: String(role.minContrast !== undefined ? role.minContrast : "4.5"),
      spread: Math.max(1, parseInt(role.spread) || 1),
      baseIndex: role.baseIndex !== undefined ? parseInt(role.baseIndex) : 0,
      darkBaseIndex: role.darkBaseIndex !== undefined ? parseInt(role.darkBaseIndex) : undefined,
    })),
    colorSteps: count,
    rampType: appState.rampType || "Balanced",
    roleMapping: appState.roleMapping || "Contrast Based",
    colorStepNames: stepNames,
    roleStepNames,
    themes: [
      { name: "light", bg: themes[0].bg || "FFFFFF" },
      { name: "dark", bg: themes[1].bg || "000000" },
    ],
    skipColorRamps: appState.skipColorRamps || false,
    tokenGrouping: appState.tokenGrouping || "color",
    useShortColorNames: appState.useShortColorNames || false,
    useShortRoleNames: appState.useShortRoleNames || false,
  };
}

// 4. EXPORT FORMATTERS
const REF_VARIATION_KEYS = ["weakest", "weak", "base", "strong", "stronger"];

// Converts any string to a safe CSS identifier segment: lowercase, spaces/underscores → dashes.
function cssSlug(str) {
  if (!str) return "";
  return String(str)
    .toLowerCase()
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}

// Escapes a CSV field that contains commas, quotes, or newlines.
function csvField(val) {
  const s = String(val !== undefined && val !== null ? val : "");
  return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s;
}

const ExportFormatter = {
  // ── CSV ─────────────────────────────────────────────────────────────────────
  // Two sections: color ramps + role tokens.
  toCSV(result, config) {
    const roleStepNames = config.roleStepNames || REF_VARIATION_KEYS;
    const lines = [];

    // Section 1: color ramps
    lines.push("COLOR RAMPS");
    lines.push("Group,Weight,Hex,Light Contrast,Light Rating,Dark Contrast,Dark Rating");
    for (const [colorName, ramp] of Object.entries(result.colorRamps)) {
      for (const [weightName, entry] of Object.entries(ramp)) {
        lines.push([csvField(colorName), csvField(weightName), csvField(entry.value), csvField(entry.contrast.light.ratio), csvField(entry.contrast.light.rating), csvField(entry.contrast.dark.ratio), csvField(entry.contrast.dark.rating)].join(","));
      }
    }

    // Section 2: Role tokens (both themes)
    lines.push("");
    lines.push("ROLE TOKENS");
    lines.push("Color,Role,Variation,Theme,Hex,Contrast,Rating,Adjusted");
    for (const theme of ["light", "dark"]) {
      if (!result.colorTokens || !result.colorTokens[theme]) continue;
      for (const [colorName, roles] of Object.entries(result.colorTokens[theme])) {
        for (const [roleId, variations] of Object.entries(roles)) {
          const roleName = (config.roles[roleId] && config.roles[roleId].name) || roleId;
          for (let i = 0; i < REF_VARIATION_KEYS.length; i++) {
            const token = variations[REF_VARIATION_KEYS[i]];
            if (!token) continue;
            const dispName = roleStepNames[i] || REF_VARIATION_KEYS[i];
            lines.push([csvField(colorName), csvField(roleName), csvField(dispName), csvField(theme), csvField(token.value), csvField(token.contrast ? token.contrast.ratio : ""), csvField(token.contrast ? token.contrast.rating : ""), csvField(token.isAdjusted ? "yes" : "")].join(","));
          }
        }
      }
    }

    return lines.join("\n");
  },

  // ── CSS ─────────────────────────────────────────────────────────────────────
  // :root for ramps, [data-theme] blocks for semantic tokens.
  toCSS(result, config) {
    const roleStepNames = config.roleStepNames || REF_VARIATION_KEYS;
    const date = new Date().toISOString();
    let css = `/* ${config.name} — generated by ctm316 | ${date} */\n\n`;

    // Color ramps in :root
    css += `:root {\n  /* ── Color Ramps ── */\n`;
    for (const [colorName, ramp] of Object.entries(result.colorRamps)) {
      css += `\n  /* ${colorName} */\n`;
      for (const [weightName, entry] of Object.entries(ramp)) {
        css += `  --${cssSlug(colorName)}-${cssSlug(String(weightName))}: ${entry.value};\n`;
      }
    }
    css += `}\n`;

    // Semantic tokens per theme
    for (const theme of ["light", "dark"]) {
      if (!result.colorTokens || !result.colorTokens[theme]) continue;
      const selector = theme === "light" ? `:root,\n[data-theme="light"]` : `[data-theme="dark"]`;
      css += `\n/* ── ${theme.toUpperCase()} Semantic Tokens ── */\n${selector} {\n`;
      for (const [colorName, roles] of Object.entries(result.colorTokens[theme])) {
        css += `\n  /* ${colorName} */\n`;
        for (const [roleId, variations] of Object.entries(roles)) {
          const roleName = (config.roles[roleId] && config.roles[roleId].name) || roleId;
          for (let i = 0; i < REF_VARIATION_KEYS.length; i++) {
            const token = variations[REF_VARIATION_KEYS[i]];
            if (!token) continue;
            const dispName = roleStepNames[i] || REF_VARIATION_KEYS[i];
            css += `  --${cssSlug(colorName)}-${cssSlug(roleName)}-${cssSlug(dispName)}: ${token.value};\n`;
          }
        }
      }
      css += `}\n`;
    }

    // OS-level dark mode fallback (only when no data-theme attribute is set)
    if (result.colorTokens && result.colorTokens.dark) {
      css += `\n/* ── OS Dark Mode Fallback ── */\n@media (prefers-color-scheme: dark) {\n  :root:not([data-theme]) {\n`;
      for (const [colorName, roles] of Object.entries(result.colorTokens.dark)) {
        for (const [roleId, variations] of Object.entries(roles)) {
          const roleName = (config.roles[roleId] && config.roles[roleId].name) || roleId;
          for (let i = 0; i < REF_VARIATION_KEYS.length; i++) {
            const token = variations[REF_VARIATION_KEYS[i]];
            if (!token) continue;
            const dispName = (config.roleStepNames || REF_VARIATION_KEYS)[i] || REF_VARIATION_KEYS[i];
            css += `    --${cssSlug(colorName)}-${cssSlug(roleName)}-${cssSlug(dispName)}: ${token.value};\n`;
          }
        }
      }
      css += `  }\n}\n`;
    }

    return css;
  },
};

// ── SCSS EXPORT ──────────────────────────────────────────────────────────────
// Produces proper SCSS: flat ramp variables, per-color nested maps,
// token maps per theme, an apply-theme mixin, and theme selectors.
function scssSlug(str) {
  return cssSlug(str); // reuse the same sanitiser
}

function generateScss(result, config) {
  if (!result || !result.colorRamps) return "";
  const roleStepNames = (config && config.roleStepNames) || REF_VARIATION_KEYS;
  const systemName = (config && config.name) || "tokens";
  const date = new Date().toISOString();

  const hr = (title) => `// ${"=".repeat(58)}\n// ${title}\n// ${"=".repeat(58)}\n\n`;

  let scss = `// ${systemName} — Auto-generated SCSS\n// Generated: ${date}\n// Do not edit manually.\n\n`;
  scss += `@use 'sass:map';\n\n`;

  // ── 1. Flat ramp variables ($primary-1, $primary-2 …)
  scss += hr("COLOR RAMP VARIABLES");
  for (const [group, weights] of Object.entries(result.colorRamps)) {
    scss += `// ${group}\n`;
    for (const [weight, data] of Object.entries(weights)) {
      if (!data || !data.value) continue;
      scss += `$${scssSlug(group)}-${scssSlug(String(weight))}: ${data.value};\n`;
    }
    scss += "\n";
  }

  // ── 2. Per-color nested maps (for programmatic access via map.get)
  scss += hr("PER-COLOR RAMP MAPS");
  for (const [group, weights] of Object.entries(result.colorRamps)) {
    scss += `$ramp-${scssSlug(group)}: (\n`;
    for (const [weight, data] of Object.entries(weights)) {
      if (!data || !data.value) continue;
      scss += `  ${scssSlug(String(weight))}: $${scssSlug(group)}-${scssSlug(String(weight))},\n`;
    }
    scss += `);\n\n`;
  }

  // ── 3. Token maps per theme (values reference the flat ramp variables)
  for (const theme of ["light", "dark"]) {
    if (!result.colorTokens || !result.colorTokens[theme]) continue;
    scss += hr(`${theme.toUpperCase()} THEME TOKENS`);
    scss += `$tokens-${theme}: (\n`;
    for (const [colorName, roles] of Object.entries(result.colorTokens[theme])) {
      scss += `  // ${colorName}\n`;
      for (const [roleId, variations] of Object.entries(roles)) {
        const roleName = (config && config.roles[roleId] && config.roles[roleId].name) || roleId;
        for (let i = 0; i < REF_VARIATION_KEYS.length; i++) {
          const token = variations[REF_VARIATION_KEYS[i]];
          if (!token || !token.tknRef) continue;
          const dispName = roleStepNames[i] || REF_VARIATION_KEYS[i];
          const tokenKey = `${scssSlug(colorName)}-${scssSlug(roleName)}-${scssSlug(dispName)}`;
          // tknRef is "colorName-weight" (e.g. "Primary-18") — split on last dash
          const lastDash = token.tknRef.lastIndexOf("-");
          const refGroup = scssSlug(token.tknRef.substring(0, lastDash));
          const refWeight = scssSlug(token.tknRef.substring(lastDash + 1));
          const adjusted = token.isAdjusted ? " /* ⚠ adjusted */" : "";
          scss += `  "${tokenKey}": $${refGroup}-${refWeight},${adjusted}\n`;
        }
      }
    }
    scss += `);\n\n`;
  }

  // ── 4. apply-theme mixin
  scss += hr("THEME MIXIN");
  scss += `/// Writes all token map entries as CSS custom properties.\n`;
  scss += `/// Usage: @include apply-theme($tokens-light);\n`;
  scss += `@mixin apply-theme($tokens) {\n`;
  scss += `  @each $name, $value in $tokens {\n`;
  scss += `    --#{$name}: #{$value};\n`;
  scss += `  }\n`;
  scss += `}\n\n`;

  // ── 5. Theme output
  scss += hr("THEME OUTPUT");
  scss += `// Class-based theming\n`;
  scss += `:root,\n[data-theme="light"] {\n  @include apply-theme($tokens-light);\n}\n\n`;
  scss += `[data-theme="dark"] {\n  @include apply-theme($tokens-dark);\n}\n\n`;
  scss += `// OS-level dark mode fallback\n`;
  scss += `@media (prefers-color-scheme: dark) {\n`;
  scss += `  :root:not([data-theme]) {\n`;
  scss += `    @include apply-theme($tokens-dark);\n`;
  scss += `  }\n`;
  scss += `}\n`;

  return scss;
}

// 5. FIGMA VARIABLE API (CRUD)
const VariableManager = {
  tally: { created: 0, updated: 0, failed: 0 },
  cache: { variables: [], collections: [] },
  rampVarNameMap: {}, // stepName ("primary-1") → figma variable name ("primary/1")

  async sync(result, config, scope = "all", appState = null) {
    this.tally = { created: 0, updated: 0, failed: 0 };
    this.rampVarNameMap = {};
    await this.refreshCache();

    const colorName = (appState && appState.colorsCollectionName) || "_Colors";
    const contextualName = (appState && appState.contextualCollectionName) || "contextual";
    const skipRamps = config.skipColorRamps || false;
    const tokenGrouping = config.tokenGrouping || "color";
    const useShortColor = config.useShortColorNames || false;
    const useShortRole = config.useShortRoleNames || false;

    // Helper: resolve display label for color/role names
    const colorLabel = (name) => {
      if (!useShortColor) return name;
      const col = config.colors.find((c) => c.name === name);
      return (col && col.shortName) || name;
    };
    const roleLabel = (name, roleIdx) => {
      if (!useShortRole) return name;
      const role = config.roles[roleIdx];
      return (role && role.shortName) || name;
    };

    // Build tknRef → Figma variable name map using the same naming as stage 1
    for (const [colorName, ramp] of Object.entries(result.colorRamps)) {
      for (const [weightName, entry] of Object.entries(ramp)) {
        this.rampVarNameMap[entry.stepName] = `${colorLabel(colorName)}/${weightName}`;
      }
    }

    const roleStepNames = config.roleStepNames || REF_VARIATION_KEYS;

    // Fetch ramps collection once — used by both stages when applicable
    const needsRampsCol = !skipRamps && (scope === "all" || scope === "groups" || scope === "roles");
    const rampsCol = needsRampsCol ? await this.getOrCreateCollection(colorName) : null;

    // STAGE 1: Color Ramps → color collection (skipped when skipColorRamps is true)
    if (rampsCol && (scope === "all" || scope === "groups")) {
      const modeId = rampsCol.modes[0].modeId;
      const allRampVars = [];
      for (const [colorName, ramp] of Object.entries(result.colorRamps)) {
        const cLabel = colorLabel(colorName);
        for (const [weightName, entry] of Object.entries(ramp)) {
          allRampVars.push([`${cLabel}/${weightName}`, "COLOR", entry.value, `L:${entry.contrast.light.ratio}(${entry.contrast.light.rating}) D:${entry.contrast.dark.ratio}(${entry.contrast.dark.rating})`]);
        }
      }
      await this.upsertVariables(rampsCol, modeId, allRampVars);
    }

    // STAGE 2: Semantic Role Tokens → contextual collection
    if (scope === "all" || scope === "roles") {
      const contextualCol = await this.getOrCreateCollection(contextualName);

      for (const theme of ["light", "dark"]) {
        const modeId = this.ensureMode(contextualCol, theme);
        for (const [colorName, roles] of Object.entries(result.colorTokens[theme])) {
          for (const [roleId, variations] of Object.entries(roles)) {
            const rName = (config.roles[roleId] && config.roles[roleId].name) || roleId;
            const cLabel = colorLabel(colorName);
            const rLabel = roleLabel(rName, parseInt(roleId));
            const vars = REF_VARIATION_KEYS.map((refKey, i) => {
              const token = variations[refKey];
              if (!token) return null;
              const dispName = roleStepNames[i] || refKey;
              const figmaName = tokenGrouping === "role" ? `${rLabel}/${cLabel}/${dispName}` : `${cLabel}/${rLabel}/${dispName}`;
              let value;
              if (skipRamps) {
                value = token.value;
              } else {
                const rampFigmaName = this.rampVarNameMap[token.tknRef];
                const targetVar = rampFigmaName ? this.cache.variables.find((cv) => cv.name === rampFigmaName && cv.variableCollectionId === rampsCol.id) : null;
                value = targetVar ? { type: "VARIABLE_ALIAS", id: targetVar.id } : token.value;
              }
              const note = token.isAdjusted ? " | ⚠ Adjusted" : "";
              return [figmaName, "COLOR", value, `${theme.toUpperCase()}${note}`];
            }).filter(Boolean);
            await this.upsertVariables(contextualCol, modeId, vars);
          }
        }
      }
    }

    // Persist config so the plugin can restore state on next launch
    if (appState) {
      await this.saveConfig(appState, colorName);
    }

    figma.ui.postMessage({ type: "finish", tally: this.tally, errors: result ? result.errors : null });
  },

  async saveConfig(appState, colorName) {
    try {
      const targetName = appState.skipColorRamps ? appState.contextualCollectionName || "contextual" : colorName;
      const rampsCol = await this.getOrCreateCollection(targetName);
      const modeId = rampsCol.modes[0].modeId;
      let cfgVar = this.cache.variables.find((v) => v.name === "__ctm316_config__" && v.variableCollectionId === rampsCol.id);
      if (!cfgVar) {
        cfgVar = figma.variables.createVariable("__ctm316_config__", rampsCol, "STRING");
        this.cache.variables.push(cfgVar);
      }
      cfgVar.setValueForMode(modeId, JSON.stringify(appState));
    } catch (_) {}
  },

  async refreshCache() {
    this.cache.variables = await figma.variables.getLocalVariablesAsync();
    this.cache.collections = await figma.variables.getLocalVariableCollectionsAsync();
  },

  async getOrCreateCollection(name) {
    const existing = this.cache.collections.find((c) => c.name === name);
    if (existing) return existing;
    const newCol = figma.variables.createVariableCollection(name);
    this.cache.collections.push(newCol);
    return newCol;
  },

  ensureMode(collection, modeName) {
    const existing = collection.modes.find((m) => m.name.toLowerCase() === modeName.toLowerCase());
    if (existing) return existing.modeId;
    if (collection.modes.length === 1 && collection.modes[0].name.toLowerCase().startsWith("mode")) {
      collection.renameMode(collection.modes[0].modeId, modeName);
      return collection.modes[0].modeId;
    }
    try {
      return collection.addMode(modeName);
    } catch (_e) {
      return collection.modes[0].modeId;
    }
  },

  async upsertVariables(collection, modeId, vars) {
    for (const [varName, varType, varValue, varDescription] of vars) {
      try {
        let variable = this.cache.variables.find((v) => v.name === varName && v.variableCollectionId === collection.id);
        if (!variable) {
          variable = figma.variables.createVariable(varName, collection, varType);
          this.cache.variables.push(variable);
          this.tally.created++;
        } else {
          this.tally.updated++;
        }
        if (varDescription) variable.description = varDescription;
        if (varValue !== undefined && varValue !== null) {
          if (varType === "COLOR" && typeof varValue === "string") {
            variable.setValueForMode(modeId, hexToFigmaRgb(varValue));
          } else {
            variable.setValueForMode(modeId, varValue);
          }
        }
      } catch (_err) {
        console.error("Failed to upsert variable:", varName, _err);
        this.tally.failed++;
      }
    }
  },
};

// Converts a hex string to Figma's { r, g, b } format (0–1 range).
function hexToFigmaRgb(hex) {
  const rgb = hexToRgb(hex);
  if (!rgb) return { r: 0, g: 0, b: 0 };
  return { r: rgb[0] / 255, g: rgb[1] / 255, b: rgb[2] / 255 };
}

// 6. COLOR RAMP MAKER: Simple hash cache: skip regeneration when config hasn't changed.
let lastInputHash = null;
let cachedOutput = null;

function colorRampMaker(hexIn, rampLength, rampType = "Balanced") {
  const hue = hexToHue(hexIn);
  const satu = hexToSat(hexIn);

  if (rampType === "Linear") {
    const output = [];
    for (let i = 0; i < rampLength; i++) {
      const lightness = (i / (rampLength - 1)) * 100;
      output.push(hslToHex(hue, satu, lightness) || "#000000");
    }
    return output.reverse();
  }

  if (rampType === "Balanced" || rampType === "Balanced (Natural)" || rampType === "Balanced (Dynamic)") {
    // Space target luminances logarithmically so perceptual steps feel even.
    const minV = Math.log(0.05);
    const maxV = Math.log(1.05);
    const step = (maxV - minV) / (rampLength + 1);
    const output = [];

    const isNatural = rampType.includes("Natural") || rampType.includes("Dynamic");
    const isDynamic = rampType.includes("Dynamic");

    for (let i = 1; i <= rampLength; i++) {
      const targetLum = Math.exp(minV + step * i) - 0.05;
      let low = 0,
        high = 100,
        closestL = 50;

      // Binary search for HSL lightness to match target Relative Luminance
      for (let j = 0; j < 30; j++) {
        const mid = (low + high) / 2;
        // Apply temporary saturation/hue for search if needed, but search usually depends on L mostly.
        // For accuracy in search, we use the potentially shifted values.
        const searchS = isNatural ? satu * (1 - Math.pow(Math.abs(mid - 50) / 50, 1.5) * 0.4) : satu;
        let searchH = hue;
        if (isDynamic) {
          const dist = (mid - 50) / 50;
          if (dist > 0)
            searchH += (60 - hue) * dist * 0.15; // Shift towards yellow in lights
          else searchH += (240 - hue) * Math.abs(dist) * 0.15; // Shift towards blue in darks
        }

        const midLum = relLum(hslToHex(searchH, searchS, mid));
        closestL = mid;
        if (Math.abs(midLum - targetLum) < 0.0001) break;
        if (midLum < targetLum) low = mid;
        else high = mid;
      }

      // Final values for this step
      let finalS = satu;
      let finalH = hue;
      if (isNatural) {
        finalS = satu * (1 - Math.pow(Math.abs(closestL - 50) / 50, 1.5) * 0.4);
      }
      if (isDynamic) {
        const dist = (closestL - 50) / 50;
        if (dist > 0) finalH += (60 - hue) * dist * 0.15;
        else finalH += (240 - hue) * Math.abs(dist) * 0.15;
      }

      output.push(hslToHex(finalH, finalS, closestL) || "#000000");
    }
    return output.reverse();
  }

  if (rampType === "Symmetric") {
    // Same as Balanced, then shifts steps so the midpoint lands near 50% lightness.
    // (We'll use standard Balanced logic here for simplicity, but it could be updated too)
    const minV = Math.log(0.05);
    const maxV = Math.log(1.05);
    const step = (maxV - minV) / (rampLength + 1);
    const output = [];
    for (let i = 1; i <= rampLength; i++) {
      const targetLum = Math.exp(minV + step * i) - 0.05;
      let low = 0,
        high = 100,
        closestL = 50;
      for (let j = 0; j < 30; j++) {
        const mid = (low + high) / 2;
        const midLum = relLum(hslToHex(hue, satu, mid));
        closestL = mid;
        if (Math.abs(midLum - targetLum) < 0.0001) break;
        if (midLum < targetLum) low = mid;
        else high = mid;
      }
      output.push(hslToHex(hue, satu, closestL) || "#000000");
    }
    const mid = Math.floor(output.length / 2);
    const midLightness = hexToLum(output[mid]) || 50;
    if (Math.abs(midLightness - 50) > 10) {
      const shift = 50 - midLightness;
      const adjusted = output.map((hex) => {
        const l = Math.min(100, Math.max(0, (hexToLum(hex) || 50) + shift));
        return hslToHex(hue, satu, l) || hex;
      });
      return adjusted.reverse();
    }
    return output.reverse();
  }

  return [];
}

// 7. COLOR SYSTEM GENERATOR
function variableMaker(config) {
  const colors = config.colors;
  const roles = config.roles;
  const rampLength = config.colorSteps;
  let stepNames = config.colorStepNames;
  if (!stepNames || stepNames.length !== rampLength) {
    stepNames = seriesMaker(rampLength);
  }

  const inputHash = JSON.stringify({
    colors: config.colors.map((g) => Object.assign({}, g, { value: normalizeHex(g.value) })),
    rampLength: config.colorSteps,
    rampType: config.rampType,
    lightBg: normalizeHex(config.themes[0].bg),
    darkBg: normalizeHex(config.themes[1].bg),
    roles: config.roles,
    roleMapping: config.roleMapping,
  });

  if (inputHash === lastInputHash && cachedOutput) return cachedOutput;

  const lightBg = normalizeHex(config.themes[0].bg);
  const darkBg = normalizeHex(config.themes[1].bg);
  const clrRampsCollection = Object.create(null);
  const tokensCollection = { light: Object.create(null), dark: Object.create(null) };
  const errors = { critical: [], warnings: [], notices: [] };

  // Build color ramps with per-step WCAG contrast data
  for (const color of colors) {
    const colorRamp = colorRampMaker(color.value, rampLength, config.rampType);
    const ramp = Object.create(null);
    clrRampsCollection[color.name] = ramp;

    for (let wIdx = 0; wIdx < rampLength; wIdx++) {
      const weight = stepNames[wIdx];
      const value = normalizeHex(colorRamp[wIdx]);
      ramp[weight] = {
        value,
        stepName: `${color.name}-${weight}`,
        shortName: `${color.shortName}-${weight}`,
        contrast: {
          light: { ratio: contrastRatio(value, lightBg), rating: contrastRating(value, lightBg) },
          dark: { ratio: contrastRatio(value, darkBg), rating: contrastRating(value, darkBg) },
        },
      };
    }
  }

  // Generate semantic tokens for each mode × color × role
  for (const mode of config.themes) {
    const modeName = mode.name;
    const conTheme = tokensCollection[modeName];

    for (const color of colors) {
      const clrName = color.name;
      const conGroup = Object.create(null);
      conTheme[clrName] = conGroup;
      const roleNames = roles.map((_, i) => i);

      if (config.roleMapping === "Contrast Based") {
        for (const roleName of roleNames) {
          const role = roles[roleName];
          const spread = role.spread;
          const minC = parseFloat(role.minContrast);
          const conRole = Object.create(null);
          conGroup[roleName] = conRole;

          // Determine which direction higher ramp index = more contrast
          const cEnd = clrRampsCollection[clrName][stepNames[rampLength - 1]].contrast[modeName].ratio;
          const cStart = clrRampsCollection[clrName][stepNames[0]].contrast[modeName].ratio;
          const contrastGrowthDir = cEnd > cStart ? 1 : -1;

          // Find base index: first step meeting minContrast
          let baseIdx = -1;
          if (modeName === "dark") {
            for (let i = rampLength - 1; i >= 0; i--) {
              if (clrRampsCollection[clrName][stepNames[i]].contrast[modeName].ratio >= minC) {
                baseIdx = i;
                break;
              }
            }
          } else {
            for (let i = 0; i < rampLength; i++) {
              if (clrRampsCollection[clrName][stepNames[i]].contrast[modeName].ratio >= minC) {
                baseIdx = i;
                break;
              }
            }
          }

          // Fallback: use best available contrast
          if (baseIdx === -1) {
            let bestIdx = -1,
              maxContrast = -1;
            for (let i = 0; i < rampLength; i++) {
              const c = clrRampsCollection[clrName][stepNames[i]].contrast[modeName].ratio;
              if (c > maxContrast) {
                bestIdx = i;
                maxContrast = c;
              }
            }
            baseIdx = bestIdx !== -1 ? bestIdx : rampLength >> 1;
            errors.critical.push({ color: clrName, role: roleName, theme: modeName, error: `Cannot meet minimum contrast ${minC}. Using closest available.` });
          }

          // Clamp so all 5 variations fit within ramp bounds; warn if base moved from contrast-found position
          const maxOffset = 2 * spread;
          const minAllowed = maxOffset;
          const maxAllowed = rampLength - 1 - maxOffset;
          let adjustedBase = false;
          if (baseIdx < minAllowed) {
            baseIdx = minAllowed;
            adjustedBase = true;
          }
          if (baseIdx > maxAllowed) {
            baseIdx = maxAllowed;
            adjustedBase = true;
          }
          if (adjustedBase) errors.warnings.push({ color: clrName, role: roleName, theme: modeName, warning: `Base index clamped to ${baseIdx} due to spread constraints.` });

          const offsetValues = [
            { key: "weakest", offset: -2 * spread },
            { key: "weak", offset: -spread },
            { key: "base", offset: 0 },
            { key: "strong", offset: spread },
            { key: "stronger", offset: 2 * spread },
          ];

          for (const { key: variation, offset: pureOffset } of offsetValues) {
            let idx = baseIdx + pureOffset * contrastGrowthDir;
            let adjusted = false;
            if (idx < 0) {
              idx = 0;
              adjusted = true;
            } else if (idx >= rampLength) {
              idx = rampLength - 1;
              adjusted = true;
            }

            const data = clrRampsCollection[clrName][stepNames[idx]];
            conRole[variation] = {
              tknName: `${clrName}-${role.name}-${variation}`,
              color: clrName,
              role: role.name,
              variation,
              tknRef: data.stepName,
              value: data.value,
              contrast: { ratio: data.contrast[modeName].ratio, rating: data.contrast[modeName].rating },
              variationOffset: pureOffset,
              isAdjusted: adjusted,
            };
            if (adjusted) errors.warnings.push({ color: clrName, role: roleName, variation, theme: modeName, warning: `Variation '${variation}' clamped due to overflow.` });
          }
        }
      } else if (config.roleMapping === "Manual Base Index") {
        for (const roleName of roleNames) {
          const role = roles[roleName];
          const spread = role.spread;
          const conRole = Object.create(null);
          conGroup[roleName] = conRole;

          const cEnd = clrRampsCollection[clrName][stepNames[rampLength - 1]].contrast[modeName].ratio;
          const cStart = clrRampsCollection[clrName][stepNames[0]].contrast[modeName].ratio;
          const contrastGrowthDir = cEnd > cStart ? 1 : -1;

          const isDark = modeName === "dark";
          const baseIndexSource = isDark && role.darkBaseIndex !== undefined ? role.darkBaseIndex : role.baseIndex;
          let baseIdx = baseIndexSource !== undefined ? parseInt(baseIndexSource) : rampLength >> 1;
          const maxOffset = 2 * spread;
          const minAllowed = maxOffset;
          const maxAllowed = rampLength - 1 - maxOffset;
          let adjustedBase = false;
          if (baseIdx < minAllowed) {
            baseIdx = minAllowed;
            adjustedBase = true;
          }
          if (baseIdx > maxAllowed) {
            baseIdx = maxAllowed;
            adjustedBase = true;
          }
          if (adjustedBase) errors.warnings.push({ color: clrName, role: roleName, theme: modeName, warning: `Base index clamped to ${baseIdx} due to spread constraints.` });

          const offsetValues = [
            { key: "weakest", offset: -2 * spread },
            { key: "weak", offset: -spread },
            { key: "base", offset: 0 },
            { key: "strong", offset: spread },
            { key: "stronger", offset: 2 * spread },
          ];

          for (const { key: variation, offset: pureOffset } of offsetValues) {
            let idx = baseIdx + pureOffset * contrastGrowthDir;
            let adjusted = false;
            if (idx < 0) {
              idx = 0;
              adjusted = true;
            } else if (idx >= rampLength) {
              idx = rampLength - 1;
              adjusted = true;
            }

            const data = clrRampsCollection[clrName][stepNames[idx]];
            conRole[variation] = {
              tknName: `${clrName}-${role.name}-${variation}`,
              color: clrName,
              role: role.name,
              variation,
              tknRef: data.stepName,
              value: data.value,
              contrast: { ratio: data.contrast[modeName].ratio, rating: data.contrast[modeName].rating },
              variationOffset: pureOffset,
              isAdjusted: adjusted,
              manualBaseIndex: baseIdx,
            };
            if (adjusted) errors.warnings.push({ color: clrName, role: roleName, variation, theme: modeName, warning: `Variation '${variation}' clamped due to overflow.` });
          }
        }
      }
    }
  }

  const output = { colorRamps: clrRampsCollection, colorTokens: tokensCollection, errors };
  lastInputHash = inputHash;
  cachedOutput = output;
  return output;
}

// 8. COLOR MATH UTILITIES: Pure, stateless functions — WCAG 2.1 compliant. (Ported from Utils.js reference.)

function validHex(hex) {
  if (typeof hex !== "string") return false;
  return /^#?([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(hex.trim());
}

function normalizeHex(hex) {
  if (!validHex(hex)) return null;
  hex = hex.trim().replace(/^#/, "");
  if (hex.length === 3)
    hex = hex
      .split("")
      .map((c) => c + c)
      .join("");
  return "#" + hex.toUpperCase();
}

function hexToRgb(hex) {
  const nhex = normalizeHex(hex);
  if (!nhex) return null;
  const bigint = parseInt(nhex.replace(/^#/, ""), 16);
  return [(bigint >> 16) & 255, (bigint >> 8) & 255, bigint & 255];
}

function rgbToHsl(r, g, b) {
  if ([r, g, b].some((v) => typeof v !== "number" || v < 0 || v > 255)) return null;
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b);
  let h,
    s,
    l = (max + min) / 2;
  if (max === min) {
    h = s = 0;
  } else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      default:
        h = (r - g) / d + 4;
        break;
    }
    h *= 60;
  }
  return [Math.round(h), Math.round(s * 100), Math.round(l * 100)];
}

function hslToRgb(h, s, l) {
  if (typeof h !== "number" || typeof s !== "number" || typeof l !== "number" || h < 0 || h > 360 || s < 0 || s > 100 || l < 0 || l > 100) return null;
  s /= 100;
  l /= 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0,
    g = 0,
    b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

function hslToHex(h, s, l) {
  const rgb = hslToRgb(h, s, l);
  if (!rgb) return null;
  return "#" + rgb.map((v) => v.toString(16).padStart(2, "0").toUpperCase()).join("");
}

function hexToHsl(hex) {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  return rgbToHsl(rgb[0], rgb[1], rgb[2]);
}

function hexToHue(hex) {
  const hsl = hexToHsl(hex);
  return hsl ? hsl[0] : null;
}
function hexToSat(hex) {
  const hsl = hexToHsl(hex);
  return hsl ? hsl[1] : null;
}
function hexToLum(hex) {
  const hsl = hexToHsl(hex);
  return hsl ? hsl[2] : null;
}

// WCAG 2.1 relative luminance
function relLum(hex) {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  const [r, g, b] = rgb.map((v) => {
    const x = v / 255;
    return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(hex1, hex2) {
  const n1 = normalizeHex(hex1),
    n2 = normalizeHex(hex2);
  if (!n1 || !n2) return null;
  const l1 = relLum(n1),
    l2 = relLum(n2);
  if (l1 === null || l2 === null) return null;
  return Number(((Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)).toFixed(2));
}

// WCAG 2.1 thresholds: <3 Fail, 3–4.5 AA Large, 4.5–7 AA, ≥7 AAA
function contrastRating(hex1, hex2) {
  const ratio = contrastRatio(hex1, hex2);
  if (ratio === null) return null;
  if (ratio < 3) return "Fail";
  if (ratio < 4.5) return "AA Large";
  if (ratio < 7) return "AA";
  return "AAA";
}

function seriesMaker(x) {
  const out = [];
  for (let i = 1; i <= x; i++) out.push(i);
  return out;
}
