/*
 * 在 Telegram 取得個別用戶的 ID 及群組 ID
 */

import winston from 'winston';

import { Manager } from '@app/init.mjs';

const tg = Manager.handlers.get( 'Telegram' );

tg.addCommand( 'thisgroupid', function ( context ) {
	const rawData = context._rawData;
	let output: string;
	if ( rawData.from.id === rawData.chat.id ) {
		output = `Your ID: <code>${ rawData.from.id }</code>`;
		winston.debug( `[ids-tg] Message #${ context.msgId }: YourId = ${ rawData.from.id }` );
	} else {
		output = `Group ID: <code>${ rawData.chat.id }</code>`;
		winston.debug( `[ids-tg] Message #${ context.msgId }: GroupId = ${ rawData.chat.id }` );
	}
	context.reply( output, {
		parse_mode: 'HTML',
	} );
} );

tg.aliasCommand( 'groupid', 'thisgroupid' );

function getOutPut( value: [ string | false, number ] ) {
	return `${ value[ 0 ] || 'User' } ID: "${ value[ 1 ] }"`;
}

tg.addCommand( 'userid', function ( context ) {
	const rawData = context._rawData;

	let output: string;
	output = 'reply_to_message' in rawData.message ? 'Reply to ' + getOutPut( tg.getMessageOriginDescription( rawData.message.reply_to_message ) ) : 'Your ' + getOutPut( tg.getMessageOriginDescription( rawData.message ) );
	winston.debug( `[ids-tg] Message #${ context.msgId }: ${ output }` );
	context.reply( output.replace( /"(-?\d+)"/, '<code>$1</code>' ), {
		parse_mode: 'HTML',
	} );
} );
