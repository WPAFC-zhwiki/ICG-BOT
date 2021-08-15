/*
 * 在 Telegram 群組中取得群組的 ID，以便於配置互聯機器人
 */

import winston = require( 'winston' );

import { addCommand } from 'lib/message';

addCommand( 'thisgroupid', function ( context ) {
	if ( context.isPrivate ) {
		context.reply( `YourId = ${ context.from }` );
		winston.debug( `[groupid-tg] Msg #${ context.msgId }: YourId = ${ context.from }` );
	} else {
		context.reply( `GroupId = ${ context.to }` );
		winston.debug( `[groupid-tg] Msg #${ context.msgId }: GroupId = ${ context.to }` );
	}
}, {
	allowedClients: [ 'Telegram' ]
} );
