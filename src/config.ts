/* eslint-disable @typescript-eslint/no-var-requires */
import defaultConfig from '../config/config';
import { ConfigTS } from '../config/type';
import { repository as Repository } from '../package.json';
import path = require( 'path' );
export { ConfigTS } from '../config/type';
export { version } from '../package.json';
export const repository = Repository.replace( /^git\+/, '' );

let config: ConfigTS;

if ( process.argv.indexOf( '--icconfig' ) > -1 ) {
	const configPath = process.argv[ process.argv.indexOf( '--icconfig' ) + 1 ];
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
	config = defaultConfig;
}

export default config;
