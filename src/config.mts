import fs from 'node:fs';
import path from 'node:path';

// import winston from 'winston';
import dotenv from 'dotenv';

import { ConfigTS } from '@config/config.type.mjs';

export { ConfigTS } from '@config/config.type.mjs';

const __dirname = import.meta.dirname;

export const programRoot = path.resolve( __dirname, '..' );
export const configRoot = path.join( programRoot, 'config' );

export function tryResolve( pathname: string ) {
	// 內建的 import.meta.resolve 不會對僅僅不存在檔案就拋出錯誤
	const resolved = import.meta.resolve( pathname, configRoot );
	// eslint-disable-next-line security/detect-non-literal-fs-filename
	if ( !fs.existsSync( new URL( resolved ) ) ) {
		throw new Error( `[ERR_MODULE_NOT_FOUND] "${ pathname }" isn't exists.` );
	}
	return resolved;
}

export let configPath: string;

if ( process.argv.includes( '--icconfig' ) ) {
	const argumentConfigPath: string = process.argv[ process.argv.indexOf( '--icconfig' ) + 1 ];
	try {
		globalThis.configPath = tryResolve( path.join( configRoot, argumentConfigPath ) );
	} catch ( error ) {
		if ( String( error ).match( 'ERR_MODULE_NOT_FOUND' ) ) {
			try {
				globalThis.configPath = tryResolve( path.join( programRoot, argumentConfigPath ) );
			} catch ( error2 ) {
				if ( String( error2 ).match( 'ERR_MODULE_NOT_FOUND' ) ) {
					globalThis.configPath = tryResolve( argumentConfigPath );
				} else {
					throw error2;
				}
			}
		} else {
			throw error;
		}
	}
} else {
	globalThis.configPath = tryResolve( path.join( configRoot, 'config.mjs' ) );
}

// eslint-disable-next-line security/detect-non-literal-fs-filename
if ( fs.existsSync( path.join( configRoot, '.env' ) ) ) {
	dotenv.config( {
		path: path.join( configRoot, '.env' ),
	} );
}

// eslint-disable-next-line unicorn/no-await-expression-member
const config: ConfigTS = ( await import( globalThis.configPath ) ).default;

// winston.debug( 'load config from "' + global.configPath + '".' );

export default config;
