import fs from 'fs';
import path from 'path';

import winston = require( 'winston' );

winston.debug( '[afc.js] Loading commands:' );

const commandFiles = fs
	.readdirSync( path.join( __dirname, 'afc/commands' ) )
	.filter( ( file ) => file.endsWith( '.js' ) );

for ( const file of commandFiles ) {
	require( `./afc/commands/${ file }` );
	winston.debug( `[afc.js] - ${ path.parse( file ).name }` );
}

winston.debug( '[afc.js] Loading events:' );

const eventFiles = fs
	.readdirSync( path.join( __dirname, 'afc/events' ) )
	.filter( ( file ) => file.endsWith( '.js' ) );

for ( const file of eventFiles ) {
	require( `./afc/events/${ file }` );
	winston.debug( `[afc.js] - ${ path.parse( file ).name }` );
}
