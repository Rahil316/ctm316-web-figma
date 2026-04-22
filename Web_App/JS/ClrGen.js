// ClrGen.js - Color ramp generation and semantic token system.
// Exports: variableMaker (full token collection), colorRampMaker (raw ramp array).
// COLOR SYSTEM
const demoConfig = {
  name: "CTM316",
  colors: [
    { name: "primary", shortName: "Pr", value: "5d10d1" },
    { name: "secondary", shortName: "Sc", value: "904AAA" },
    { name: "tertiary", shortName: "Te", value: "7E8088" },
    { name: "black", shortName: "Bk", value: "1C2230" },
    { name: "gray", shortName: "Gr", value: "87899D" },
    { name: "success", shortName: "Su", value: "47B872" },
    { name: "danger", shortName: "Dg", value: "ED3E3E" },
    { name: "warning", shortName: "Wg", value: "F2AA30" },
    { name: "info", shortName: "In", value: "206BB0" },
  ],
  roles: {
    text: { name: "Text", shortName: "tx", minContrast: "5", spread: 3, baseIndex: 10 }, // baseIndex is 0-based: 10 = step 11
    layer: { name: "Layer", shortName: "ly", minContrast: "0", spread: 1, baseIndex: 10 },
    stroke: { name: "Stroke", shortName: "st", minContrast: "1", spread: 1, baseIndex: 10 },
    fill: { name: "Fill", shortName: "fi", minContrast: "4", spread: 2, baseIndex: 10 },
  },
  roleSteps: 5,
  roleStepNames: ["Weakest", "Weak", "Base", "Strong", "Stronger"],
  colorSteps: 23,
  rampType: "Balanced",
  roleMapping: "Contrast Based",
  colorStepNames: null || seriesMaker(23),
  themes: [
    { name: "light", bg: "FFFFFF" },
    { name: "dark", bg: "000000" },
  ],
};
const roleMappingMethods = ["Contrast Based", "Manual Base Index"];
const rampTypes = ["Linear", "Balanced", "Symmetric"];

// Simple hash-based cache: skip regeneration when config hasn't changed.
let lastInputHash = null;
let cachedOutput = null;

// ============================================================================
// COLOR RAMP MAKER - Multiple methods
// ============================================================================
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
    // Binary search finds the HSL lightness that hits each target luminance.
    const minL = 0;
    const maxL = 1;
    const minV = Math.log(minL + 0.05);
    const maxV = Math.log(maxL + 0.05);
    const step = (maxV - minV) / (rampLength + 1);
    const output = [];

    for (let i = 1; i <= rampLength; i++) {
      const targetV = minV + step * i;
      const targetLum = Math.exp(targetV) - 0.05;

      let low = 0;
      let high = 100;
      let closestL = 50;

      for (let j = 0; j < 30; j++) {
        let mid = (low + high) / 2;
        let midHex = hslToHex(hue, satu, mid);
        let midLum = relLum(midHex);
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
    // Same as Balanced, then shifts all steps so the midpoint lands at ~50% lightness.
    const minL = 0;
    const maxL = 1;
    const minV = Math.log(minL + 0.05);
    const maxV = Math.log(maxL + 0.05);
    const step = (maxV - minV) / (rampLength + 1);
    const output = [];

    for (let i = 1; i <= rampLength; i++) {
      const targetV = minV + step * i;
      const targetLum = Math.exp(targetV) - 0.05;

      let low = 0;
      let high = 100;
      let closestL = 50;

      for (let j = 0; j < 30; j++) {
        let mid = (low + high) / 2;
        let midHex = hslToHex(hue, satu, mid);
        let midLum = relLum(midHex);
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

// ============================================================================
// COLOR SYSTEM GENERATOR
// ============================================================================
function variableMaker(config) {
  const colors = config.colors;
  const roles = config.roles;
  const rampLength = config.colorSteps;
  let stepNames = config.colorStepNames || seriesMaker(config.colorSteps);

  const inputHash = JSON.stringify({
    colors: config.colors.map((g) => ({
      ...g,
      value: normalizeHex(g.value),
    })),
    rampLength: config.colorSteps,
    rampType: config.rampType,
    lightBg: normalizeHex(config.themes[0].bg),
    darkBg: normalizeHex(config.themes[1].bg),
    roles: config.roles,
    roleMapping: config.roleMapping,
  });

  if (inputHash === lastInputHash && cachedOutput) {
    return cachedOutput;
  }

  const lightBg = normalizeHex(config.themes[0].bg);
  const darkBg = normalizeHex(config.themes[1].bg);
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
