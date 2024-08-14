import fs = require( 'node:fs' );
import os = require( 'node:os' );
import path = require( 'node:path' );

import dotenv = require( 'dotenv' );
import winston = require( 'winston' );

import config, { programRoot, configRoot } from '@app/config';

import { inspect } from '@app/lib/util';

const heartbeatConfig = 'heartbeatConfig.sh';

if ( config.heartbeat ) {
	const heartbeatData = dotenv.parse<Record<'STATUS_FILE' | 'MAX_NO_UPDATE_TIME', string>>( fs.readFileSync( path.join( configRoot, heartbeatConfig ) ) );
	const statusFilePath = heartbeatData.STATUS_FILE
		.replace( /\$PROGRAM_ROOT/g, programRoot )
		.replace( /\$CONFIG_ROOT/g, configRoot )
		.replace( /\$HOME/g, os.homedir() );

	const maxNoUpdateTime = Number.parseInt( heartbeatData.MAX_NO_UPDATE_TIME, 10 );

	// eslint-disable-next-line no-inner-declarations
	function heartbeat() {
		fs.writeFile( statusFilePath, new Date().toISOString(), ( err ) => {
			if ( err ) {
				winston.error( '[heartbeat] Failed to update status file:', inspect( err ) );
				throw err;
			} else {
				winston.debug( '[heartbeat] Status file updated' );
			}
			setTimeout( heartbeat, maxNoUpdateTime * 100 );
		} );
	}

	heartbeat();
}
