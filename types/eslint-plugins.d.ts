declare module '@internal/eslint-plugin-exports' {
	import type {
		ESLint
	} from 'eslint';

	declare const plugin: ESLint.Plugin & Required<Pick<ESLint.Plugin, 'configs'>>;
	export = plugin;
}

declare module 'eslint-plugin-es-x' {
	import module = require( '@internal/eslint-plugin-exports' );
	export = module;
}

declare module 'eslint-plugin-import' {
	import module = require( '@internal/eslint-plugin-exports' );
	const exports: typeof module & {
		flatConfigs: typeof module['configs']
	};
	export = exports;
}

declare module 'eslint-plugin-json-es' {
	import module = require( '@internal/eslint-plugin-exports' );
	export = module;
}

declare module 'eslint-plugin-security' {
	import module = require( '@internal/eslint-plugin-exports' );
	export = module;
}
