import fs = require( 'fs' );
import path = require( 'path' );
import winston = require( 'winston' );
import chokidar = require( 'chokidar' );
import { inspect } from 'src/lib/util';

import config from 'src/config';

const exits: string[] = [];

if ( config.exits ) {
	config.exits.paths.forEach( function ( obj ) {
		const isFolder = obj.type === 'folder';
		try {
			const stats = fs.statSync( obj.path );
			if ( stats.isDirectory() ) {
				if ( !isFolder ) {
					winston.error( `[exit] Can't watch file "${ path.normalize( obj.path ) }": It is a directory.` );
					return;
				}
				exits.push( path.normalize( obj.path ) + path.sep + '**' );
			} else {
				if ( isFolder ) {
					winston.error( `[exit] Can't watch folder "${ path.normalize( obj.path ) }": It is a file.` );
					return;
				}
				exits.push( path.normalize( obj.path ) );
			}
		} catch ( error ) {
			if ( String( error ).match( 'no such file or directory' ) ) {
				winston.warn( `[exit] Can't watch ${ isFolder ? 'folder' : 'file' } "${ path.normalize( obj.path ) }": It isn't exist.` );
			} else {
				winston.error( `[exit] Can't watch ${ isFolder ? 'folder' : 'file' } "${ path.normalize( obj.path ) }": `, inspect( error ) );
			}
		}
	} );
}

const watcher = chokidar.watch( exits, {
	persistent: true,
	ignoreInitial: false,
	usePolling: config.exits.usePolling
} );

watcher
	.on( 'ready', function () {
		winston.info( '[exit] chokidar ready.' );
	} )
	.on( 'error', function ( error ) {
		winston.error( '[exit]' + inspect( error ) );
	} )
	.on( 'change', function ( exit ) {
		winston.warn( `[exit] watching path "${ exit }" change, exit.` );
		// eslint-disable-next-line no-process-exit
		process.exit( 1 );
	} );

winston.info( `[exit] watching ${ exits.length } path......` );
winston.info( `[exit] paths: "${ exits.join( '", "' ) }"` );
