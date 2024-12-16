import fs from 'node:fs';
import path from 'node:path';

import chokidar from 'chokidar';
import winston from 'winston';

import config from '@app/config.mjs';

import { inspect } from '@app/lib/util.mjs';

const exits: string[] = [];

if ( config.exits ) {
	for ( const object of config.exits.paths ) {
		const isFolder = object.type === 'folder';
		try {
			// eslint-disable-next-line security/detect-non-literal-fs-filename
			const stats = fs.statSync( object.path );
			if ( stats.isDirectory() ) {
				if ( !isFolder ) {
					winston.error( `[exit] Can't watch file "${ path.normalize( object.path ) }": It is a directory.` );
					continue;
				}
				exits.push( path.normalize( object.path ) + path.sep + '**' );
			} else {
				if ( isFolder ) {
					winston.error( `[exit] Can't watch folder "${ path.normalize( object.path ) }": It is a file.` );
					continue;
				}
				exits.push( path.normalize( object.path ) );
			}
		} catch ( error ) {
			if ( String( error ).match( 'no such file or directory' ) ) {
				winston.warn( `[exit] Can't watch ${ isFolder ? 'folder' : 'file' } "${ path.normalize( object.path ) }": It isn't exist.` );
			} else {
				winston.error( `[exit] Can't watch ${ isFolder ? 'folder' : 'file' } "${ path.normalize( object.path ) }": `, inspect( error ) );
			}
		}
	}
}

const watcher = chokidar.watch( exits, {
	persistent: true,
	ignoreInitial: false,
	usePolling: config.exits.usePolling,
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
		// eslint-disable-next-line n/no-process-exit, unicorn/no-process-exit
		process.exit( 1 );
	} );

winston.info( `[exit] watching ${ exits.length } path......` );
winston.info( `[exit] paths: "${ exits.join( '", "' ) }"` );
