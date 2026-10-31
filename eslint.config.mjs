import coreWebVitals from "eslint-config-next/core-web-vitals";
import typescript from "eslint-config-next/typescript";

const eslintConfig = [
  ...coreWebVitals,
  ...typescript,
  {
    // Reglas nuevas y estrictas de React 19 (compilador): se muestran como aviso hasta refactorizar.
    rules: {
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/refs": "warn",
    },
  },
  {
    // qa/ son scripts de verificación en Node (CommonJS, Playwright global); no forman parte de la aplicación.
    ignores: ["node_modules/**", ".next/**", "out/**", "build/**", "next-env.d.ts", "qa/**"],
  },
];

export default eslintConfig;
