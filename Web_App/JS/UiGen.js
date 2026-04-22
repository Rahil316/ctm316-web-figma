// UiGen.js - UI rendering and interaction layer.
// Builds the sidebar controls and main token display; delegates data work to ClrGen/DocGen.

window.currentEditableScheme = null;

function getOptimalTextColor(bg) {
  const b = normalizeHex(bg) || "#000000";
  return contrastRatio(b, "#000000") > contrastRatio(b, "#FFFFFF") ? "black" : "white";
}

// ─── Display Functions ────────────────────────────────────────────────────────

function filterErrorsByTheme(errors, theme) {
  if (!errors) return null;
  const filtered = {
    critical: errors.critical?.filter((e) => e.theme === theme) || [],
    warnings: errors.warnings?.filter((e) => e.theme === theme) || [],
    notices:  errors.notices?.filter((e) => e.theme === theme) || [],
  };
  if (filtered.critical.length > 0 || filtered.warnings.length > 0 || filtered.notices.length > 0) return filtered;
  return null;
}

function displayColorTokens(collection) {
  const container = document.getElementById("rawColorsContainer");
  container.classList.add("color-system-updating");
  const fragment = document.createDocumentFragment();

  const rawPanel = document.createElement("div");
  rawPanel.id = "panel-colorRamps";
  rawPanel.classList.add("tab-panel");
  rawPanel.appendChild(createRawSection(collection.colorRamps));

  const lightPanel = document.createElement("div");
  lightPanel.id = "panel-tokens-light";
  lightPanel.classList.add("tab-panel");
  const lightErrors = filterErrorsByTheme(collection.errors, "light");
  if (lightErrors) lightPanel.appendChild(createErrorSection(lightErrors));
  lightPanel.appendChild(createThemeSection(collection.colorTokens.light, "light"));

  const darkPanel = document.createElement("div");
  darkPanel.id = "panel-tokens-dark";
  darkPanel.classList.add("tab-panel");
  const darkErrors = filterErrorsByTheme(collection.errors, "dark");
  if (darkErrors) darkPanel.appendChild(createErrorSection(darkErrors));
  darkPanel.appendChild(createThemeSection(collection.colorTokens.dark, "dark"));

  const activeTabBtn = document.querySelector(".tab-btn.active");
  const activeTargetId = activeTabBtn ? activeTabBtn.dataset.target : "panel-colorRamps";
  if (activeTargetId === "panel-colorRamps") rawPanel.classList.add("active");
  if (activeTargetId === "panel-tokens-light") lightPanel.classList.add("active");
  if (activeTargetId === "panel-tokens-dark") darkPanel.classList.add("active");

  fragment.appendChild(rawPanel);
  fragment.appendChild(lightPanel);
  fragment.appendChild(darkPanel);
  container.innerHTML = "";
  container.appendChild(fragment);

  // Tab listener registered once; survives panel re-renders because the nav bar is not replaced.
  if (!window.tabListenersSet) {
    const tabsContainer = document.querySelector(".tabs-navigation");
    if (tabsContainer) {
      tabsContainer.addEventListener("click", (e) => {
        const btn = e.target.closest(".tab-btn");
        if (!btn) return;
        document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        const targetId = btn.dataset.target;
        document.querySelectorAll(".tab-panel").forEach((p) => {
          p.classList.remove("active", "animate-in");
        });
        const targetPanel = document.getElementById(targetId);
        if (targetPanel) {
          targetPanel.classList.add("active");
          void targetPanel.offsetWidth;
          targetPanel.classList.add("animate-in");
        }
      });
      window.tabListenersSet = true;
    }
  }

  requestAnimationFrame(() => container.classList.remove("color-system-updating"));
}

function createErrorSection(errors) {
  const createListHTML = (arr) =>
    arr.map((e) => {
      let ctxArray = [];
      if (e.color) ctxArray.push(`Group: <strong>${e.color.toUpperCase()}</strong>`);
      if (e.role) ctxArray.push(`Role: <strong>${e.role}</strong>`);
      if (e.variation) ctxArray.push(`Var: <strong>${e.variation}</strong>`);
      const prefixHTML = ctxArray.length
        ? `<span style="opacity:0.85;margin-right:8px;">[ ${ctxArray.join(" | ")} ]</span>`
        : "";
      return `<div class="px-2 py-1.5 bg-[var(--bg-card)] rounded-[8px] font-mono text-[10px] text-[var(--text-muted)] mb-1 last:mb-0">${prefixHTML}${e.error || e.warning || e.notice}</div>`;
    }).join("");

  const section = document.createElement("div");
  section.className = "bg-[rgba(245,158,11,0.08)] border border-[rgba(245,158,11,0.3)] mb-4 rounded-[10px] overflow-hidden";
  section.innerHTML = `
    <div class="errors-header px-3.5 py-2.5 cursor-pointer flex justify-between items-center transition-colors duration-150 hover:bg-[rgba(245,158,11,0.05)]">
      <h4 class="text-[var(--warning)] text-[12px] font-bold tracking-[0.5px]">⚠️ Warnings &amp; Errors</h4>
      <button class="errors-toggle collapsed bg-transparent border-none text-[12px] cursor-pointer text-[var(--warning)] transition-transform duration-200">&lt;</button>
    </div>
    <div class="errors-content custom-scrollbar">
      <div class="px-3.5 py-2 border-t border-[rgba(245,158,11,0.15)]">
        <div class="text-[var(--warning)] text-[11px] font-bold mb-1.5 uppercase tracking-[0.5px]">Critical (${errors.critical?.length || 0})</div>
        ${createListHTML(errors.critical || [])}
      </div>
      <div class="px-3.5 py-2 border-t border-[rgba(245,158,11,0.15)]">
        <div class="text-[var(--warning)] text-[11px] font-bold mb-1.5 uppercase tracking-[0.5px]">Warnings (${errors.warnings?.length || 0})</div>
        ${createListHTML(errors.warnings || [])}
      </div>
      <div class="px-3.5 py-2 border-t border-[rgba(245,158,11,0.15)]">
        <div class="text-[var(--warning)] text-[11px] font-bold mb-1.5 uppercase tracking-[0.5px]">Notices (${errors.notices?.length || 0})</div>
        ${createListHTML(errors.notices || [])}
      </div>
    </div>
  `;

  const header  = section.querySelector(".errors-header");
  const content = section.querySelector(".errors-content");
  const toggle  = section.querySelector(".errors-toggle");
  header.addEventListener("click", () => {
    const isCollapsed = toggle.classList.contains("collapsed");
    toggle.classList.toggle("collapsed", !isCollapsed);
    content.classList.toggle("expanded", isCollapsed);
  });
  return section;
}

function createRawSection(colorRamps) {
  const rawHTML = Object.entries(colorRamps).map(([colorGroup, weights]) => {
    const swatchesHTML = Object.entries(weights).map(([, data]) => {
      if (!data?.value) return "";
      const colorValue = normalizeHex(data.value) || "#000000";
      const textColor  = getOptimalTextColor(colorValue);
      return `
        <div class="rounded-[8px] p-3 min-h-[110px] flex items-end relative shadow-[0_2px_4px_rgba(0,0,0,0.3)] transition-[transform,box-shadow] duration-200 cursor-pointer hover:-translate-y-0.5 hover:shadow-[0_6px_12px_rgba(0,0,0,0.4)] break-inside-avoid"
             style="background-color:${colorValue};color:${textColor}">
          <div class="flex flex-col gap-1.5 w-full">
            <div class="font-mono text-[11px] font-semibold bg-black/25 rounded-[6px] px-2 py-1 cursor-pointer hover:bg-black/40 transition-colors duration-150 w-fit"
                 data-tooltip="Click to copy hex" data-copy="${colorValue}">
              ${colorValue}
            </div>
            <div class="text-[13px] font-semibold cursor-pointer"
                 data-tooltip="Click to copy name" data-copy="${data.stepName}">
              ${data.stepName} (${data.shortName})
            </div>
            <div class="flex gap-1 flex-wrap">
              <div class="flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-white/90 text-[#212529] border border-black/10">
                <span class="text-[10px] leading-none flex-shrink-0">☀️</span>
                <span class="text-[10px] font-semibold leading-none whitespace-nowrap">${(data.contrast.light.ratio || 0).toFixed(2)} - ${data.contrast.light.rating}</span>
              </div>
              <div class="flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-black/70 text-[#f8f9fa] border border-white/10">
                <span class="text-[10px] leading-none flex-shrink-0">🌙</span>
                <span class="text-[10px] font-semibold leading-none whitespace-nowrap">${(data.contrast.dark.ratio || 0).toFixed(2)} - ${data.contrast.dark.rating}</span>
              </div>
            </div>
          </div>
        </div>`;
    }).join("");
    return `
      <div class="mb-6">
        <h3 class="text-[11px] font-bold tracking-[0.8px] text-[var(--text-muted)] uppercase mb-2.5">${colorGroup.toUpperCase()}</h3>
        <div class="grid gap-2" style="grid-template-columns:repeat(auto-fill,minmax(200px,1fr))">${swatchesHTML}</div>
      </div>`;
  }).join("");

  const section = document.createElement("div");
  section.className = "bg-[var(--bg-card)] border border-[var(--border)] mb-4 p-4 rounded-[10px]";
  section.innerHTML = rawHTML;
  return section;
}

function createThemeSection(colorTokens, theme) {
  const themeName = theme.charAt(0).toUpperCase() + theme.slice(1);
  const isDark    = theme === "dark";
  const pillClass = isDark
    ? "flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-black/70 text-[#f8f9fa] border border-white/10"
    : "flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-white/90 text-[#212529] border border-black/10";
  const pillIcon  = isDark ? "🌙" : "☀️";

  const contextualHTML = Object.entries(colorTokens).map(([colorGroup, roles]) => {
    if (!roles || Object.keys(roles).length === 0) {
      return `<div class="${isDark ? "bg-black" : "bg-[var(--bg-card)]"} p-4 rounded-[10px] border border-[var(--border)] mb-4"><h4 class="text-[11px] font-bold tracking-[0.8px] uppercase mb-3 ${isDark ? "text-[#888]" : "text-[var(--text-muted)]"}">${colorGroup}</h4><p>No roles generated</p></div>`;
    }

    const rolesHTML = Object.entries(roles).map(([role, variations]) => {
      if (!variations || Object.keys(variations).length === 0) return "";
      const variationsHTML = Object.entries(variations).map(([, data]) => {
        if (!data?.value) return "";
        const colorValue = normalizeHex(data.value);
        const textColor  = getOptimalTextColor(colorValue);
        return `
          <div class="rounded-[8px] p-3 min-h-[100px] flex items-end relative shadow-[0_2px_4px_rgba(0,0,0,0.3)] transition-[transform,box-shadow] duration-200 cursor-pointer hover:-translate-y-0.5 hover:shadow-[0_6px_12px_rgba(0,0,0,0.4)] border border-white/5 break-inside-avoid"
               style="background-color:${colorValue};color:${textColor}">
            <div class="flex flex-col gap-1 w-full text-[11px] leading-snug">
              <div class="font-mono text-[11px] font-semibold bg-black/25 rounded-[4px] px-1.5 py-0.5 cursor-pointer hover:bg-black/40 transition-colors duration-150 w-fit"
                   data-tooltip="Click to copy hex" data-copy="${colorValue}">
                ${colorValue}
              </div>
              <div class="font-semibold text-[12px] cursor-pointer"
                   data-tooltip="Click to copy name" data-copy="${data.tknName}">
                ${data.tknName}
              </div>
              <div class="font-mono text-[9px] opacity-60">Ref: ${data.tknRef}</div>
              <div class="flex gap-1 flex-wrap">
                <div class="${pillClass}">
                  <span class="text-[10px] leading-none flex-shrink-0">${pillIcon}</span>
                  <span class="text-[10px] font-semibold leading-none whitespace-nowrap">${(data.contrast.ratio || 0).toFixed(2)} - ${data.contrast.rating}</span>
                </div>
              </div>
              ${data.isAdjusted ? `<div class="text-[var(--warning)] font-bold text-[9px] tracking-[0.5px] uppercase">Adjusted</div>` : ""}
            </div>
          </div>`;
      }).join("");

      const firstVar       = Object.values(variations)[0];
      const displayRoleName = firstVar?.role || role;
      return variationsHTML
        ? `<div class="mb-4">
             <h5 class="text-[10px] font-semibold tracking-[0.6px] ${isDark ? "text-[#666]" : "text-[var(--text-dim)]"} uppercase mb-2">${displayRoleName}</h5>
             <div class="grid gap-2" style="grid-template-columns:repeat(auto-fill,minmax(180px,1fr))">${variationsHTML}</div>
           </div>`
        : "";
    }).join("");

    return rolesHTML
      ? `<div class="${isDark ? "bg-black" : "bg-[var(--bg-card)]"} p-4 rounded-[10px] border border-[var(--border)] mb-4">
           <h4 class="text-[11px] font-bold tracking-[0.8px] uppercase mb-3 ${isDark ? "text-[#888]" : "text-[var(--text-muted)]"}">${colorGroup.toUpperCase()}</h4>
           ${rolesHTML}
         </div>`
      : "";
  }).join("");

  const section = document.createElement("div");
  section.innerHTML = `
    <h4 class="text-[11px] font-bold tracking-[0.8px] text-[var(--text-muted)] uppercase mb-3">${themeName} Theme — Contextual Tokens</h4>
    ${contextualHTML}`;
  return section;
}

// ─── Control Panel Functions ──────────────────────────────────────────────────

function createColorInputs(colorScheme, onUpdate) {
  const targetContainer = document.getElementById("colorInputs");
  if (!targetContainer) return;
  targetContainer.innerHTML = "";

  const basicSection = createSection("Basic Settings");
  basicSection.appendChild(createInput("name", "System Name", colorScheme.name));
  basicSection.appendChild(createInput("colorSteps", "Weight Count", colorScheme.colorSteps, "number"));
  basicSection.appendChild(createInput("rampType", "Ramp Generation Mode", colorScheme.rampType || "Balanced", "select", rampTypes));
  basicSection.appendChild(createInput("roleMapping", "Role Mapping Method", colorScheme.roleMapping || "Contrast Based", "select", roleMappingMethods));
  basicSection.appendChild(createColorInput("themes.0.bg", "Light Theme Background", colorScheme.themes[0].bg || "FFFFFF"));
  basicSection.appendChild(createColorInput("themes.1.bg", "Dark Theme Background", colorScheme.themes[1].bg || "000000"));
  targetContainer.appendChild(basicSection);
  targetContainer.appendChild(createColorGroupsSection(colorScheme));
  targetContainer.appendChild(createRolesSection(colorScheme, onUpdate));

  // Delegated listener registered once on the container; 350 ms debounce batches rapid input.
  if (!targetContainer.dataset.hasListener) {
    let updateTimeout;
    ["input", "change"].forEach((evtType) => {
      targetContainer.addEventListener(evtType, (e) => {
        const target = e.target;
        const path   = target.dataset.path;
        if (!path) return;
        const pathParts = path.split(".");
        const rawVal    = target.value;
        const type      = target.type;
        if (updateTimeout) clearTimeout(updateTimeout);
        updateTimeout = setTimeout(() => {
          const activeScheme = window.currentEditableScheme;
          if (!activeScheme) return;
          if (type === "text" && target.classList.contains("color-text")) {
            const normalized = normalizeHex(rawVal);
            if (!normalized) return;
            updateColorScheme(activeScheme, pathParts, normalized.replace("#", ""));
          } else if (type === "number") {
            const n = rawVal === "" ? 0 : Number(rawVal);
            updateColorScheme(activeScheme, pathParts, Number.isFinite(n) ? n : 0);
          } else if (type === "color") {
            updateColorScheme(activeScheme, pathParts, rawVal.replace("#", ""));
          } else {
            updateColorScheme(activeScheme, pathParts, rawVal);
          }
          if (typeof onUpdate === "function") onUpdate(activeScheme);
        }, 350);
      });
    });
    targetContainer.dataset.hasListener = "true";
  }

  // Role mapping needs its own direct listener because switching modes rebuilds the entire sidebar,
  // which must happen before onUpdate re-renders tokens.
  const roleMappingSelect = targetContainer.querySelector('[data-path="roleMapping"]');
  if (roleMappingSelect) {
    roleMappingSelect.removeEventListener("change", roleMappingSelect._handler);
    const handler = (e) => {
      const activeScheme = window.currentEditableScheme;
      if (activeScheme) {
        activeScheme.roleMapping = e.target.value;
        createColorInputs(activeScheme, onUpdate);
        if (typeof onUpdate === "function") onUpdate(activeScheme);
      }
    };
    roleMappingSelect.addEventListener("change", handler);
    roleMappingSelect._handler = handler;
  }
}

function createColorGroupsSection(colorScheme) {
  const colorsSection = createSection("Color Groups");
  const addButton = document.createElement("button");
  addButton.className = "w-full h-10 px-4 mb-2 bg-transparent text-[var(--accent)] border-2 border-dashed border-[var(--accent)] rounded-[10px] text-[13px] font-semibold cursor-pointer transition-colors duration-150 hover:bg-[rgba(24,160,251,0.1)]";
  addButton.textContent = "+ Add";
  addButton.addEventListener("click", () => {
    const newGroup = {
      name: `color${colorScheme.colors.length + 1}`,
      shortName: `C${colorScheme.colors.length + 1}`,
      value: "000000",
    };
    colorScheme.colors.push(newGroup);
    createColorInputs(colorScheme, (updated) => {
      window.currentEditableScheme = updated;
      displayColorTokens(variableMaker(updated));
    });
  });
  colorsSection.appendChild(addButton);
  colorScheme.colors.forEach((group, index) => {
    colorsSection.appendChild(createColorGroupInput(group, index, colorScheme));
  });
  return colorsSection;
}

function createColorGroupInput(group, index, colorScheme) {
  const div = document.createElement("div");
  div.className = "bg-[var(--bg-card)] rounded-[10px] border border-[var(--border)] p-3 flex flex-col gap-2 mb-2";
  div.innerHTML = `
    <div class="flex justify-between items-center">
      <input type="text"
        class="bg-transparent border border-transparent rounded-[8px] text-[14px] font-semibold text-[var(--text-primary)] px-1.5 py-0.5 w-full mr-2 transition-all duration-150 focus:outline-none hover:bg-[var(--bg-hover)] hover:border-[var(--border)] focus:bg-[var(--bg-input)] focus:border-[var(--border-focus)]"
        value="${group.name}" data-path="colors.${index}.name" placeholder="Group Name">
      <button class="delete-group-btn bg-[var(--danger-bg)] text-[var(--danger)] border border-[rgba(231,76,60,0.2)] rounded-[10px] w-8 h-8 flex items-center justify-center text-sm cursor-pointer flex-shrink-0 transition-colors duration-150 hover:bg-[rgba(231,76,60,0.2)]"
        data-index="${index}">×</button>
    </div>
    <div class="flex flex-col gap-1">
      <label class="text-[12px] font-medium text-[var(--text-muted)] ml-0.5">Short Name</label>
      <input type="text"
        class="h-10 w-full px-2 text-[13px] text-[var(--text-primary)] bg-[var(--bg-input)] border border-[var(--border)] rounded-[8px] transition-colors duration-150 focus:outline-none focus:border-[var(--border-focus)]"
        value="${group.shortName}" data-path="colors.${index}.shortName">
    </div>
    <div class="flex flex-col gap-1">
      <label class="text-[12px] font-medium text-[var(--text-muted)] ml-0.5">Color Value</label>
      <div class="grid grid-cols-[40px_1fr] gap-2">
        <input type="color" value="#${group.value}" data-path="colors.${index}.value"
          class="color-picker h-10 w-full p-0.5 bg-[var(--bg-input)] border border-[var(--border)] rounded-[8px] cursor-pointer focus:outline-none focus:border-[var(--border-focus)]">
        <input type="text" value="${group.value}" data-path="colors.${index}.value"
          class="color-text h-10 w-full px-2 text-[13px] text-[var(--text-primary)] bg-[var(--bg-input)] border border-[var(--border)] rounded-[8px] transition-colors duration-150 focus:outline-none focus:border-[var(--border-focus)]"
          placeholder="Hex color">
      </div>
    </div>
  `;
  setupColorInputSync(div);
  const deleteBtn = div.querySelector(".delete-group-btn");
  if (deleteBtn) {
    deleteBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const idx = parseInt(e.target.dataset.index);
      colorScheme.colors.splice(idx, 1);
      const updatedScheme = JSON.parse(JSON.stringify(colorScheme));
      window.currentEditableScheme = updatedScheme;
      createColorInputs(updatedScheme, (s) => {
        window.currentEditableScheme = s;
        displayColorTokens(variableMaker(s));
      });
      displayColorTokens(variableMaker(updatedScheme));
    });
  }
  return div;
}

function createColorInput(path, label, value) {
  const div = document.createElement("div");
  div.className = "flex flex-col gap-1";
  div.innerHTML = `
    <label class="text-[12px] font-medium text-[var(--text-muted)] ml-0.5">${label}</label>
    <div class="grid grid-cols-[40px_1fr] gap-2">
      <input type="color" value="#${value}" data-path="${path}"
        class="color-picker h-10 w-full p-0.5 bg-[var(--bg-input)] border border-[var(--border)] rounded-[8px] cursor-pointer focus:outline-none focus:border-[var(--border-focus)]">
      <input type="text" value="${value}" data-path="${path}"
        class="color-text h-10 w-full px-2 text-[13px] text-[var(--text-primary)] bg-[var(--bg-input)] border border-[var(--border)] rounded-[8px] transition-colors duration-150 focus:outline-none focus:border-[var(--border-focus)]"
        placeholder="${label}">
    </div>
  `;
  setupColorInputSync(div);
  return div;
}

function setupColorInputSync(container) {
  const colorPicker = container.querySelector(".color-picker");
  const colorText   = container.querySelector(".color-text");
  if (colorPicker && colorText) {
    colorPicker.addEventListener("input", (e) => {
      colorText.value = e.target.value.replace("#", "").toUpperCase();
    });
    colorText.addEventListener("input", (e) => {
      const hex = e.target.value.replace("#", "").toUpperCase();
      if (/^[0-9A-F]{6}$/.test(hex)) colorPicker.value = "#" + hex;
    });
  }
}

function createRolesSection(colorScheme, onUpdate) {
  const rolesSection = createSection("Roles Configuration");
  const addButton    = document.createElement("button");
  addButton.className = "w-full h-10 px-4 mb-2 bg-transparent text-[var(--accent)] border-2 border-dashed border-[var(--accent)] rounded-[10px] text-[13px] font-semibold cursor-pointer transition-colors duration-150 hover:bg-[rgba(24,160,251,0.1)]";
  addButton.textContent = "+ Add Role";
  addButton.addEventListener("click", () => {
    const roleId = `role${Object.keys(colorScheme.roles).length + 1}`;
    colorScheme.roles[roleId] = {
      name: "New Role",
      shortName: "nr",
      minContrast: 4.5,
      spread: 2,
      baseIndex: Math.floor(colorScheme.colorSteps / 2),
    };
    createColorInputs(colorScheme, (updated) => {
      window.currentEditableScheme = updated;
      displayColorTokens(variableMaker(updated));
    });
  });
  rolesSection.appendChild(addButton);

  const isManualMode = colorScheme.roleMapping === "Manual Base Index";
  const rampLength   = colorScheme.colorSteps;

  for (const [roleKey, role] of Object.entries(colorScheme.roles)) {
    const roleDiv    = document.createElement("div");
    const roleInputs = document.createElement("div");
    roleInputs.className = "grid grid-cols-[1fr_0.5fr_0.5fr] items-end gap-2";
    roleDiv.className = "bg-[var(--bg-card)] rounded-[10px] border border-[var(--border)] p-3 mb-2 flex flex-col gap-2";
    roleDiv.innerHTML = `
      <div class="flex justify-between items-center">
        <input type="text"
          class="bg-transparent border border-transparent rounded-[8px] text-[14px] font-semibold text-[var(--text-primary)] px-1.5 py-0.5 w-full mr-2 transition-all duration-150 focus:outline-none hover:bg-[var(--bg-hover)] hover:border-[var(--border)] focus:bg-[var(--bg-input)] focus:border-[var(--border-focus)]"
          value="${role.name}" data-path="roles.${roleKey}.name" placeholder="Role Name">
        <button class="delete-group-btn bg-[var(--danger-bg)] text-[var(--danger)] border border-[rgba(231,76,60,0.2)] rounded-[10px] w-8 h-8 flex items-center justify-center text-sm cursor-pointer flex-shrink-0 transition-colors duration-150 hover:bg-[rgba(231,76,60,0.2)]"
          data-role="${roleKey}">×</button>
      </div>
    `;

    const spreadInput    = createInput(`roles.${roleKey}.spread`, "Spread", role.spread, "number");
    const shortNameInput = createInput(`roles.${roleKey}.shortName`, "Short Name", role.shortName);
    roleInputs.appendChild(spreadInput);
    roleInputs.appendChild(shortNameInput);

    if (isManualMode) {
      const zeroBased  = role.baseIndex !== undefined ? role.baseIndex : Math.floor(rampLength / 2);
      const stepValue  = zeroBased + 1;
      const baseStepDiv = document.createElement("div");
      baseStepDiv.className = "flex flex-col gap-1";
      baseStepDiv.innerHTML = `
        <label class="text-[12px] font-medium text-[var(--text-muted)] ml-0.5">Base Step (1-${rampLength})</label>
        <input type="number" class="h-10 w-full px-2 text-[13px] text-[var(--text-primary)] bg-[var(--bg-input)] border border-[var(--border)] rounded-[8px] transition-colors duration-150 focus:outline-none focus:border-[var(--border-focus)]"
          value="${stepValue}" min="1" max="${rampLength}">
      `;
      const stepInput = baseStepDiv.querySelector("input");
      stepInput.addEventListener("change", (e) => {
        let newStep = parseInt(e.target.value);
        if (isNaN(newStep)) newStep = 1;
        newStep = Math.min(rampLength, Math.max(1, newStep));
        role.baseIndex = newStep - 1;
        e.target.value = newStep;
        if (typeof onUpdate === "function") onUpdate(colorScheme);
      });
      roleInputs.appendChild(baseStepDiv);
    } else {
      const minContrastInput = createInput(`roles.${roleKey}.minContrast`, "Min Contrast", role.minContrast, "number");
      roleInputs.appendChild(minContrastInput);
    }

    roleDiv.appendChild(roleInputs);

    const deleteBtn = roleDiv.querySelector(".delete-group-btn");
    if (deleteBtn) {
      deleteBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const rKey = e.target.dataset.role;
        delete colorScheme.roles[rKey];
        const updatedScheme = JSON.parse(JSON.stringify(colorScheme));
        window.currentEditableScheme = updatedScheme;
        createColorInputs(updatedScheme, (s) => {
          window.currentEditableScheme = s;
          displayColorTokens(variableMaker(s));
        });
        displayColorTokens(variableMaker(updatedScheme));
      });
    }
    rolesSection.appendChild(roleDiv);
  }
  return rolesSection;
}

function createSection(title) {
  const section = document.createElement("div");
  section.className = "py-1";

  const header = document.createElement("div");
  header.className = "flex justify-between items-center px-1 py-2 mb-1 rounded-[8px] cursor-pointer select-none transition-colors duration-150 hover:bg-[var(--bg-hover)]";
  header.innerHTML = `
    <h4 class="text-[12px] font-bold text-[var(--text-muted)] uppercase tracking-wide">${title}</h4>
    <button class="section-toggle-btn bg-transparent border-none text-[12px] text-[var(--text-dim)] cursor-pointer w-5 h-5 flex items-center justify-center transition-transform duration-200">▼</button>
  `;

  const content = document.createElement("div");
  content.className = "section-content";

  const inner = document.createElement("div");
  inner.className = "flex flex-col gap-2 pt-1";
  content.appendChild(inner);

  const toggleBtn = header.querySelector(".section-toggle-btn");
  header.addEventListener("click", () => {
    content.classList.toggle("collapsed");
    toggleBtn.style.transform = content.classList.contains("collapsed") ? "rotate(-90deg)" : "rotate(0deg)";
  });

  section.appendChild(header);
  section.appendChild(content);

  // Override appendChild so callers treat the section like a flat container —
  // child nodes are automatically routed into the collapsible inner div.
  const originalAppendChild = section.appendChild.bind(section);
  section.appendChild = function (node) {
    if (this.contains(content) && node !== header && node !== content) {
      return inner.appendChild(node);
    }
    return originalAppendChild(node);
  };
  return section;
}

function createInput(path, label, value, type = "text", options = []) {
  const div = document.createElement("div");
  div.className = "flex flex-col gap-1";
  const inputClass = "h-10 w-full px-2 text-[13px] text-[var(--text-primary)] bg-[var(--bg-input)] border border-[var(--border)] rounded-[8px] transition-colors duration-150 focus:outline-none focus:border-[var(--border-focus)]";
  if (type === "select") {
    div.innerHTML = `
      <label class="text-[12px] font-medium text-[var(--text-muted)] ml-0.5">${label}</label>
      <select class="${inputClass} appearance-none cursor-pointer" data-path="${path}">
        ${options.map((o) => `<option value="${o}" ${value === o ? "selected" : ""}>${o}</option>`).join("")}
      </select>`;
    return div;
  }
  div.innerHTML = `
    <label class="text-[12px] font-medium text-[var(--text-muted)] ml-0.5">${label}</label>
    <input type="${type}" class="${inputClass}" value="${value}" data-path="${path}" />`;
  return div;
}

// ─── Sidebar & Global Listeners ──────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", () => {
  const toggleSidebarBtn = document.getElementById("toggleSidebarBtn");
  const appContainer     = document.querySelector("app");
  if (toggleSidebarBtn && appContainer) {
    toggleSidebarBtn.addEventListener("click", () => appContainer.classList.toggle("sidebar-hidden"));
  }

  document.addEventListener("click", async (e) => {
    const copyTarget = e.target.closest("[data-copy]");
    if (!copyTarget) return;
    const value = copyTarget.getAttribute("data-copy");
    try {
      await navigator.clipboard.writeText(value);
      const originalTooltip = copyTarget.getAttribute("data-tooltip");
      copyTarget.setAttribute("data-tooltip", "Copied!");
      copyTarget.classList.add("copy-success");
      setTimeout(() => {
        copyTarget.setAttribute("data-tooltip", originalTooltip);
        copyTarget.classList.remove("copy-success");
      }, 1500);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  });

  // Drag-drop import
  const dropOverlay = document.getElementById("drop-overlay");
  if (dropOverlay) {
    window.addEventListener("dragenter", (e) => {
      if (e.dataTransfer?.types?.includes("Files")) {
        e.preventDefault();
        dropOverlay.classList.add("active");
      }
    });
    window.addEventListener("dragover", (e) => e.preventDefault());
    dropOverlay.addEventListener("dragleave", (e) => {
      if (!e.relatedTarget || e.relatedTarget === document.documentElement) {
        dropOverlay.classList.remove("active");
      }
    });
    dropOverlay.addEventListener("drop", (e) => {
      e.preventDefault();
      dropOverlay.classList.remove("active");
      const file = e.dataTransfer.files[0];
      if (file) handleDroppedFile(file);
    });
  }

  const dialog = document.getElementById("import-confirm-dialog");
  if (dialog) {
    document.getElementById("import-dialog-overwrite").addEventListener("click", () => {
      if (_pendingImport) { applyImportedScheme(_pendingImport); _pendingImport = null; }
      dialog.close();
    });
    document.getElementById("import-dialog-cancel").addEventListener("click", () => {
      _pendingImport = null;
      dialog.close();
    });
  }
});

// ─── Scheme Helpers ───────────────────────────────────────────────────────────

function updateColorScheme(colorScheme, pathParts, value) {
  if (!colorScheme || !pathParts || pathParts.length === 0) return;
  let current = colorScheme;
  for (let i = 0; i < pathParts.length - 1; i++) {
    const key = pathParts[i];
    if (Array.isArray(current) && !isNaN(parseInt(key))) {
      current = current[parseInt(key)];
    } else if (current && typeof current === "object") {
      if (!(key in current)) current[key] = {};
      current = current[key];
    } else {
      console.error(`Cannot navigate to ${key} in path ${pathParts.join(".")}`);
      return;
    }
  }
  const lastKey = pathParts[pathParts.length - 1];
  if (Array.isArray(current) && !isNaN(parseInt(lastKey))) {
    current[parseInt(lastKey)] = value;
  } else if (current && typeof current === "object") {
    if (typeof value === "string" && !isNaN(parseFloat(value)) && isFinite(value)) {
      if (lastKey === "minContrast" || lastKey === "spread" || lastKey === "colorSteps") {
        current[lastKey] = parseFloat(value);
      } else {
        current[lastKey] = value;
      }
    } else {
      current[lastKey] = value;
    }
  }
}

function exportColorScheme(colorScheme) {
  const dataStr  = JSON.stringify(colorScheme, null, 2);
  const dataUri  = "data:application/json;charset=utf-8," + encodeURIComponent(dataStr);
  const filename = `color-scheme-${colorScheme.name || "untitled"}-${new Date().toISOString().slice(0, 10)}.json`;
  const a = document.createElement("a");
  a.setAttribute("href", dataUri);
  a.setAttribute("download", filename);
  a.click();
}

function importColorScheme(event, onImportSuccess) {
  const file = event.target.files[0];
  if (!file) return;
  parseSchemeFile(file, (scheme) => {
    onImportSuccess(scheme);
    event.target.value = "";
  });
}

function parseSchemeFile(file, onValid) {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const imported = JSON.parse(e.target.result);
      if (!imported || !imported.colors || !Array.isArray(imported.colors) || !imported.roles) {
        alert("Invalid color scheme file format");
        return;
      }
      onValid(imported);
    } catch (err) {
      console.error("Error parsing color scheme:", err);
      alert("Error parsing color scheme file. Please check the format.");
    }
  };
  reader.readAsText(file);
}

function isCurrentSchemeDirty() {
  if (!window.currentEditableScheme) return false;
  return JSON.stringify(window.currentEditableScheme) !== JSON.stringify(demoConfig);
}

function applyImportedScheme(scheme) {
  Object.assign(demoConfig, scheme);
  window.currentEditableScheme = JSON.parse(JSON.stringify(scheme));
  initializeColorControls();
}

let _pendingImport = null;

function handleDroppedFile(file) {
  if (!file || !file.name.toLowerCase().endsWith(".json")) return;
  parseSchemeFile(file, (scheme) => {
    if (isCurrentSchemeDirty()) {
      _pendingImport = scheme;
      document.getElementById("import-confirm-dialog").showModal();
    } else {
      applyImportedScheme(scheme);
    }
  });
}

// ─── Main Action Buttons ──────────────────────────────────────────────────────

function createMainBtnGroup() {
  const container = document.getElementById("mainActionBtns");
  if (!container) return;
  const btnClass = "h-10 px-4 bg-[var(--accent)] text-white rounded-[10px] text-[13px] font-semibold cursor-pointer transition-colors duration-150 hover:bg-[var(--accent-hover)] shadow-[0_4px_12px_var(--accent-glow)] inline-flex items-center gap-1.5 whitespace-nowrap border-none";
  container.innerHTML = `
    <button id="exportCss"    class="${btnClass}">Export CSS</button>
    <button id="downloadCsv"  class="${btnClass}">Export CSV</button>
    <button id="exportConfig" class="${btnClass}">Export Config</button>
    <label for="importConfig" class="${btnClass} cursor-pointer">
      Import Config
      <input type="file" id="importConfig" accept=".json" class="hidden" />
    </label>
  `;
  const importInput = container.querySelector("#importConfig");
  if (importInput) {
    importInput.addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (file) handleDroppedFile(file);
      e.target.value = "";
    });
  }
}

// ─── Initialisation ───────────────────────────────────────────────────────────

function initializeColorControls() {
  const editable = JSON.parse(JSON.stringify(demoConfig));
  window.currentEditableScheme = editable;

  createColorInputs(editable, (updatedScheme) => {
    window.currentEditableScheme = updatedScheme;
    displayColorTokens(variableMaker(updatedScheme));
  });

  setTimeout(createMainBtnGroup, 50);
  displayColorTokens(variableMaker(editable));

  if (!window.globalListenersSet) {
    document.addEventListener("click", (e) => {
      const id = e.target.id;
      if (id === "exportCss")    downloadCss(window.currentEditableScheme || editable);
      if (id === "exportConfig") exportColorScheme(window.currentEditableScheme || demoConfig);
      if (id === "downloadCsv") {
        const scheme     = window.currentEditableScheme || editable;
        const dataForCsv = variableMaker(scheme);
        const flat       = flattenTokensForCsv(dataForCsv);
        if (flat.length === 0) {
          alert("No color token data found to export. Please check if the color system is properly configured.");
          return;
        }
        const columns = [
          { label: "Theme",          path: "theme" },
          { label: "Group",          path: "group" },
          { label: "Role",           path: "role" },
          { label: "Variation",      path: "variation" },
          { label: "Token Ref",      path: "tokenRef" },
          { label: "Token Name",     path: "tokenName" },
          { label: "Hex Value",      path: "value" },
          { label: "Contrast Ratio", path: "contrastRatio" },
          { label: "Rating",         path: "contrastRating" },
          { label: "Adjusted",       path: "isAdjusted" },
        ];
        downloadCSV("tokens.csv", generateCSV({ data: flat, columns }));
      }
    });
    window.globalListenersSet = true;
  }
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    displayColorTokens,
    createColorInputs,
    initializeColorControls,
    exportColorScheme,
    importColorScheme,
    handleDroppedFile,
    applyImportedScheme,
  };
}
