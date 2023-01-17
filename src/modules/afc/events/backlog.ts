import { CronJob } from 'cron';
import winston = require( 'winston' );

import { inspect } from '@app/lib/util';

import { getBacklogInfo, registerEvent, send } from '@app/modules/afc/util';

const backlogCronJob = new CronJob( '0 0 */4 * * *', async function () {
	try {
		const { tMsg, dMsg, iMsg, cnt, lvl } = await getBacklogInfo();

		send( {
			tMsg: tMsg + `\n\n#審核積壓 #積壓約${ lvl }周`,
			dMsg,
			iMsg
		}, 'backlog' );

		winston.debug( `[afc/event/backlog] count: ${ cnt }, level ${ lvl }` );
	} catch ( error ) {
		winston.error( '[afc/event/backlog]' + inspect( error ) );
	}
} );
backlogCronJob.start();

registerEvent( 'backlog' );
