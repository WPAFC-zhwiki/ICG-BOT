/*
 * 在 Telegram 取得個別用戶的 ID
 */

import winston = require( 'winston' );

import { Manager } from 'src/init';

const tg = Manager.handlers.get( 'Telegram' );
tg.addCommand( 'userid', function ( context ) {
	const rawdata = context._rawdata;
	let output = 'User ID: ';
	if ( 'reply_to_message' in rawdata.message ) {
		if ( 'forward_from' in rawdata.message.reply_to_message ) {
			output += `<code>${ rawdata.message.reply_to_message.forward_from.id }</code>`;
			winston.debug( `[userid-tg] Msg #${ context.msgId }: forward_userid = ${ rawdata.message.reply_to_message.forward_from.id }` );
		} else {
			output += `<code>${ rawdata.message.reply_to_message.from.id }</code>`;
			winston.debug( `[userid-tg] Msg #${ context.msgId }: reply_userid = ${ rawdata.message.reply_to_message.from.id }` );
		}
	} else {
		output += `<code>${ rawdata.message.from.id }</code>`;
		winston.debug( `[userid-tg] Msg #${ context.msgId }: userid = ${ rawdata.message.from.id }` );
	}
	context.reply( output, {
		parse_mode: 'HTML'
	} );
} );
