/*
 * 在 Telegram 取得個別用戶的 ID 及群組 ID
 */

import winston = require( 'winston' );

import { Manager } from '@app/init';

const tg = Manager.handlers.get( 'Telegram' );

tg.addCommand( 'thisgroupid', function ( context ) {
	const rawdata = context._rawData;
	let output: string;
	if ( rawdata.from.id === rawdata.chat.id ) {
		output = `Your ID: <code>${ rawdata.from.id }</code>`;
		winston.debug( `[ids-tg] Msg #${ context.msgId }: YourId = ${ rawdata.from.id }` );
	} else {
		output = `Group ID: <code>${ rawdata.chat.id }</code>`;
		winston.debug( `[ids-tg] Msg #${ context.msgId }: GroupId = ${ rawdata.chat.id }` );
	}
	context.reply( output, {
		parse_mode: 'HTML'
	} );
} );

tg.aliasCommand( 'groupid', 'thisgroupid' );

function getOutPut( value: [ string | false, number ] ) {
	return `${ value[ 0 ] || 'User' } ID: "${ value[ 1 ] }"`;
}

tg.addCommand( 'userid', function ( context ) {
	const rawdata = context._rawData;

	let output: string;
	if ( 'reply_to_message' in rawdata.message ) {
		output = 'Reply to ' + getOutPut( tg.getMessageOriginDescription( rawdata.message.reply_to_message ) );
	} else {
		output = 'Your ' + getOutPut( tg.getMessageOriginDescription( rawdata.message ) );
	}
	winston.debug( `[ids-tg] Msg #${ context.msgId }: ${ output }` );
	context.reply( output.replace( /"(-?\d+)"/, '<code>$1</code>' ), {
		parse_mode: 'HTML'
	} );
} );
