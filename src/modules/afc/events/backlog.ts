import { CronJob } from 'cron';
import { getBacklogInfo, send } from 'src/modules/afc/util';
import winston from 'winston';

const backlogCronJob = new CronJob( '0 0 */4 * * *', async function () {
	try {
		const { tMsg, dMsg, iMsg, cnt, lvl } = await getBacklogInfo();

		send( {
			tMsg,
			dMsg,
			iMsg
		} );

		winston.debug( `[afc/event/backlog] count: ${ cnt }, level ${ lvl }` );
	} catch ( err ) {
		winston.error( err );
	}
} );
backlogCronJob.start();
