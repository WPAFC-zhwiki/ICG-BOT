import winston = require( 'winston' );

import { inspect } from '@app/lib/util';

import { getBacklogInfo, setCommand } from '@app/modules/afc/util';

setCommand( 'backlog', async function ( _args, reply ) {
	try {
		const { tMsg, dMsg, iMsg, cnt, lvl } = await getBacklogInfo();

		reply( {
			tMsg,
			dMsg,
			iMsg
		} );

		winston.debug( `[afc/commands/backlog] count: ${ cnt }, level ${ lvl }` );
	} catch ( error ) {
		const output = '生成等待時間數據失敗，請稍後再試。';

		reply( {
			tMsg: output,
			dMsg: output,
			iMsg: output
		} );

		winston.error( '[afc/commands/backlog]' + inspect( error ) );
	}
} );
