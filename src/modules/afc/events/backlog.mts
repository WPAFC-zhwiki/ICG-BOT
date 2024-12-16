import { CronJob } from 'cron';
import winston from 'winston';

import { inspect } from '@app/lib/util.mjs';

import { getBacklogInfo, registerEvent, send } from '@app/modules/afc/util.mjs';

const backlogCronJob = new CronJob( '0 0 */4 * * *', async function () {
	try {
		const { tMessage, dMessage, iMessage, cnt, lvl } = await getBacklogInfo();

		send( {
			tMessage: tMessage + `\n\n#審核積壓 #積壓約${ lvl }周`,
			dMessage,
			iMessage,
		}, 'backlog' );

		winston.debug( `[afc/event/backlog] count: ${ cnt }, level ${ lvl }` );
	} catch ( error ) {
		winston.error( '[afc/event/backlog]' + inspect( error ) );
	}
} );
backlogCronJob.start();

registerEvent( 'backlog' );
