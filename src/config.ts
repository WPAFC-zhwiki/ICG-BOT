import fs = require( 'node:fs' );
import path = require( 'node:path' );

// import winston = require( 'winston' );
import dotenv = require( 'dotenv' );

import { ConfigTS } from '@config/config.type';
import { repository as Repository } from '@package.json';

export { ConfigTS } from '@config/config.type';
export { version } from '@package.json';
export const repository: string = Repository.replace( /^git\+/, '' );

export const programRoot = path.resolve( __dirname, '..' );
export const configRoot = path.join( programRoot, 'config' );

export let configPath: string;

if ( process.argv.includes( '--icconfig' ) ) {
	const argumentConfigPath: string = process.argv[ process.argv.indexOf( '--icconfig' ) + 1 ];
	try {
		globalThis.configPath = require.resolve( path.join( configRoot, argumentConfigPath ) );
	} catch ( error ) {
		if ( String( error ).match( 'Cannot find module' ) ) {
			try {
				globalThis.configPath = require.resolve( path.join( programRoot, argumentConfigPath ) );
			} catch ( error2 ) {
				if ( String( error2 ).match( 'Cannot find module' ) ) {
					globalThis.configPath = require.resolve( argumentConfigPath );
				} else {
					throw error2;
				}
			}
		} else {
			throw error;
		}
	}
} else {
	globalThis.configPath = require.resolve( path.join( configRoot, 'config' ) );
}

if ( fs.existsSync( path.join( configRoot, '.env' ) ) ) {
	dotenv.config( {
		path: path.join( configRoot, '.env' ),
	} );
}

// eslint-disable-next-line security/detect-non-literal-require, @typescript-eslint/no-require-imports
const config: ConfigTS = require( globalThis.configPath ).default;

// winston.debug( 'load config from "' + global.configPath + '".' );

export default config;
