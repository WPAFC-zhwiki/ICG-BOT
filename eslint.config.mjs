// @ts-check
// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="./types/eslint-plugins.d.ts" />
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import eslint from '@eslint/js';
import { includeIgnoreFile } from '@eslint/compat';
import tsEslint from 'typescript-eslint';
import stylisticJs from '@stylistic/eslint-plugin';

import pluginEsX from 'eslint-plugin-es-x';
import pluginImport from 'eslint-plugin-import';
import pluginJsonEs from 'eslint-plugin-json-es';
import pluginN from 'eslint-plugin-n';
import pluginSecurity from 'eslint-plugin-security';
import pluginUnicorn from 'eslint-plugin-unicorn';
import pluginJsdoc from 'eslint-plugin-jsdoc';

import packageJson from './package.json' with { type: 'json' };

const __dirname = import.meta.dirname ?? path.dirname( fileURLToPath( import.meta.url ) );
const tsconfigPath = path.join( __dirname, 'tsconfig.json' );

const bannedFromIgnoredFiles = includeIgnoreFile( path.join( __dirname, '.gitignore' ) ).ignores ?? [];
// 讓 *-nogit-* 也被 eslint 校驗
bannedFromIgnoredFiles.splice(
	bannedFromIgnoredFiles.findIndex( value => value.includes( '*-nogit-*' ) ),
	1
);

export default tsEslint.config(
	{
		ignores: [ ...bannedFromIgnoredFiles, '!.*.*', '.*/*', 'node_modules/*', 'config/*js' ],
	},
	eslint.configs.recommended,
	// @ts-expect-error TS2345
	pluginSecurity.configs.recommended,
	tsEslint.configs.recommended,
	pluginImport.flatConfigs.recommended,
	pluginEsX.configs[ 'flat/restrict-to-es2023' ],
	pluginN.configs[ 'flat/recommended-module' ],
	pluginUnicorn.configs[ 'flat/recommended' ],
	pluginJsdoc.configs[ 'flat/recommended' ],
	{
		plugins: {
			'@stylistic': stylisticJs,
		},
		languageOptions: {
			parser: tsEslint.parser,
			ecmaVersion: 12,
			globals: {
				$: 'off',
			},
			sourceType: 'module',
		},
		linterOptions: {
			reportUnusedDisableDirectives: true,
		},
		ignores: [ '*.json' ],
		rules: {
			'array-callback-return': 'error',
			'block-scoped-var': 'error',
			curly: [ 'error', 'all' ],
			'dot-notation': [ 'error' ],
			eqeqeq: 'error',
			'new-cap': [
				'error',
				{
					newIsCapExceptions: [ 'mwn' ],
					newIsCapExceptionPattern: String.raw`^mwn\..|^mw[Bb]ot\..`,
					newIsCap: true,
					capIsNew: false,
					properties: true,
				},
			],
			'no-array-constructor': 'error',
			'no-bitwise': 'error',
			'no-caller': 'error',
			'no-console': 'off',
			'no-constant-binary-expression': 'error',
			'no-constant-condition': [ 'error', { checkLoops: false } ],
			'no-empty': [ 'error', { allowEmptyCatch: true } ],
			'no-eval': 'error',
			'no-extend-native': 'error',
			'no-extra-bind': 'error',
			'no-extra-label': 'error',
			'no-implicit-coercion': [ 'error', { string: true, boolean: false, number: false } ],
			'no-implicit-globals': 'error',
			'no-label-var': 'error',
			'no-loop-func': 'error',
			'no-loss-of-precision': 'error',
			'no-new': 'error',
			'no-new-func': 'error',
			'no-new-object': 'error',
			'no-new-wrappers': 'error',
			'no-nonoctal-decimal-escape': 'error',
			'no-octal-escape': 'error',
			'no-proto': 'error',
			'no-prototype-builtins': 'error',
			'no-return-assign': 'error',
			'no-script-url': 'error',
			'no-self-compare': 'error',
			'no-sequences': 'error',
			'no-shadow': [ 'error', { hoist: 'all' } ],
			'no-shadow-restricted-names': 'error',
			'no-throw-literal': 'error',
			'no-undef-init': 'error',
			'no-unmodified-loop-condition': 'error',
			'no-unneeded-ternary': [ 'error', { defaultAssignment: false } ],
			'no-unreachable-loop': 'error',
			'no-unused-expressions': 'error',
			'no-unused-vars': [
				'error',
				{
					vars: 'all',
					args: 'after-used',
					ignoreRestSiblings: false,
					argsIgnorePattern: '^_',
				},
			],
			'no-useless-call': 'error',
			'no-useless-concat': 'error',
			'no-void': 'error',
			'no-with': 'error',
			'one-var': 'off',
			'prefer-const': 'off',
			'prefer-numeric-literals': 'error',
			'prefer-regex-literals': 'error',
			strict: [ 'error' ],
			'unicode-bom': [ 'error' ],
			'vars-on-top': 'off',
			yoda: [ 'error', 'never' ],
			'@stylistic/array-bracket-spacing': [ 'error', 'always' ],
			'@stylistic/block-spacing': 'error',
			'@stylistic/brace-style': [ 'error', '1tbs' ],
			'@stylistic/comma-dangle': [
				'error',
				{
					arrays: 'always-multiline',
					objects: 'always-multiline',
					imports: 'never',
					exports: 'always-multiline',
					functions: 'never',
					importAttributes: 'never',
					dynamicImports: 'never',
				},
			],
			'@stylistic/comma-spacing': [ 'error', { before: false, after: true } ],
			'@stylistic/comma-style': [ 'error', 'last' ],
			'@stylistic/computed-property-spacing': [ 'error', 'always' ],
			'@stylistic/dot-location': [ 'error', 'property' ],
			'@stylistic/eol-last': 'error',
			'@stylistic/func-call-spacing': 'error',
			'@stylistic/indent': [ 'error', 'tab', { SwitchCase: 1 } ],
			'@stylistic/key-spacing': [ 'error', { beforeColon: false, afterColon: true } ],
			'@stylistic/keyword-spacing': 'error',
			'@stylistic/linebreak-style': [ 'error', 'unix' ],
			'@stylistic/max-len': [
				'warn',
				{
					code: 120,
					tabWidth: 4,
					ignorePattern: '^// eslint-.+',
					ignoreUrls: true,
					ignoreComments: false,
					ignoreRegExpLiterals: true,
					ignoreStrings: true,
					ignoreTemplateLiterals: true,
				},
			],
			'@stylistic/max-statements-per-line': [ 'error', { max: 1 } ],
			'@stylistic/new-parens': 'error',
			'@stylistic/no-floating-decimal': 'error',
			'@stylistic/no-multi-spaces': 'error',
			'@stylistic/no-multiple-empty-lines': [ 'error', { max: 1, maxBOF: 0, maxEOF: 0 } ],
			'@stylistic/no-tabs': [ 'error', { allowIndentationTabs: true } ],
			'@stylistic/no-trailing-spaces': 'error',
			'@stylistic/no-whitespace-before-property': 'error',
			'@stylistic/object-curly-spacing': [ 'error', 'always' ],
			'@stylistic/operator-linebreak': [ 'error', 'after' ],
			'@stylistic/quote-props': [ 'error', 'as-needed' ],
			'@stylistic/quotes': [ 'error', 'single', { avoidEscape: true } ],
			'@stylistic/semi': [ 'error', 'always' ],
			'@stylistic/semi-spacing': [ 'error', { before: false, after: true } ],
			'@stylistic/semi-style': [ 'error', 'last' ],
			'@stylistic/space-before-blocks': [ 'error', 'always' ],
			'@stylistic/space-before-function-paren': [ 'error', { anonymous: 'always', named: 'never' } ],
			'@stylistic/space-in-parens': [ 'error', 'always', { exceptions: [ 'empty' ] } ],
			'@stylistic/space-infix-ops': 'error',
			'@stylistic/space-unary-ops': [ 'error', { words: true, nonwords: false } ],
			'@stylistic/spaced-comment': [ 'error', 'always', { exceptions: [ '*', '!' ], block: { balanced: true } } ],
			'@stylistic/switch-colon-spacing': [ 'error', { after: true, before: false } ],
			'@stylistic/template-curly-spacing': [ 'error', 'always' ],
			'@stylistic/wrap-iife': 'error',
			'@typescript-eslint/explicit-member-accessibility': [
				'error',
				{
					accessibility: 'explicit',
				},
			],
			'es-x/no-hashbang': 'off',
			'import/no-unresolved': 'off',
			'jsdoc/check-param-names': [ 'warn', { allowExtraTrailingParamDocs: true } ],
			'jsdoc/check-tag-names': [ 'warn', { definedTags: [ 'ignore', 'internal', 'stable' ] } ],
			'jsdoc/check-values': 'off',
			'jsdoc/empty-tags': 'off',
			'jsdoc/no-blank-block-descriptions': 'warn',
			'jsdoc/no-blank-blocks': 'warn',
			'jsdoc/no-defaults': 'off',
			'jsdoc/no-multi-asterisks': [ 'error', { allowWhitespace: true } ],
			'jsdoc/require-asterisk-prefix': 'error',
			'jsdoc/require-jsdoc': 'off',
			'jsdoc/require-param-description': 'off',
			'jsdoc/require-property': 'off',
			'jsdoc/require-property-description': 'off',
			'jsdoc/require-property-name': 'off',
			'jsdoc/require-returns-description': 'off',
			'jsdoc/tag-lines': [ 'warn', 'any', { startLines: 1 } ],
			'n/no-unsupported-features/node-builtins': [
				'error',
				{
					version: packageJson.engines.node,
					allowExperimental: true,
				},
			],
			'security/detect-object-injection': 'off',
			'unicorn/catch-error-name': [
				'error',
				{
					ignore: [ String.raw`^error\d*$`, /^ignore/i ],
				},
			],
			'unicorn/filename-case': 'off',
			'unicorn/prevent-abbreviations': [
				'error',
				{
					replacements: {
						str: false,
						args: false,
						func: false,
						ctx: false,
						temp: false,
					},
				},
			],
			'unicorn/prefer-date-now': 'error',
			'unicorn/prefer-string-slice': 'error',
			'unicorn/switch-case-braces': [ 'error', 'avoid' ],
			'unicorn/throw-new-error': 'error',
		},
		settings: {
			jsdoc: {
				tagNamePreference: {
					augments: 'extends',
					func: 'method',
					function: 'method',
					returns: 'return',
				},
				preferredTypes: {
					$: 'jQuery',
					array: 'Array',
					Boolean: 'boolean',
					date: 'Date',
					error: 'Error',
					function: 'Function',
					mixed: 'Mixed',
					Null: 'null',
					Number: 'number',
					object: 'Object',
					regexp: 'RegExp',
					set: 'Set',
					String: 'string',
					Undefined: 'undefined',
				},
				mode: 'typescript',
			},
			'es-x': { aggressive: true },
		},
	},
	{
		files: [ '*.json' ],
		languageOptions: {
			parser: pluginJsonEs,
		},
		...pluginJsonEs.configs.recommended,
	},
	{
		files: [ '*.ts', '**/*.ts', '*.mts', '**/*.mts' ],
		languageOptions: {
			parser: tsEslint.parser,
			parserOptions: {
				project: tsconfigPath,
			},
		},
		plugins: {
			'@import': pluginImport.configs.typescript,
		},
		rules: {
			'no-unused-vars': 'off',
			'no-shadow': 'off',
			'@typescript-eslint/no-deprecated': [ 'warn' ],
			'@typescript-eslint/no-require-imports': [
				'error',
				{
					allowAsImport: true,
				},
			],
			'es-x/no-class-fields': 'off',
			'import/order': [
				'error',
				{
					groups: [ 'builtin', 'external', 'internal', [ 'parent', 'sibling' ], 'index', 'unknown' ],
					'newlines-between': 'always',
					alphabetize: {
						order: 'asc',
						caseInsensitive: true,
					},
					warnOnUnassignedImports: true,
					pathGroupsExcludedImportTypes: [ 'builtin', 'object' ],
					pathGroups: [
						{
							pattern: 'bun',
							group: 'builtin',
						},
						{
							pattern: '__isTSMode__',
							group: 'internal',
							position: 'before',
						},
						{
							pattern: '@app/lib/**',
							group: 'internal',
							position: 'after',
						},
						{
							pattern: '@app/modules/**',
							group: 'internal',
							position: 'after',
						},
					],
				},
			],
			// 註：完全無法辨識 compilerOptions.paths
			'n/no-missing-import': 'off',
			// 全部都不是 .mjs 沒有報告的意思
			'unicorn/prefer-module': 'off',
			'unicorn/prefer-top-level-await': 'off',
		},
		settings: {
			'import/resolver': {
				typescript: {
					alwaysTryTypes: true,
					project: tsconfigPath,
				},
			},
			n: {
				tsconfigPath,
				tryExtensions: [ '.js', '.ts', '.mjs', '.mts' ],
			},
		},
	},
	{
		files: [ '*.mts', '**/*.mts' ],
		rules: {
			'unicorn/prefer-module': 'error',
		},
	},
	{
		files: [ 'eslint.config.mjs', '**/*.d.ts' ],
		rules: {
			'node/no-missing-import': 'off',
			'@stylistic/spaced-comment': [
				'error',
				'always',
				{
					markers: [ '/' ],
				},
			],
		},
	}
);
