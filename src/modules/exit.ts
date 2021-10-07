import fs = require( 'fs' );
import winston = require( 'winston' );

import config from 'src/config';

const exits: string[] = [ global.configPath ];

if ( config.exits && Array.isArray( config.exits ) ) {
	exits.push( ...config.exits );
}

exits.forEach( function ( path ) {
	fs.watchFile( path, {}, function () {
		winston.warn( `[exit] listening path "${ path }" change, exit.` );
		// eslint-disable-next-line no-process-exit
		process.exit( 1 );
	} );
} );

winston.info( `[exit] listening ${ exits.length } path......` );
