/**
 * FIGMA COLOR SYSTEM GENERATOR
 * Organization:
 * 1. UI Initialization
 * 2. Message Router
 * 3. Config Translator  (appState → reference engine format)
 * 4. Export Formatters  (CSV / CSS / JSON / SCSS)
 * 5. Figma Variable API (CRUD – _raw + contextual collections)
 * 6. Color Ramp Maker   (Linear / Balanced / Symmetric)
 * 7. Color System Generator (variableMaker – ramps + semantic tokens)
 * 8. Color Math Utilities  (WCAG-correct conversions from Utils.js)
 */

// 1. UI INITIALIZATION
figma.showUI(__html__, { width: 424, height: 720, themeColors: true });

// 2. MESSAGE ROUTER
figma.ui.onmessage = async (msg) => {
  try {
    switch (msg.type) {
      case "run-creater": {
        const config = translateConfig(msg.state);
        const result = variableMaker(config);
        await VariableManager.sync(result, config, msg.scope || "all");
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
        else if (msg.exportType === "scss") content = generateScss(result);
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
  const count = Math.max(1, parseInt(appState.colorStep) || 23);

  // Weight (step) names
  const userWeightNames = appState.colorStepNames && appState.colorStepNames.trim() ? appState.colorStepNames.split(",").map((n) => n.trim()) : null;
  let stepNames = null;
  if (userWeightNames && userWeightNames.length > 0) {
    const names = [...userWeightNames];
    while (names.length < count) names.push(String(names.length + 1));
    stepNames = names.slice(0, count);
  }

  // Role variation display names (maps to the 5 fixed reference keys)
  const userVarNames = (appState.roleVariationsNames || "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
  const defaultVarNames = ["weakest", "weak", "base", "strong", "stronger"];
  const roleStepNames = defaultVarNames.map((def, i) => userVarNames[i] || def);

  // Method name normalization (UI labels → reference engine values)
  const rampTypeMap = { Balanced: "Balanced", Linear: "Linear", Symmetric: "Symmetric" };
  const roleMappingMap = { "Contrast Based": "Contrast Based", "Manual Base Index": "Manual Base Index" };

  // themes array → light/dark backgrounds
  const themes = appState.themes || [{ bg: "FFFFFF" }, { bg: "000000" }];

  return {
    name: appState.designSystemName || "ctm316",
    colors: (appState.colors || []).map((g) => ({
      name: g.name,
      shortName: g.shortName,
      value: g.value,
    })),
    // roles is now an array; use numeric index as key for the engine
    roles: Object.fromEntries(
      (appState.roles || []).map((role, idx) => [
        idx,
        {
          name: role.name,
          shortName: role.shortName || role.name.substring(0, 2).toLowerCase(),
          minContrast: String(role.minContrast !== undefined ? role.minContrast : "4.5"),
          spread: Math.max(1, parseInt(role.spread) || 1),
          // UI uses 1-based baseWeight; reference uses 0-based baseIndex
          baseIndex: Math.max(0, (parseInt(role.baseWeight) || 1) - 1),
        },
      ]),
    ),
    colorSteps: count,
    rampType: rampTypeMap[appState.colorStepMethod] || "Balanced",
    roleMapping: roleMappingMap[appState.roleMappingMethod] || "Contrast Based",
    colorStepNames: stepNames,
    roleStepNames,
    themes: [
      { name: "light", bg: themes[0].bg || "FFFFFF" },
      { name: "dark", bg: themes[1].bg || "000000" },
    ],
  };
}

// 4. EXPORT FORMATTERS
const REF_VARIATION_KEYS = ["weakest", "weak", "base", "strong", "stronger"];

const ExportFormatter = {
  toCSV(result) {
    let csv = "Group,Weight,Token Name,Value,Contrast (Light),Contrast (Dark)\n";
    for (const [colorName, ramp] of Object.entries(result.colorRamps)) {
      for (const [weightName, entry] of Object.entries(ramp)) {
        csv += `${colorName},${weightName},${colorName}/${weightName},${entry.value},${entry.contrast.light.ratio},${entry.contrast.dark.ratio}\n`;
      }
    }
    return csv;
  },

  toCSS(result, config) {
    const roleStepNames = config.roleStepNames || REF_VARIATION_KEYS;
    let css = `:root {\n  /* ${config.name} — generated by ctm316 */\n\n  /* Color Ramps */\n`;
    for (const [colorName, ramp] of Object.entries(result.colorRamps)) {
      for (const [weightName, entry] of Object.entries(ramp)) {
        css += `  --${colorName}-${weightName}: ${entry.value};\n`;
      }
    }
    for (const theme of ["light", "dark"]) {
      css += `\n  /* Semantic Tokens — ${theme.toUpperCase()} */\n`;
      for (const [colorName, roles] of Object.entries(result.colorTokens[theme])) {
        for (const [roleId, variations] of Object.entries(roles)) {
          const roleName = (config.roles[roleId] && config.roles[roleId].name) || roleId;
          for (let i = 0; i < REF_VARIATION_KEYS.length; i++) {
            const token = variations[REF_VARIATION_KEYS[i]];
            if (!token) continue;
            const dispName = roleStepNames[i] || REF_VARIATION_KEYS[i];
            css += `  --${colorName}-${roleName}-${dispName}-${theme}: ${token.value};\n`;
          }
        }
      }
    }
    css += "}\n";
    return css;
  },
};

// 4b. SCSS EXPORT — ported from Web_App/JS/DocGen.js
function scssSlug(str) {
  if (!str) return "";
  return String(str)
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function generateScss(result) {
  if (!result || !result.colorRamps) return "";
  const date = new Date().toISOString();
  let scss = `// Color Tokens — Auto-generated SCSS\n// Generated: ${date}\n\n`;
  scss += `// ============================================\n// RAW COLOR RAMPS\n// ============================================\n\n`;
  for (const [group, weights] of Object.entries(result.colorRamps)) {
    scss += `// ${group.toUpperCase()}\n`;
    for (const [weight, data] of Object.entries(weights)) {
      if (!data?.value) continue;
      scss += `$${scssSlug(group)}-${scssSlug(String(weight))}: ${data.value};\n`;
    }
    scss += "\n";
  }
  scss += `// ============================================\n// LIGHT THEME TOKENS\n// ============================================\n\n$light-theme: (\n`;
  if (result.colorTokens?.light) {
    for (const [group, roles] of Object.entries(result.colorTokens.light)) {
      for (const [, variations] of Object.entries(roles)) {
        for (const [variation, data] of Object.entries(variations)) {
          if (!data?.tknRef) continue;
          const last = data.tknRef.lastIndexOf("-");
          const varName = `${scssSlug(group)}-${scssSlug(data.role || group)}-${scssSlug(variation)}`;
          const refGroup = scssSlug(data.tknRef.substring(0, last));
          const refWeight = scssSlug(data.tknRef.substring(last + 1));
          scss += `  "${varName}": $${refGroup}-${refWeight},\n`;
        }
      }
    }
  }
  scss += ");\n\n";
  scss += `// ============================================\n// DARK THEME TOKENS\n// ============================================\n\n$dark-theme: (\n`;
  if (result.colorTokens?.dark) {
    for (const [group, roles] of Object.entries(result.colorTokens.dark)) {
      for (const [, variations] of Object.entries(roles)) {
        for (const [variation, data] of Object.entries(variations)) {
          if (!data?.tknRef) continue;
          const last = data.tknRef.lastIndexOf("-");
          const varName = `${scssSlug(group)}-${scssSlug(data.role || group)}-${scssSlug(variation)}`;
          const refGroup = scssSlug(data.tknRef.substring(0, last));
          const refWeight = scssSlug(data.tknRef.substring(last + 1));
          scss += `  "${varName}": $${refGroup}-${refWeight},\n`;
        }
      }
    }
  }
  scss += ");\n";
  return scss;
}

// 5. FIGMA VARIABLE API (CRUD)
const VariableManager = {
  tally: { created: 0, updated: 0, failed: 0 },
  cache: { variables: [], collections: [] },
  rawVarNameMap: {}, // stepName ("primary-1") → figma variable name ("primary/1")

  async sync(result, config, scope = "all") {
    this.tally = { created: 0, updated: 0, failed: 0 };
    this.rawVarNameMap = {};
    await this.refreshCache();

    // Build tknRef → Figma variable name map (needed for alias resolution in "roles" scope too)
    for (const [colorName, ramp] of Object.entries(result.colorRamps)) {
      for (const [weightName, entry] of Object.entries(ramp)) {
        this.rawVarNameMap[entry.stepName] = `${colorName}/${weightName}`;
      }
    }

    const roleStepNames = config.roleStepNames || REF_VARIATION_KEYS;

    // STAGE 1: Raw Color Ramps → "_raw" collection
    if (scope === "all" || scope === "groups") {
      const rawCol = await this.getOrCreateCollection("_raw");
      const modeId = rawCol.themes[0].modeId;
      for (const [colorName, ramp] of Object.entries(result.colorRamps)) {
        const vars = Object.entries(ramp).map(([weightName, entry]) => [`${colorName}/${weightName}`, "COLOR", entry.value, `L:${entry.contrast.light.ratio}(${entry.contrast.light.rating}) D:${entry.contrast.dark.ratio}(${entry.contrast.dark.rating})`]);
        await this.upsertVariables(rawCol, modeId, vars);
      }
    }

    // STAGE 2: Semantic Role Tokens → "contextual" collection
    if (scope === "all" || scope === "roles") {
      const contextualCol = await this.getOrCreateCollection("contextual");
      const rawCol = await this.getOrCreateCollection("_raw");

      for (const theme of ["light", "dark"]) {
        const modeId = this.ensureMode(contextualCol, theme);
        for (const [colorName, roles] of Object.entries(result.colorTokens[theme])) {
          for (const [roleId, variations] of Object.entries(roles)) {
            const roleName = (config.roles[roleId] && config.roles[roleId].name) || roleId;
            const vars = REF_VARIATION_KEYS.map((refKey, i) => {
              const token = variations[refKey];
              if (!token) return null;
              const dispName = roleStepNames[i] || refKey;
              const figmaName = `${colorName}/${roleName}/${dispName}`;
              const rawFigmaName = this.rawVarNameMap[token.tknRef];
              const targetVar = rawFigmaName ? this.cache.variables.find((cv) => cv.name === rawFigmaName && cv.variableCollectionId === rawCol.id) : null;
              const value = targetVar ? { type: "VARIABLE_ALIAS", id: targetVar.id } : token.value;
              const note = token.isAdjusted ? " | ⚠ Adjusted" : "";
              return [figmaName, "COLOR", value, `${theme.toUpperCase()}${note}`];
            }).filter(Boolean);
            await this.upsertVariables(contextualCol, modeId, vars);
          }
        }
      }
    }

    figma.ui.postMessage({ type: "finish", tally: this.tally, errors: result ? result.errors : null });
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
    const existing = collection.themes.find((m) => m.name.toLowerCase() === modeName.toLowerCase());
    if (existing) return existing.modeId;
    if (collection.themes.length === 1 && collection.themes[0].name.toLowerCase().startsWith("mode")) {
      collection.renameMode(collection.themes[0].modeId, modeName);
      return collection.themes[0].modeId;
    }
    try {
      return collection.addMode(modeName);
    } catch (e) {
      return collection.themes[0].modeId;
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
      } catch (err) {
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

  if (rampType === "Balanced") {
    // Space target luminances logarithmically so perceptual steps feel even.
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
    return output.reverse();
  }

  if (rampType === "Symmetric") {
    // Same as Balanced, then shifts steps so the midpoint lands near 50% lightness.
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
  const stepNames = config.colorStepNames || seriesMaker(config.colorSteps);

  const inputHash = JSON.stringify({
    colors: config.colors.map((g) => ({ ...g, value: normalizeHex(g.value) })),
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
      const roleNames = Object.keys(roles);

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

          let baseIdx = role.baseIndex !== undefined ? parseInt(role.baseIndex) : rampLength >> 1;
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
  return rgbToHsl(...rgb);
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

function slugify(str) {
  if (!str) return "";
  return str
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
