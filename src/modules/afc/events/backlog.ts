import { CronJob } from 'cron';
import { send } from '../msg';
import getBacklogInfo from '../backlogInfo.js';
import winston from 'winston';

const backlogCronJob = new CronJob( '0 0 */6 * * *', async function () {
	try {
		const { tMsg, dMsg, iMsg, cnt, lvl } = await getBacklogInfo();

		send( {
			tMsg,
			dMsg,
			iMsg
		} );

		winston.debug( `[afc/event/backlog.js] count: ${ cnt }, level ${ lvl }` );
	} catch ( err ) {
		winston.error( err );
	}
} );
backlogCronJob.start();
