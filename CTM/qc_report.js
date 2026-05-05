#!/usr/bin/env node
// QC report for colorRampMaker — tests all ramp types, a spread of colors,
// and a range of ramp lengths. Prints a structured report to stdout.

// ── Inline all needed utilities (no module system in these files) ─────────────
const fs = require("fs");
const path = require("path");

function load(file) {
  return fs.readFileSync(path.join(__dirname, file), "utf8");
}

// Evaluate Utils then ClrGen in a shared scope so ClrGen can call Utils fns.
const utilsSrc = load("Web_App/JS/Utils.js");
const clrGenSrc = load("Web_App/JS/ClrGen.js");

// We need a sandbox with both files' globals available.
const vm = require("vm");
const ctx = vm.createContext({ Math, Number, JSON, parseInt, parseFloat, isNaN, console });
vm.runInContext(utilsSrc, ctx);
vm.runInContext(clrGenSrc, ctx);

const { colorRampMaker, relLum, contrastRatio } = ctx;

// ── Test matrix ───────────────────────────────────────────────────────────────
const RAMP_TYPES = ["Linear", "Balanced", "Balanced (Natural)", "Balanced (Dynamic)", "Symmetric"];
const RAMP_LENGTHS = [5, 11, 21];

// Diverse hues, saturations, and edge cases
const TEST_COLORS = [
  { name: "pure-red",       hex: "FF0000" },
  { name: "pure-green",     hex: "00FF00" },
  { name: "pure-blue",      hex: "0000FF" },
  { name: "violet",         hex: "5D10D1" },
  { name: "teal",           hex: "1AA8A8" },
  { name: "orange",         hex: "F2AA30" },
  { name: "desaturated",    hex: "87899D" },
  { name: "near-black",     hex: "1C2230" },
  { name: "near-white",     hex: "F5F5F5" },
  { name: "neutral-gray",   hex: "808080" },
  // Stress: unusual/edge hues
  { name: "yellow",         hex: "FFFF00" },
  { name: "magenta",        hex: "FF00FF" },
  { name: "cyan",           hex: "00FFFF" },
];

// ── Metrics ───────────────────────────────────────────────────────────────────

function luminances(ramp) {
  return ramp.map((h) => relLum(h));
}

function isMonotone(lums) {
  // Ramp is ordered lightest→darkest (index 0 = lightest after .reverse()).
  // Check that luminance is non-increasing.
  for (let i = 1; i < lums.length; i++) {
    if (lums[i] > lums[i - 1] + 0.001) return false;
  }
  return true;
}

function stepRatios(lums) {
  const ratios = [];
  for (let i = 1; i < lums.length; i++) {
    const hi = lums[i] + 0.05;
    const lo = lums[i - 1] + 0.05;
    ratios.push(hi / lo);
  }
  return ratios;
}

function stats(arr) {
  const min = Math.min(...arr);
  const max = Math.max(...arr);
  const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
  const variance = arr.reduce((s, v) => s + (v - mean) ** 2, 0) / arr.length;
  return { min, max, mean, stddev: Math.sqrt(variance) };
}

// ── Run ───────────────────────────────────────────────────────────────────────

const results = [];
const issues = [];

for (const color of TEST_COLORS) {
  for (const rampType of RAMP_TYPES) {
    for (const rampLength of RAMP_LENGTHS) {
      const ramp = colorRampMaker(color.hex, rampLength, rampType);

      // Basic validity
      const nullCount = ramp.filter((h) => !h).length;
      const lums = luminances(ramp);
      const nullLums = lums.filter((l) => l === null).length;
      const monotone = isMonotone(lums);

      // Extremes: how close to true black/white?
      const darkestLum = Math.min(...lums.filter((l) => l !== null));
      const lightestLum = Math.max(...lums.filter((l) => l !== null));

      // Step ratios (perceptual evenness)
      const validLums = lums.filter((l) => l !== null);
      const ratios = stepRatios(validLums);
      const ratioStats = stats(ratios);

      // Contrast range: darkest vs lightest
      const endContrast = contrastRatio(ramp[0], ramp[ramp.length - 1]);

      const row = {
        color: color.name,
        rampType,
        rampLength,
        monotone,
        darkestLum: +darkestLum.toFixed(4),
        lightestLum: +lightestLum.toFixed(4),
        endContrast,
        ratioStddev: +ratioStats.stddev.toFixed(4),
        ratioMin: +ratioStats.min.toFixed(4),
        ratioMax: +ratioStats.max.toFixed(4),
        nullCount,
        nullLums,
      };
      results.push(row);

      // Flag issues
      if (!monotone)
        issues.push(`NON-MONOTONE  ${color.name} / ${rampType} / len=${rampLength}`);
      if (nullCount > 0)
        issues.push(`NULL_HEX(${nullCount})  ${color.name} / ${rampType} / len=${rampLength}`);
      if (nullLums > 0)
        issues.push(`NULL_LUM(${nullLums})  ${color.name} / ${rampType} / len=${rampLength}`);
      if (darkestLum > 0.03)
        issues.push(`DARK_TOO_LIGHT(${darkestLum.toFixed(4)})  ${color.name} / ${rampType} / len=${rampLength} — darkest stop is not near black`);
      if (lightestLum < 0.85)
        issues.push(`LIGHT_TOO_DARK(${lightestLum.toFixed(4)})  ${color.name} / ${rampType} / len=${rampLength} — lightest stop is not near white`);
      if (ratioStats.stddev > 0.5)
        issues.push(`UNEVEN_STEPS(stddev=${ratioStats.stddev.toFixed(4)})  ${color.name} / ${rampType} / len=${rampLength} — step ratios vary a lot`);
      if (endContrast !== null && endContrast < 10)
        issues.push(`LOW_END_CONTRAST(${endContrast})  ${color.name} / ${rampType} / len=${rampLength} — ramp endpoints lack range`);
    }
  }
}

// ── Report ────────────────────────────────────────────────────────────────────

const SEP = "─".repeat(100);

console.log("\n" + SEP);
console.log("  CTM316 COLOR RAMP — QC REPORT");
console.log(`  ${RAMP_TYPES.length} ramp types × ${TEST_COLORS.length} colors × ${RAMP_LENGTHS.length} lengths = ${results.length} combinations`);
console.log(SEP);

// Summary table per ramp type
console.log("\n  PER-RAMP-TYPE SUMMARY (averaged over all colors + lengths)\n");
const header = ["RampType".padEnd(24), "Monotone%".padEnd(12), "AvgDarkest".padEnd(13), "AvgLightest".padEnd(13), "AvgEndContrast".padEnd(16), "StepStddev"];
console.log("  " + header.join(""));
console.log("  " + "─".repeat(92));

for (const rt of RAMP_TYPES) {
  const rows = results.filter((r) => r.rampType === rt);
  const monoPct = (rows.filter((r) => r.monotone).length / rows.length * 100).toFixed(0) + "%";
  const avgDark = (rows.reduce((s, r) => s + r.darkestLum, 0) / rows.length).toFixed(4);
  const avgLight = (rows.reduce((s, r) => s + r.lightestLum, 0) / rows.length).toFixed(4);
  const avgContrast = (rows.filter(r => r.endContrast).reduce((s, r) => s + r.endContrast, 0) / rows.filter(r => r.endContrast).length).toFixed(1);
  const avgStddev = (rows.reduce((s, r) => s + r.ratioStddev, 0) / rows.length).toFixed(4);
  console.log("  " + [
    rt.padEnd(24),
    monoPct.padEnd(12),
    avgDark.padEnd(13),
    avgLight.padEnd(13),
    avgContrast.padEnd(16),
    avgStddev,
  ].join(""));
}

// Worst offenders per metric
console.log("\n\n  WORST END-CONTRAST PER RAMP TYPE (darkest vs lightest stop)\n");
for (const rt of RAMP_TYPES) {
  const rows = results.filter((r) => r.rampType === rt && r.endContrast !== null);
  rows.sort((a, b) => a.endContrast - b.endContrast);
  const worst = rows.slice(0, 3);
  console.log(`  ${rt}`);
  for (const r of worst) {
    console.log(`    contrast=${r.endContrast}  color=${r.color.padEnd(16)} len=${r.rampLength}  dark=${r.darkestLum}  light=${r.lightestLum}`);
  }
}

// Step evenness — flag high stddev
console.log("\n\n  STEP UNEVENNESS (highest ratioStddev — lower is more perceptually even)\n");
const byStddev = [...results].sort((a, b) => b.ratioStddev - a.ratioStddev).slice(0, 10);
for (const r of byStddev) {
  console.log(`  stddev=${r.ratioStddev}  ${r.rampType.padEnd(24)} ${r.color.padEnd(16)} len=${r.rampLength}`);
}

// Issues
console.log("\n\n" + SEP);
if (issues.length === 0) {
  console.log("  ✓ NO ISSUES FOUND — all combinations passed all checks.");
} else {
  console.log(`  ⚠  ${issues.length} ISSUE(S) FOUND:\n`);
  for (const issue of issues) {
    console.log("  • " + issue);
  }
}
console.log(SEP + "\n");

// Stress test: timing for large ramp on all types
console.log("  STRESS TEST — 10,000 ramp generations (len=21, mixed types)\n");
const stressColors = TEST_COLORS.map((c) => c.hex);
const stressTypes = RAMP_TYPES;
let count = 0;
const t0 = Date.now();
while (count < 10000) {
  const hex = stressColors[count % stressColors.length];
  const rt = stressTypes[count % stressTypes.length];
  colorRampMaker(hex, 21, rt);
  count++;
}
const elapsed = Date.now() - t0;
console.log(`  ${count} ramps generated in ${elapsed}ms  (${(elapsed / count).toFixed(3)}ms per ramp)`);
console.log("\n" + SEP + "\n");
