// DocGen.js - Export functions for CSS, SCSS, and CSV output.
// Depends on variableMaker (ClrGen.js) and slugify (Utils.js) being loaded first.
function flattenToCss(collection) {
  const cssVars = {
    raw: {},
    light: {},
    dark: {},
  };

  if (!collection.colorRamps) {
    console.error("No colorRamps found in collection");
    return cssVars;
  }

  Object.entries(collection.colorRamps).forEach(([group, weights]) => {
    Object.entries(weights).forEach(([weight, data]) => {
      if (!data?.value) return;
      const varName = `--${slugify(group)}-${slugify(weight)}`;
      const value = data.value || "#000000";
      cssVars.raw[varName] = value;
    });
  });

  if (collection.colorTokens) {
    Object.entries(collection.colorTokens).forEach(([theme, themeData]) => {
      if (!themeData) return;
      Object.entries(themeData).forEach(([group, roles]) => {
        if (!roles) return;
        Object.entries(roles).forEach(([role, variations]) => {
          if (!variations) return;
          Object.entries(variations).forEach(([variation, data]) => {
            if (!data?.tknRef) return;
            const tokenName = `--${slugify(group)}-${slugify(data.role || role)}-${slugify(variation)}`;
            const ref = data.tknRef;
            const lastDash = ref.lastIndexOf("-");
            if (lastDash === -1) return;
            const refGroup = slugify(ref.substring(0, lastDash));
            const refWeight = slugify(ref.substring(lastDash + 1));
            const rawVarRef = `var(--${refGroup}-${refWeight})`;
            cssVars[theme][tokenName] = rawVarRef;
          });
        });
      });
    });
  }
  return cssVars;
}

function generateCss(cssVars) {
  let css = `/* Color Tokens - Auto-generated */\n`;
  css += `/* Generated on: ${new Date().toISOString()} */\n\n`;
  css += `/* ============================================\n   RAW COLOR RAMPS\n   ============================================ */\n\n`;
  css += `:root {\n`;
  Object.entries(cssVars.raw).forEach(([variable, value]) => {
    css += `  ${variable}: ${value};\n`;
  });
  css += `}\n\n`;
  css += `/* ============================================\n   LIGHT THEME TOKENS\n   ============================================ */\n\n`;
  css += `:root,\n.light,\n[data-theme="light"] {\n`;
  Object.entries(cssVars.light).forEach(([variable, value]) => {
    css += `  ${variable}: ${value};\n`;
  });
  css += `}\n\n`;
  css += `/* ============================================\n   DARK THEME TOKENS\n   ============================================ */\n\n`;
  // Dark tokens emitted twice: once for the OS preference media query, once for the explicit .dark class.
  css += `@media (prefers-color-scheme: dark) {\n  :root {\n`;
  Object.entries(cssVars.dark).forEach(([variable, value]) => {
    css += `    ${variable}: ${value};\n`;
  });
  css += `  }\n}\n\n`;
  css += `.dark,\n[data-theme="dark"] {\n`;
  Object.entries(cssVars.dark).forEach(([variable, value]) => {
    css += `  ${variable}: ${value};\n`;
  });
  css += `}\n`;
  return css;
}

function generateSeparateCssFiles(cssVars) {
  const files = {
    raw: `/* Raw Color Ramps - Base Colors */\n:root {\n${Object.entries(cssVars.raw)
      .map(([varName, value]) => `  ${varName}: ${value};`)
      .join("\n")}\n}`,
    light: `/* Light Theme Tokens */\n.light,\n[data-theme="light"] {\n${Object.entries(cssVars.light)
      .map(([varName, value]) => `  ${varName}: ${value};`)
      .join("\n")}\n}`,
    dark: `/* Dark Theme Tokens */\n.dark,\n[data-theme="dark"] {\n${Object.entries(cssVars.dark)
      .map(([varName, value]) => `  ${varName}: ${value};`)
      .join("\n")}\n}`,
  };
  return files;
}

function downloadCss(scheme) {
  try {
    const currentScheme = scheme || window.currentEditableScheme || demoConfig;
    console.log("Generating CSS for scheme:", currentScheme.name);
    const collection = variableMaker(currentScheme);
    if (!collection || !collection.colorRamps) {
      throw new Error("Invalid collection generated from variableMaker");
    }
    const cssVars = flattenToCss(collection);
    const cssContent = generateCss(cssVars);
    const blob = new Blob([cssContent], { type: "text/css" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${slugify(currentScheme.name)}-tokens.css`;
    a.click();
    URL.revokeObjectURL(url);
    console.log("CSS downloaded successfully");
  } catch (error) {
    console.error("Error generating CSS:", error);
    alert(`Error generating CSS: ${error.message}`);
  }
}

function generateScss(collection) {
  if (!collection || !collection.colorRamps) return "";
  let scss = `// Color Tokens - Auto-generated SCSS\n`;
  scss += `// Generated on: ${new Date().toISOString()}\n\n`;
  scss += `// ============================================\n// RAW COLOR RAMPS\n// ============================================\n\n`;
  Object.entries(collection.colorRamps).forEach(([group, weights]) => {
    scss += `// ${group.toUpperCase()} Ramps\n`;
    Object.entries(weights).forEach(([weight, data]) => {
      if (!data?.value) return;
      const varName = `$${slugify(group)}-${slugify(weight)}`;
      scss += `${varName}: ${data.value};\n`;
    });
    scss += `\n`;
  });
  scss += `// ============================================\n// LIGHT THEME TOKENS\n// ============================================\n\n`;
  scss += `$light-theme: (\n`;
  if (collection.colorTokens?.light) {
    Object.entries(collection.colorTokens.light).forEach(([group, roles]) => {
      Object.entries(roles).forEach(([role, variations]) => {
        Object.entries(variations).forEach(([variation, data]) => {
          if (!data?.tknRef) return;
          const varName = `${slugify(group)}-${slugify(data.role || role)}-${slugify(variation)}`;
          const ref = data.tknRef;
          const lastDash = ref.lastIndexOf("-");
          const refGroup = slugify(ref.substring(0, lastDash));
          const refWeight = slugify(ref.substring(lastDash + 1));
          scss += `  "${varName}": $${refGroup}-${refWeight},\n`;
        });
      });
    });
  }
  scss += `);\n\n`;
  scss += `// ============================================\n// DARK THEME TOKENS\n// ============================================\n\n`;
  scss += `$dark-theme: (\n`;
  if (collection.colorTokens?.dark) {
    Object.entries(collection.colorTokens.dark).forEach(([group, roles]) => {
      Object.entries(roles).forEach(([role, variations]) => {
        Object.entries(variations).forEach(([variation, data]) => {
          if (!data?.tknRef) return;
          const varName = `${slugify(group)}-${slugify(data.role || role)}-${slugify(variation)}`;
          const ref = data.tknRef;
          const lastDash = ref.lastIndexOf("-");
          const refGroup = slugify(ref.substring(0, lastDash));
          const refWeight = slugify(ref.substring(lastDash + 1));
          scss += `  "${varName}": $${refGroup}-${refWeight},\n`;
        });
      });
    });
  }
  scss += `);\n`;
  return scss;
}

function generateSimpleCss(cssVars) {
  let css = `/* Color Tokens - Simplified */\n\n`;
  css += `/* Raw Color Ramps */\n`;
  css += `:root {\n`;
  Object.entries(cssVars.raw).forEach(([variable, value]) => {
    css += `  ${variable}: ${value};\n`;
  });
  css += `}\n\n`;
  css += `/* Light Theme */\n`;
  css += `.light-theme {\n`;
  Object.entries(cssVars.light).forEach(([variable, value]) => {
    css += `  ${variable}: ${value};\n`;
  });
  css += `}\n\n`;
  css += `/* Dark Theme */\n`;
  css += `.dark-theme {\n`;
  Object.entries(cssVars.dark).forEach(([variable, value]) => {
    css += `  ${variable}: ${value};\n`;
  });
  css += `}\n`;
  return css;
}

function generateCSV({ data, columns }) {
  if (!data || data.length === 0) return "";
  const rows = Array.isArray(data) ? data : Object.entries(data).map(([key, value]) => ({ key, ...value }));
  const header = columns.map((col) => col.label);
  const body = rows.map((row) => {
    return columns
      .map((col) => {
        const val = getValueByPath(row, col.path);
        return escapeCSV(val ?? "");
      })
      .join(",");
  });
  return [header.join(","), ...body].join("\n");
}

function getValueByPath(obj, path) {
  if (!obj || !path) return undefined;
  return path.split(".").reduce((acc, key) => (acc ? acc[key] : undefined), obj);
}

function escapeCSV(value) {
  const str = String(value).replace(/"/g, '""');
  return /["\n,]/.test(str) ? `"${str}"` : str;
}

function flattenTokensForCsv(collection) {
  const result = [];
  if (!collection || !collection.colorTokens) {
    console.error("Cannot find theme data in output:", collection);
    return result;
  }
  const themesData = collection.colorTokens;
  ["light", "dark"].forEach((theme) => {
    const groups = themesData[theme];
    if (!groups) {
      console.warn(`No data for ${theme} theme`);
      return;
    }
    for (const group in groups) {
      const roles = groups[group];
      if (!roles) continue;
      for (const role in roles) {
        const variations = roles[role];
        if (!variations) continue;
        for (const variation in variations) {
          const item = variations[variation];
          result.push({
            theme: theme,
            group: group,
            role: item.role || role,
            variation: variation,
            value: item.value || "",
            tokenRef: item.tknRef || "",
            tokenName: item.tknName || "",
            contrastRatio: item.contrast?.ratio?.toFixed(2) || "0",
            contrastRating: item.contrast?.rating || "",
            isAdjusted: item.isAdjusted ? "Yes" : "No",
          });
        }
      }
    }
  });
  return result;
}

function downloadCSV(filename, csvString) {
  if (!csvString || csvString.length === 0) {
    alert("No data to export");
    return;
  }
  const blob = new Blob(["\uFEFF" + csvString], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  link.href = url;
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

if (typeof window !== "undefined") {
  window.downloadCss = downloadCss;
  window.downloadCSV = downloadCSV;
  window.flattenTokensForCsv = flattenTokensForCsv;
  window.generateCSV = generateCSV;
  window.generateScss = generateScss;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    flattenToCss,
    generateCss,
    downloadCss,
    generateCSV,
    flattenTokensForCsv,
    downloadCSV,
    generateScss,
    generateSimpleCss,
    generateSeparateCssFiles,
  };
}
