/* eslint-disable @typescript-eslint/no-var-requires */
import { ConfigTS } from 'config/type';
import { repository as Repository } from 'package.json';
import path = require( 'path' );

export { ConfigTS } from 'config/type';
export { version } from 'package.json';
export const repository: string = Repository.replace( /^git\+/, '' );

let config: ConfigTS;

if ( process.argv.indexOf( '--icconfig' ) > -1 ) {
	const configPath: string = process.argv[ process.argv.indexOf( '--icconfig' ) + 1 ];
	try {
		config = require( path.join( __dirname, '../config', configPath ) ).default;
	} catch ( err1 ) {
		if ( String( err1 ).match( 'Cannot find module' ) ) {
			try {
				config = require( path.join( __dirname, '../', configPath ) ).default;
			} catch ( err2 ) {
				if ( String( err2 ).match( 'Cannot find module' ) ) {
					config = require( configPath ).default;
				} else {
					throw err2;
				}
			}
		} else {
			throw err1;
		}
	}
} else {
	config = require( path.join( __dirname, '../config', 'config' ) ).default;
}

export default config;
