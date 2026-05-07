/**
 * FIGMA COLOR SYSTEM GENERATOR
 * Organization:
 * 1. UI Initialization
 * 2. Message Router
 * 3. Config Translator  (appState → reference engine format)
 * 4. Export Formatters  (CSV / CSS / JSON / SCSS)
 * 5. Figma Variable API (CRUD – _color_Ramps + tokens collections)
 * 6. Color Ramp Maker   (Linear / Uniform / Natural / Expressive / Symmetric)
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

  // Weight (step) names — colorStepNames can be a comma-string (plugin) or array (web app export)
  const colorStepRaw = Array.isArray(appState.colorStepNames)
    ? appState.colorStepNames.join(",")
    : appState.colorStepNames || "";
  const userWeightNames = colorStepRaw.trim() ? colorStepRaw.split(",").map((n) => n.trim()) : null;
  let stepNames = null;
  if (userWeightNames && userWeightNames.length > 0) {
    const names = userWeightNames.slice();
    while (names.length < count) names.push(String(names.length + 1));
    stepNames = names.slice(0, count);
  }

  // Role variation display names — roleStepNames can be a comma-string (plugin) or array (web app export)
  const roleStepRaw = Array.isArray(appState.roleStepNames)
    ? appState.roleStepNames.join(",")
    : appState.roleStepNames || "";
  const userVarNames = roleStepRaw
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
      baseIndex: role.baseIndex !== undefined ? parseInt(role.baseIndex) : Math.floor(count / 2),
      darkBaseIndex: role.darkBaseIndex !== undefined ? parseInt(role.darkBaseIndex) : undefined,
    })),
    colorSteps: count,
    rampType: appState.rampType || "Natural",
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

    // Fetch ramps collection once — used by both stages when applicable.
    // scope="roles" skips Stage 1 but Stage 2 still needs rampsCol to resolve variable aliases
    // (unless skipColorRamps is true, in which case raw hex values are used directly).
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
                const targetVar = (rampFigmaName && rampsCol)
                  ? this.cache.variables.find((cv) => cv.name === rampFigmaName && cv.variableCollectionId === rampsCol.id)
                  : null;
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
      const targetCol = await this.getOrCreateCollection(targetName);
      const modeId = targetCol.modes[0].modeId;

      // Remove any stale copies of __ctm316_config__ in other collections to avoid
      // ambiguous restore on next launch when skipColorRamps has been toggled.
      for (const v of this.cache.variables) {
        if (v.name === "__ctm316_config__" && v.variableCollectionId !== targetCol.id) {
          try { v.remove(); } catch (_) {}
        }
      }
      this.cache.variables = this.cache.variables.filter(
        (v) => !(v.name === "__ctm316_config__" && v.variableCollectionId !== targetCol.id)
      );

      let cfgVar = this.cache.variables.find((v) => v.name === "__ctm316_config__" && v.variableCollectionId === targetCol.id);
      if (!cfgVar) {
        cfgVar = figma.variables.createVariable("__ctm316_config__", targetCol, "STRING");
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

// 6. COLOR SPACES — OKLCH + HCT (inlined from ColorSpaces.js, no external deps)
function _lin(c){return c<=0.04045?c/12.92:Math.pow((c+0.055)/1.055,2.4);}
function _dlin(c){return c<=0.0031308?c*12.92:1.055*Math.pow(c,1/2.4)-0.055;}
function _h2lr(hex){const n=parseInt(hex.replace("#",""),16);return[_lin(((n>>16)&255)/255),_lin(((n>>8)&255)/255),_lin((n&255)/255)];}
function _lr2h(r,g,b){const cl=(v)=>Math.max(0,Math.min(255,Math.round(_dlin(Math.max(0,v))*255)));return"#"+[cl(r),cl(g),cl(b)].map(v=>v.toString(16).padStart(2,"0")).join("");}
function _m3(m,v){return[m[0][0]*v[0]+m[0][1]*v[1]+m[0][2]*v[2],m[1][0]*v[0]+m[1][1]*v[1]+m[1][2]*v[2],m[2][0]*v[0]+m[2][1]*v[1]+m[2][2]*v[2]];}
// OKLCH matrices (Björn Ottosson — direct linRGB↔LMS, no XYZ intermediate)
const _M1=[[0.4122214708,0.5363325363,0.0514459929],[0.2119034982,0.6806995451,0.1073969566],[0.0883024619,0.2817188376,0.6299787005]];
const _M2=[[0.2104542553,0.7936177850,-0.0040720468],[1.9779984951,-2.4285922050,0.4505937099],[0.0259040371,0.7827717662,-0.8086757660]];
const _M2i=[[1.0,0.3963377774,0.2158037573],[1.0,-0.1055613458,-0.0638541728],[1.0,-0.0894841775,-1.2914855480]];
const _M1i=[[4.0767416621,-3.3077115913,0.2309699292],[-1.2684380046,2.6097574011,-0.3413193965],[-0.0041960863,-0.7034186147,1.7076147010]];
function hexToOklch(hex){const[r,g,b]=_h2lr(hex);const lms=_m3(_M1,[r,g,b]).map(v=>Math.cbrt(Math.max(0,v)));const[L,a,b2]=_m3(_M2,lms);const C=Math.sqrt(a*a+b2*b2);const H=((Math.atan2(b2,a)*180/Math.PI)+360)%360;return{L,C,H};}
function oklchToHex(L,C,H){const a=C*Math.cos(H*Math.PI/180);const b=C*Math.sin(H*Math.PI/180);const lms=_m3(_M2i,[L,a,b]).map(v=>v*v*v);const[r,g,bl]=_m3(_M1i,lms);return _lr2h(r,g,bl);}
// HCT — CAM16 + CIE L* tone
const _LX=[[0.4123907993,0.3575843394,0.1804807884],[0.2126390059,0.7151686788,0.0721923154],[0.0193308187,0.1191947798,0.9505321522]];
const _XL=[[3.2409699419,-1.5373831776,-0.4986107603],[-0.9692436363,1.8759675015,0.0415550574],[0.0556300797,-0.2039769589,1.0569715142]];
const _VC=(()=>{const W=[95.047,100,108.883];const aL=(200/Math.PI)*Math.pow(66/116,3);const F=1,c=0.69,Nc=1;const k=1/(5*aL+1);const FL=0.2*k**4*(5*aL)+0.1*(1-k**4)**2*(5*aL)**(1/3);const n=Math.pow(66/116,3);const z=1.48+Math.sqrt(50*n),Nbb=0.725/n**0.2,Ncb=Nbb;const hpe=[[0.38971,0.68898,-0.07868],[-0.22981,1.1834,0.04641],[0,0,1]];const cat=[[0.7328,0.4296,-0.1624],[-0.7036,1.6975,0.0061],[0.003,0.0136,0.9834]];const ci=[[1.0961238208,-0.2788690002,0.1827452039],[0.4543690419,0.4735331543,0.0720978039],[-0.0096276087,-0.0056980312,1.0153256399]];const hpi=[[1.9101968341,-1.1121238928,0.2019079568],[0.3709500882,0.6290542574,-0.0000080551],[0,0,1]];const m3=(m,v)=>[m[0][0]*v[0]+m[0][1]*v[1]+m[0][2]*v[2],m[1][0]*v[0]+m[1][1]*v[1]+m[1][2]*v[2],m[2][0]*v[0]+m[2][1]*v[1]+m[2][2]*v[2]];const D=F*(1-(1/3.6)*Math.exp((-aL-42)/92));const rW=m3(cat,W.map(v=>v/100));const Drgb=rW.map(v=>D/v+1-D);const ad=c2=>{const f=(FL*Math.abs(c2))**0.42;return 400*Math.sign(c2)*f/(f+27.13);};const aW=m3(hpe,m3(ci,rW.map((v,i)=>v*Drgb[i]))).map(ad);const Aw=(2*aW[0]+aW[1]+0.05*aW[2]-0.305)*Nbb;return{F,c,Nc,Nbb,Ncb,FL,n,z,Aw,D,Drgb,hpe,cat,ci,hpi,ad};})();
function _x2hct(X,Y,Z){const v=_VC,m3=(m,v2)=>[m[0][0]*v2[0]+m[0][1]*v2[1]+m[0][2]*v2[2],m[1][0]*v2[0]+m[1][1]*v2[1]+m[1][2]*v2[2],m[2][0]*v2[0]+m[2][1]*v2[1]+m[2][2]*v2[2]];const rgb=m3(v.cat,[X,Y,Z]).map((c2,i)=>c2*v.Drgb[i]);const rA=m3(v.hpe,m3(v.ci,rgb)).map(v.ad);const p2=(2*rA[0]+rA[1]+0.05*rA[2]-0.305)*v.Nbb;const a=rA[0]-12*rA[1]/11+rA[2]/11,b=(rA[0]+rA[1]-2*rA[2])/9;const hd=((Math.atan2(b,a)*180/Math.PI)+360)%360;const t=(50000/13)*v.Nc*v.Ncb*Math.sqrt(a*a+b*b)/(p2+0.305);const J=100*Math.pow(p2/v.Aw,v.c*v.z);return{h:hd,c:Math.pow(t===0?0:Math.pow(t,0.9)*Math.pow(1.64-Math.pow(0.29,v.n),0.73),1)*Math.sqrt(J/100),t:Y<=0?0:Y>=1?100:116*Math.cbrt(Y)-16};}
function hexToHct(hex){const[r,g,b]=_h2lr(hex);const[X,Y,Z]=_m3(_LX,[r,g,b]);return _x2hct(X,Y,Z);}
function _jFromTone(tone){const v=_VC,m3=(m,v2)=>[m[0][0]*v2[0]+m[0][1]*v2[1]+m[0][2]*v2[2],m[1][0]*v2[0]+m[1][1]*v2[1]+m[1][2]*v2[2],m[2][0]*v2[0]+m[2][1]*v2[1]+m[2][2]*v2[2]];if(tone<=0)return 0;if(tone>=100)return 100;const Y=tone>8?Math.pow((tone+16)/116,3):tone/903.3;const X=Y*0.95047,Z=Y*1.08883;const cat=m3(v.cat,[X,Y,Z]).map((c2,i)=>c2*v.Drgb[i]);const hR=m3(v.hpe,m3(v.ci,cat)).map(v.ad);const p2=(2*hR[0]+hR[1]+0.05*hR[2]-0.305)*v.Nbb;return 100*Math.pow(Math.max(0,p2/v.Aw),v.c*v.z);}
function _hctRgbOrNull(hue,ch,J){const v=_VC,m3=(m,v2)=>[m[0][0]*v2[0]+m[0][1]*v2[1]+m[0][2]*v2[2],m[1][0]*v2[0]+m[1][1]*v2[1]+m[1][2]*v2[2],m[2][0]*v2[0]+m[2][1]*v2[1]+m[2][2]*v2[2]];if(J<=0)return null;const ta=ch>0?Math.pow(ch/Math.sqrt(J/100),1/0.9)/Math.pow(1.64-Math.pow(0.29,v.n),0.73):0;const hr=hue*Math.PI/180,p1=(50000/13)*v.Nc*v.Ncb,p2=Math.pow(J/100,1/(v.c*v.z))*v.Aw/v.Nbb+0.305;let a,b;if(ta<=0){a=0;b=0;}else{const g=23*(p2+0.305)*ta/(23*p1+11*ta*Math.cos(hr)+108*ta*Math.sin(hr));a=g*Math.cos(hr);b=g*Math.sin(hr);}const Ra=(460*p2+451*a+288*b)/1403,Ga=(460*p2-891*a-261*b)/1403,Ba=(460*p2-220*a-6300*b)/1403;const iv=c2=>{const s=Math.sign(c2);return s*Math.pow(Math.max(0,Math.abs(c2)*27.13/(400-Math.abs(c2))),1/0.42)/v.FL;};const lr=m3(_XL,m3(v.ci,m3(v.hpi,[Ra,Ga,Ba].map(iv)).map((c2,i)=>c2/v.Drgb[i])));if(Math.max(...lr)>1+1e-4||Math.min(...lr)<-1e-4)return null;return lr.map(x=>Math.max(0,x));}
function hctToHex(hue,ch,tone){if(ch<0.0001||tone<=0||tone>=100){if(tone<=0)return"#000000";if(tone>=100)return"#ffffff";const Y=tone>8?Math.pow((tone+16)/116,3):tone/903.3;const v=Math.round(_dlin(Y)*255);return"#"+v.toString(16).padStart(2,"0").repeat(3);}const J=_jFromTone(tone);if(J<=0)return"#000000";let lo=0,hi=ch,best=null;for(let it=0;it<50;it++){if(hi-lo<0.01)break;const mid=(lo+hi)/2;const rgb=_hctRgbOrNull(hue,mid,J);if(rgb===null){hi=mid;}else{best=_lr2h(...rgb);lo=mid;}}return best||("#"+Math.round(_dlin(tone>8?Math.pow((tone+16)/116,3):tone/903.3)*255).toString(16).padStart(2,"0").repeat(3));}

// 6b. COLOR RAMP MAKER: Simple hash cache: skip regeneration when config hasn't changed.
let lastInputHash = null;
let cachedOutput = null;

function colorRampMaker(hexIn, rampLength, rampType = "Natural") {
  const hue = hexToHue(hexIn);
  const satu = hexToSat(hexIn);
  const N = rampLength;

  if (rampType === "Linear") {
    const inc = 100 / (N + 1);
    const out = [];
    for (let i = 1; i <= N; i++) out.push(hslToHex(hue, satu, i * inc) || "#000000");
    return out.reverse();
  }

  // Contrast-symmetric perceptual spacing in log(L+0.05) space.
  // C_max = 21·N/(N+1) — approaches 21:1 but never reaches pure black or white.
  // Symmetry: contrast vs black at lightest step = contrast vs white at darkest step.
  const C_max = (21 * N) / (N + 1);
  const uMax  = Math.log(0.05 * C_max);
  const uMin  = Math.log(1.05 / C_max);

  function stepLum(i) {
    const u = N === 1 ? (uMax + uMin) / 2 : uMax - (i / (N - 1)) * (uMax - uMin);
    return Math.exp(u) - 0.05;
  }

  function findL(targetLum, getS, getH) {
    let lo = 0, hi = 100, L = 50;
    for (let j = 0; j < 30; j++) {
      const mid = (lo + hi) / 2;
      const lum = relLum(hslToHex(getH(mid), getS(mid), mid));
      L = mid;
      if (Math.abs(lum - targetLum) < 0.0001) break;
      if (lum < targetLum) lo = mid; else hi = mid;
    }
    return L;
  }

  const tapS = (L) => satu * (1 - Math.pow(Math.abs(L - 50) / 50, 1.5) * 0.4);

  if (rampType === "Uniform") {
    const out = [];
    for (let i = 0; i < N; i++) {
      const L = findL(stepLum(i), () => satu, () => hue);
      out.push(hslToHex(hue, satu, L) || "#000000");
    }
    return out;
  }

  if (rampType === "Natural") {
    const out = [];
    for (let i = 0; i < N; i++) {
      const L = findL(stepLum(i), tapS, () => hue);
      out.push(hslToHex(hue, tapS(L), L) || "#000000");
    }
    return out;
  }

  if (rampType === "Expressive") {
    const shiftH = (L) => {
      const d = (L - 50) / 50;
      return (hue + shortestHueDiff(hue, d > 0 ? 60 : 240) * Math.abs(d) * 0.15 + 360) % 360;
    };
    const out = [];
    for (let i = 0; i < N; i++) {
      const L = findL(stepLum(i), tapS, shiftH);
      out.push(hslToHex(shiftH(L), tapS(L), L) || "#000000");
    }
    return out;
  }

  if (rampType === "Symmetric") {
    const srcLum = relLum(normalizeHex(hexIn)) || 0.18;
    const uSrc   = Math.log(srcLum + 0.05);
    const mid    = Math.floor((N - 1) / 2);
    const out    = [];
    for (let i = 0; i < N; i++) {
      let u;
      if      (N === 1)       u = uSrc;
      else if (i === 0)       u = uMax;
      else if (i === N - 1)   u = uMin;
      else if (i <= mid && mid > 0) u = uMax - (uMax - uSrc) * i / mid;
      else                    u = uSrc - (uSrc - uMin) * (i - mid) / (N - 1 - mid);
      const targetLum = Math.max(0.0001, Math.exp(Math.min(uMax, Math.max(uMin, u))) - 0.05);
      const L = findL(targetLum, () => satu, () => hue);
      out.push(hslToHex(hue, satu, L) || "#000000");
    }
    return out;
  }

  if (rampType === "OKLCH") {
    const { C: srcC, H: srcH } = hexToOklch(normalizeHex(hexIn));
    const out = [];
    for (let i = 0; i < N; i++) {
      const targetLum = stepLum(i);
      let lo = 0, hi = 1, oL = 0.5;
      for (let j = 0; j < 40; j++) {
        const mid = (lo + hi) / 2;
        const lum = relLum(oklchToHex(mid, srcC, srcH));
        oL = mid;
        if (Math.abs(lum - targetLum) < 0.0001) break;
        if (lum < targetLum) lo = mid; else hi = mid;
      }
      out.push(oklchToHex(oL, srcC, srcH) || "#000000");
    }
    return out;
  }

  if (rampType === "Material") {
    const { h: srcH, c: srcC } = hexToHct(normalizeHex(hexIn));
    const out = [];
    for (let i = 0; i < N; i++) {
      const targetLum = stepLum(i);
      let lo = 0, hi = 100, tone = 50;
      for (let j = 0; j < 40; j++) {
        const mid = (lo + hi) / 2;
        const lum = relLum(hctToHex(srcH, srcC, mid));
        tone = mid;
        if (Math.abs(lum - targetLum) < 0.0001) break;
        if (lum < targetLum) lo = mid; else hi = mid;
      }
      out.push(hctToHex(srcH, srcC, tone) || "#000000");
    }
    return out;
  }

  return colorRampMaker(hexIn, rampLength, "Natural");
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
    colorStepNames: config.colorStepNames,
    roleStepNames: config.roleStepNames,
  });

  if (inputHash === lastInputHash && cachedOutput) {
    return cachedOutput;
  }

  const lightBg = normalizeHex(config.themes[0].bg) || "#FFFFFF";
  const darkBg = normalizeHex(config.themes[1].bg) || "#000000";
  const clrRampsCollection = Object.create(null);
  const tokensCollection = {
    light: Object.create(null),
    dark: Object.create(null),
  };
  const errors = { critical: [], warnings: [], notices: [] };

  for (const color of colors) {
    const colorRamp = colorRampMaker(color.value, rampLength, config.rampType);
    const ramp = Object.create(null);
    clrRampsCollection[color.name] = ramp;

    for (let wIdx = 0; wIdx < rampLength; wIdx++) {
      const weight = stepNames[wIdx];
      const value = normalizeHex(colorRamp[wIdx]);
      const lightContrast = contrastRatio(value, lightBg);
      const darkContrast = contrastRatio(value, darkBg);

      ramp[weight] = {
        value,
        stepName: `${color.name}-${weight}`,
        shortName: `${color.shortName}-${weight}`,
        contrast: {
          light: { ratio: lightContrast, rating: contrastRating(value, lightBg) },
          dark: { ratio: darkContrast, rating: contrastRating(value, darkBg) },
        },
      };
    }
  }

  for (const mode of config.themes) {
    const modeName = mode.name.toLowerCase();
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

          let baseIdx = -1;
          const highestWeight = stepNames[rampLength - 1];
          const lowestWeight = stepNames[0];
          const cEnd = clrRampsCollection[clrName][highestWeight].contrast[modeName].ratio;
          const cStart = clrRampsCollection[clrName][lowestWeight].contrast[modeName].ratio;
          // +1: higher ramp index = more contrast (light bg). -1: lower index = more contrast (dark bg).
          // Applied as a multiplier on spread offsets so "stronger" always means more contrast.
          const contrastGrowthDir = cEnd > cStart ? 1 : -1;
          const isDarkTheme = modeName === "dark";

          if (isDarkTheme) {
            for (let i = rampLength - 1; i >= 0; i--) {
              const weight = stepNames[i];
              const c = clrRampsCollection[clrName][weight].contrast[modeName].ratio;
              if (c >= minC) {
                baseIdx = i;
                break;
              }
            }
          } else {
            for (let i = 0; i < rampLength; i++) {
              const weight = stepNames[i];
              const c = clrRampsCollection[clrName][weight].contrast[modeName].ratio;
              if (c >= minC) {
                baseIdx = i;
                break;
              }
            }
          }

          if (baseIdx === -1) {
            let bestIdx = -1;
            let maxContrast = -1;
            for (let i = 0; i < rampLength; i++) {
              const weight = stepNames[i];
              const c = clrRampsCollection[clrName][weight].contrast[modeName].ratio;
              if (c > maxContrast) {
                bestIdx = i;
                maxContrast = c;
              }
            }
            if (bestIdx !== -1) {
              baseIdx = bestIdx;
              errors.critical.push({
                color: clrName,
                role: roleName,
                theme: modeName,
                error: `Cannot meet minimum contrast ${minC}. using closest available (${maxContrast.toFixed(2)}).`,
              });
            } else {
              baseIdx = rampLength >> 1;
              errors.critical.push({
                color: clrName,
                role: roleName,
                theme: modeName,
                error: "Cannot evaluate contrast for any weight.",
              });
            }
          }

          const maxOffset = 2 * spread;
          const minAllowed = maxOffset;
          const maxAllowed = rampLength - 1 - maxOffset;
          let adjustedBase = false;
          if (minAllowed > maxAllowed) {
            // spread is too large for this ramp length — pin to midpoint so all offsets clamp symmetrically
            baseIdx = Math.floor((rampLength - 1) / 2);
            adjustedBase = true;
          } else {
            if (baseIdx < minAllowed) { baseIdx = minAllowed; adjustedBase = true; }
            if (baseIdx > maxAllowed) { baseIdx = maxAllowed; adjustedBase = true; }
          }
          if (adjustedBase) errors.warnings.push({ color: clrName, role: roleName, theme: modeName, warning: `Base index clamped to ${baseIdx} due to spread constraints.` });

          const offsetValues = [
            { key: "weakest", offset: -2 * spread },
            { key: "weak", offset: -spread },
            { key: "base", offset: 0 },
            { key: "strong", offset: spread },
            { key: "stronger", offset: 2 * spread },
          ];

          for (let vIdx = 0; vIdx < offsetValues.length; vIdx++) {
            const { key: variation, offset: pureOffset } = offsetValues[vIdx];
            let idx = baseIdx + pureOffset * contrastGrowthDir;
            let adjusted = false;
            if (idx < 0) {
              idx = 0;
              adjusted = true;
            } else if (idx >= rampLength) {
              idx = rampLength - 1;
              adjusted = true;
            }

            const weight = stepNames[idx];
            const data = clrRampsCollection[clrName][weight];

            conRole[variation] = {
              tknName: `${clrName}-${role.name}-${variation}`,
              color: clrName,
              role: role.name,
              variation: variation,
              tknRef: data.stepName,
              value: data.value,
              contrast: {
                ratio: data.contrast[modeName].ratio,
                rating: data.contrast[modeName].rating,
              },
              variationOffset: pureOffset,
              isAdjusted: adjusted,
            };
            if (adjusted) {
              errors.warnings.push({
                color: clrName,
                role: roleName,
                variation,
                theme: modeName,
                warning: `Variation '${variation}' clamped due to overflow`,
              });
            }
          }
        }
      } else if (config.roleMapping === "Manual Base Index") {
        for (const roleName of roleNames) {
          const role = roles[roleName];
          const spread = role.spread;
          const conRole = Object.create(null);
          conGroup[roleName] = conRole;

          const highestWeight = stepNames[rampLength - 1];
          const lowestWeight = stepNames[0];
          const cEnd = clrRampsCollection[clrName][highestWeight].contrast[modeName].ratio;
          const cStart = clrRampsCollection[clrName][lowestWeight].contrast[modeName].ratio;
          const contrastGrowthDir = cEnd > cStart ? 1 : -1;

          const isDark = modeName === "dark";
          const baseIndexSource = isDark && role.darkBaseIndex !== undefined ? role.darkBaseIndex : role.baseIndex;
          let baseIdx = baseIndexSource !== undefined ? parseInt(baseIndexSource) : rampLength >> 1;

          const maxOffset = 2 * spread;
          const minAllowed = maxOffset;
          const maxAllowed = rampLength - 1 - maxOffset;
          let adjustedBase = false;
          if (minAllowed > maxAllowed) {
            baseIdx = Math.floor((rampLength - 1) / 2);
            adjustedBase = true;
          } else {
            if (baseIdx < minAllowed) { baseIdx = minAllowed; adjustedBase = true; }
            if (baseIdx > maxAllowed) { baseIdx = maxAllowed; adjustedBase = true; }
          }
          if (adjustedBase) {
            errors.warnings.push({
              color: clrName,
              role: roleName,
              theme: modeName,
              warning: `Base index clamped to ${baseIdx} due to spread constraints.`,
            });
          }

          const offsetValues = [
            { key: "weakest", offset: -2 * spread },
            { key: "weak", offset: -spread },
            { key: "base", offset: 0 },
            { key: "strong", offset: spread },
            { key: "stronger", offset: 2 * spread },
          ];

          for (let vIdx = 0; vIdx < offsetValues.length; vIdx++) {
            const { key: variation, offset: pureOffset } = offsetValues[vIdx];
            let idx = baseIdx + pureOffset * contrastGrowthDir;
            let adjusted = false;
            if (idx < 0) {
              idx = 0;
              adjusted = true;
            } else if (idx >= rampLength) {
              idx = rampLength - 1;
              adjusted = true;
            }

            const weight = stepNames[idx];
            const data = clrRampsCollection[clrName][weight];

            conRole[variation] = {
              tknName: `${clrName}-${role.name}-${variation}`,
              color: clrName,
              role: role.name,
              variation: variation,
              tknRef: data.stepName,
              value: data.value,
              contrast: {
                ratio: data.contrast[modeName].ratio,
                rating: data.contrast[modeName].rating,
              },
              variationOffset: pureOffset,
              isAdjusted: adjusted,
              manualBaseIndex: baseIdx,
            };
            if (adjusted) {
              errors.warnings.push({
                color: clrName,
                role: roleName,
                variation,
                theme: modeName,
                warning: `Variation '${variation}' clamped due to overflow`,
              });
            }
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

function shortestHueDiff(current, target) {
  return (((target - current + 180) % 360) + 360) % 360 - 180;
}
