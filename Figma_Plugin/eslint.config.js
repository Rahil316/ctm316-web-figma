const eslint = require("@eslint/js");
const figmaPlugin = require("@figma/eslint-plugin-figma-plugins");

module.exports = [
  eslint.configs.recommended,
  {
    languageOptions: {
      globals: {
        figma: "readonly",
        __html__: "readonly",
        console: "readonly",
      },
    },
    plugins: {
      "@figma/figma-plugins": figmaPlugin,
    },
    rules: {
      ...figmaPlugin.configs.recommended.rules,
      "@figma/figma-plugins/ban-deprecated-id-params": "off",
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
