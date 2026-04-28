// UiGen.js - UI rendering and interaction layer.
// Builds the sidebar controls and main token display; delegates data work to ClrGen/DocGen.

window.currentEditableScheme = null;
window.sidebarExpandedState = window.sidebarExpandedState || {};

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
    notices: errors.notices?.filter((e) => e.theme === theme) || [],
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
  rawPanel.innerHTML = createRawSection(collection.colorRamps);

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
    arr
      .map((e) => {
        let ctxArray = [];
        if (e.color) ctxArray.push(`Group: <strong>${e.color.toUpperCase()}</strong>`);
        if (e.role) ctxArray.push(`Role: <strong>${e.role}</strong>`);
        if (e.variation) ctxArray.push(`Var: <strong>${e.variation}</strong>`);
        const prefixHTML = ctxArray.length ? `<span style="opacity:0.85;margin-right:8px;">[ ${ctxArray.join(" | ")} ]</span>` : "";
        return `<div class="px-2 py-1.5 bg-[var(--bg-card)] rounded-[8px] font-mono text-[10px] text-[var(--text-muted)] mb-1 last:mb-0">${prefixHTML}${e.error || e.warning || e.notice}</div>`;
      })
      .join("");

  const section = document.createElement("div");
  section.className = "bg-[var(--warning)]/10 border border-[var(--warning)]/30 mb-4 rounded-[10px] overflow-hidden";
  section.innerHTML = `
    <div class="errors-header px-3.5 py-2.5 cursor-pointer flex justify-between items-center transition-colors duration-150 hover:bg-[var(--warning)]/5">
      <h4 class="text-[var(--warning)] text-[12px] font-bold tracking-[0.5px]">⚠️ Warnings &amp; Errors</h4>
      <button class="errors-toggle collapsed bg-transparent border-none text-[12px] cursor-pointer text-[var(--warning)] transition-transform duration-200">&lt;</button>
    </div>
    <div class="errors-content custom-scrollbar">
      <div class="px-3.5 py-2 border-t border-[var(--warning)]/15">
        <div class="text-[var(--warning)] text-[11px] font-bold mb-1.5 tracking-[0.5px]">Critical (${errors.critical?.length || 0})</div>
        ${createListHTML(errors.critical || [])}
      </div>
      <div class="px-3.5 py-2 border-t border-[var(--warning)]/15">
        <div class="text-[var(--warning)] text-[11px] font-bold mb-1.5 tracking-[0.5px]">Warnings (${errors.warnings?.length || 0})</div>
        ${createListHTML(errors.warnings || [])}
      </div>
      <div class="px-3.5 py-2 border-t border-[var(--warning)]/15">
        <div class="text-[var(--warning)] text-[11px] font-bold mb-1.5 tracking-[0.5px]">Notices (${errors.notices?.length || 0})</div>
        ${createListHTML(errors.notices || [])}
      </div>
    </div>
  `;

  const header = section.querySelector(".errors-header");
  const content = section.querySelector(".errors-content");
  const toggle = section.querySelector(".errors-toggle");
  header.addEventListener("click", () => {
    const isCollapsed = toggle.classList.contains("collapsed");
    toggle.classList.toggle("collapsed", !isCollapsed);
    content.classList.toggle("expanded", isCollapsed);
  });
  return section;
}

function createRawSection(colorRamps) {
  // const section = document.createElement("div");
  // section.className = "bg-[var(--bg-card)] border border-[var(--border)] mb-4 p-4 rounded-[10px]";

  const rawHTML = Object.entries(colorRamps)
    .map(([colorGroup, weights]) => {
      const swatchesHTML = Object.entries(weights)
        .map(([, data]) => {
          if (!data?.value) return "";
          const colorValue = normalizeHex(data.value) || "#000000";
          const textColor = getOptimalTextColor(colorValue);
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
        })
        .join("");
      return `
      <div class="bg-[var(--bg-card)] border border-[var(--border)] mb-4 p-4 rounded-[10px]">
        <h3 class="text-[14px] font-bold tracking-[0.8px] text-[var(--text-muted)] mb-2.5">${colorGroup}</h3>
        <div class="grid gap-2" style="grid-template-columns:repeat(auto-fill,minmax(200px,1fr))">${swatchesHTML}</div>
      </div>`;
    })
    .join("");

  // section.innerHTML = rawHTML;
  return rawHTML;
}

function createThemeSection(colorTokens, theme) {
  const isDark = theme === "dark";
  const pillClass = isDark
    ? "flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-black/70 text-[var(--text-primary)] border border-white/10"
    : "flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-white/90 text-[var(--text-primary)] border border-black/10";
  const pillIcon = isDark ? "🌙" : "☀️";

  // Create a container for all color groups (e.g., a div or DocumentFragment)
  const container = document.createElement("div");
  container.className = "color-roles-container";

  for (const [colorGroup, roles] of Object.entries(colorTokens)) {
    if (!roles || Object.keys(roles).length === 0) {
      container.innerHTML = `
      <div class="p-4 rounded-[10px] border border-[var(--border)] mb-4 ${isDark ? "bg-black" : "bg-[var(--bg-card)]"}">
        <h4 class="text-[11px] font-bold tracking-[0.8px] mb-3 ${isDark ? "text-[var(--text-dim)]" : "text-[var(--text-muted)]"}">${colorGroup}</h4>
        <p>No roles generated</p>
      </div>`;
      return;
    }

    // Main group container
    const groupDiv = document.createElement("div");
    groupDiv.className = `p-4 rounded-[10px] border border-[var(--border)] mb-4 ${isDark ? "bg-black" : "bg-[var(--bg-card)]"}`;

    // Group title
    groupDiv.innerHTML = `
    <h4 class="text-[14px] font-bold tracking-[0.5px] mb-3 ${isDark ? "text-[var(--text-dim)]" : "text-[var(--text-muted)]"}">${colorGroup}</h4>
    `;

    // Iterate over each role inside the group using for...of on Object.entries
    for (const [role, variations] of Object.entries(roles)) {
      if (!variations || Object.keys(variations).length === 0) continue;

      // Get display name for the role (first variation's role property or the key)
      const firstVar = Object.values(variations)[0];
      const displayRoleName = firstVar?.role || role;

      // Role sub‑heading
      const roleHeading = document.createElement("h5");
      roleHeading.className = `text-[10px] font-semibold tracking-[0.6px] mb-2 ${isDark ? "text-[var(--text-dim)]" : "text-[var(--text-dim)]"}`;
      roleHeading.textContent = displayRoleName;
      groupDiv.appendChild(roleHeading);

      // Grid container for color cards
      const grid = document.createElement("div");
      grid.className = "grid gap-2";
      grid.style.gridTemplateColumns = "repeat(auto-fill, minmax(180px, 1fr))";

      // Iterate over each variation (color) inside the role using for...in
      for (const variationKey in variations) {
        if (!Object.hasOwn(variations, variationKey)) continue;
        const data = variations[variationKey];
        if (!data?.value) continue;

        const colorValue = normalizeHex(data.value);
        const textColor = getOptimalTextColor(colorValue);

        // Color card element
        const card = document.createElement("div");
        card.className = "rounded-[8px] p-3 min-h-[100px] flex items-end relative shadow-[0_2px_4px_rgba(0,0,0,0.3)] transition-[transform,box-shadow] duration-200 cursor-pointer hover:-translate-y-0.5 hover:shadow-[0_6px_12px_rgba(0,0,0,0.4)] border border-white/5 break-inside-avoid";
        card.style.backgroundColor = colorValue;
        card.style.color = textColor;

        // Inner content container
        const content = document.createElement("div");
        content.className = "flex flex-col gap-1 w-full text-[11px] leading-snug";

        // Hex value element (with copy tooltip)
        const hexSpan = document.createElement("div");
        hexSpan.className = "font-mono text-[11px] font-semibold bg-black/25 rounded-[4px] px-1.5 py-0.5 cursor-pointer hover:bg-black/40 transition-colors duration-150 w-fit";
        hexSpan.setAttribute("data-tooltip", "Click to copy hex");
        hexSpan.setAttribute("data-copy", colorValue);
        hexSpan.textContent = colorValue;

        // Token name element (copy name)
        const nameSpan = document.createElement("div");
        nameSpan.className = "font-semibold text-[12px] cursor-pointer";
        nameSpan.setAttribute("data-tooltip", "Click to copy name");
        nameSpan.setAttribute("data-copy", data.tknName);
        nameSpan.textContent = data.tknName;

        // Reference element
        const refSpan = document.createElement("div");
        refSpan.className = "font-mono text-[9px] opacity-60";
        refSpan.textContent = `Ref: ${data.tknRef}`;

        // Contrast pill
        const pill = document.createElement("div");
        pill.className = pillClass; // uses existing pillClass variable
        // Add icon (if pillIcon is a string, use innerHTML; if it's an element, clone)
        if (typeof pillIcon === "string") {
          pill.innerHTML = pillIcon;
        } else if (pillIcon instanceof Element) {
          pill.appendChild(pillIcon.cloneNode(true));
        }
        const contrastText = document.createElement("span");
        contrastText.className = "text-[10px] font-semibold leading-none whitespace-nowrap";
        contrastText.textContent = `${(data.contrast.ratio || 0).toFixed(2)} - ${data.contrast.rating}`;
        pill.appendChild(contrastText);

        // Wrap pill and text in a flex container (since pill may already have structure, adjust as needed)
        // The original uses a <div class="flex gap-1 flex-wrap">, so we create that wrapper
        const pillWrapper = document.createElement("div");
        pillWrapper.className = "flex gap-1 flex-wrap";
        pillWrapper.appendChild(pill);

        // Append all parts to content
        content.appendChild(hexSpan);
        content.appendChild(nameSpan);
        content.appendChild(refSpan);
        content.appendChild(pillWrapper);

        // "Adjusted" warning if needed
        if (data.isAdjusted) {
          const adjustedBadge = document.createElement("div");
          adjustedBadge.className = "text-[var(--warning)] font-bold text-[9px] tracking-[0.5px]";
          adjustedBadge.textContent = "Adjusted";
          content.appendChild(adjustedBadge);
        }

        card.appendChild(content);
        grid.appendChild(card);
      }

      groupDiv.appendChild(grid);
    }

    container.appendChild(groupDiv);
  }

  const section = document.createElement("div");
  section.appendChild(container);
  return section;
}

// ─── Control Panel Functions ──────────────────────────────────────────────────

function createColorInputs(colorScheme, onUpdate) {
  const targetContainer = document.getElementById("colorInputs");
  if (!targetContainer) return;

  const fragment = document.createDocumentFragment();

  // 1. Basic Settings
  const basicSection = createSection("Basic Settings", "basic-settings");
  basicSection.content.appendChild(createInput("name", "System Name", colorScheme.name));
  basicSection.content.appendChild(createInput("colorSteps", "Weight Count", colorScheme.colorSteps, "number"));
  basicSection.content.appendChild(createInput("rampType", "Ramp Generation Mode", colorScheme.rampType || "Balanced", "select", rampTypes));
  basicSection.content.appendChild(createInput("roleMapping", "Role Mapping Method", colorScheme.roleMapping || "Contrast Based", "select", roleMappingMethods));
  basicSection.content.appendChild(createColorInput("themes.0.bg", "Light Theme Background", colorScheme.themes[0].bg || "FFFFFF"));
  basicSection.content.appendChild(createColorInput("themes.1.bg", "Dark Theme Background", colorScheme.themes[1].bg || "000000"));
  fragment.appendChild(basicSection.element);

  // 2. Color Groups
  fragment.appendChild(createColorGroupsSection(colorScheme).element);

  // 3. Roles Configuration
  fragment.appendChild(createRolesSection(colorScheme, onUpdate).element);

  targetContainer.innerHTML = "";
  targetContainer.appendChild(fragment);

  // Delegated listener for inputs
  if (!targetContainer.dataset.hasListener) {
    let updateTimeout;
    ["input", "change"].forEach((evtType) => {
      targetContainer.addEventListener(evtType, (e) => {
        const target = e.target;
        const path = target.dataset.path;
        if (!path) return;
        const pathParts = path.split(".");
        const rawVal = target.value;
        const type = target.type;
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

  // Direct listener for role mapping select
  const roleMappingSelect = targetContainer.querySelector('[data-path="roleMapping"]');
  if (roleMappingSelect) {
    const handler = (e) => {
      const activeScheme = window.currentEditableScheme;
      if (activeScheme) {
        activeScheme.roleMapping = e.target.value;
        createColorInputs(activeScheme, onUpdate);
        if (typeof onUpdate === "function") onUpdate(activeScheme);
      }
    };
    roleMappingSelect.onchange = handler;
  }
}

function createColorGroupsSection(colorScheme) {
  const section = createSection("Color Groups", "color-groups");
  const addButton = document.createElement("button");
  addButton.className = "w-full h-10 px-4 mb-2 bg-transparent text-[var(--accent)] border-2 border-dashed border-[var(--accent)] rounded-[10px] text-[13px] font-semibold cursor-pointer transition-colors duration-150 hover:bg-[var(--accent)]/10";
  addButton.textContent = "+ Add Color";
  addButton.onclick = () => {
    const newGroup = {
      name: `color${colorScheme.colors.length + 1}`,
      shortName: `C${colorScheme.colors.length + 1}`,
      value: "888888",
    };
    colorScheme.colors.unshift(newGroup);
    createColorInputs(colorScheme, (updated) => {
      window.currentEditableScheme = updated;
      displayColorTokens(variableMaker(updated));
    });
    displayColorTokens(variableMaker(colorScheme));
  };
  section.content.appendChild(addButton);
  colorScheme.colors.forEach((group, index) => {
    section.content.appendChild(createColorGroupInput(group, index, colorScheme));
  });
  return section;
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
    deleteBtn.onclick = (e) => {
      e.stopPropagation();
      const idx = parseInt(e.currentTarget.dataset.index);
      colorScheme.colors.splice(idx, 1);
      const updatedScheme = JSON.parse(JSON.stringify(colorScheme));
      window.currentEditableScheme = updatedScheme;
      createColorInputs(updatedScheme, (s) => {
        window.currentEditableScheme = s;
        displayColorTokens(variableMaker(s));
      });
      displayColorTokens(variableMaker(updatedScheme));
    };
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
  const colorText = container.querySelector(".color-text");
  if (colorPicker && colorText) {
    colorPicker.oninput = (e) => {
      colorText.value = e.target.value.replace("#", "").toUpperCase();
    };
    colorText.oninput = (e) => {
      const hex = e.target.value.replace("#", "").toUpperCase();
      if (/^[0-9A-F]{6}$/.test(hex)) colorPicker.value = "#" + hex;
    };
  }
}

function createRolesSection(colorScheme, onUpdate) {
  const section = createSection("Roles Configuration", "roles-config");
  const addButton = document.createElement("button");
  addButton.className = "w-full h-10 px-4 mb-2 bg-transparent text-[var(--accent)] border-2 border-dashed border-[var(--accent)] rounded-[10px] text-[13px] font-semibold cursor-pointer transition-colors duration-150 hover:bg-[rgba(24,160,251,0.1)]";
  addButton.textContent = "+ Add Role";
  addButton.onclick = () => {
    const roleId = colorScheme.roles.length + 1;
    const mid = Math.floor(colorScheme.colorSteps / 2);
    colorScheme.roles.unshift({
      name: "Role " + roleId,
      shortName: `r-${roleId}`,
      minContrast: 4.5,
      spread: 2,
      baseIndex: mid,
      darkBaseIndex: mid,
    });
    createColorInputs(colorScheme, (updated) => {
      window.currentEditableScheme = updated;
      displayColorTokens(variableMaker(updated));
    });
    onUpdate(colorScheme);
  };
  section.content.appendChild(addButton);

  const isManualMode = colorScheme.roleMapping === "Manual Base Index";
  const rampLength = colorScheme.colorSteps;

  for (let roleKey = 0; roleKey < colorScheme.roles.length; roleKey++) {
    const role = colorScheme.roles[roleKey];
    const roleDiv = document.createElement("div");
    const roleInputs = document.createElement("div");
    roleInputs.className = `grid ${isManualMode ? "grid-cols-4" : "grid-cols-3"} items-end gap-2`;
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

    const spreadInput = createInput(`roles.${roleKey}.spread`, "Spread", role.spread, "number");
    const shortNameInput = createInput(`roles.${roleKey}.shortName`, "Short Name", role.shortName);
    roleInputs.appendChild(spreadInput);
    roleInputs.appendChild(shortNameInput);

    if (isManualMode) {
      const mid = Math.floor(rampLength / 2);
      const zeroBased = role.baseIndex !== undefined ? role.baseIndex : mid;
      const darkZeroBased = role.darkBaseIndex !== undefined ? role.darkBaseIndex : zeroBased;

      const baseStepDiv = document.createElement("div");
      baseStepDiv.className = "flex flex-col gap-1";
      baseStepDiv.innerHTML = `
        <label class="text-[12px] font-medium text-[var(--text-muted)] ml-0.5">Base ☀️ (1-${rampLength})</label>
        <input type="number" class="h-10 w-full px-2 text-[13px] text-[var(--text-primary)] bg-[var(--bg-input)] border border-[var(--border)] rounded-[8px] transition-colors duration-150 focus:outline-none focus:border-[var(--border-focus)]"
          value="${zeroBased + 1}" min="1" max="${rampLength}">
      `;
      const stepInput = baseStepDiv.querySelector("input");
      stepInput.onchange = (e) => {
        let newStep = parseInt(e.target.value);
        if (isNaN(newStep)) newStep = 1;
        newStep = Math.min(rampLength, Math.max(1, newStep));
        role.baseIndex = newStep - 1;
        e.target.value = newStep;
        if (typeof onUpdate === "function") onUpdate(colorScheme);
      };
      roleInputs.appendChild(baseStepDiv);

      const darkStepDiv = document.createElement("div");
      darkStepDiv.className = "flex flex-col gap-1";
      darkStepDiv.innerHTML = `
        <label class="text-[12px] font-medium text-[var(--text-muted)] ml-0.5">Base 🌙 (1-${rampLength})</label>
        <input type="number" class="h-10 w-full px-2 text-[13px] text-[var(--text-primary)] bg-[var(--bg-input)] border border-[var(--border)] rounded-[8px] transition-colors duration-150 focus:outline-none focus:border-[var(--border-focus)]"
          value="${darkZeroBased + 1}" min="1" max="${rampLength}">
      `;
      const darkStepInput = darkStepDiv.querySelector("input");
      darkStepInput.onchange = (e) => {
        let newStep = parseInt(e.target.value);
        if (isNaN(newStep)) newStep = 1;
        newStep = Math.min(rampLength, Math.max(1, newStep));
        role.darkBaseIndex = newStep - 1;
        e.target.value = newStep;
        if (typeof onUpdate === "function") onUpdate(colorScheme);
      };
      roleInputs.appendChild(darkStepDiv);
    } else {
      const minContrastInput = createInput(`roles.${roleKey}.minContrast`, "Min Contrast", role.minContrast, "number");
      roleInputs.appendChild(minContrastInput);
    }

    roleDiv.appendChild(roleInputs);

    const deleteBtn = roleDiv.querySelector(".delete-group-btn");
    if (deleteBtn) {
      deleteBtn.onclick = (e) => {
        e.stopPropagation();
        const rKey = parseInt(e.currentTarget.dataset.role);
        colorScheme.roles.splice(rKey, 1);
        const updatedScheme = JSON.parse(JSON.stringify(colorScheme));
        window.currentEditableScheme = updatedScheme;
        createColorInputs(updatedScheme, (s) => {
          window.currentEditableScheme = s;
          displayColorTokens(variableMaker(s));
        });
        displayColorTokens(variableMaker(updatedScheme));
      };
    }
    section.content.appendChild(roleDiv);
  }
  return section;
}

function createSection(title, id) {
  const container = document.createElement("div");
  container.className = "flex flex-col gap-1";

  // Check state: if never seen, default to true (expanded).
  if (!window.sidebarExpandedState) window.sidebarExpandedState = {};
  if (window.sidebarExpandedState[id] === undefined) {
    window.sidebarExpandedState[id] = true;
  }
  const isExpanded = window.sidebarExpandedState[id];

  const header = document.createElement("div");
  header.className = "text-[14px] font-bold text-[var(--text-muted)] flex justify-between items-center px-1 py-3 mb-1 rounded-[8px] cursor-pointer select-none transition-colors duration-150 hover:bg-[var(--bg-hover)]";
  header.setAttribute("role", "button");
  header.setAttribute("aria-expanded", isExpanded);
  header.setAttribute("tabindex", "0");

  header.innerHTML = `
    ${title}
    <svg class="w-4 h-4 transition-transform duration-200 ${isExpanded ? "rotate-0" : "-rotate-90"}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="6 9 12 15 18 9"></polyline>
    </svg>
  `;

  const content = document.createElement("div");
  content.className = `flex-col gap-4 ${isExpanded ? "flex" : "hidden"}`;

  const toggle = () => {
    const isNowExpanded = content.classList.contains("hidden");
    content.classList.toggle("hidden", !isNowExpanded);
    content.classList.toggle("flex", isNowExpanded);
    header.setAttribute("aria-expanded", isNowExpanded);
    window.sidebarExpandedState[id] = isNowExpanded;

    const svg = header.querySelector("svg");
    if (svg) {
      if (isNowExpanded) {
        svg.classList.remove("-rotate-90");
        svg.classList.add("rotate-0");
      } else {
        svg.classList.remove("rotate-0");
        svg.classList.add("-rotate-90");
      }
    }
  };

  header.onclick = toggle;
  header.onkeydown = (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      toggle();
    }
  };

  container.appendChild(header);
  container.appendChild(content);

  return { element: container, content: content };
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
  const appContainer = document.querySelector("app");
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
      if (_pendingImport) {
        applyImportedScheme(_pendingImport);
        _pendingImport = null;
      }
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
  const dataStr = JSON.stringify(colorScheme, null, 2);
  const dataUri = "data:application/json;charset=utf-8," + encodeURIComponent(dataStr);
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
      if (!imported || !imported.colors || !Array.isArray(imported.colors) || !Array.isArray(imported.roles)) {
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
  const iconBtn = "bg-[var(--bg-input)] hover:bg-[var(--bg-hover)] border border-[var(--border)] w-10 h-10 flex items-center justify-center rounded-[10px] transition-colors cursor-pointer text-[var(--text-primary)]";
  container.innerHTML = `
    <button id="downloadCsv" title="Export CSV" class="${iconBtn}">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <rect x="2" y="2" width="12" height="12" rx="1.5"/>
        <line x1="2" y1="6" x2="14" y2="6"/><line x1="2" y1="10" x2="14" y2="10"/>
        <line x1="6" y1="6" x2="6" y2="14"/><line x1="10" y1="6" x2="10" y2="14"/>
      </svg>
    </button>
    <button id="exportConfig" title="Export Config" class="${iconBtn}">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M12.5 8.5C12.5 7.94772 12.0523 7.5 11.5 7.5V11.5C11.5 12.6046 10.6046 13.5 9.5 13.5H5.5C5.5 14.0523 5.94772 14.5 6.5 14.5H11.5C12.0523 14.5 12.5 14.0523 12.5 13.5V8.5ZM6.5 1C6.5 0.723858 6.72386 0.5 7 0.5C7.27614 0.5 7.5 0.723858 7.5 1V8.29297L8.64648 7.14648C8.84175 6.95122 9.15825 6.95122 9.35352 7.14648C9.54878 7.34175 9.54878 7.65825 9.35352 7.85352L7.35352 9.85352C7.25975 9.94728 7.13261 10 7 10C6.86739 10 6.74025 9.94728 6.64648 9.85352L4.64648 7.85352C4.45122 7.65825 4.45122 7.34175 4.64648 7.14648C4.84175 6.95122 5.15825 6.95122 5.35352 7.14648L6.5 8.29297V1ZM13.5 13.5C13.5 14.6046 12.6046 15.5 11.5 15.5H6.5C5.39543 15.5 4.5 14.6046 4.5 13.5C3.39543 13.5 2.5 12.6046 2.5 11.5V6.5C2.5 5.39543 3.39543 4.5 4.5 4.5H5C5.27614 4.5 5.5 4.72386 5.5 5C5.5 5.27614 5.27614 5.5 5 5.5H4.5C3.94772 5.5 3.5 5.94772 3.5 6.5V11.5C3.5 12.0523 3.94772 12.5 4.5 12.5H9.5C10.0523 12.5 10.5 12.0523 10.5 11.5V6.5C10.5 5.94772 10.0523 5.5 9.5 5.5H9C8.72386 5.5 8.5 5.27614 8.5 5C8.5 4.72386 8.72386 4.5 9 4.5H9.5C10.6046 4.5 11.5 5.39543 11.5 6.5C12.6046 6.5 13.5 7.39543 13.5 8.5V13.5Z" fill="currentColor"/>
      </svg>
    </button>
    <label for="importConfig" title="Import Config" class="${iconBtn}">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M12.5 8.5C12.5 7.94772 12.0523 7.5 11.5 7.5V11.5C11.5 12.6046 10.6046 13.5 9.5 13.5H5.5C5.5 14.0523 5.94772 14.5 6.5 14.5H11.5C12.0523 14.5 12.5 14.0523 12.5 13.5V8.5ZM6.5 1C6.5 0.723858 6.72386 0.5 7 0.5C7.27614 0.5 7.5 0.723858 7.5 1V8.29297L8.64648 7.14648C8.84175 6.95122 9.15825 6.95122 9.35352 7.14648C9.54878 7.34175 9.54878 7.65825 9.35352 7.85352L7.35352 9.85352C7.15825 10.0488 6.84175 10.0488 6.64648 9.85352L4.64648 7.85352C4.45122 7.65825 4.45122 7.34175 4.64648 7.14648C4.84175 6.95122 5.15825 6.95122 5.35352 7.14648L6.5 8.29297V1ZM13.5 13.5C13.5 14.6046 12.6046 15.5 11.5 15.5H6.5C5.39543 15.5 4.5 14.6046 4.5 13.5C3.39543 13.5 2.5 12.6046 2.5 11.5V6.5C2.5 5.39543 3.39543 4.5 4.5 4.5H5C5.27614 4.5 5.5 4.72386 5.5 5C5.5 5.27614 5.27614 5.5 5 5.5H4.5C3.94772 5.5 3.5 5.94772 3.5 6.5V11.5C3.5 12.0523 3.94772 12.5 4.5 12.5H9.5C10.0523 12.5 10.5 12.0523 10.5 11.5V6.5C10.5 5.94772 10.0523 5.5 9.5 5.5H9C8.72386 5.5 8.5 5.27614 8.5 5C8.5 4.72386 8.72386 4.5 9 4.5H9.5C10.6046 4.5 11.5 5.39543 11.5 6.5C12.6046 6.5 13.5 7.39543 13.5 8.5V13.5Z" fill="currentColor"/>
      </svg>
      <input type="file" id="importConfig" accept=".json" class="hidden" />
    </label>
    <button id="exportCss" class="bg-[var(--accent)] hover:bg-[var(--accent-hover)] flex items-center gap-2 px-4 py-2 rounded-[10px] transition-all shadow-[0_4px_12px_var(--accent-glow)] border-none cursor-pointer h-10">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="white">
        <path d="M2 2.5A.5.5 0 0 1 2.5 2h11a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5H2.5a.5.5 0 0 1-.5-.5v-1ZM2 13.5a.5.5 0 0 1 .5-.5h11a.5.5 0 0 1 0 1h-11a.5.5 0 0 1-.5-.5ZM2 7a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V7Z" fill="white"/>
      </svg>
      <span class="text-[14px] font-bold text-white">Export CSS</span>
    </button>
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
      if (id === "exportCss") downloadCss(window.currentEditableScheme || editable);
      if (id === "exportConfig") exportColorScheme(window.currentEditableScheme || demoConfig);
      if (id === "downloadCsv") {
        const scheme = window.currentEditableScheme || editable;
        const dataForCsv = variableMaker(scheme);
        const flat = flattenTokensForCsv(dataForCsv);
        if (flat.length === 0) {
          alert("No color token data found to export. Please check if the color system is properly configured.");
          return;
        }
        const columns = [
          { label: "Theme", path: "theme" },
          { label: "Group", path: "group" },
          { label: "Role", path: "role" },
          { label: "Variation", path: "variation" },
          { label: "Token Ref", path: "tokenRef" },
          { label: "Token Name", path: "tokenName" },
          { label: "Hex Value", path: "value" },
          { label: "Contrast Ratio", path: "contrastRatio" },
          { label: "Rating", path: "contrastRating" },
          { label: "Adjusted", path: "isAdjusted" },
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
