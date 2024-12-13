import winston from 'winston';

import { inspect } from '@app/lib/util.mjs';

import { getBacklogInfo, setCommand } from '@app/modules/afc/util.mjs';

setCommand( 'backlog', async function ( _args, reply ) {
	try {
		const { tMessage, dMessage, iMessage, cnt, lvl } = await getBacklogInfo();

		reply( {
			tMessage,
			dMessage,
			iMessage,
		} );

		winston.debug( `[afc/commands/backlog] count: ${ cnt }, level ${ lvl }` );
	} catch ( error ) {
		const output = '生成等待時間數據失敗，請稍後再試。';

		reply( {
			tMessage: output,
			dMessage: output,
			iMessage: output,
		} );

		winston.error( '[afc/commands/backlog]' + inspect( error ) );
	}
} );
