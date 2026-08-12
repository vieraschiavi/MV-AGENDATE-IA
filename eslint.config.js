// Configuración de ESLint (flat config, ESLint 9+).
// Corre con: npm run lint
//
// Alcance: el código vivo que escribimos a mano — src/, api/, test/, scripts/
// y electron/. Queda afuera todo lo generado o de terceros (bundles
// compilados, artefactos de build, node_modules).
import js from '@eslint/js';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';

// Globals de Node (los que usa este repo). Se declaran a mano para no sumar
// la dependencia `globals` sólo por esto.
const GLOBALS_NODE = {
  process: 'readonly',
  console: 'readonly',
  Buffer: 'readonly',
  URL: 'readonly',
  URLSearchParams: 'readonly',
  TextEncoder: 'readonly',
  TextDecoder: 'readonly',
  AbortController: 'readonly',
  AbortSignal: 'readonly',
  fetch: 'readonly',
  setTimeout: 'readonly',
  clearTimeout: 'readonly',
  setInterval: 'readonly',
  clearInterval: 'readonly',
  setImmediate: 'readonly',
  queueMicrotask: 'readonly',
  structuredClone: 'readonly',
  crypto: 'readonly',
  __dirname: 'readonly',
  __filename: 'readonly',
  module: 'writable',
  require: 'readonly',
  exports: 'writable',
  global: 'readonly',
};

// Globals del navegador, para el front (public/js, webapp/src, movil) y los
// service workers.
const GLOBALS_BROWSER = {
  window: 'readonly',
  document: 'readonly',
  navigator: 'readonly',
  location: 'readonly',
  localStorage: 'readonly',
  sessionStorage: 'readonly',
  fetch: 'readonly',
  console: 'readonly',
  alert: 'readonly',
  confirm: 'readonly',
  prompt: 'readonly',
  setTimeout: 'readonly',
  clearTimeout: 'readonly',
  setInterval: 'readonly',
  clearInterval: 'readonly',
  requestAnimationFrame: 'readonly',
  URL: 'readonly',
  URLSearchParams: 'readonly',
  FormData: 'readonly',
  Blob: 'readonly',
  File: 'readonly',
  FileReader: 'readonly',
  Image: 'readonly',
  Audio: 'readonly',
  AudioContext: 'readonly',
  MediaRecorder: 'readonly',
  WebSocket: 'readonly',
  CustomEvent: 'readonly',
  Event: 'readonly',
  Notification: 'readonly',
  AbortController: 'readonly',
  crypto: 'readonly',
  btoa: 'readonly',
  atob: 'readonly',
  // Service workers
  self: 'readonly',
  caches: 'readonly',
  clients: 'readonly',
  skipWaiting: 'readonly',
  registration: 'readonly',
};

export default [
  {
    // No tiene sentido lintear lo que no editamos a mano.
    ignores: [
      'node_modules/**',
      'webapp/node_modules/**',
      'dist-instalador/**',
      'dist-protegido/**',
      'INSTALADOR/**',
      'public/app/**',        // bundle compilado de Vite (React)
      'public/vendor/**',     // código de terceros (botid), no se edita acá
      '.claude/helpers/**',   // los escribe `graft init` y los pisa al actualizar
      'movil/android-apk/**',
      'promo/**',
      'respaldo/**',
      'voces/**',
      'data/**',
    ],
  },

  // Reglas recomendadas de ESLint como piso.
  js.configs.recommended,

  // Código de servidor: ES modules sobre Node.
  {
    files: ['src/**/*.js', 'api/**/*.js', 'scripts/**/*.js', 'test/**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: GLOBALS_NODE,
    },
    rules: {
      // Un catch vacío suele ser un error tragado; exigimos que diga por qué.
      'no-empty': ['error', { allowEmptyCatch: false }],
      // Variables sin usar: se permiten args con guion bajo (convención del repo).
      'no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      }],
    },
  },

  // Front simple: scripts de las páginas públicas y la PWA móvil (sin React).
  {
    files: ['public/**/*.js', 'public/**/*.mjs', 'movil/**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: GLOBALS_BROWSER,
    },
    rules: {
      'no-empty': ['error', { allowEmptyCatch: false }],
      'no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      }],
    },
  },

  // SPA del workspace: React + JSX, se compila aparte con Vite.
  // Los plugins de React son necesarios para que `no-unused-vars` entienda que
  // un componente usado sólo dentro de JSX (<Creditos />) SÍ está en uso.
  {
    files: ['webapp/src/**/*.js', 'webapp/src/**/*.jsx'],
    plugins: { react, 'react-hooks': reactHooks },
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: GLOBALS_BROWSER,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    settings: { react: { version: 'detect' } },
    rules: {
      ...react.configs.flat.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      // El proyecto usa el JSX transform automático; no hace falta que cada
      // archivo tenga React en el scope.
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',
      // Las comillas literales en prosa castellana renderizan bien y escribir
      // &quot; en cada texto sólo ensucia la fuente. Se siguen vigilando `>` y
      // `}`, que sí suelen ser un typo de JSX.
      'react/no-unescaped-entities': ['error', { forbid: ['>', '}'] }],
      'no-empty': ['error', { allowEmptyCatch: false }],
      'no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      }],
    },
  },

  // Electron corre en CommonJS aunque la raíz del repo sea ESM (.cjs).
  {
    files: ['electron/**/*.cjs'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'commonjs',
      globals: GLOBALS_NODE,
    },
  },
];
