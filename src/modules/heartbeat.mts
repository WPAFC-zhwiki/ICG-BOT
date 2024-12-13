import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import dotenv from 'dotenv';
import winston from 'winston';

import config, { programRoot, configRoot } from '@app/config.mjs';

import { inspect } from '@app/lib/util.mjs';

const heartbeatConfig = 'heartbeatConfig.sh';

if ( config.heartbeat ) {
	// eslint-disable-next-line security/detect-non-literal-fs-filename
	const heartbeatData = dotenv.parse<Record<'STATUS_FILE' | 'MAX_NO_UPDATE_TIME', string>>( fs.readFileSync( path.join( configRoot, heartbeatConfig ) ) );
	const statusFilePath = heartbeatData.STATUS_FILE
		.replaceAll( '$PROGRAM_ROOT', programRoot )
		.replaceAll( '$CONFIG_ROOT', configRoot )
		.replaceAll( '$HOME', os.homedir() );

	const maxNoUpdateTime = Number.parseInt( heartbeatData.MAX_NO_UPDATE_TIME, 10 );

	function heartbeat() {
		// eslint-disable-next-line security/detect-non-literal-fs-filename
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
