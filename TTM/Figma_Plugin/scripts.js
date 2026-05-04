/**
 * TTM316 — TEXT TOKEN MANAGER
 * Organization:
 * 1. UI Initialization
 * 2. Message Router
 * 3. Config Translator  (appState → engine format)
 * 4. Export Formatters  (JSON / CSS / SCSS)
 * 5. Figma API Manager  (FLOAT variables + Text Styles CRUD)
 * 6. Scale Generator    (Modular / Linear / Custom)
 * 7. Role Style Resolver (scale index → typography spec)
 * 8. Type System Generator (typeMaker — scale + roles)
 */

// 1. UI INITIALIZATION
figma.showUI(__html__, { width: 424, height: 720, themeColors: true });

// Load saved config from Figma on startup
(async () => {
  try {
    const vars = await figma.variables.getLocalVariablesAsync("STRING");
    const cfgVar = vars.find((v) => v.name === "__ttm316_config__");
    if (cfgVar) {
      const modeId = Object.keys(cfgVar.valuesByMode)[0];
      const colorRamp = cfgVar.valuesByMode[modeId];
      if (typeof colorRamp === "string") {
        figma.ui.postMessage({ type: "load-config", state: JSON.parse(colorRamp) });
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
        const result = typeMaker(config);
        if (result.errors.critical.length > 0 && result.scaleSteps.length === 0) {
          figma.ui.postMessage({ type: "error", message: result.errors.critical[0] });
          break;
        }
        await TTMManager.sync(result, config, msg.scope || "all", msg.state);
        break;
      }

      case "check-collections": {
        const cols = await figma.variables.getLocalVariableCollectionsAsync();
        const names = [msg.scaleCollectionName].filter(Boolean);
        const existing = names.filter((n) => cols.some((c) => c.name === n));
        figma.ui.postMessage({ type: "collection-check-result", existing });
        break;
      }

      case "resize":
        figma.ui.resize(msg.width, msg.height);
        break;

      case "request-processed-data": {
        const config = translateConfig(msg.state);
        const result = typeMaker(config);
        let content = "";
        if (msg.exportType === "json") content = ExportFormatter.toJSON(result, config, msg.state);
        else if (msg.exportType === "css") content = ExportFormatter.toCSS(result, config);
        else if (msg.exportType === "scss") content = ExportFormatter.toSCSS(result, config);
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

// 3. CONFIG TRANSLATOR
function translateConfig(appState) {
  const scale = appState.scale || {};
  const fonts = appState.fonts || [
    { slot: "primary", family: "Inter", fallback: "sans-serif" },
    { slot: "secondary", family: "Merriweather", fallback: "serif" },
    { slot: "tertiary", family: "JetBrains Mono", fallback: "monospace" },
  ];

  const fontWeights = appState.fontWeights || [
    { alias: "Thin", value: 100, figmaStyles: {} },
    { alias: "Light", value: 300, figmaStyles: {} },
    { alias: "Regular", value: 400, figmaStyles: {} },
    { alias: "Medium", value: 500, figmaStyles: {} },
    { alias: "SemiBold", value: 600, figmaStyles: {} },
    { alias: "Bold", value: 700, figmaStyles: {} },
    { alias: "ExtraBold", value: 800, figmaStyles: {} },
    { alias: "Black", value: 900, figmaStyles: {} },
  ];

  return {
    name: appState.name || "ttm316",
    baseFontSize: parseFloat(appState.baseFontSize) || 16,
    fonts,
    fontWeights,
    scale: {
      method: scale.method || "Modular",
      seedSize: parseFloat(scale.seedSize) || 16,
      ratio: parseFloat(scale.ratio) || 1.25,
      ratioName: scale.ratioName || "Major Third",
      steps: Math.max(1, parseInt(scale.steps) || 10),
      minSize: parseFloat(scale.minSize) || 10,
      maxSize: parseFloat(scale.maxSize) || 96,
      customValues: scale.customValues || [],
      namingScheme: scale.namingScheme || "numeric",
      customStepNames: scale.customStepNames || [],
      scaleOverrides: scale.scaleOverrides || {},
    },
    roles: (appState.roles || []).map(function (role) {
      // Migrate old format (variationCount/baseScaleIndex) to new variations array
      if (role.variations) {
        return {
          name: role.name || "Role",
          shortName: role.shortName || role.name.substring(0, 2).toLowerCase(),
          fontSlot: role.fontSlot || "primary",
          textTransform: role.textTransform || "none",
          variations: role.variations.map(function (vr) {
            return {
              name: vr.name || "v",
              scaleIndex: parseInt(vr.scaleIndex) || 0,
              lineHeight: vr.lineHeight || { unit: "PERCENT", value: 150 },
              letterSpacing: vr.letterSpacing || { unit: "PERCENT", value: 0 },
            };
          }),
        };
      }
      // Legacy format migration
      var count = Math.max(1, parseInt(role.variationCount) || 1);
      var variations = [];
      for (var v = 0; v < count; v++) {
        var delta = role.scaleDirection === "descending" ? count - 1 - v : v;
        var scaleIndex = Math.max(0, (parseInt(role.baseScaleIndex) || 0) - delta);
        var ov =
          (role.variationOverrides || []).filter(function (o) {
            return o.index === v;
          })[0] || {};
        var varName = (role.variationNames && role.variationNames[v]) || (role.shortName || "r") + (v + 1);
        variations.push({
          name: varName,
          scaleIndex: scaleIndex,
          lineHeight: ov.lineHeight || role.lineHeight || { unit: "PERCENT", value: 150 },
          letterSpacing: ov.letterSpacing || role.letterSpacing || { unit: "PERCENT", value: 0 },
        });
      }
      return {
        name: role.name || "Role",
        shortName: role.shortName || role.name.substring(0, 2).toLowerCase(),
        fontSlot: role.fontSlot || "primary",
        textTransform: role.textTransform || "none",
        variations: variations,
      };
    }),
    scaleCollectionName: appState.scaleCollectionName || "Type Scale",
    skipScaleVariables: appState.skipScaleVariables || false,
    tokenGrouping: appState.tokenGrouping || "role",
    useShortRoleNames: appState.useShortRoleNames || false,
    styleNameSeparator: appState.styleNameSeparator || "/",
  };
}

// 4. EXPORT FORMATTERS
function cssSlug(str) {
  if (!str) return "";
  return String(str)
    .toLowerCase()
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}

function lineHeightToCss(lh) {
  if (!lh) return "1.5";
  if (lh.unit === "AUTO") return "normal";
  if (lh.unit === "PIXELS") return `${lh.value}px`;
  if (lh.unit === "PERCENT") return String(Math.round((lh.value / 100) * 1000) / 1000);
  return String(lh.value);
}

function letterSpacingToCss(ls) {
  if (!ls) return "0";
  if (ls.unit === "PIXELS") return `${ls.value}px`;
  if (ls.unit === "PERCENT") return `${Math.round((ls.value / 100) * 1000) / 1000}em`;
  return "0";
}

function resolveWeightValue(alias, fontWeights) {
  const w = fontWeights.find((fw) => fw.alias === alias);
  return w ? w.value : 400;
}

const ExportFormatter = {
  toJSON(result, config, appState) {
    return JSON.stringify(
      {
        meta: {
          system: "ttm316",
          name: config.name,
          generated: new Date().toISOString(),
          baseFontSize: config.baseFontSize,
        },
        scale: result.scaleSteps,
        roles: result.roleStyles ? groupRoleStylesForExport(result.roleStyles) : [],
        config: appState || config,
      },
      null,
      2,
    );
  },

  toCSS(result, config) {
    const date = new Date().toISOString();
    let css = `/* ${config.name} — generated by ttm316 | ${date} */\n\n`;
    css += `:root {\n  /* ── Type Scale ── */\n`;
    for (const step of result.scaleSteps) {
      css += `  --scale-${cssSlug(String(step.name))}: ${step.px}px;\n`;
      css += `  --scale-${cssSlug(String(step.name))}-rem: ${step.rem}rem;\n`;
    }
    css += `\n  /* ── Role Tokens ── */\n`;
    for (const spec of result.roleStyles || []) {
      const prefix = `--${cssSlug(spec.roleName)}-${cssSlug(spec.variationName)}`;
      css += `  ${prefix}-size: var(--scale-${cssSlug(String(spec.scaleStep.name))});\n`;
      css += `  ${prefix}-line-height: ${lineHeightToCss(spec.lineHeight)};\n`;
      css += `  ${prefix}-letter-spacing: ${letterSpacingToCss(spec.letterSpacing)};\n`;
      css += `  ${prefix}-font-family: "${spec.fontFamily}";\n`;
      css += `  ${prefix}-font-weight: ${resolveWeightValue(spec.fontWeightAlias, config.fontWeights)};\n`;
      if (spec.textTransform && spec.textTransform !== "none") {
        css += `  ${prefix}-text-transform: ${spec.textTransform};\n`;
      }
    }
    css += `}\n`;
    return css;
  },

  toSCSS(result, config) {
    const date = new Date().toISOString();
    const hr = (t) => `// ${"=".repeat(58)}\n// ${t}\n// ${"=".repeat(58)}\n\n`;
    let scss = `// ${config.name} — Auto-generated SCSS\n// Generated: ${date}\n// Do not edit manually.\n\n`;
    scss += `@use 'sass:map';\n\n`;
    scss += hr("TYPE SCALE VARIABLES");
    for (const step of result.scaleSteps) {
      scss += `$scale-${cssSlug(String(step.name))}: ${step.px}px;\n`;
    }
    scss += `\n$type-scale: (\n`;
    for (const step of result.scaleSteps) {
      scss += `  "${cssSlug(String(step.name))}": $scale-${cssSlug(String(step.name))},\n`;
    }
    scss += `);\n\n`;
    scss += hr("ROLE TOKEN MAPS");
    for (const spec of result.roleStyles || []) {
      const varName = `$${cssSlug(spec.roleName)}-${cssSlug(spec.variationName)}`;
      scss += `${varName}: (\n`;
      scss += `  size:           $scale-${cssSlug(String(spec.scaleStep.name))},\n`;
      scss += `  line-height:    ${lineHeightToCss(spec.lineHeight)},\n`;
      scss += `  letter-spacing: ${letterSpacingToCss(spec.letterSpacing)},\n`;
      scss += `  font-family:    "${spec.fontFamily}",\n`;
      scss += `  font-weight:    ${resolveWeightValue(spec.fontWeightAlias, config.fontWeights)},\n`;
      if (spec.textTransform && spec.textTransform !== "none") {
        scss += `  text-transform: ${spec.textTransform},\n`;
      }
      scss += `);\n\n`;
    }
    scss += hr("ROLE MIXIN");
    scss += `@mixin apply-text-role($role-map) {\n`;
    scss += `  font-size:      map.get($role-map, size);\n`;
    scss += `  line-height:    map.get($role-map, line-height);\n`;
    scss += `  letter-spacing: map.get($role-map, letter-spacing);\n`;
    scss += `  font-family:    map.get($role-map, font-family);\n`;
    scss += `  font-weight:    map.get($role-map, font-weight);\n`;
    scss += `  @if map.has-key($role-map, text-transform) {\n`;
    scss += `    text-transform: map.get($role-map, text-transform);\n`;
    scss += `  }\n}\n`;
    return scss;
  },
};

function groupRoleStylesForExport(roleStyles) {
  const grouped = {};
  for (const spec of roleStyles) {
    if (!grouped[spec.roleName]) grouped[spec.roleName] = { role: spec.roleName, variations: [] };
    grouped[spec.roleName].variations.push({
      name: spec.variationName,
      scaleName: String(spec.scaleStep.name),
      px: spec.scaleStep.px,
      rem: spec.scaleStep.rem,
      fontFamily: spec.fontFamily,
      fontStyle: spec.fontStyle,
      fontWeightAlias: spec.fontWeightAlias,
      lineHeight: spec.lineHeight,
      letterSpacing: spec.letterSpacing,
      textTransform: spec.textTransform,
    });
  }
  return Object.values(grouped);
}

// 5. FIGMA API MANAGER
const TTMManager = {
  tally: { created: 0, updated: 0, failed: 0 },
  cache: { variables: [], collections: [], textStyles: [] },
  scaleVarMap: {},
  propVarMap: { fonts: {}, weights: {}, lineHeights: {}, letterSpacings: {} },

  async sync(result, config, scope = "all", appState = null) {
    this.tally = { created: 0, updated: 0, failed: 0 };
    this.scaleVarMap = {};
    this.propVarMap = { fonts: {}, weights: {}, lineHeights: {}, letterSpacings: {} };
    await this.refreshCache();

    const scaleColName = config.scaleCollectionName || "Type Scale";
    const scaleCol = await this.getOrCreateCollection(scaleColName);
    const modeId = scaleCol.modes[0].modeId;

    // STAGE 1: Float variables for type scale steps + all property variables
    if (!config.skipScaleVariables && (scope === "all" || scope === "scale")) {
      // Scale step FLOAT vars
      for (const step of result.scaleSteps) {
        const variable = await this.upsertFloatVariable(`scale/${step.name}`, scaleCol, modeId, step.px, `${step.px}px / ${step.rem}rem`);
        if (variable) this.scaleVarMap[step.index] = variable;
      }

      // Font family STRING vars
      for (const font of config.fonts) {
        const v = await this.upsertStringVariable(`fonts/${font.slot}`, scaleCol, modeId, font.family, `Font family for "${font.slot}" slot`);
        if (v) this.propVarMap.fonts[font.slot] = v;
      }

      // Weight STRING vars — one per alias per font slot (e.g. weights/primary/Bold)
      for (const font of config.fonts) {
        for (const w of config.fontWeights) {
          const styleName = getFigmaStyle(w, font.slot);
          const v = await this.upsertStringVariable(`weights/${font.slot}/${w.alias}`, scaleCol, modeId, styleName, `"${w.alias}" figma style name for ${font.slot}`);
          if (v) {
            if (!this.propVarMap.weights[font.slot]) this.propVarMap.weights[font.slot] = {};
            this.propVarMap.weights[font.slot][w.alias] = v;
          }
        }
      }

      // Per-variation FLOAT vars for line height and letter spacing (deduplicated)
      const varKeys = new Set();
      for (const spec of result.roleStyles) {
        const key = `${spec.roleName}/${spec.variationName}`;
        if (varKeys.has(key)) continue;
        varKeys.add(key);
        const lh = spec.lineHeight || { unit: "PERCENT", value: 150 };
        const ls = spec.letterSpacing || { unit: "PERCENT", value: 0 };
        const lhVar = await this.upsertFloatVariable(`roles/${spec.roleName}/${spec.variationName}/line-height`, scaleCol, modeId, lh.value);
        if (lhVar) this.propVarMap.lineHeights[key] = lhVar;
        const lsVar = await this.upsertFloatVariable(`roles/${spec.roleName}/${spec.variationName}/letter-spacing`, scaleCol, modeId, ls.value);
        if (lsVar) this.propVarMap.letterSpacings[key] = lsVar;
      }
    }

    if (appState) await this.saveConfig(appState, scaleCol, modeId);

    // STAGE 2: Text styles
    if (scope === "all" || scope === "styles") {
      const fontRequests = this.collectRequiredFonts(result.roleStyles);
      const fontLoadResults = await Promise.allSettled(fontRequests.map((f) => figma.loadFontAsync(f)));
      const loadedFonts = new Set();
      fontRequests.forEach((f, i) => {
        if (fontLoadResults[i].status === "fulfilled") {
          loadedFonts.add(`${f.family}::${f.style}`);
        } else {
          result.errors.critical.push(`Font "${f.family} ${f.style}" not available in Figma. Affected styles skipped.`);
        }
      });

      this.cache.textStyles = await figma.getLocalTextStylesAsync();

      for (const spec of result.roleStyles) {
        const fontKey = `${spec.fontFamily}::${spec.fontStyle}`;
        if (!loadedFonts.has(fontKey)) {
          this.tally.failed++;
          continue;
        }
        try {
          const styleName = this.buildStyleName(spec, config);
          let style = this.cache.textStyles.find((s) => s.name === styleName);
          if (!style) {
            style = figma.createTextStyle();
            style.name = styleName;
            this.tally.created++;
          } else {
            this.tally.updated++;
          }
          this.applyStyleSpec(style, spec, config);
        } catch (err) {
          console.error("Style error:", err);
          this.tally.failed++;
        }
      }
    }

    figma.ui.postMessage({ type: "finish", tally: this.tally, errors: result.errors });
  },

  buildStyleName(spec, config) {
    const sep = config.styleNameSeparator || "/";
    const roleName = config.useShortRoleNames ? spec.roleShortName || spec.roleName.substring(0, 2) : spec.roleName;
    return `${roleName}${sep}${spec.variationName}${sep}${spec.fontWeightAlias}`;
  },

  applyStyleSpec(style, spec, config) {
    style.fontName = { family: spec.fontFamily, style: spec.fontStyle };
    style.fontSize = spec.scaleStep.px;
    if (spec.lineHeight) {
      if (spec.lineHeight.unit === "AUTO") style.lineHeight = { unit: "AUTO" };
      else if (spec.lineHeight.unit === "PIXELS") style.lineHeight = { unit: "PIXELS", value: spec.lineHeight.value };
      else style.lineHeight = { unit: "PERCENT", value: spec.lineHeight.value };
    }
    if (spec.letterSpacing) {
      style.letterSpacing = spec.letterSpacing.unit === "PIXELS" ? { unit: "PIXELS", value: spec.letterSpacing.value } : { unit: "PERCENT", value: spec.letterSpacing.value };
    }
    const caseMap = { uppercase: "UPPER", lowercase: "LOWER", capitalize: "TITLE" };
    style.textCase = caseMap[spec.textTransform] || "ORIGINAL";
    style.description = `${spec.scaleStep.px}px / ${spec.scaleStep.rem}rem | ${spec.fontFamily} ${spec.fontWeightAlias}`;

    if (!config.skipScaleVariables) {
      if (this.scaleVarMap[spec.scaleStep.index]) {
        try {
          style.setBoundVariable("fontSize", this.scaleVarMap[spec.scaleStep.index]);
        } catch (_) {}
      }
      if (this.propVarMap.fonts[spec.fontSlot]) {
        try {
          style.setBoundVariable("fontFamily", this.propVarMap.fonts[spec.fontSlot]);
        } catch (_) {}
      }
      const weightVar = this.propVarMap.weights[spec.fontSlot] && this.propVarMap.weights[spec.fontSlot][spec.fontWeightAlias];
      if (weightVar) {
        try {
          style.setBoundVariable("fontStyle", weightVar);
        } catch (_) {}
      }
      const varKey = `${spec.roleName}/${spec.variationName}`;
      if (this.propVarMap.lineHeights[varKey]) {
        try {
          style.setBoundVariable("lineHeight", this.propVarMap.lineHeights[varKey]);
        } catch (_) {}
      }
      if (this.propVarMap.letterSpacings[varKey]) {
        try {
          style.setBoundVariable("letterSpacing", this.propVarMap.letterSpacings[varKey]);
        } catch (_) {}
      }
    }
  },

  collectRequiredFonts(roleStyles) {
    const seen = new Set();
    const requests = [];
    for (const spec of roleStyles) {
      const key = `${spec.fontFamily}::${spec.fontStyle}`;
      if (!seen.has(key)) {
        seen.add(key);
        requests.push({ family: spec.fontFamily, style: spec.fontStyle });
      }
    }
    return requests;
  },

  async upsertFloatVariable(name, collection, modeId, value, description) {
    try {
      let variable = this.cache.variables.find((v) => v.name === name && v.variableCollectionId === collection.id);
      if (!variable) {
        variable = figma.variables.createVariable(name, collection, "FLOAT");
        this.cache.variables.push(variable);
        this.tally.created++;
      } else {
        this.tally.updated++;
      }
      if (description) variable.description = description;
      variable.setValueForMode(modeId, value);
      return variable;
    } catch (err) {
      console.error("Failed to upsert float variable:", name, err);
      this.tally.failed++;
      return null;
    }
  },

  async upsertStringVariable(name, collection, modeId, value, description) {
    try {
      let variable = this.cache.variables.find((v) => v.name === name && v.variableCollectionId === collection.id);
      if (!variable) {
        variable = figma.variables.createVariable(name, collection, "STRING");
        this.cache.variables.push(variable);
        this.tally.created++;
      } else {
        this.tally.updated++;
      }
      if (description) variable.description = description;
      variable.setValueForMode(modeId, value);
      return variable;
    } catch (err) {
      console.error("Failed to upsert string variable:", name, err);
      this.tally.failed++;
      return null;
    }
  },

  async saveConfig(appState, collection, modeId) {
    try {
      let cfgVar = this.cache.variables.find((v) => v.name === "__ttm316_config__" && v.variableCollectionId === collection.id);
      if (!cfgVar) {
        cfgVar = figma.variables.createVariable("__ttm316_config__", collection, "STRING");
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
};

// 6. SCALE GENERATOR
const MODULAR_RATIOS = {
  "Minor Second": 1.067,
  "Major Second": 1.125,
  "Minor Third": 1.2,
  "Major Third": 1.25,
  "Perfect Fourth": 1.333,
  "Augmented Fourth": 1.414,
  "Perfect Fifth": 1.5,
  "Golden Ratio": 1.618,
  "Major Sixth": 1.667,
  "Minor Seventh": 1.778,
  "Major Seventh": 1.875,
  Octave: 2.0,
};

const SIZE_LABEL_LIST = ["3xs", "2xs", "xs", "s", "m", "l", "xl", "2xl", "3xl", "4xl", "5xl", "6xl", "7xl", "8xl", "9xl"];

function generateModularScale(seed, ratio, steps) {
  const result = [];
  for (let i = 0; i < steps; i++) {
    result.push(Math.round(seed * Math.pow(ratio, i)));
  }
  return result;
}

function generateLinearScale(minSize, maxSize, steps) {
  if (steps === 1) return [Math.round(minSize)];
  const result = [];
  for (let i = 0; i < steps; i++) {
    const t = i / (steps - 1);
    result.push(Math.round(minSize + t * (maxSize - minSize)));
  }
  return result;
}

function generateCustomScale(customValues, steps) {
  const vals = customValues.map((v) => Math.round(parseFloat(v))).filter((v) => !isNaN(v) && v > 0);
  while (vals.length < steps) vals.push(vals[vals.length - 1] || 16);
  return vals.slice(0, steps);
}

function generateStepNames(steps, scheme, baseFontSize, customNames, pxValues) {
  switch (scheme) {
    case "sizeLabels": {
      const center = SIZE_LABEL_LIST.indexOf("m");
      const offset = center - Math.floor(steps / 2);
      return Array.from({ length: steps }, (_, i) => SIZE_LABEL_LIST[i + offset] || String(i + 1));
    }
    case "rem":
      return pxValues.map((px) => `${Math.round((px / baseFontSize) * 1000) / 1000}rem`);
    case "px":
      return pxValues.map((px) => `${px}px`);
    case "custom":
      if (customNames && customNames.length > 0) {
        const names = customNames.slice();
        while (names.length < steps) names.push(String(names.length + 1));
        return names.slice(0, steps);
      }
      return Array.from({ length: steps }, (_, i) => String(i + 1));
    default:
      return Array.from({ length: steps }, (_, i) => String(i + 1));
  }
}

function scaleGenerator(config) {
  const { method, seedSize, ratio, steps, minSize, maxSize, customValues, namingScheme, customStepNames, scaleOverrides } = config.scale;
  const base = config.baseFontSize || 16;
  let pxValues;

  if (method === "Modular") {
    pxValues = generateModularScale(seedSize, ratio, steps);
  } else if (method === "Linear") {
    pxValues = generateLinearScale(minSize || seedSize * 0.5, maxSize || seedSize * 4, steps);
  } else {
    const parsed = (customValues || []).map((v) => parseFloat(String(v).trim())).filter((v) => !isNaN(v) && v > 0);
    if (parsed.length === 0) return [];
    pxValues = generateCustomScale(parsed, steps);
  }

  if (!pxValues || pxValues.length === 0) return [];

  // Apply per-step overrides
  if (scaleOverrides) {
    for (const [idx, val] of Object.entries(scaleOverrides)) {
      const i = parseInt(idx);
      const v = Math.round(parseFloat(val));
      if (!isNaN(i) && i >= 0 && i < pxValues.length && !isNaN(v) && v > 0) {
        pxValues[i] = v;
      }
    }
  }

  const names = generateStepNames(pxValues.length, namingScheme, base, customStepNames, pxValues);
  return pxValues.map((px, i) => ({
    index: i,
    name: names[i],
    px,
    rem: Math.round((px / base) * 1000) / 1000,
  }));
}

// 7. ROLE STYLE RESOLVER

// Resolves the Figma style name for a weight + font slot combo.
// Falls back to: slot override → alias (e.g. "Bold") as last resort.
function getFigmaStyle(weightDef, slotName) {
  if (weightDef.figmaStyles && weightDef.figmaStyles[slotName]) {
    return weightDef.figmaStyles[slotName];
  }
  // legacy single-field support
  if (weightDef.figmaStyle) return weightDef.figmaStyle;
  return weightDef.alias;
}

function lineHeightHint(pxSize) {
  if (pxSize < 16) return "1.4–1.6 (small text needs more air)";
  if (pxSize <= 32) return "1.2–1.4 (body reading range)";
  if (pxSize <= 64) return "1.0–1.2 (display headings)";
  return "0.9–1.05 (very large display)";
}

function resolveRoleStyles(role, scaleSteps, config) {
  var styles = [];
  var errors = [];
  var variations = role.variations || [];

  for (var v = 0; v < variations.length; v++) {
    var vr = variations[v];
    var rawIdx = parseInt(vr.scaleIndex) || 0;
    var scaleIdx = Math.max(0, Math.min(scaleSteps.length - 1, rawIdx));
    if (rawIdx !== scaleIdx) errors.push('Role "' + role.name + '" variation ' + v + ": scale index " + rawIdx + " clamped to " + scaleIdx + ".");

    var fontDef = config.fonts.filter(function (f) {
      return f.slot === role.fontSlot;
    })[0];
    var lineHeight = vr.lineHeight || { unit: "PERCENT", value: 150 };
    var letterSpacing = vr.letterSpacing || { unit: "PERCENT", value: 0 };
    var variationName = vr.name || String(v + 1);

    // One sub-style per weight from settings
    for (var wi = 0; wi < config.fontWeights.length; wi++) {
      var weightDef = config.fontWeights[wi];
      styles.push({
        roleName: role.name,
        roleShortName: role.shortName,
        variationName: variationName,
        weightAlias: weightDef.alias,
        scaleIndex: scaleIdx,
        scaleStep: scaleSteps[scaleIdx],
        fontFamily: fontDef ? fontDef.family : "Inter",
        fontSlot: role.fontSlot,
        fontStyle: getFigmaStyle(weightDef, role.fontSlot),
        fontWeightAlias: weightDef.alias,
        lineHeight: lineHeight,
        letterSpacing: letterSpacing,
        textTransform: role.textTransform || "none",
        lineHeightHint: lineHeightHint(scaleSteps[scaleIdx].px),
      });
    }
  }
  return { styles: styles, errors: errors };
}

// 8. TYPE SYSTEM GENERATOR
function typeMaker(config) {
  const errors = { critical: [], warnings: [], notices: [] };
  if (!config.scale || config.scale.steps < 1) {
    errors.critical.push("Scale must have at least 1 step.");
    return { scaleSteps: [], roleStyles: [], errors };
  }

  const scaleSteps = scaleGenerator(config);
  if (scaleSteps.length === 0) {
    errors.critical.push("Scale generation produced no steps. Check Custom values or step count.");
    return { scaleSteps: [], roleStyles: [], errors };
  }

  const allRoleStyles = [];
  for (const role of config.roles) {
    const { styles, errors: roleErrors } = resolveRoleStyles(role, scaleSteps, config);
    allRoleStyles.push(...styles);
    errors.warnings.push(...roleErrors);
  }

  return { scaleSteps, roleStyles: allRoleStyles, errors };
}
