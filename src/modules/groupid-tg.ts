/*
 * 在 Telegram 群組中取得群組的 ID，以便於配置互聯機器人
 */

import winston = require( 'winston' );

import { Manager } from 'src/init';

const tg = Manager.handlers.get( 'Telegram' );
tg.addCommand( 'thisgroupid', function ( context ) {
	const rawdata = context._rawdata;
	let output: string;
	if ( rawdata.from.id === rawdata.chat.id ) {
		output = `Your ID: <code>${ rawdata.from.id }</code>`;
		winston.debug( `[groupid-tg] Msg #${ context.msgId }: YourId = ${ rawdata.from.id }` );
	} else {
		output = `Group ID: <code>${ rawdata.chat.id }</code>`;
		winston.debug( `[groupid-tg] Msg #${ context.msgId }: GroupId = ${ rawdata.chat.id }` );
	}
	context.reply( output, {
		parse_mode: 'HTML'
	} );
} );

tg.aliasCommand( 'groupid', 'thisgroupid' );
