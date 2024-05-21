import fs = require( 'node:fs' );
import path = require( 'node:path' );

// import winston = require( 'winston' );
import dotenv = require( 'dotenv' );

import { ConfigTS } from '@config/config.type';
import { repository as Repository } from '@package.json';

export { ConfigTS, MessageAssociation } from '@config/config.type';
export { version } from '@package.json';
export const repository: string = Repository.replace( /^git\+/, '' );

export const programRoot = path.resolve( __dirname, '..' );
export const configRoot = path.join( programRoot, 'config' );

export let configPath: string;

if ( process.argv.includes( '--icconfig' ) ) {
	const argConfigPath: string = process.argv[ process.argv.indexOf( '--icconfig' ) + 1 ];
	try {
		global.configPath = require.resolve( path.join( configRoot, argConfigPath ) );
	} catch ( err1 ) {
		if ( String( err1 ).match( 'Cannot find module' ) ) {
			try {
				global.configPath = require.resolve( path.join( programRoot, argConfigPath ) );
			} catch ( err2 ) {
				if ( String( err2 ).match( 'Cannot find module' ) ) {
					global.configPath = require.resolve( argConfigPath );
				} else {
					throw err2;
				}
			}
		} else {
			throw err1;
		}
	}
} else {
	global.configPath = require.resolve( path.join( configRoot, 'config' ) );
}

if ( fs.existsSync( path.join( configRoot, '.env' ) ) ) {
	dotenv.config( {
		path: path.join( configRoot, '.env' )
	} );
}

// eslint-disable-next-line @typescript-eslint/no-var-requires, security/detect-non-literal-require
const config: ConfigTS = require( global.configPath ).default;

// winston.debug( 'load config from "' + global.configPath + '".' );

export default config;
