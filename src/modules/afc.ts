import fs = require( 'node:fs' );
import path = require( 'node:path' );

import winston = require( 'winston' );

winston.debug( '[afc] Loading commands:' );

const commandFiles = fs
	.readdirSync( path.join( __dirname, 'afc/commands' ) )
	.filter( ( file ) => file.match( /\.[jt]s$/ ) );

for ( const file of commandFiles ) {
	// eslint-disable-next-line security/detect-non-literal-require, @typescript-eslint/no-require-imports
	require( `@app/modules/afc/commands/${ file }` );
	winston.debug( `[afc] - ${ path.parse( file ).name }` );
}

winston.debug( '[afc] Loading events:' );

const eventFiles = fs
	.readdirSync( path.join( __dirname, 'afc/events' ) )
	.filter( ( file ) => file.match( /\.[jt]s$/ ) );

for ( const file of eventFiles ) {
	// eslint-disable-next-line security/detect-non-literal-require, @typescript-eslint/no-require-imports
	require( `@app/modules/afc/events/${ file }` );
	winston.debug( `[afc] - ${ path.parse( file ).name }` );
}

import { checkRegister } from '@app/modules/afc/util';

checkRegister();
