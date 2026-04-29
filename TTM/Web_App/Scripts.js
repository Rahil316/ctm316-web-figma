/**
 * TTM316 Web App — Type Token Manager
 * Standalone browser preview (mirrors Figma plugin logic, no Figma API calls).
 */

// ── APP STATE ──────────────────────────────────────────────────────────────────
let appState = {
  name: "ttm316",
  baseFontSize: 16,
  fonts: [
    { slot: "primary",   family: "Inter",         fallback: "sans-serif" },
    { slot: "secondary", family: "Merriweather",   fallback: "serif"      },
    { slot: "tertiary",  family: "JetBrains Mono", fallback: "monospace"  },
  ],
  fontWeights: [
    { alias: "Thin",      value: 100, figmaStyle: "Thin"      },
    { alias: "Light",     value: 300, figmaStyle: "Light"     },
    { alias: "Regular",   value: 400, figmaStyle: "Regular"   },
    { alias: "Medium",    value: 500, figmaStyle: "Medium"    },
    { alias: "SemiBold",  value: 600, figmaStyle: "SemiBold"  },
    { alias: "Bold",      value: 700, figmaStyle: "Bold"      },
    { alias: "ExtraBold", value: 800, figmaStyle: "ExtraBold" },
    { alias: "Black",     value: 900, figmaStyle: "Black"     },
  ],
  scale: {
    method: "Modular", seedSize: 16, ratio: 1.25, ratioName: "Major Third",
    steps: 10, minSize: 10, maxSize: 96, customValues: [],
    namingScheme: "numeric", customStepNames: [],
  },
  roles: [
    {
      name: "Heading", shortName: "hd", variationCount: 6,
      variationNames: ["h1","h2","h3","h4","h5","h6"],
      baseScaleIndex: 9, scaleDirection: "descending",
      fontSlot: "primary", fontWeightAlias: "Bold",
      lineHeight: { unit: "PERCENT", value: 110 },
      letterSpacing: { unit: "PERCENT", value: -1 },
      textTransform: "none", variationOverrides: [{ index: 0, fontWeightAlias: "ExtraBold" }],
    },
    {
      name: "Body", shortName: "bd", variationCount: 3,
      variationNames: ["large","base","small"],
      baseScaleIndex: 4, scaleDirection: "descending",
      fontSlot: "primary", fontWeightAlias: "Regular",
      lineHeight: { unit: "PERCENT", value: 150 },
      letterSpacing: { unit: "PERCENT", value: 0 },
      textTransform: "none", variationOverrides: [],
    },
    {
      name: "Caption", shortName: "cp", variationCount: 2,
      variationNames: ["base","small"],
      baseScaleIndex: 2, scaleDirection: "descending",
      fontSlot: "primary", fontWeightAlias: "Regular",
      lineHeight: { unit: "PERCENT", value: 140 },
      letterSpacing: { unit: "PERCENT", value: 2 },
      textTransform: "none", variationOverrides: [],
    },
  ],
  scaleCollectionName: "Type Scale",
  skipScaleVariables: false,
  useShortRoleNames: false,
  styleNameSeparator: "/",
};

// ── SCALE GENERATOR ───────────────────────────────────────────────────────────
const SIZE_LABELS = ["3xs","2xs","xs","s","m","l","xl","2xl","3xl","4xl","5xl","6xl","7xl","8xl","9xl"];

const MODULAR_RATIOS = {
  "Minor Second": 1.067, "Major Second": 1.125, "Minor Third": 1.200,
  "Major Third": 1.250, "Perfect Fourth": 1.333, "Augmented Fourth": 1.414,
  "Perfect Fifth": 1.500, "Golden Ratio": 1.618, "Major Sixth": 1.667,
  "Minor Seventh": 1.778, "Major Seventh": 1.875, "Octave": 2.000,
};

function computeScale(scale, base) {
  const { method, seedSize, ratio, steps, minSize, maxSize, customValues, namingScheme, customStepNames } = scale;
  let px = [];

  if (method === "Modular") {
    const mid = Math.floor(steps / 2);
    for (let i = 0; i < steps; i++) px.push(Math.round(seedSize * Math.pow(ratio, i - mid) * 100) / 100);
  } else if (method === "Linear") {
    const mn = parseFloat(minSize) || seedSize * 0.5, mx = parseFloat(maxSize) || seedSize * 4;
    for (let i = 0; i < steps; i++) {
      const t = steps === 1 ? 0 : i / (steps - 1);
      px.push(Math.round((mn + t * (mx - mn)) * 100) / 100);
    }
  } else {
    px = (customValues || []).map(v => parseFloat(String(v).trim())).filter(v => !isNaN(v) && v > 0);
    if (!px.length) return [];
  }

  const n = px.length;
  let names;
  if (namingScheme === "sizeLabels") {
    const c = SIZE_LABELS.indexOf("m"), off = c - Math.floor(n / 2);
    names = Array.from({length: n}, (_, i) => SIZE_LABELS[Math.max(0, i + off)] || String(i + 1));
  } else if (namingScheme === "rem") {
    names = px.map(v => `${Math.round(v / base * 1000) / 1000}rem`);
  } else if (namingScheme === "px") {
    names = px.map(v => `${v}px`);
  } else if (namingScheme === "custom" && customStepNames && customStepNames.length) {
    const cn = [...customStepNames]; while (cn.length < n) cn.push(String(cn.length + 1));
    names = cn.slice(0, n);
  } else {
    names = Array.from({length: n}, (_, i) => String(i + 1));
  }
  return px.map((v, i) => ({ index: i, name: names[i], px: v, rem: Math.round(v / base * 1000) / 1000 }));
}

function typeMaker(appState) {
  const steps = computeScale(appState.scale, appState.baseFontSize);
  const roleStyles = [];
  for (const role of appState.roles) {
    for (let v = 0; v < role.variationCount; v++) {
      const ov = (role.variationOverrides || []).find(o => o.index === v) || {};
      const delta = role.scaleDirection === "descending" ? (role.variationCount - 1 - v) : v;
      const rawIdx = role.baseScaleIndex - delta + (ov.scaleIndexOffset || 0);
      const idx = Math.max(0, Math.min(steps.length - 1, rawIdx));
      const autoName = role.scaleDirection === "descending" ? String(v + 1) : String(role.variationCount - v);
      const varName = (role.variationNames && role.variationNames[v]) || autoName;
      const weightAlias = ov.fontWeightAlias || role.fontWeightAlias;
      const fontSlot = ov.fontSlot || role.fontSlot;
      const lh = ov.lineHeight || role.lineHeight;
      const ls = ov.letterSpacing || role.letterSpacing;
      const fontDef = appState.fonts.find(f => f.slot === fontSlot);
      const wDef = appState.fontWeights.find(w => w.alias === weightAlias);
      roleStyles.push({
        roleName: role.name, roleShortName: role.shortName,
        variationName: varName, scaleStep: steps[idx],
        fontFamily: fontDef ? fontDef.family : "Inter",
        fontStyle: wDef ? wDef.figmaStyle : "Regular",
        fontWeight: wDef ? wDef.value : 400,
        fontWeightAlias: weightAlias,
        lineHeight: lh, letterSpacing: ls,
        textTransform: ov.textTransform || role.textTransform || "none",
      });
    }
  }
  return { scaleSteps: steps, roleStyles };
}

// ── CSS / SCSS EXPORT ─────────────────────────────────────────────────────────
function cssSlug(s) { return String(s||"").toLowerCase().trim().replace(/[\s_]+/g,"-").replace(/[^a-z0-9-]/g,""); }

function lhToCss(lh) {
  if (!lh || lh.unit === "AUTO") return "normal";
  if (lh.unit === "PIXELS") return `${lh.value}px`;
  return String(Math.round(lh.value / 100 * 1000) / 1000);
}

function lsToCss(ls) {
  if (!ls) return "0";
  return ls.unit === "PIXELS" ? `${ls.value}px` : `${Math.round(ls.value / 100 * 1000) / 1000}em`;
}

function generateCSS(result, config) {
  const date = new Date().toISOString();
  let css = `/* ${config.name} — generated by ttm316 | ${date} */\n\n:root {\n  /* ── Type Scale ── */\n`;
  for (const s of result.scaleSteps) {
    css += `  --scale-${cssSlug(String(s.name))}: ${s.px}px;\n`;
    css += `  --scale-${cssSlug(String(s.name))}-rem: ${s.rem}rem;\n`;
  }
  css += `\n  /* ── Role Tokens ── */\n`;
  for (const spec of result.roleStyles) {
    const p = `--${cssSlug(spec.roleName)}-${cssSlug(spec.variationName)}`;
    css += `  ${p}-size: var(--scale-${cssSlug(String(spec.scaleStep.name))});\n`;
    css += `  ${p}-line-height: ${lhToCss(spec.lineHeight)};\n`;
    css += `  ${p}-letter-spacing: ${lsToCss(spec.letterSpacing)};\n`;
    css += `  ${p}-font-family: "${spec.fontFamily}";\n`;
    css += `  ${p}-font-weight: ${spec.fontWeight};\n`;
    if (spec.textTransform !== "none") css += `  ${p}-text-transform: ${spec.textTransform};\n`;
  }
  css += `}\n`;
  return css;
}

function generateSCSS(result, config) {
  const date = new Date().toISOString();
  const hr = t => `// ${"=".repeat(58)}\n// ${t}\n// ${"=".repeat(58)}\n\n`;
  let scss = `// ${config.name} — Auto-generated SCSS\n// Generated: ${date}\n@use 'sass:map';\n\n`;
  scss += hr("TYPE SCALE");
  for (const s of result.scaleSteps) scss += `$scale-${cssSlug(String(s.name))}: ${s.px}px;\n`;
  scss += `\n$type-scale: (\n`;
  for (const s of result.scaleSteps) scss += `  "${cssSlug(String(s.name))}": $scale-${cssSlug(String(s.name))},\n`;
  scss += `);\n\n`;
  scss += hr("ROLE TOKEN MAPS");
  for (const spec of result.roleStyles) {
    const vn = `$${cssSlug(spec.roleName)}-${cssSlug(spec.variationName)}`;
    scss += `${vn}: (\n  size: $scale-${cssSlug(String(spec.scaleStep.name))},\n  line-height: ${lhToCss(spec.lineHeight)},\n  letter-spacing: ${lsToCss(spec.letterSpacing)},\n  font-family: "${spec.fontFamily}",\n  font-weight: ${spec.fontWeight},\n`;
    if (spec.textTransform !== "none") scss += `  text-transform: ${spec.textTransform},\n`;
    scss += `);\n\n`;
  }
  scss += hr("MIXIN");
  scss += `@mixin apply-text-role($m) {\n  font-size: map.get($m,size); line-height: map.get($m,line-height);\n  letter-spacing: map.get($m,letter-spacing); font-family: map.get($m,font-family);\n  font-weight: map.get($m,font-weight);\n  @if map.has-key($m,text-transform) { text-transform: map.get($m,text-transform); }\n}\n`;
  return scss;
}

// ── RENDER ────────────────────────────────────────────────────────────────────
function render() {
  buildScaleSidebar();
  buildRolesSidebar();
  buildOutput();
  syncSettingsPanel();
}

function buildScaleSidebar() {
  const steps = computeScale(appState.scale, appState.baseFontSize);
  const el = document.getElementById("scale-sidebar");
  if (!el) return;
  const pf = appState.fonts.find(f => f.slot === "primary");
  const ff = pf ? pf.family : "Inter";
  el.innerHTML = `<h3 class="text-[var(--text-muted)] text-[11px] font-bold tracking-[1.2px] mb-2">TYPE SCALE</h3>` +
    steps.map(s => `
      <div class="flex items-center gap-3 py-2 border-b border-[var(--border)]">
        <span class="font-mono text-[10px] text-[var(--text-dim)] w-10">${esc(String(s.name))}</span>
        <span style="font-family:'${esc(ff)}';font-size:${Math.min(s.px, 28)}px;line-height:1;overflow:hidden;white-space:nowrap;max-width:130px;" class="font-semibold">Aa</span>
        <span class="ml-auto font-mono text-[10px] text-[var(--text-muted)] flex-shrink-0">${s.px}px</span>
      </div>`).join("");
}

function buildRolesSidebar() {
  const { scaleSteps, roleStyles } = typeMaker(appState);
  const el = document.getElementById("roles-sidebar");
  if (!el) return;
  el.innerHTML = appState.roles.map(role => {
    const vars = roleStyles.filter(s => s.roleName === role.name);
    return `<div class="mb-4">
      <h4 class="text-[var(--text-muted)] text-[10px] font-bold tracking-wider uppercase mb-1">${esc(role.name)}</h4>
      ${vars.map(v => `
        <div class="py-2 border-b border-[var(--border)]">
          <div style="font-family:'${esc(v.fontFamily)}';font-size:${Math.min(v.scaleStep.px, 32)}px;line-height:${lhToCss(v.lineHeight)};letter-spacing:${lsToCss(v.letterSpacing)};font-weight:${v.fontWeight};overflow:hidden;white-space:nowrap;text-overflow:ellipsis;">The quick brown fox</div>
          <div class="flex gap-2 mt-0.5">
            <span class="text-[10px] text-[var(--text-dim)]">${esc(v.variationName)}</span>
            <span class="text-[10px] text-[var(--text-dim)]">·</span>
            <span class="text-[10px] text-[var(--text-dim)]">${v.scaleStep.px}px</span>
            <span class="text-[10px] text-[var(--accent)]">${esc(v.fontWeightAlias)}</span>
          </div>
        </div>`).join("")}
    </div>`;
  }).join("");
}

function buildOutput() {
  const result = typeMaker(appState);
  const cssEl = document.getElementById("output-css");
  const scssEl = document.getElementById("output-scss");
  const jsonEl = document.getElementById("output-json");
  if (cssEl)  cssEl.textContent  = generateCSS(result, appState);
  if (scssEl) scssEl.textContent = generateSCSS(result, appState);
  if (jsonEl) jsonEl.textContent = JSON.stringify({
    meta: { system: "ttm316", name: appState.name, generated: new Date().toISOString(), baseFontSize: appState.baseFontSize },
    scale: result.scaleSteps,
    roles: result.roleStyles.reduce((acc, s) => {
      const g = acc.find(r => r.role === s.roleName);
      const v = { name: s.variationName, px: s.scaleStep.px, rem: s.scaleStep.rem, fontFamily: s.fontFamily, fontWeight: s.fontWeight, lineHeight: s.lineHeight, letterSpacing: s.letterSpacing };
      if (g) g.variations.push(v); else acc.push({ role: s.roleName, variations: [v] });
      return acc;
    }, []),
    config: appState,
  }, null, 2);
}

function syncSettingsPanel() {
  safeSet("ws-name", appState.name);
  safeSet("ws-base", appState.baseFontSize);
  safeSet("ws-method", appState.scale.method);
  safeSet("ws-seed", appState.scale.seedSize);
  safeSet("ws-steps", appState.scale.steps);
  safeSet("ws-ratio", appState.scale.ratio);
  safeSet("ws-naming", appState.scale.namingScheme);
}

// ── UTILS ─────────────────────────────────────────────────────────────────────
function esc(s) { return String(s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }
function safeSet(id, val) { const el = document.getElementById(id); if (el && val != null) { if (el.tagName === "SELECT") el.value = String(val); else el.value = String(val); } }

function copyText(id) {
  const el = document.getElementById(id);
  if (!el) return;
  navigator.clipboard.writeText(el.textContent).then(() => {
    const btn = document.querySelector(`[data-copy="${id}"]`);
    if (btn) { const orig = btn.textContent; btn.textContent = "Copied!"; setTimeout(() => btn.textContent = orig, 1500); }
  });
}

function downloadOutput(id, filename) {
  const el = document.getElementById(id);
  if (!el) return;
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([el.textContent], { type: "text/plain" }));
  a.download = filename; a.click();
}

// ── DOM BOOTSTRAP ─────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  buildUI();
  render();
  wireEvents();
});

function buildUI() {
  const app = document.querySelector("app") || document.querySelector("#app") || document.body;
  if (app.innerHTML.trim()) return; // HTML already has structure

  app.innerHTML = `
  <div class="flex h-screen overflow-hidden">
    <!-- Sidebar -->
    <aside class="w-72 flex-shrink-0 bg-[var(--bg-panel)] border-r border-[var(--border)] flex flex-col overflow-hidden">
      <div class="px-4 py-3 border-b border-[var(--border)] flex items-center justify-between">
        <h1 class="text-[20px] font-bold">ttm316</h1>
        <span class="text-[var(--text-muted)] text-[11px]">Type Token Manager</span>
      </div>
      <div class="flex border-b border-[var(--border)]">
        <button class="flex-1 py-2.5 text-[11px] font-bold text-[var(--accent)] border-b-2 border-[var(--accent)] uppercase tracking-wider" onclick="switchSidebarTab('scale', this)">Scale</button>
        <button class="flex-1 py-2.5 text-[11px] font-bold text-[var(--text-muted)] border-b-2 border-transparent uppercase tracking-wider" onclick="switchSidebarTab('roles', this)">Roles</button>
      </div>
      <div class="flex-1 overflow-y-auto p-3">
        <div id="scale-sidebar"></div>
        <div id="roles-sidebar" class="hidden"></div>
      </div>
    </aside>

    <!-- Main -->
    <div class="flex-1 flex flex-col overflow-hidden">
      <!-- Top bar -->
      <div class="bg-[var(--bg-panel)] border-b border-[var(--border)] px-4 py-2 flex items-center gap-3">
        <div class="flex gap-1">
          <button class="px-3 py-1.5 rounded-lg bg-[var(--accent)] text-white text-[12px] font-bold" onclick="showPanel('css')">CSS</button>
          <button class="px-3 py-1.5 rounded-lg bg-[var(--bg-input)] text-[var(--text-muted)] text-[12px] font-bold" onclick="showPanel('scss')">SCSS</button>
          <button class="px-3 py-1.5 rounded-lg bg-[var(--bg-input)] text-[var(--text-muted)] text-[12px] font-bold" onclick="showPanel('json')">JSON</button>
        </div>
        <div class="ml-auto flex gap-2">
          <button class="text-[12px] text-[var(--text-muted)] hover:text-[var(--accent)] font-medium" data-copy="output-css" onclick="copyText(currentPanel())">Copy</button>
          <button class="text-[12px] text-[var(--text-muted)] hover:text-[var(--accent)] font-medium" onclick="downloadCurrentPanel()">Download</button>
          <button class="px-3 py-1.5 rounded-lg bg-[var(--bg-input)] text-[var(--text-muted)] text-[12px] font-bold ml-2" onclick="toggleSettings()">⚙ Settings</button>
        </div>
      </div>

      <!-- Output panels -->
      <div class="flex-1 overflow-auto bg-[var(--bg-app)] relative">
        <pre id="output-css"  class="output-panel p-4 text-[12px] font-mono text-[var(--text-muted)] whitespace-pre-wrap leading-relaxed"></pre>
        <pre id="output-scss" class="output-panel hidden p-4 text-[12px] font-mono text-[var(--text-muted)] whitespace-pre-wrap leading-relaxed"></pre>
        <pre id="output-json" class="output-panel hidden p-4 text-[12px] font-mono text-[var(--text-muted)] whitespace-pre-wrap leading-relaxed"></pre>
      </div>
    </div>

    <!-- Settings panel -->
    <aside id="settings-panel" class="hidden w-64 flex-shrink-0 bg-[var(--bg-panel)] border-l border-[var(--border)] overflow-y-auto p-4 space-y-4">
      <div class="flex items-center justify-between mb-2">
        <h2 class="text-[15px] font-bold">Settings</h2>
        <button class="text-[var(--text-muted)] hover:text-[var(--text-primary)]" onclick="toggleSettings()">✕</button>
      </div>
      <div class="space-y-3">
        <h3 class="text-[var(--text-muted)] text-[11px] font-bold tracking-widest">BASIC</h3>
        <div class="space-y-1"><label class="text-[12px] text-[var(--text-muted)]">System Name</label><input id="ws-name" class="w-full h-[34px] bg-[var(--bg-input)] border border-[var(--border)] rounded-[7px] p-2 text-[12px] outline-none focus:border-[var(--accent)]" /></div>
        <div class="space-y-1"><label class="text-[12px] text-[var(--text-muted)]">Base Font (px)</label><input id="ws-base" type="number" min="1" class="w-full h-[34px] bg-[var(--bg-input)] border border-[var(--border)] rounded-[7px] p-2 text-[12px] outline-none focus:border-[var(--accent)]" /></div>
      </div>
      <div class="space-y-3">
        <h3 class="text-[var(--text-muted)] text-[11px] font-bold tracking-widest">SCALE</h3>
        <div class="space-y-1"><label class="text-[12px] text-[var(--text-muted)]">Method</label>
          <select id="ws-method" class="w-full h-[34px] bg-[var(--bg-input)] border border-[var(--border)] rounded-[7px] p-2 text-[12px] outline-none focus:border-[var(--accent)] appearance-none cursor-pointer">
            <option value="Modular">Modular</option><option value="Linear">Linear</option><option value="Custom">Custom</option>
          </select></div>
        <div class="space-y-1"><label class="text-[12px] text-[var(--text-muted)]">Seed (px)</label><input id="ws-seed" type="number" min="1" class="w-full h-[34px] bg-[var(--bg-input)] border border-[var(--border)] rounded-[7px] p-2 text-[12px] outline-none focus:border-[var(--accent)]" /></div>
        <div class="space-y-1"><label class="text-[12px] text-[var(--text-muted)]">Steps</label><input id="ws-steps" type="number" min="1" max="24" class="w-full h-[34px] bg-[var(--bg-input)] border border-[var(--border)] rounded-[7px] p-2 text-[12px] outline-none focus:border-[var(--accent)]" /></div>
        <div class="space-y-1"><label class="text-[12px] text-[var(--text-muted)]">Ratio</label>
          <select id="ws-ratio" class="w-full h-[34px] bg-[var(--bg-input)] border border-[var(--border)] rounded-[7px] p-2 text-[12px] outline-none focus:border-[var(--accent)] appearance-none cursor-pointer">
            ${Object.entries(MODULAR_RATIOS).map(([name, val]) => `<option value="${val}">${name} — ${val}</option>`).join("")}
          </select></div>
        <div class="space-y-1"><label class="text-[12px] text-[var(--text-muted)]">Naming</label>
          <select id="ws-naming" class="w-full h-[34px] bg-[var(--bg-input)] border border-[var(--border)] rounded-[7px] p-2 text-[12px] outline-none focus:border-[var(--accent)] appearance-none cursor-pointer">
            <option value="numeric">Numeric (1,2,3)</option><option value="sizeLabels">Size Labels (xs,s,m)</option>
            <option value="rem">Rem</option><option value="px">Px</option>
          </select></div>
      </div>
    </aside>
  </div>`;
}

let activePanelId = "output-css";

function showPanel(type) {
  activePanelId = `output-${type}`;
  document.querySelectorAll(".output-panel").forEach(el => el.classList.toggle("hidden", el.id !== activePanelId));
  document.querySelectorAll(".output-panel ~ button, [onclick^='showPanel']").forEach(() => {});
}

function currentPanel() { return activePanelId; }

function downloadCurrentPanel() {
  const ext = { "output-css": "css", "output-scss": "scss", "output-json": "json" }[activePanelId] || "txt";
  downloadOutput(activePanelId, `ttm316-tokens.${ext}`);
}

function switchSidebarTab(tab, btn) {
  document.getElementById("scale-sidebar").classList.toggle("hidden", tab !== "scale");
  document.getElementById("roles-sidebar").classList.toggle("hidden", tab !== "roles");
  if (btn) {
    btn.parentElement.querySelectorAll("button").forEach(b => {
      b.classList.toggle("text-[var(--accent)]", b === btn);
      b.classList.toggle("border-[var(--accent)]", b === btn);
      b.classList.toggle("text-[var(--text-muted)]", b !== btn);
      b.classList.toggle("border-transparent", b !== btn);
    });
  }
}

function toggleSettings() {
  const panel = document.getElementById("settings-panel");
  if (panel) panel.classList.toggle("hidden");
}

function wireEvents() {
  // Settings inputs
  const wire = (id, updater) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener(el.tagName === "SELECT" ? "change" : "input", () => { updater(el.value); render(); });
  };
  wire("ws-name",   v => { appState.name = v; });
  wire("ws-base",   v => { appState.baseFontSize = parseFloat(v) || 16; });
  wire("ws-method", v => { appState.scale.method = v; });
  wire("ws-seed",   v => { appState.scale.seedSize = parseFloat(v) || 16; });
  wire("ws-steps",  v => { appState.scale.steps = Math.max(1, parseInt(v) || 1); });
  wire("ws-ratio",  v => { appState.scale.ratio = parseFloat(v) || 1.25; });
  wire("ws-naming", v => { appState.scale.namingScheme = v; });
}
