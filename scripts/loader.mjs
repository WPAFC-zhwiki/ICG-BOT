// @ts-check
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { serializeError } from 'serialize-error';
import ts from 'typescript';
import tsNode from 'ts-node';

const __dirname = import.meta.dirname;
const projectRoot = path.dirname( __dirname );

const tsc = await ( async () => {
	const tsconfigJson = path.join( projectRoot, 'tsconfig.json' );

	const configFile = ts.readConfigFile( tsconfigJson, ts.sys.readFile );
	if ( configFile.error ) {
		throw new Error(
			`Error parsing tsconfig.json: ${ configFile.error.messageText }`
		);
	}

	return ts.parseJsonConfigFileContent( configFile.config, ts.sys, projectRoot );
} )();

tsc.options.noEmit = false;
tsc.options.noEmitOnError = false;
tsc.options.sourceMap = true;
tsc.options.inlineSourceMap = true;
tsc.options.inlineSources = true;

const host = ts.createCompilerHost( tsc.options );

const cache =
	host.getModuleResolutionCache?.() ??
	ts.createModuleResolutionCache(
		projectRoot,
		( s ) => host.getCanonicalFileName( s )
	);

const typescriptExtension = new Set( [ '.ts', '.cts', '.mts' ] );

let shouldCastAsTs = false;
const getEsmHook = ( () => {
	/** @type {tsNode.Service} */
	let tsNodeServer;
	/** @type {tsNode.NodeLoaderHooksAPI2} */
	let esmHook;
	// eslint-disable-next-line no-shadow
	return function getEsmHook() {
		if ( shouldCastAsTs ) {
			tsNodeServer ??= tsNode.create( {
				cwd: projectRoot,
			} );
			// Node version > 20
			// @ts-expect-error TS2322
			esmHook ??= tsNode.createEsmHooks( tsNodeServer );
			return esmHook;
		}
		return false;
	};
} )();

/**
 * @param {string} pathname
 * @return {string[]}
 */
function getAllExtensionName( pathname ) {
	const result = [];
	let m = path.extname( pathname );
	while ( m ) {
		result.unshift( m );
		pathname = pathname.slice( 0, -m.length );
		m = path.extname( pathname );
	}
	return result;
}

/**
 * @param {Object} [data]
 * @param {boolean} [data.enableTypescript]
 */
export async function initialize( { enableTypescript } = {} ) {
	// Receives data from `register`.
	shouldCastAsTs = !!enableTypescript;
}

const loadErrorWrapperSpecifier = '__loadErrorWrapper__';
const isTypescriptSpecifier = '__isTSMode__';

/**
 * @param {string} specifier
 * @param {import('node:module').ResolveHookContext} context
 * @param {Parameters<import('node:module').ResolveHook>[2]} nextResolve
 * @return {Promise<import('node:module').ResolveFnOutput>}
 */
export async function resolve( specifier, context, nextResolve ) {
	if ( specifier === loadErrorWrapperSpecifier ) {
		return {
			shortCircuit: true,
			url: pathToFileURL( path.join( __dirname, 'lib', 'loadErrorWrapper.mjs' ) ).href,
		};
	} else if ( specifier === isTypescriptSpecifier ) {
		return {
			shortCircuit: true,
			url: `data:text/javascript;base64,${ Buffer.from( 'export default ' + ( shouldCastAsTs ? 'true' : 'false' ) + ';', 'utf8' ).toString( 'base64' ) }`,
		};
	}

	// 不處理任何疑似包含相對路徑的模組
	if ( !specifier.startsWith( '.' ) && context.parentURL && context.parentURL.startsWith( 'file:' ) ) {
		const resolveResult = ts.resolveModuleName(
			specifier,
			path.join( projectRoot, 'noop.mjs' ),
			tsc.options,
			host,
			cache
		);
		if ( resolveResult.resolvedModule ) {
			const resolvedPath = ( ( resolved ) => {
				if ( /[/\\](node_modules|@types)[/\\]/.test( resolved ) ) {
					// 不要嘗試處理 node_modules 裡，或是根本就是 typings 的東西
					return false;
				}

				const extensions = getAllExtensionName( resolved );
				if ( extensions.length > 0 ) {
					const lastExtension = extensions.at( -1 );
					assert( lastExtension );

					// 註：根據規範，僅允許 .d.<ext>.ts，.d.<ext>.cts 和 .d.<ext>.mts 都是無效的
					if ( extensions.at( -3 ) === '.d' && lastExtension === '.ts' ) {
						let realExtension = extensions.at( -2 );
						assert( realExtension );
						const target = resolved.slice( 0, -( realExtension.length + 5 /** .d.ts */ ) ) + realExtension;
						// eslint-disable-next-line security/detect-non-literal-fs-filename
						if ( !fs.existsSync( target ) ) {
							// 只是一個沒有對應到檔案的無效 .d.<ext>.ts
							return false;
						}
						return target;
					}

					if ( extensions.at( -2 ) === '.d' && typescriptExtension.has( lastExtension ) ) {
						// .d.ts => .js
						// .d.cts => .cjs
						// .d.mts => .mjs
						let target = resolved.slice( 0, -( lastExtension.length + 2 /** .d */ ) ) + lastExtension.slice( 0, -2 ) + 'js';
						// eslint-disable-next-line security/detect-non-literal-fs-filename
						if ( !fs.existsSync( target ) ) {
							if ( lastExtension === '.mjs' ) {
								// 只是一個沒有對應到檔案的無效 .d.mts
								return false;
							} else {
								// 處理舊式 .json.d.ts
								target = resolved.slice( 0, -( lastExtension.length + 2 /** .d */ ) );
								// eslint-disable-next-line security/detect-non-literal-fs-filename
								if ( !fs.existsSync( target ) ) {
									// 只是一個沒有對應到檔案的無效 .d.ts / .d.cts
									return false;
								}
							}
						}
						return target;
					}

					if ( !shouldCastAsTs && typescriptExtension.has( lastExtension ) ) {
						// .ts => .js
						// .cts => .cjs
						// .mts => .mjs
						const target = resolved.slice( 0, -2 ) + 'js';
						// eslint-disable-next-line security/detect-non-literal-fs-filename
						if ( !fs.existsSync( target ) ) {
							// 沒有轉譯過
							return false;
						}
						return target;
					}

					return resolved;
				}
			} )( resolveResult.resolvedModule.resolvedFileName );

			if ( resolvedPath ) {
				return {
					shortCircuit: true,
					url: pathToFileURL( resolvedPath ).href,
				};
			}
		}
	}

	return nextResolve( specifier, context );
}

/**
 * @param {string} url
 * @param {import('node:module').LoadHookContext} context
 * @param {Parameters<import('node:module').LoadHook>[2]} nextLoad
 * @return {Promise<import('node:module').LoadFnOutput>}
 */
export async function load( url, context, nextLoad ) {
	const moduleExtension = path.extname( url );
	if (
		shouldCastAsTs &&
		url.startsWith( 'file:' ) &&
		typescriptExtension.has( moduleExtension )
	) {
		const hook = getEsmHook();
		if ( hook ) {
			try {
				// @ts-expect-error TS2322, TS2345
				return await hook.load( url, context, nextLoad );
			} catch ( error ) {
				if ( error && typeof error === 'object' && error instanceof Error ) {
					return {
						format: 'module',
						source: `import { throwError } from '${ loadErrorWrapperSpecifier }';\nthrowError( ${ JSON.stringify( serializeError( error ) ) } );`,
						shortCircuit: true,
					};
				}
				throw error;
			}
		}
	} else if ( !url.startsWith( 'node:' ) && !url.startsWith( 'file:' ) && !url.startsWith( 'data:' ) ) {
		const error = new Error( `Import target isn't support: ${ url }.` );
		return {
			format: 'module',
			source: `import { throwError } from '${ loadErrorWrapperSpecifier }';\nthrowError( ${ JSON.stringify( serializeError( error ) ) } );`,
			shortCircuit: true,
		};
	}

	return nextLoad( url, context );
}
