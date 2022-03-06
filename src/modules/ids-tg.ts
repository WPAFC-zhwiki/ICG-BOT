/*
 * 在 Telegram 取得個別用戶的 ID 及群組 ID
 */

import winston = require( 'winston' );

import { Manager } from 'src/init';

const tg = Manager.handlers.get( 'Telegram' );

tg.addCommand( 'thisgroupid', function ( context ) {
	const rawdata = context._rawdata;
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

function upperCaseFirst( str: string ): string {
	return str.slice( 0, 1 ).toUpperCase() + str.slice( 1 );
}

tg.addCommand( 'userid', function ( context ) {
	const rawdata = context._rawdata;

	let output: string;
	if ( 'reply_to_message' in rawdata.message ) {
		if (
			'forward_from_chat' in rawdata.message.reply_to_message &&
			[ 'channel', 'group', 'supergroup' ].includes( rawdata.message.reply_to_message.forward_from_chat.type )
		) {
			output = 'Forward From ' + getOutPut( [
				upperCaseFirst( rawdata.message.reply_to_message.forward_from_chat.type ),
				rawdata.message.reply_to_message.forward_from_chat.id
			] );
		} else if (
			'forward_from' in rawdata.message.reply_to_message
		) {
			output = 'Forward From ' + getOutPut( [ false, rawdata.message.reply_to_message.forward_from.id ] );
		} else {
			output = 'Reply to ' + getOutPut( tg.isTelegramFallbackBot( rawdata.message.reply_to_message ) );
		}
	} else {
		output = 'Your ' + getOutPut( tg.isTelegramFallbackBot( rawdata.message ) );
	}
	winston.debug( `[ids-tg] Msg #${ context.msgId }: ${ output }` );
	context.reply( output.replace( /"(-?\d+)"/, '<code>$1</code>' ), {
		parse_mode: 'HTML'
	} );
} );
