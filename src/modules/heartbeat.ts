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
		.replaceAll( '$PROGRAM_ROOT', programRoot )
		.replaceAll( '$CONFIG_ROOT', configRoot )
		.replaceAll( '$HOME', os.homedir() );

	const maxNoUpdateTime = Number.parseInt( heartbeatData.MAX_NO_UPDATE_TIME, 10 );

	function heartbeat() {
		fs.writeFile( statusFilePath, new Date().toISOString(), ( error ) => {
			if ( error ) {
				winston.error( '[heartbeat] Failed to update status file:', inspect( error ) );
				throw error;
			} else {
				winston.debug( '[heartbeat] Status file updated' );
			}
			setTimeout( heartbeat, maxNoUpdateTime * 100 );
		} );
	}

	heartbeat();
}
