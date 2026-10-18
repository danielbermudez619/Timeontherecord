const security = require('eslint-plugin-security');

const securityRules = {
  'security/detect-object-injection': 'warn',
  'security/detect-non-literal-fs-filename': 'warn',
  'security/detect-non-literal-require': 'warn',
  'security/detect-possible-timing-attacks': 'warn',
  'security/detect-unsafe-regex': 'error',
  'security/detect-buffer-noassert': 'error',
  'security/detect-child-process': 'error',
  'security/detect-disable-mustache-escape': 'error',
  'security/detect-eval-with-expression': 'error',
  'security/detect-no-csrf-before-method-override': 'error',
  'security/detect-pseudoRandomBytes': 'error',
  'security/detect-new-buffer': 'error',
  // Core rules that catch code-injection sinks in either environment.
  'no-eval': 'error',
  'no-implied-eval': 'error',
  'no-new-func': 'error',
  'no-script-url': 'error',
};

module.exports = [
  {
    files: ['server.js', 'eslint.config.js'],
    languageOptions: {
      ecmaVersion: 2021,
      sourceType: 'commonjs',
      globals: {
        require: 'readonly',
        module: 'readonly',
        exports: 'writable',
        process: 'readonly',
        console: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        Buffer: 'readonly',
      },
    },
    plugins: {
      security,
    },
    rules: securityRules,
  },
  // Client-side code served to the Zoom panel and the static pages.
  {
    files: ['public/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
    },
    plugins: {
      security,
    },
    rules: securityRules,
  },
  {
    files: ['public/zoom-sdk.js'],
    languageOptions: {
      sourceType: 'module',
    },
  },
];
