
export default [
  {
    files: ['**/*.jsx', '**/*.js'],
    languageOptions: {
      ecmaVersion: 2022, sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { window:'readonly', document:'readonly', localStorage:'readonly', sessionStorage:'readonly',
        navigator:'readonly', console:'readonly', setTimeout:'readonly', clearTimeout:'readonly',
        setInterval:'readonly', clearInterval:'readonly', fetch:'readonly', Audio:'readonly', Image:'readonly',
        FormData:'readonly', Blob:'readonly', URL:'readonly', URLSearchParams:'readonly', requestAnimationFrame:'readonly',
        Notification:'readonly', caches:'readonly', AudioContext:'readonly', webkitAudioContext:'readonly',
        __VH_BUILD__:'readonly', FileReader:'readonly', MediaRecorder:'readonly', alert:'readonly', confirm:'readonly',
        prompt:'readonly', getComputedStyle:'readonly', ResizeObserver:'readonly', IntersectionObserver:'readonly',
        atob:'readonly', btoa:'readonly', crypto:'readonly', performance:'readonly', location:'readonly', history:'readonly' },
    },
    rules: {
      /* 🎯 A REGRA QUE FALTAVA: usar antes de declarar.
         Foi assim que o CRM ficou branco duas vezes hoje — const lido na hora
         do render antes de existir. O build nunca acusa. Esta regra acusa. */
      'no-use-before-define': ['error', { functions: false, classes: false, variables: true }],
      'no-undef': 'error',
      // ruído que não interessa aqui
      'no-unused-vars': 'off', 'no-empty': 'off', 'no-control-regex': 'off',
      'no-useless-escape': 'off', 'no-cond-assign': 'off', 'no-prototype-builtins': 'off',
      'no-constant-condition': 'off', 'no-fallthrough': 'off', 'no-misleading-character-class': 'off',
    },
  },
];
