const fs = require("fs");
let css = fs.readFileSync("Styles.css", "utf-8");

const theming = `:root {
  --bg-app: #d2d8e5;
  --bg-sidebar: #ffffff;
  --bg-main: #f8f9fa;
  --bg-panel: #ffffff;
  --bg-input: #ffffff;
  --bg-hover: #e9ecef;
  --bg-active: rgba(0, 123, 255, 0.1);
  --bg-raw: #eaf5ff;
  --bg-dark-ctx: #02101b;
  --bg-error: #fff3cd;
  --bg-error-item: #ffffff;
  
  --border-light: #dee2e6;
  --border-input: #ced4da;
  --border-panel: #989ece;
  --border-dark: #495057;
  --border-error: #ffeaa7;
  
  --text-primary: #343a40;
  --text-secondary: #495057;
  --text-muted: #6c757d;
  --text-error: #856404;
  --text-dark-ctx: #ffffff;
  --text-dark-muted: #c7cacc;
}

body.app-dark-mode {
  --bg-app: #1a1e23;
  --bg-sidebar: #212529;
  --bg-main: #0d0f12;
  --bg-panel: #212529;
  --bg-input: #2b3035;
  --bg-hover: #343a40;
  --bg-active: rgba(0, 123, 255, 0.2);
  --bg-raw: #212529;
  --bg-dark-ctx: #212529;
  --bg-error: #332701;
  --bg-error-item: #212529;
  
  --border-light: #343a40;
  --border-input: #495057;
  --border-panel: #343a40;
  --border-dark: #343a40;
  --border-error: #664d03;
  
  --text-primary: #e9ecef;
  --text-secondary: #e9ecef;
  --text-muted: #adb5bd;
  --text-error: #ffda6a;
  --text-dark-ctx: #e9ecef;
  --text-dark-muted: #adb5bd;
}

`;

const overrideMarker = "/* ============================================================================\n   App Dark Mode Theme";
const overrideIndex = css.indexOf(overrideMarker);
if (overrideIndex !== -1) {
  css = css.substring(0, overrideIndex).trim();
}

css = theming + css;

const replacements = [
  { s: /background-color:\s*#d2d8e5;/g, r: "background-color: var(--bg-app);" },
  { s: /color:\s*#343a40;/g, r: "color: var(--text-primary);" },
  {
    s: /background-color:\s*#ffffff;/g,
    r: "background-color: var(--bg-panel);",
  },
  { s: /background:\s*#ffffff;/g, r: "background: var(--bg-panel);" },
  {
    s: /border:\s*1px solid #dee2e6;/g,
    r: "border: 1px solid var(--border-light);",
  },
  {
    s: /border-bottom:\s*2px solid #dee2e6;/g,
    r: "border-bottom: 2px solid var(--border-light);",
  },
  {
    s: /background-color:\s*#f8f9fa;/g,
    r: "background-color: var(--bg-main);",
  },
  { s: /color:\s*#495057;/g, r: "color: var(--text-secondary);" },
  {
    s: /border:\s*1px solid #ced4da;/g,
    r: "border: 1px solid var(--border-input);",
  },
  { s: /background-color:\s*#eaf5ff;/g, r: "background-color: var(--bg-raw);" },
  {
    s: /border:\s*1px solid #989ece;/g,
    r: "border: 1px solid var(--border-panel);",
  },
  {
    s: /background-color:\s*#02101b;/g,
    r: "background-color: var(--bg-dark-ctx);",
  },
  {
    s: /border:\s*1px solid #495057;/g,
    r: "border: 1px solid var(--border-dark);",
  },
  { s: /color:\s*#ffffff;/g, r: "color: var(--text-dark-ctx);" },
  { s: /color:\s*#6c757d;/g, r: "color: var(--text-muted);" },
  { s: /color:\s*#c7cacc;/g, r: "color: var(--text-dark-muted);" },
  {
    s: /background-color:\s*#fff3cd;/g,
    r: "background-color: var(--bg-error);",
  },
  {
    s: /border:\s*2px solid #ffeaa7;/g,
    r: "border: 2px solid var(--border-error);",
  },
  {
    s: /border-bottom:\s*1px solid #ffeaa7;/g,
    r: "border-bottom: 1px solid var(--border-error);",
  },
  { s: /color:\s*#856404;/g, r: "color: var(--text-error);" },
  {
    s: /background-color:\s*#e9ecef;/g,
    r: "background-color: var(--bg-hover);",
  },
  {
    s: /background-color:\s*rgba\(0, 123, 255, 0\.1\);/g,
    r: "background-color: var(--bg-active);",
  },
];

replacements.forEach((x) => {
  css = css.replace(x.s, x.r);
});

fs.writeFileSync("Styles.css", css);
console.log("Migration complete!");
