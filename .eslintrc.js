module.exports = {
  extends: [
    'airbnb/legacy'
  ],
  parserOptions: {
    'ecmaVersion': 8,
    'sourceType': 'module'
  },
  rules: {
    'consistent-return': 0,
    //eqeqeq: [2, 'smart'], // ON IN LEGACY.JS BUT DIFFERENT eqeqeq: ['error', 'always', { null: 'ignore' }],
    'func-names': 0,
    //indent: [2, 2, { SwitchCase: 1 }], // ON IN LEGACY.JS BUT DIFFERENT
    //'keyword-spacing': [2, { before: true, after: true }], // ON IN LEGACY.JS BUT DIFFERENT
    'import/first': 2,
    'import/order': 2,
    'max-len': ["error", 150, { "ignoreRegExpLiterals": true, "ignoreStrings": true} ], // ON IN LEGACY.JS BUT DIFFERENT, ALLOWS DISABLING FOR STRINGS / COMMENTS ETC
    'new-cap': [2, { newIsCapExceptions: ['acl.memoryBackend', 'acl'] }],
    'no-param-reassign': 0, // ON IN LEGACY.JS BUT DIFFERENT, ALLOWS DISABLING FOR $scope etc
    'no-shadow': 0,
    //'no-unneeded-ternary': 2, // ON IN LEGACY.JS BUT DIFFERENT
    'no-restricted-syntax': [
      'error',
      'ForOfStatement',
      'LabeledStatement',
      'WithStatement',
    ],
    'no-underscore-dangle': 0,
    'no-unused-vars': 0,
    'no-use-before-define': [1, 'nofunc'],
    'one-var': [0, 'never'],
    //'spaced-comment': [2, 'always'], // ON IN LEGACY.JS BUT DIFFERENT
    //'wrap-iife': [2, 'outside'], // ON IN LEGACY.JS BUT DIFFERENT
    'vars-on-top': 0,
    'no-return-await': 0,
    "mocha/no-exclusive-tests": "error"
  },
  env: {
    node: true,
    es6: true,
    browser: true,
    jasmine: true,
    mocha: true,
    jquery: true
  },
  globals: {
    angular: true,
    by: true,
    browser: true,
    element: true,
    inject: true,
    io: true,
    moment: true,
    semver: true,
    Ajv: true,
    Modernizr: true,
    Promise: true,
    __TESTING__: true,
    _: false,
    ApplicationConfiguration: true,
    YAML: true,
    saveAs: true
  },
  "plugins": [
    "mocha",
    "import"
  ]
};
