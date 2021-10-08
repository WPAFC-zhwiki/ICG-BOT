import fs = require( 'fs' );
import path = require( 'path' );
import winston = require( 'winston' );

import config from 'src/config';

const exits: string[] = [];

if ( config.exits ) {
	config.exits.forEach( function ( obj ) {
		const isFolder = obj.type === 'folder';
		try {
			const stats = fs.statSync( obj.path );
			if ( stats.isDirectory() ) {
				if ( !isFolder ) {
					winston.error( `[exit] Can't watch file "${ path.normalize( obj.path ) }": It is a directory.` );
					return;
				}
				exits.push( path.normalize( obj.path ) + path.sep );
			} else {
				if ( isFolder ) {
					winston.error( `[exit] Can't watch folder "${ path.normalize( obj.path ) }": It is a file.` );
					return;
				}
				exits.push( path.normalize( obj.path ) );
			}
		} catch ( e ) {
			if ( String( e ).match( 'no such file or directory' ) ) {
				winston.warn( `[exit] Can't watch ${ isFolder ? 'folder' : 'file' } "${ path.normalize( obj.path ) }": It isn't exist.` );
			} else {
				winston.error( `[exit] Can't watch ${ isFolder ? 'folder' : 'file' } "${ path.normalize( obj.path ) }": `, e );
			}
		}
	} );
}

exits.forEach( function ( exit ) {
	fs.watch( exit, {
		recursive: true
	}, function ( _, n ) {
		winston.warn( `[exit] listening path "${ path.join( exit, n ) }" change, exit.` );
		// eslint-disable-next-line no-process-exit
		process.exit( 1 );
	} );
} );

winston.info( `[exit] listening ${ exits.length } path......` );
winston.info( `[exit] paths: "${ exits.join( '", "' ) }"` );
