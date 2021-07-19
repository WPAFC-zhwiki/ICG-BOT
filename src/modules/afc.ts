import fs from 'fs';
import path from 'path';

import winston = require( 'winston' );

winston.debug( '[afc] Loading commands:' );

const commandFiles = fs
	.readdirSync( path.join( __dirname, 'afc/commands' ) )
	.filter( ( file ) => file.match( /\.[jt]s$/ ) );

for ( const file of commandFiles ) {
	require( `./afc/commands/${ file }` );
	winston.debug( `[afc] - ${ path.parse( file ).name }` );
}

winston.debug( '[afc] Loading events:' );

const eventFiles = fs
	.readdirSync( path.join( __dirname, 'afc/events' ) )
	.filter( ( file ) => file.match( /\.[jt]s$/ ) );

for ( const file of eventFiles ) {
	require( `./afc/events/${ file }` );
	winston.debug( `[afc] - ${ path.parse( file ).name }` );
}
