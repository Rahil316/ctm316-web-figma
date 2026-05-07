// ClrGen.js - Color ramp generation and semantic token system.
// Exports: variableMaker (full token collection), colorRampMaker (Color ramp array).
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
  roles: [
    { name: "Text", shortName: "tx", minContrast: "5", spread: 3, baseIndex: 10 },
    { name: "Layer", shortName: "ly", minContrast: "0", spread: 1, baseIndex: 10 },
    { name: "Stroke", shortName: "st", minContrast: "1", spread: 1, baseIndex: 10 },
    { name: "Fill", shortName: "fi", minContrast: "4", spread: 2, baseIndex: 10 },
  ],
  roleSteps: 5,
  roleStepNames: ["Weakest", "Weak", "Base", "Strong", "Stronger"],
  colorSteps: 21,
  rampType: "Natural",
  roleMapping: "Contrast Based",
  colorStepNames: [],
  themes: [
    { name: "light", bg: "FFFFFF" },
    { name: "dark", bg: "000000" },
  ],
};
const roleMappingMethods = ["Contrast Based", "Manual Base Index"];
const rampTypes = ["Linear", "Uniform", "Natural", "Expressive", "Symmetric", "OKLCH", "Material"];

// Simple hash-based cache: skip regeneration when config hasn't changed.
let lastInputHash = null;
let cachedOutput = null;

// ============================================================================
// COLOR RAMP MAKER - Multiple methods
// ============================================================================
function colorRampMaker(hexIn, rampLength, rampType = "Natural") {
  const hue = hexToHue(hexIn);
  const satu = hexToSat(hexIn);
  const N = rampLength;

  if (rampType === "Linear") {
    // Uniform HSL-lightness steps. 100/(N+1) spacing avoids pure black and white.
    const inc = 100 / (N + 1);
    const out = [];
    for (let i = 1; i <= N; i++) out.push(hslToHex(hue, satu, i * inc) || "#000000");
    return out.reverse();
  }

  // ─── Contrast-symmetric perceptual spacing ────────────────────────────────
  // Steps are evenly spaced in log(L+0.05) space. This guarantees:
  //   • contrast vs black at the lightest step  =  contrast vs white at the darkest step
  //   • no pure white or black — C_max = 21·N/(N+1) approaches 21 but never reaches it
  //   • no manual floor/ceiling constants needed
  //
  // Derivation: contrast_vs_black(L) = (L+0.05)/0.05
  //             contrast_vs_white(L) = 1.05/(L+0.05)
  // Symmetry holds when log(L_i+0.05) + log(L_{N-1-i}+0.05) = log(0.0525) for all i.
  // Uniform spacing in u = log(L+0.05) satisfies this automatically.
  const C_max = (21 * N) / (N + 1);
  const uMax  = Math.log(0.05 * C_max);   // lightest step: contrast vs black = C_max
  const uMin  = Math.log(1.05 / C_max);   // darkest  step: contrast vs white = C_max

  // Target WCAG luminance for step i  (i=0 → lightest, i=N-1 → darkest).
  function stepLum(i) {
    const u = N === 1 ? (uMax + uMin) / 2 : uMax - (i / (N - 1)) * (uMax - uMin);
    return Math.exp(u) - 0.05;
  }

  // Binary-search HSL lightness L that achieves targetLum, given per-L S and H functions.
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

  // Saturation taper: reduces chroma near pure-white and pure-black extremes.
  const tapS = (L) => satu * (1 - Math.pow(Math.abs(L - 50) / 50, 1.5) * 0.4);

  if (rampType === "Uniform") {
    // Fixed H and S — numerically clean, predictable contrast values.
    const out = [];
    for (let i = 0; i < N; i++) {
      const L = findL(stepLum(i), () => satu, () => hue);
      out.push(hslToHex(hue, satu, L) || "#000000");
    }
    return out;
  }

  if (rampType === "Natural") {
    // Saturation taper at extremes — reduces oversaturation in near-white/black steps.
    // Best default for design systems.
    const out = [];
    for (let i = 0; i < N; i++) {
      const L = findL(stepLum(i), tapS, () => hue);
      out.push(hslToHex(hue, tapS(L), L) || "#000000");
    }
    return out;
  }

  if (rampType === "Expressive") {
    // Saturation taper + hue shift toward warm (60°) at lights, cool (240°) at darks.
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
    // Input color anchored at the midpoint; ramp expands outward to the same
    // contrast-symmetric endpoints used by the other methods.
    const srcLum = relLum(normalizeHex(hexIn)) || 0.18;
    const uSrc   = Math.log(srcLum + 0.05);
    const mid    = Math.floor((N - 1) / 2);
    const out    = [];
    for (let i = 0; i < N; i++) {
      let u;
      if      (N === 1)  u = uSrc;
      else if (i === 0)  u = uMax;
      else if (i === N - 1) u = uMin;
      else if (i <= mid && mid > 0) u = uMax - (uMax - uSrc) * i / mid;
      else               u = uSrc - (uSrc - uMin) * (i - mid) / (N - 1 - mid);
      const targetLum = Math.max(0.0001, Math.exp(Math.min(uMax, Math.max(uMin, u))) - 0.05);
      const L = findL(targetLum, () => satu, () => hue);
      out.push(hslToHex(hue, satu, L) || "#000000");
    }
    return out;
  }

  if (rampType === "OKLCH") {
    // Ramp in Oklab lightness, preserving input chroma and hue.
    const { C: srcC, H: srcH } = hexToOklch(normalizeHex(hexIn));
    const out = [];
    for (let i = 0; i < N; i++) {
      const targetLum = stepLum(i);
      // Map WCAG luminance target → approximate Oklab L via cube root of relative lum
      // Oklab L ≈ cbrt(Y) where Y is CIE luminance (not WCAG). WCAG Y = relLum * 100/100.
      // We binary-search Oklab L that produces the target WCAG luminance.
      let lo = 0, hi = 1, oL = 0.5;
      for (let j = 0; j < 40; j++) {
        const mid = (lo + hi) / 2;
        const hex = oklchToHex(mid, srcC, srcH);
        const lum = relLum(hex);
        oL = mid;
        if (Math.abs(lum - targetLum) < 0.0001) break;
        if (lum < targetLum) lo = mid; else hi = mid;
      }
      out.push(oklchToHex(oL, srcC, srcH) || "#000000");
    }
    return out;
  }

  if (rampType === "Material") {
    // Ramp using Google's HCT color space — tone 0-100 maps to WCAG luminance.
    const { h: srcH, c: srcC } = hexToHct(normalizeHex(hexIn));
    const out = [];
    for (let i = 0; i < N; i++) {
      const targetLum = stepLum(i);
      // HCT tone is CIE L* which monotonically relates to Y (WCAG luminance).
      // Binary-search tone to hit targetLum.
      let lo = 0, hi = 100, tone = 50;
      for (let j = 0; j < 40; j++) {
        const mid = (lo + hi) / 2;
        const hex = hctToHex(srcH, srcC, mid);
        const lum = relLum(hex);
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

// ============================================================================
// COLOR SYSTEM GENERATOR
// ============================================================================
function variableMaker(config) {
  const colors = config.colors;
  const roles = config.roles;
  const rampLength = config.colorSteps;
  let stepNames = config.colorStepNames;
  if (!stepNames || stepNames.length !== rampLength) {
    stepNames = seriesMaker(rampLength);
  }

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
