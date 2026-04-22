const eslint = require("@eslint/js");
const figmaPlugin = require("@figma/eslint-plugin-figma-plugins");

module.exports = [
  eslint.configs.recommended,
  {
    plugins: {
      "@figma/figma-plugins": figmaPlugin,
    },
    rules: {
      ...figmaPlugin.configs.recommended.rules,
      "no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },
  {
    ignores: ["dist", "eslint.config.js"],
  },
];
