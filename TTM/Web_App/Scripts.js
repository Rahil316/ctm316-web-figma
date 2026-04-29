/**
 * TTM316 Web App — Text Token Manager
 * No Figma API. Uses localStorage for persistence.
 * Organization:
 * 1. App State + Persistence
 * 2. Scale Math
 * 3. Export Formatters
 * 4. Render Functions
 * 5. Mutations
 * 6. UI / Event Wiring
 * 7. Init
 */

// ── 1. APP STATE + PERSISTENCE ────────────────────────────────────────────────

const DEFAULT_STATE = {
  name: "ttm316",
  baseFontSize: 16,
  fonts: [
    { slot: "primary",   family: "Inter",         fallback: "sans-serif" },
    { slot: "secondary", family: "Merriweather",   fallback: "serif"     },
    { slot: "tertiary",  family: "JetBrains Mono", fallback: "monospace" },
  ],
  fontWeights: [
    { alias: "Thin",      value: 100, figmaStyles: {} },
    { alias: "Light",     value: 300, figmaStyles: {} },
    { alias: "Regular",   value: 400, figmaStyles: {} },
    { alias: "Medium",    value: 500, figmaStyles: {} },
    { alias: "SemiBold",  value: 600, figmaStyles: {} },
    { alias: "Bold",      value: 700, figmaStyles: {} },
    { alias: "ExtraBold", value: 800, figmaStyles: {} },
    { alias: "Black",     value: 900, figmaStyles: {} },
  ],
  scale: {
    method: "Modular",
    seedSize: 16,
    ratio: 1.25,
    ratioName: "Major Third",
    steps: 10,
    minSize: 10,
    maxSize: 96,
    customValues: [],
    namingScheme: "numeric",
    customStepNames: [],
    scaleOverrides: {},
  },
  roles: [],
  useShortRoleNames: false,
  styleNameSeparator: "/",
};

let appState = JSON.parse(JSON.stringify(DEFAULT_STATE));

function loadFromStorage() {
  try {
    const raw = localStorage.getItem("ttm316_state");
    if (raw) {
      const parsed = JSON.parse(raw);
      appState = Object.assign(JSON.parse(JSON.stringify(DEFAULT_STATE)), parsed);
      if (!appState.scale.scaleOverrides) appState.scale.scaleOverrides = {};
    }
  } catch (_) {}
}

function saveToStorage() {
  try { localStorage.setItem("ttm316_state", JSON.stringify(appState)); } catch (_) {}
}

let _saveTimer = null;
function scheduleSave() {
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(saveToStorage, 600);
}

// ── 2. SCALE MATH ─────────────────────────────────────────────────────────────

const SIZE_LABELS = ["3xs","2xs","xs","s","m","l","xl","2xl","3xl","4xl","5xl","6xl","7xl","8xl","9xl"];

function computeScale(scale, base) {
  const { method, seedSize, ratio, steps, minSize, maxSize, customValues, namingScheme, customStepNames, scaleOverrides } = scale;
  let px = [];
  if (method === "Modular") {
    for (let i = 0; i < steps; i++) px.push(Math.round(seedSize * Math.pow(ratio, i)));
  } else if (method === "Linear") {
    const mn = parseFloat(minSize) || seedSize * 0.5;
    const mx = parseFloat(maxSize) || seedSize * 4;
    for (let i = 0; i < steps; i++) {
      const t = steps === 1 ? 0 : i / (steps - 1);
      px.push(Math.round(mn + t * (mx - mn)));
    }
  } else {
    px = (customValues || []).map((v) => Math.round(parseFloat(String(v).trim()))).filter((v) => !isNaN(v) && v > 0);
    if (!px.length) return [];
  }
  if (scaleOverrides) {
    for (const [idx, val] of Object.entries(scaleOverrides)) {
      const i = parseInt(idx), v = Math.round(parseFloat(val));
      if (!isNaN(i) && i >= 0 && i < px.length && !isNaN(v) && v > 0) px[i] = v;
    }
  }
  const n = px.length;
  let names;
  if (namingScheme === "sizeLabels") {
    const c = SIZE_LABELS.indexOf("m"), off = c - Math.floor(n / 2);
    names = Array.from({ length: n }, (_, i) => SIZE_LABELS[i + off] || String(i + 1));
  } else if (namingScheme === "rem") {
    names = px.map((v) => `${Math.round((v / base) * 1000) / 1000}rem`);
  } else if (namingScheme === "px") {
    names = px.map((v) => `${v}px`);
  } else if (namingScheme === "custom" && customStepNames && customStepNames.length) {
    const cn = [...customStepNames];
    while (cn.length < n) cn.push(String(cn.length + 1));
    names = cn.slice(0, n);
  } else {
    names = Array.from({ length: n }, (_, i) => String(i + 1));
  }
  return px.map((v, i) => ({ index: i, name: names[i], px: v, rem: Math.round((v / base) * 1000) / 1000 }));
}

function resolveRolePreview(role, steps) {
  const result = [];
  for (let v = 0; v < role.variationCount; v++) {
    const ov = (role.variationOverrides || []).find((o) => o.index === v) || {};
    const delta = role.scaleDirection === "descending" ? role.variationCount - 1 - v : v;
    const idx = Math.max(0, Math.min(steps.length - 1, role.baseScaleIndex - delta + (ov.scaleIndexOffset || 0)));
    const autoName = role.scaleDirection === "descending" ? String(v + 1) : String(role.variationCount - v);
    const varName = (role.variationNames && role.variationNames[v]) || autoName;
    const fontSlot = ov.fontSlot || role.fontSlot;
    const lh = ov.lineHeight || role.lineHeight;
    const ls = ov.letterSpacing || role.letterSpacing;
    const fontDef = appState.fonts.find((f) => f.slot === fontSlot);
    const wDef = appState.fontWeights[0] || { alias: "Regular", value: 400 };
    result.push({
      variationName: varName,
      scaleStep: steps[idx],
      fontFamily: fontDef ? fontDef.family : "Inter",
      fontWeight: wDef.value,
      weightAlias: wDef.alias,
      lineHeight: lh,
      letterSpacing: ls,
      textTransform: ov.textTransform || role.textTransform || "none",
    });
  }
  return result;
}

function lhHintUI(px) {
  if (px < 16) return "1.4–1.6";
  if (px <= 32) return "1.2–1.4";
  if (px <= 64) return "1.0–1.2";
  return "0.9–1.05";
}

function lhToCss(lh) {
  if (!lh || lh.unit === "AUTO") return "1.2";
  if (lh.unit === "PIXELS") return `${lh.value}px`;
  return String(Math.round((lh.value / 100) * 1000) / 1000);
}

function lsToCss(ls) {
  if (!ls) return "0";
  return ls.unit === "PIXELS" ? `${ls.value}px` : `${Math.round((ls.value / 100) * 1000) / 1000}em`;
}

// ── 3. EXPORT FORMATTERS ──────────────────────────────────────────────────────

function cssSlug(str) {
  return String(str || "").toLowerCase().trim().replace(/[\s_]+/g, "-").replace(/[^a-z0-9-]/g, "");
}

function lineHeightToCss(lh) {
  if (!lh) return "1.5";
  if (lh.unit === "AUTO") return "normal";
  if (lh.unit === "PIXELS") return `${lh.value}px`;
  return String(Math.round((lh.value / 100) * 1000) / 1000);
}

function letterSpacingToCss(ls) {
  if (!ls) return "0";
  if (ls.unit === "PIXELS") return `${ls.value}px`;
  return `${Math.round((ls.value / 100) * 1000) / 1000}em`;
}

function buildAllRoleStyles(scaleSteps) {
  const styles = [];
  for (const role of appState.roles) {
    for (let v = 0; v < role.variationCount; v++) {
      const ov = (role.variationOverrides || []).find((o) => o.index === v) || {};
      const delta = role.scaleDirection === "descending" ? role.variationCount - 1 - v : v;
      const rawIdx = role.baseScaleIndex - delta + (ov.scaleIndexOffset || 0);
      const scaleIdx = Math.max(0, Math.min(scaleSteps.length - 1, rawIdx));
      const fontSlot = ov.fontSlot || role.fontSlot;
      const lineHeight = ov.lineHeight || role.lineHeight;
      const letterSpacing = ov.letterSpacing || role.letterSpacing;
      const textTransform = ov.textTransform || role.textTransform || "none";
      const fontDef = appState.fonts.find((f) => f.slot === fontSlot);
      const autoName = role.scaleDirection === "descending" ? String(v + 1) : String(role.variationCount - v);
      const variationName = (role.variationNames && role.variationNames[v]) || autoName;
      for (const weightDef of appState.fontWeights) {
        styles.push({
          roleName: role.name,
          roleShortName: role.shortName || role.name.substring(0, 2).toLowerCase(),
          variationName,
          fontFamily: fontDef ? fontDef.family : "Inter",
          fontSlot,
          fontWeightAlias: weightDef.alias,
          fontWeight: weightDef.value,
          scaleStep: scaleSteps[scaleIdx],
          lineHeight,
          letterSpacing,
          textTransform,
        });
      }
    }
  }
  return styles;
}

function buildStyleName(spec) {
  const sep = appState.styleNameSeparator || "/";
  const roleName = appState.useShortRoleNames ? spec.roleShortName : spec.roleName;
  return `${roleName}${sep}${spec.variationName}${sep}${spec.fontWeightAlias}`;
}

const ExportFormatter = {
  toCSS(scaleSteps, roleStyles) {
    let css = `/* ${appState.name} — generated by ttm316 | ${new Date().toISOString()} */\n\n`;
    css += `:root {\n  /* ── Type Scale ── */\n`;
    for (const s of scaleSteps) {
      css += `  --scale-${cssSlug(String(s.name))}: ${s.px}px;\n`;
      css += `  --scale-${cssSlug(String(s.name))}-rem: ${s.rem}rem;\n`;
    }
    css += `\n  /* ── Role Tokens ── */\n`;
    for (const spec of roleStyles) {
      const prefix = `--${cssSlug(spec.roleName)}-${cssSlug(spec.variationName)}-${cssSlug(spec.fontWeightAlias)}`;
      css += `  ${prefix}-size: var(--scale-${cssSlug(String(spec.scaleStep.name))});\n`;
      css += `  ${prefix}-line-height: ${lineHeightToCss(spec.lineHeight)};\n`;
      css += `  ${prefix}-letter-spacing: ${letterSpacingToCss(spec.letterSpacing)};\n`;
      css += `  ${prefix}-font-family: "${spec.fontFamily}";\n`;
      css += `  ${prefix}-font-weight: ${spec.fontWeight};\n`;
      if (spec.textTransform && spec.textTransform !== "none") {
        css += `  ${prefix}-text-transform: ${spec.textTransform};\n`;
      }
    }
    css += `}\n`;
    return css;
  },

  toSCSS(scaleSteps, roleStyles) {
    const hr = (t) => `// ${"=".repeat(58)}\n// ${t}\n// ${"=".repeat(58)}\n\n`;
    let scss = `// ${appState.name} — Auto-generated SCSS\n// Generated: ${new Date().toISOString()}\n// Do not edit manually.\n\n`;
    scss += `@use 'sass:map';\n\n`;
    scss += hr("TYPE SCALE VARIABLES");
    for (const s of scaleSteps) scss += `$scale-${cssSlug(String(s.name))}: ${s.px}px;\n`;
    scss += `\n$type-scale: (\n`;
    for (const s of scaleSteps) scss += `  "${cssSlug(String(s.name))}": $scale-${cssSlug(String(s.name))},\n`;
    scss += `);\n\n`;
    scss += hr("ROLE TOKEN MAPS");
    for (const spec of roleStyles) {
      const varName = `$${cssSlug(spec.roleName)}-${cssSlug(spec.variationName)}-${cssSlug(spec.fontWeightAlias)}`;
      scss += `${varName}: (\n`;
      scss += `  size:           $scale-${cssSlug(String(spec.scaleStep.name))},\n`;
      scss += `  line-height:    ${lineHeightToCss(spec.lineHeight)},\n`;
      scss += `  letter-spacing: ${letterSpacingToCss(spec.letterSpacing)},\n`;
      scss += `  font-family:    "${spec.fontFamily}",\n`;
      scss += `  font-weight:    ${spec.fontWeight},\n`;
      if (spec.textTransform && spec.textTransform !== "none") scss += `  text-transform: ${spec.textTransform},\n`;
      scss += `);\n\n`;
    }
    scss += hr("ROLE MIXIN");
    scss += `@mixin apply-text-role($role-map) {\n`;
    scss += `  font-size:      map.get($role-map, size);\n`;
    scss += `  line-height:    map.get($role-map, line-height);\n`;
    scss += `  letter-spacing: map.get($role-map, letter-spacing);\n`;
    scss += `  font-family:    map.get($role-map, font-family);\n`;
    scss += `  font-weight:    map.get($role-map, font-weight);\n`;
    scss += `  @if map.has-key($role-map, text-transform) {\n    text-transform: map.get($role-map, text-transform);\n  }\n}\n`;
    return scss;
  },

  toJSON(scaleSteps, roleStyles) {
    const grouped = {};
    for (const spec of roleStyles) {
      if (!grouped[spec.roleName]) grouped[spec.roleName] = { role: spec.roleName, variations: {} };
      const key = spec.variationName;
      if (!grouped[spec.roleName].variations[key]) {
        grouped[spec.roleName].variations[key] = {
          name: key, scaleName: String(spec.scaleStep.name),
          px: spec.scaleStep.px, rem: spec.scaleStep.rem,
          lineHeight: spec.lineHeight, letterSpacing: spec.letterSpacing,
          textTransform: spec.textTransform, weights: [],
        };
      }
      grouped[spec.roleName].variations[key].weights.push({
        alias: spec.fontWeightAlias, value: spec.fontWeight, fontFamily: spec.fontFamily,
      });
    }
    return JSON.stringify({
      meta: { system: "ttm316", name: appState.name, generated: new Date().toISOString(), baseFontSize: appState.baseFontSize },
      scale: scaleSteps,
      roles: Object.values(grouped).map((r) => ({ role: r.role, variations: Object.values(r.variations) })),
      config: appState,
    }, null, 2);
  },
};

// ── 4. RENDER FUNCTIONS ───────────────────────────────────────────────────────

function renderAll() {
  renderScalePreviewBar();
  renderRolesList();
  renderPreviewScale();
  renderPreviewRoles();
  renderSettingsForm();
  renderStyleNamePreview();
  scheduleExportRefresh();
}

function renderScalePreviewBar() {
  const steps = computeScale(appState.scale, appState.baseFontSize);
  const bar = document.getElementById("scale-preview-bar");
  if (!bar) return;
  if (!steps.length) {
    bar.innerHTML = `<p class="text-[11px] text-[var(--text-muted)] text-center py-3">No steps — check settings.</p>`;
    return;
  }
  const pf = appState.fonts.find((f) => f.slot === "primary") || appState.fonts[0];
  const ff = pf ? pf.family : "Inter";
  const overrides = appState.scale.scaleOverrides || {};
  bar.innerHTML = steps.map((s) => {
    const isOv = overrides[s.index] != null;
    return `
    <div class="scale-bar-item">
      <span class="text-[var(--text-dim)] font-mono text-[10px] w-10 flex-shrink-0">${esc(String(s.name))}</span>
      <span style="font-family:'${esc(ff)}';font-size:${Math.min(s.px, 48)}px;" class="truncate whitespace-nowrap leading-none flex-1 overflow-hidden">The quick brown fox jumps over the lazy dog</span>
      <span class="text-[var(--text-muted)] text-[10px] flex-shrink-0" style="min-width:44px;text-align:right;">${s.rem}rem</span>
      <input type="number" min="1" max="999" value="${isOv ? overrides[s.index] : s.px}"
        class="w-[52px] h-[22px] text-[10px] text-right bg-[var(--bg-input)] border rounded-[4px] px-1 outline-none focus:border-[var(--border-focus)] flex-shrink-0 ${isOv ? "border-[var(--accent)] text-[var(--accent)]" : "border-[var(--border)]"}"
        data-step-override="${s.index}" title="Override step ${s.index} size" />
    </div>`;
  }).join("");
  bar.querySelectorAll("[data-step-override]").forEach((el) => {
    el.addEventListener("change", (e) => {
      const idx = parseInt(e.target.dataset.stepOverride);
      const val = Math.round(parseFloat(e.target.value));
      if (!appState.scale.scaleOverrides) appState.scale.scaleOverrides = {};
      if (!isNaN(val) && val > 0) { appState.scale.scaleOverrides[idx] = val; }
      else { delete appState.scale.scaleOverrides[idx]; }
      renderScalePreviewBar(); renderPreviewScale(); renderPreviewRoles();
      scheduleExportRefresh(); scheduleSave();
    });
  });
}

function renderRolesList() {
  const list = document.getElementById("roles-list");
  if (!list) return;
  if (!appState.roles.length) {
    list.innerHTML = `<p class="text-[var(--text-muted)] text-[12px] text-center py-4">No roles yet. Click "Add Role" to get started.</p>`;
    return;
  }
  list.innerHTML = appState.roles.map((role, idx) => buildRoleCard(role, idx)).join("");
  list.querySelectorAll("[data-rf]").forEach((el) => {
    const ev = el.tagName === "SELECT" ? "change" : "input";
    el.addEventListener(ev, (e) => handleRoleInput(parseInt(e.target.dataset.ri), e.target.dataset.rf, e.target.value));
  });
}

function buildRoleCard(role, idx) {
  const steps = computeScale(appState.scale, appState.baseFontSize);
  const basePx = steps[role.baseScaleIndex] ? `${steps[role.baseScaleIndex].px}px` : "–";
  const maxIdx = Math.max(0, steps.length - 1);
  const lhUnit = (role.lineHeight || {}).unit || "PERCENT";
  const lhVal  = (role.lineHeight || {}).value !== undefined ? (role.lineHeight || {}).value : 150;
  const lsUnit = (role.letterSpacing || {}).unit || "PERCENT";
  const lsVal  = (role.letterSpacing || {}).value !== undefined ? (role.letterSpacing || {}).value : 0;
  const hint = lhHintUI(steps[role.baseScaleIndex] ? steps[role.baseScaleIndex].px : 16);
  const fOpts = appState.fonts.map((f) => `<option value="${esc(f.slot)}" ${role.fontSlot === f.slot ? "selected" : ""}>${cap(f.slot)} — ${esc(f.family)}</option>`).join("");

  return `
  <div class="role-card bg-[var(--bg-card)] border border-[var(--border)] rounded-[12px] overflow-hidden" data-idx="${idx}">
    <div class="flex items-center gap-2 p-3 cursor-pointer" onclick="toggleRoleCard(${idx})">
      <svg class="chevron w-4 h-4 text-[var(--text-muted)] flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="18 15 12 9 6 15"/></svg>
      <span class="font-semibold text-[14px] flex-1">${esc(role.name || "Unnamed")}</span>
      <span class="text-[var(--text-muted)] text-[11px] mr-1">x${role.variationCount}</span>
      <button class="p-1 text-[var(--danger)] hover:bg-[var(--danger)]/10 rounded" onclick="event.stopPropagation();deleteRole(${idx})">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
      </button>
    </div>
    <div class="role-card-body border-t border-[var(--border)] p-3 space-y-2.5">
      <div class="grid grid-cols-2 gap-2">
        <div class="space-y-1"><label class="text-[var(--text-muted)] text-[11px] font-medium ml-1">Name</label>
          <input type="text" class="w-full h-[34px] bg-[var(--bg-input)] border border-[var(--border)] rounded-[7px] p-2 text-[13px] outline-none focus:border-[var(--border-focus)]" value="${esc(role.name)}" data-ri="${idx}" data-rf="name" /></div>
        <div class="space-y-1"><label class="text-[var(--text-muted)] text-[11px] font-medium ml-1">Short Name</label>
          <input type="text" class="w-full h-[34px] bg-[var(--bg-input)] border border-[var(--border)] rounded-[7px] p-2 text-[13px] outline-none focus:border-[var(--border-focus)]" value="${esc(role.shortName || "")}" data-ri="${idx}" data-rf="shortName" /></div>
      </div>
      <div class="grid grid-cols-2 gap-2">
        <div class="space-y-1"><label class="text-[var(--text-muted)] text-[11px] font-medium ml-1">Variations</label>
          <input type="number" min="1" max="12" class="w-full h-[34px] bg-[var(--bg-input)] border border-[var(--border)] rounded-[7px] p-2 text-[13px] outline-none focus:border-[var(--border-focus)]" value="${role.variationCount}" data-ri="${idx}" data-rf="variationCount" /></div>
        <div class="space-y-1"><label class="text-[var(--text-muted)] text-[11px] font-medium ml-1">Names (CSV)</label>
          <input type="text" placeholder="h1,h2,h3..." class="w-full h-[34px] bg-[var(--bg-input)] border border-[var(--border)] rounded-[7px] p-2 text-[12px] outline-none focus:border-[var(--border-focus)]" value="${(role.variationNames || []).join(",")}" data-ri="${idx}" data-rf="variationNames" /></div>
      </div>
      <div class="grid grid-cols-2 gap-2">
        <div class="space-y-1"><label class="text-[var(--text-muted)] text-[11px] font-medium ml-1">Base Step <span class="text-[var(--accent)]">(${basePx})</span></label>
          <input type="number" min="0" max="${maxIdx}" class="w-full h-[34px] bg-[var(--bg-input)] border border-[var(--border)] rounded-[7px] p-2 text-[13px] outline-none focus:border-[var(--border-focus)]" value="${role.baseScaleIndex}" data-ri="${idx}" data-rf="baseScaleIndex" /></div>
        <div class="space-y-1"><label class="text-[var(--text-muted)] text-[11px] font-medium ml-1">Direction</label>
          <select class="w-full h-[34px] bg-[var(--bg-input)] border border-[var(--border)] rounded-[7px] p-1.5 text-[11px] outline-none focus:border-[var(--border-focus)] appearance-none cursor-pointer" data-ri="${idx}" data-rf="scaleDirection">
            <option value="descending" ${role.scaleDirection === "descending" ? "selected" : ""}>↓ Desc (v0=largest)</option>
            <option value="ascending"  ${role.scaleDirection === "ascending"  ? "selected" : ""}>↑ Asc (v0=smallest)</option>
          </select></div>
      </div>
      <div class="grid grid-cols-2 gap-2">
        <div class="space-y-1"><label class="text-[var(--text-muted)] text-[11px] font-medium ml-1">Font Slot</label>
          <div class="relative">
            <select class="w-full h-[34px] bg-[var(--bg-input)] border border-[var(--border)] rounded-[7px] pl-2 pr-7 text-[11px] outline-none focus:border-[var(--border-focus)] appearance-none cursor-pointer" data-ri="${idx}" data-rf="fontSlot">${fOpts}</select>
            <svg class="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
          </div></div>
        <div class="space-y-1"><label class="text-[var(--text-muted)] text-[11px] font-medium ml-1">Text Transform</label>
          <div class="relative">
            <select class="w-full h-[34px] bg-[var(--bg-input)] border border-[var(--border)] rounded-[7px] pl-2 pr-7 text-[11px] outline-none focus:border-[var(--border-focus)] appearance-none cursor-pointer" data-ri="${idx}" data-rf="textTransform">
              <option value="none"       ${role.textTransform === "none"       ? "selected" : ""}>None</option>
              <option value="uppercase"  ${role.textTransform === "uppercase"  ? "selected" : ""}>Uppercase</option>
              <option value="lowercase"  ${role.textTransform === "lowercase"  ? "selected" : ""}>Lowercase</option>
              <option value="capitalize" ${role.textTransform === "capitalize" ? "selected" : ""}>Capitalize</option>
            </select>
            <svg class="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
          </div></div>
      </div>
      <div class="grid grid-cols-2 gap-2">
        <div class="space-y-1">
          <label class="text-[var(--text-muted)] text-[11px] font-medium ml-1">Line Height <span class="text-[var(--text-dim)]">(${lhUnit === "PERCENT" ? "% of size" : lhUnit === "PIXELS" ? "px" : "auto"})</span></label>
          <div class="flex gap-1 items-center">
            <select class="w-[60px] h-[34px] bg-[var(--bg-input)] border border-[var(--border)] rounded-[7px] p-1 text-[11px] outline-none focus:border-[var(--border-focus)] appearance-none cursor-pointer flex-shrink-0" data-ri="${idx}" data-rf="lineHeightUnit">
              <option value="PERCENT" ${lhUnit === "PERCENT" ? "selected" : ""}>%</option>
              <option value="PIXELS"  ${lhUnit === "PIXELS"  ? "selected" : ""}>px</option>
              <option value="AUTO"    ${lhUnit === "AUTO"    ? "selected" : ""}>auto</option>
            </select>
            <input type="number" step="0.1" class="flex-1 h-[34px] bg-[var(--bg-input)] border border-[var(--border)] rounded-[7px] p-2 text-[13px] outline-none focus:border-[var(--border-focus)] ${lhUnit === "AUTO" ? "opacity-30 pointer-events-none" : ""}" value="${lhVal}" data-ri="${idx}" data-rf="lineHeightValue" ${lhUnit === "AUTO" ? "disabled" : ""} />
          </div>
          <p class="text-[10px] text-[var(--text-dim)] ml-1">Hint: ${hint}</p>
        </div>
        <div class="space-y-1">
          <label class="text-[var(--text-muted)] text-[11px] font-medium ml-1">Letter Spacing <span class="text-[var(--text-dim)]">(${lsUnit === "PERCENT" ? "% of size" : "px"})</span></label>
          <div class="flex gap-1 items-center">
            <select class="w-[60px] h-[34px] bg-[var(--bg-input)] border border-[var(--border)] rounded-[7px] p-1 text-[11px] outline-none focus:border-[var(--border-focus)] appearance-none cursor-pointer flex-shrink-0" data-ri="${idx}" data-rf="letterSpacingUnit">
              <option value="PERCENT" ${lsUnit === "PERCENT" ? "selected" : ""}>%</option>
              <option value="PIXELS"  ${lsUnit === "PIXELS"  ? "selected" : ""}>px</option>
            </select>
            <input type="number" step="0.1" class="flex-1 h-[34px] bg-[var(--bg-input)] border border-[var(--border)] rounded-[7px] p-2 text-[13px] outline-none focus:border-[var(--border-focus)]" value="${lsVal}" data-ri="${idx}" data-rf="letterSpacingValue" />
          </div>
        </div>
      </div>
    </div>
  </div>`;
}

function handleRoleInput(ri, field, val) {
  const role = appState.roles[ri];
  if (!role) return;
  if (field === "variationCount") {
    role.variationCount = Math.max(1, parseInt(val) || 1);
    const autoPattern = new RegExp(`^${escRegex(role.shortName || "")}\\d+$`);
    if (!role.variationNames.length || role.variationNames.every((n) => autoPattern.test(n))) {
      role.variationNames = autoVariationNames(role.shortName, role.variationCount);
    }
    renderRolesList();
  } else if (field === "shortName") {
    role.shortName = val;
    const autoPattern = new RegExp(`^[a-z0-9]*\\d+$`);
    if (!role.variationNames.length || role.variationNames.every((n) => autoPattern.test(n))) {
      role.variationNames = autoVariationNames(val, role.variationCount);
      renderRolesList();
    }
  } else if (field === "variationNames") {
    role.variationNames = val.split(",").map((s) => s.trim()).filter(Boolean);
  } else if (field === "baseScaleIndex") {
    role.baseScaleIndex = parseInt(val) || 0;
  } else if (field === "lineHeightValue") {
    if (!role.lineHeight) role.lineHeight = { unit: "PERCENT", value: 150 };
    role.lineHeight.value = parseFloat(val) || 0;
  } else if (field === "lineHeightUnit") {
    if (!role.lineHeight) role.lineHeight = { unit: "PERCENT", value: 150 };
    role.lineHeight.unit = val;
    renderRolesList();
  } else if (field === "letterSpacingValue") {
    if (!role.letterSpacing) role.letterSpacing = { unit: "PERCENT", value: 0 };
    role.letterSpacing.value = parseFloat(val) || 0;
  } else if (field === "letterSpacingUnit") {
    if (!role.letterSpacing) role.letterSpacing = { unit: "PERCENT", value: 0 };
    role.letterSpacing.unit = val;
  } else {
    role[field] = val;
  }
  renderPreviewRoles();
  renderStyleNamePreview();
  scheduleExportRefresh();
  scheduleSave();
}

function renderPreviewScale() {
  const steps = computeScale(appState.scale, appState.baseFontSize);
  const pf = appState.fonts.find((f) => f.slot === "primary") || appState.fonts[0];
  const ff = pf ? pf.family : "Inter";
  const el = document.getElementById("scale-specimens");
  if (!el) return;
  el.innerHTML = steps.map((s) => `
    <div class="scale-bar-item">
      <span class="text-[var(--text-dim)] font-mono text-[10px] w-12 flex-shrink-0">${esc(String(s.name))}</span>
      <span style="font-family:'${esc(ff)}';font-size:${Math.min(s.px, 72)}px;" class="truncate whitespace-nowrap leading-none flex-1 overflow-hidden">The quick brown fox jumps over the lazy dog</span>
      <span class="text-[var(--text-muted)] text-[10px] ml-2 flex-shrink-0">${s.px}px / ${s.rem}rem</span>
    </div>`).join("");
}

function renderPreviewRoles() {
  const steps = computeScale(appState.scale, appState.baseFontSize);
  const el = document.getElementById("role-specimens");
  if (!el) return;
  if (!appState.roles.length) {
    el.innerHTML = `<p class="text-[var(--text-muted)] text-[12px] text-center py-4">No roles defined.</p>`;
    return;
  }
  el.innerHTML = appState.roles.map((role) => {
    const variants = resolveRolePreview(role, steps);
    return `<div class="space-y-1">
      <p class="text-[var(--text-muted)] text-[10px] font-bold tracking-wider uppercase mb-2">${esc(role.name)}</p>
      ${variants.map((v) => `
        <div class="role-specimen">
          <div style="font-family:'${esc(v.fontFamily)}';font-size:${Math.min(v.scaleStep.px, 80)}px;line-height:${lhToCss(v.lineHeight)};letter-spacing:${lsToCss(v.letterSpacing)};font-weight:${v.fontWeight};text-transform:${v.textTransform !== "none" ? v.textTransform : ""};" class="truncate whitespace-nowrap overflow-hidden">The quick brown fox jumps over the lazy dog</div>
          <div class="flex gap-2 mt-1">
            <span class="text-[10px] text-[var(--text-dim)]">${esc(v.variationName)}</span>
            <span class="text-[10px] text-[var(--text-dim)]">·</span>
            <span class="text-[10px] text-[var(--text-dim)]">${v.scaleStep.px}px</span>
            <span class="text-[10px] text-[var(--text-dim)]">·</span>
            <span class="text-[10px] text-[var(--accent)]">${esc(v.fontFamily)}</span>
          </div>
        </div>`).join("")}
    </div>`;
  }).join("");
}

let _currentExportFmt = "css";
let _exportTimer = null;

function scheduleExportRefresh() {
  clearTimeout(_exportTimer);
  _exportTimer = setTimeout(refreshExportIfVisible, 300);
}

function refreshExportIfVisible() {
  const panel = document.getElementById("tab-export");
  if (panel && !panel.classList.contains("hidden")) renderExportPanel();
}

function renderExportPanel() {
  const steps = computeScale(appState.scale, appState.baseFontSize);
  const roleStyles = buildAllRoleStyles(steps);
  let content = "";
  if (_currentExportFmt === "css") content = ExportFormatter.toCSS(steps, roleStyles);
  else if (_currentExportFmt === "scss") content = ExportFormatter.toSCSS(steps, roleStyles);
  else content = ExportFormatter.toJSON(steps, roleStyles);
  const el = document.getElementById("export-code");
  if (el) el.textContent = content;
}

function renderSettingsForm() {
  safeSet("setting-name", appState.name);
  safeSet("setting-base-font", appState.baseFontSize);
  safeSet("setting-separator", appState.styleNameSeparator);
  syncToggle("toggle-useShortRoleNames", appState.useShortRoleNames);

  const slotList = document.getElementById("font-slots-list");
  if (slotList) {
    slotList.innerHTML = appState.fonts.map((f, i) => `
      <div class="flex gap-1.5 items-center">
        <input type="text" class="w-[72px] h-[32px] bg-[var(--bg-input)] border border-[var(--border)] rounded-[7px] p-2 text-[11px] outline-none focus:border-[var(--border-focus)]"
          placeholder="slot" value="${esc(f.slot)}" data-fi="${i}" data-ff="slot" />
        <input type="text" class="flex-1 h-[32px] bg-[var(--bg-input)] border border-[var(--border)] rounded-[7px] p-2 text-[12px] outline-none focus:border-[var(--border-focus)]"
          placeholder="Font family" value="${esc(f.family)}" data-fi="${i}" data-ff="family" />
        <input type="text" class="w-[72px] h-[32px] bg-[var(--bg-input)] border border-[var(--border)] rounded-[7px] p-2 text-[11px] outline-none focus:border-[var(--border-focus)]"
          placeholder="fallback" value="${esc(f.fallback || "")}" data-fi="${i}" data-ff="fallback" />
        <button class="text-[var(--danger)] p-1.5 hover:bg-[var(--danger)]/10 rounded flex-shrink-0" onclick="deleteFontSlot(${i})">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>`).join("");
    slotList.querySelectorAll("[data-ff]").forEach((el) =>
      el.addEventListener("input", (e) => {
        appState.fonts[parseInt(e.target.dataset.fi)][e.target.dataset.ff] = e.target.value;
        renderRolesList(); renderPreviewScale(); renderPreviewRoles();
        scheduleSave(); scheduleExportRefresh();
      })
    );
  }

  const wHeader = document.getElementById("font-weights-header");
  const wList = document.getElementById("font-weights-list");
  if (wHeader && wList) {
    const slotHeaders = appState.fonts.map((f) => `<span class="text-[11px] text-[var(--text-dim)] ml-1 flex-1">${esc(f.slot)}</span>`).join("");
    wHeader.innerHTML = `<span class="text-[11px] text-[var(--text-dim)] ml-1 w-[80px]">Alias</span>` +
      `<span class="text-[11px] text-[var(--text-dim)] ml-1 w-12">Value</span>` +
      slotHeaders + `<span class="w-7"></span>`;
    wList.innerHTML = appState.fontWeights.map((w, i) => {
      const slotInputs = appState.fonts.map((f) => {
        const val = (w.figmaStyles && w.figmaStyles[f.slot]) || w.figmaStyle || w.alias;
        return `<input type="text" class="flex-1 h-[32px] bg-[var(--bg-input)] border border-[var(--border)] rounded-[7px] p-2 text-[11px] outline-none focus:border-[var(--border-focus)]"
          placeholder="${esc(w.alias)}" value="${esc(val)}" data-wi="${i}" data-wf="figmaStyles" data-slot="${esc(f.slot)}" />`;
      }).join("");
      return `<div class="flex gap-1.5 items-center">
        <input type="text"   class="w-[80px] h-[32px] bg-[var(--bg-input)] border border-[var(--border)] rounded-[7px] p-2 text-[12px] outline-none focus:border-[var(--border-focus)]" value="${esc(w.alias)}" data-wi="${i}" data-wf="alias" />
        <input type="number" class="w-12    h-[32px] bg-[var(--bg-input)] border border-[var(--border)] rounded-[7px] p-2 text-[11px] outline-none focus:border-[var(--border-focus)]" value="${w.value}" data-wi="${i}" data-wf="value" />
        ${slotInputs}
        <button class="text-[var(--danger)] p-1.5 hover:bg-[var(--danger)]/10 rounded flex-shrink-0 w-7" onclick="deleteFontWeight(${i})">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>`;
    }).join("");
    wList.querySelectorAll("[data-wf]").forEach((el) =>
      el.addEventListener("input", (e) => {
        const wi = parseInt(e.target.dataset.wi), wf = e.target.dataset.wf;
        if (wf === "value") appState.fontWeights[wi].value = parseInt(e.target.value) || 400;
        else if (wf === "figmaStyles") {
          if (!appState.fontWeights[wi].figmaStyles) appState.fontWeights[wi].figmaStyles = {};
          appState.fontWeights[wi].figmaStyles[e.target.dataset.slot] = e.target.value;
        } else { appState.fontWeights[wi][wf] = e.target.value; }
        scheduleSave(); scheduleExportRefresh();
      })
    );
  }
}

function renderStyleNamePreview() {
  const el = document.getElementById("style-name-preview");
  if (!el) return;
  const sep = appState.styleNameSeparator || "/";
  const role = appState.roles[0];
  if (!role) { el.textContent = "— (add a role to preview)"; return; }
  const roleName = appState.useShortRoleNames ? (role.shortName || role.name) : role.name;
  const varName = (role.variationNames && role.variationNames[0]) || "1";
  const weightAlias = (appState.fontWeights[0] || {}).alias || "Regular";
  el.textContent = `${roleName}${sep}${varName}${sep}${weightAlias}`;
}

// ── 5. MUTATIONS ──────────────────────────────────────────────────────────────

function autoVariationNames(shortName, count) {
  if (!shortName) return [];
  return Array.from({ length: count }, (_, i) => `${shortName}${i + 1}`);
}

function addRole() {
  const steps = computeScale(appState.scale, appState.baseFontSize);
  const idx = appState.roles.length + 1;
  const shortName = `r${idx}`;
  const variationCount = 3;
  appState.roles.push({
    name: `Role ${idx}`, shortName, variationCount,
    variationNames: autoVariationNames(shortName, variationCount),
    baseScaleIndex: Math.max(0, steps.length - 1),
    scaleDirection: "descending",
    fontSlot: appState.fonts[0] ? appState.fonts[0].slot : "primary",
    fontWeightAlias: (appState.fontWeights[0] || {}).alias || "Regular",
    lineHeight: { unit: "PERCENT", value: 150 },
    letterSpacing: { unit: "PERCENT", value: 0 },
    textTransform: "none",
    variationOverrides: [],
  });
  renderRolesList(); renderPreviewRoles(); renderStyleNamePreview();
  scheduleExportRefresh(); scheduleSave();
}

function deleteRole(idx) {
  appState.roles.splice(idx, 1);
  renderRolesList(); renderPreviewRoles(); renderStyleNamePreview();
  scheduleExportRefresh(); scheduleSave();
}

function deleteFontWeight(idx) {
  appState.fontWeights.splice(idx, 1);
  renderSettingsForm(); scheduleExportRefresh(); scheduleSave();
}

function deleteFontSlot(idx) {
  if (appState.fonts.length <= 1) return;
  const removedSlot = appState.fonts[idx] ? appState.fonts[idx].slot : null;
  appState.fonts.splice(idx, 1);
  if (removedSlot) {
    const firstSlot = appState.fonts[0] ? appState.fonts[0].slot : "primary";
    appState.roles.forEach((r) => { if (r.fontSlot === removedSlot) r.fontSlot = firstSlot; });
  }
  renderSettingsForm(); renderRolesList(); renderPreviewRoles(); scheduleSave();
}

function addFontSlot() {
  const n = appState.fonts.length + 1;
  appState.fonts.push({ slot: `font${n}`, family: "", fallback: "sans-serif" });
  renderSettingsForm(); scheduleSave();
}

function toggleRoleCard(idx) {
  const card = document.querySelector(`.role-card[data-idx="${idx}"]`);
  if (card) card.classList.toggle("collapsed");
}

function toggleBoolSetting(key) {
  appState[key] = !appState[key];
  syncToggle(`toggle-${key}`, appState[key]);
  scheduleSave();
}

// ── 6. UI UTILITIES ───────────────────────────────────────────────────────────

function switchSidebarTab(name) {
  document.querySelectorAll(".sidebar-tab-btn").forEach((b) => b.classList.toggle("active", b.dataset.tab === name));
  document.querySelectorAll(".tab-content").forEach((el) => el.classList.toggle("hidden", el.id !== `tab-${name}`));
}

function switchRightTab(id) {
  document.querySelectorAll(".right-tab-btn").forEach((b) => b.classList.toggle("active", b.dataset.rtab === id));
  document.querySelectorAll(".right-tab-content").forEach((el) => el.classList.toggle("hidden", el.id !== id));
  if (id === "tab-export") renderExportPanel();
}

function switchPreviewTab(panelId) {
  document.querySelectorAll("[data-ptab]").forEach((b) => b.classList.toggle("active", b.dataset.ptab === panelId));
  document.querySelectorAll(".preview-panel").forEach((el) => el.classList.toggle("active", el.id === panelId));
}

function showSheet(id) {
  document.getElementById("overlay").classList.add("active");
  document.getElementById(id).classList.add("open");
}
function hideSheet(id) {
  document.getElementById("overlay").classList.remove("active");
  document.getElementById(id).classList.remove("open");
}
function hideOverlay(id) {
  document.getElementById("overlay").classList.remove("active");
  const el = document.getElementById(id);
  if (el) { el.classList.add("hidden"); el.classList.remove("active"); }
}

function syncScaleUI() {
  document.querySelectorAll(".scale-method-btn").forEach((b) => b.classList.toggle("active", b.dataset.method === appState.scale.method));
  document.getElementById("modular-controls").classList.toggle("hidden", appState.scale.method !== "Modular");
  document.getElementById("linear-controls").classList.toggle("hidden", appState.scale.method !== "Linear");
  document.getElementById("custom-controls").classList.toggle("hidden", appState.scale.method !== "Custom");
  document.querySelectorAll(".naming-btn").forEach((b) => b.classList.toggle("active", b.dataset.naming === appState.scale.namingScheme));
  document.getElementById("custom-names-row").classList.toggle("hidden", appState.scale.namingScheme !== "custom");
  safeSet("scale-seed", appState.scale.seedSize);
  safeSet("scale-steps", appState.scale.steps);
  safeSet("scale-steps-linear", appState.scale.steps);
  safeSet("scale-min", appState.scale.minSize);
  safeSet("scale-max", appState.scale.maxSize);
  safeSet("scale-custom-names", (appState.scale.customStepNames || []).join(", "));
  const rEl = document.getElementById("scale-ratio");
  if (rEl) rEl.value = String(appState.scale.ratio);
  const cEl = document.getElementById("scale-custom");
  if (cEl) cEl.value = (appState.scale.customValues || []).join(", ");
}

function safeSet(id, val) {
  const el = document.getElementById(id);
  if (el && val != null) el.value = String(val);
}
function esc(s) {
  return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
function escRegex(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
function syncToggle(id, val) {
  const el = document.getElementById(id);
  if (el) el.classList.toggle("on", !!val);
}
function dlFile(content, name) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([content], { type: "text/plain" }));
  a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
function wireInput(id, field, parser) {
  const el = document.getElementById(id);
  if (!el) return;
  el.addEventListener("input", () => {
    appState.scale[field] = parser ? parser(el.value) : el.value;
    renderScalePreviewBar(); renderPreviewScale(); renderPreviewRoles();
    scheduleExportRefresh(); scheduleSave();
  });
}

// ── 7. INIT ───────────────────────────────────────────────────────────────────

(function init() {
  loadFromStorage();

  let _pendingImport = null;

  // Tabs
  document.querySelectorAll(".sidebar-tab-btn").forEach((b) =>
    b.addEventListener("click", () => switchSidebarTab(b.dataset.tab)));
  document.querySelectorAll(".right-tab-btn").forEach((b) =>
    b.addEventListener("click", () => switchRightTab(b.dataset.rtab)));
  document.querySelectorAll("[data-ptab]").forEach((b) =>
    b.addEventListener("click", () => switchPreviewTab(b.dataset.ptab)));

  // Scale method + naming
  document.querySelectorAll(".scale-method-btn").forEach((b) =>
    b.addEventListener("click", () => {
      appState.scale.method = b.dataset.method;
      syncScaleUI(); renderScalePreviewBar(); renderPreviewScale(); renderPreviewRoles();
      scheduleSave(); scheduleExportRefresh();
    }));
  document.querySelectorAll(".naming-btn").forEach((b) =>
    b.addEventListener("click", () => {
      appState.scale.namingScheme = b.dataset.naming;
      syncScaleUI(); renderScalePreviewBar(); renderRolesList(); renderPreviewScale();
      scheduleExportRefresh(); scheduleSave();
    }));

  wireInput("scale-seed", "seedSize", parseFloat);
  wireInput("scale-steps", "steps", (v) => Math.max(1, parseInt(v) || 1));
  wireInput("scale-steps-linear", "steps", (v) => Math.max(1, parseInt(v) || 1));
  wireInput("scale-min", "minSize", parseFloat);
  wireInput("scale-max", "maxSize", parseFloat);
  wireInput("scale-custom-names", "customStepNames", (v) => v.split(",").map((s) => s.trim()).filter(Boolean));

  document.getElementById("scale-ratio").addEventListener("change", (e) => {
    appState.scale.ratio = parseFloat(e.target.value);
    appState.scale.ratioName = e.target.options[e.target.selectedIndex].text.split("—")[0].trim();
    renderScalePreviewBar(); renderPreviewScale(); renderPreviewRoles();
    scheduleExportRefresh(); scheduleSave();
  });

  document.getElementById("scale-custom").addEventListener("input", (e) => {
    appState.scale.customValues = e.target.value.split(",").map((s) => parseFloat(s.trim())).filter((v) => !isNaN(v) && v > 0);
    appState.scale.steps = appState.scale.customValues.length || 1;
    renderScalePreviewBar(); renderPreviewScale();
    scheduleExportRefresh(); scheduleSave();
  });

  document.getElementById("btn-add-role").addEventListener("click", addRole);

  // Settings
  document.getElementById("btn-settings").addEventListener("click", () => {
    renderSettingsForm(); showSheet("settings-sheet");
  });
  document.getElementById("close-settings").addEventListener("click", () => hideSheet("settings-sheet"));
  document.getElementById("overlay").addEventListener("click", () => hideSheet("settings-sheet"));

  document.getElementById("setting-name").addEventListener("input", (e) => {
    appState.name = e.target.value; scheduleSave(); scheduleExportRefresh();
  });
  document.getElementById("setting-base-font").addEventListener("input", (e) => {
    appState.baseFontSize = parseFloat(e.target.value) || 16;
    renderScalePreviewBar(); renderPreviewScale(); scheduleSave(); scheduleExportRefresh();
  });
  document.getElementById("setting-separator").addEventListener("input", (e) => {
    appState.styleNameSeparator = e.target.value || "/";
    renderStyleNamePreview(); scheduleExportRefresh(); scheduleSave();
  });
  document.getElementById("btn-add-weight").addEventListener("click", () => {
    appState.fontWeights.push({ alias: "New", value: 400, figmaStyles: {} });
    renderSettingsForm(); scheduleSave(); scheduleExportRefresh();
  });
  document.getElementById("btn-clear").addEventListener("click", () => {
    if (!confirm("Reset all settings to defaults?")) return;
    appState = JSON.parse(JSON.stringify(DEFAULT_STATE));
    hideSheet("settings-sheet");
    syncScaleUI(); renderAll(); saveToStorage();
  });

  // Export panel
  document.querySelectorAll(".export-fmt-btn").forEach((b) =>
    b.addEventListener("click", () => {
      _currentExportFmt = b.dataset.fmt;
      document.querySelectorAll(".export-fmt-btn").forEach((x) => x.classList.toggle("active", x.dataset.fmt === _currentExportFmt));
      renderExportPanel();
    }));
  document.getElementById("btn-copy-export").addEventListener("click", () => {
    const el = document.getElementById("export-code");
    if (!el) return;
    navigator.clipboard.writeText(el.textContent).then(() => {
      const btn = document.getElementById("btn-copy-export");
      const orig = btn.innerHTML;
      btn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> Copied!`;
      setTimeout(() => { btn.innerHTML = orig; }, 1800);
    });
  });
  document.getElementById("btn-download-export").addEventListener("click", () => {
    const el = document.getElementById("export-code");
    if (!el) return;
    const name = `${appState.name || "ttm316"}-tokens.${_currentExportFmt}`;
    dlFile(el.textContent, name);
  });

  // Import
  document.getElementById("btn-import").addEventListener("click", () => document.getElementById("file-input").click());
  document.getElementById("file-input").addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        _pendingImport = JSON.parse(ev.target.result);
        document.getElementById("confirm-import-overlay").classList.remove("hidden");
        document.getElementById("overlay").classList.add("active");
      } catch (_) { alert("Invalid JSON file."); }
    };
    reader.readAsText(file);
    e.target.value = "";
  });
  document.getElementById("btn-import-confirm").addEventListener("click", () => {
    if (_pendingImport) {
      const data = _pendingImport.config || _pendingImport;
      Object.assign(appState, data);
      if (!appState.scale.scaleOverrides) appState.scale.scaleOverrides = {};
      _pendingImport = null;
      hideOverlay("confirm-import-overlay");
      syncScaleUI(); renderAll(); saveToStorage();
    }
  });

  // Drag & drop
  document.addEventListener("dragenter", (e) => {
    e.preventDefault();
    document.getElementById("drop-overlay").classList.add("active");
  });
  document.addEventListener("dragleave", (e) => {
    if (!e.relatedTarget || !document.contains(e.relatedTarget))
      document.getElementById("drop-overlay").classList.remove("active");
  });
  document.addEventListener("dragover", (e) => e.preventDefault());
  document.addEventListener("drop", (e) => {
    e.preventDefault();
    document.getElementById("drop-overlay").classList.remove("active");
    const file = e.dataTransfer.files[0];
    if (!file || !file.name.endsWith(".json")) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        _pendingImport = JSON.parse(ev.target.result);
        document.getElementById("confirm-import-overlay").classList.remove("hidden");
        document.getElementById("overlay").classList.add("active");
      } catch (_) { alert("Invalid JSON file."); }
    };
    reader.readAsText(file);
  });

  // Light/dark toggle
  document.getElementById("btn-light-toggle").addEventListener("click", () => {
    document.body.classList.toggle("app-light-mode");
    const isLight = document.body.classList.contains("app-light-mode");
    document.getElementById("icon-sun").classList.toggle("hidden", isLight);
    document.getElementById("icon-moon").classList.toggle("hidden", !isLight);
  });

  // Initial active state for export format buttons
  document.querySelector(`.export-fmt-btn[data-fmt="css"]`).classList.add("active");

  // Bootstrap
  syncScaleUI();
  renderAll();
})();
