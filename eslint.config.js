import js from '@eslint/js';
import globals from 'globals';
import pluginVue from 'eslint-plugin-vue';

export default [
    {ignores: ['node_modules/', 'storage/', 'dist/']},

    js.configs.recommended,

    // Vue SFC: только правила корректности (essential), без навязывания
    // форматирования шаблонов - формат задают правила ниже.
    ...pluginVue.configs['flat/essential'],

    {
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'module',
            globals: {...globals.browser, ...globals.es2021},
        },

        rules: {
            // Google JS Style
            'indent': ['error', 4],
            'quotes': ['error', 'single'],
            'semi': ['error', 'always'],
            'no-var': 'error',
            'prefer-const': 'error',
            'comma-dangle': ['error', 'always-multiline'],
            'arrow-parens': ['error', 'always'],
            'eol-last': 'error',
            'no-trailing-spaces': 'error',
            'space-before-function-paren': ['error', {
                anonymous: 'never',
                named: 'never',
                asyncArrow: 'always',
            }],
            'key-spacing': 'error',
            'keyword-spacing': 'error',
            'space-infix-ops': 'error',
            'object-curly-spacing': ['error', 'never'],
            'curly': ['error', 'all'],
            'brace-style': ['error', '1tbs'],
            'padding-line-between-statements': [
                'error',
                {blankLine: 'always', prev: '*', next: 'return'},
                {blankLine: 'always', prev: ['const', 'let', 'var'], next: '*'},
                {blankLine: 'any', prev: ['const', 'let', 'var'], next: ['const', 'let', 'var']},
                {blankLine: 'always', prev: 'block-like', next: '*'},
                {blankLine: 'always', prev: '*', next: 'block-like'},
            ],

            // Качество кода
            'no-unused-vars': ['warn', {argsIgnorePattern: '^_'}],
            'max-len': ['warn', {
                code: 150,
                ignoreUrls: true,
                ignoreStrings: true,
                ignoreTemplateLiterals: true,
                ignoreRegExpLiterals: true,
            }],
        },
    },

    // Компонент верхнего уровня называется одним словом - это нормально.
    {
        files: ['**/*.vue'],
        rules: {
            'vue/multi-word-component-names': 'off',
        },
    },
];
