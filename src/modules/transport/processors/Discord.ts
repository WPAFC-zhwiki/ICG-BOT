import format = require( 'string-format' );
import winston = require( 'winston' );

import { Manager } from 'src/init';
import { ConfigTS } from 'src/config';
import * as bridge from 'src/modules/transport/bridge';
import { BridgeMsg } from 'src/modules/transport/BridgeMsg';

function truncate( str: string, maxLen = 20 ) {
	str = str.replace( /\n/gu, '' );
	if ( str.length > maxLen ) {
		str = str.slice( 0, maxLen - 3 ) + '...';
	}
	return str;
}

const config: ConfigTS[ 'transport' ] = Manager.config.transport;
const discordHandler = Manager.handlers.get( 'Discord' );
const options: ConfigTS[ 'transport' ][ 'options' ][ 'Discord' ] = config.options.Discord;
const forwardBots: Record<string, [ string | number, '[]' | '<>' | 'self' ]> = options.forwardBots;

function parseForwardBot( username: string, text: string ) {
	let realText: string, realNick: string;
	const symbol = forwardBots[ username ] && forwardBots[ username ][ '1' ];
	if ( symbol === 'self' ) {
		// TODO 更換匹配方式
		// [ , , realNick, realText ] = text.match(/^(|<.> )\[(.*?)\] ([^]*)$/mu) || [];
		[ , realNick, realText ] = text.match( /^\[(.*?)\] ([^]*)$/mu ) || [];
	} else if ( symbol === '[]' ) {
		[ , realNick, realText ] = text.match( /^\[(.*?)\](?::? |\n)([^]*)$/mu ) || [];
	} else if ( symbol === '<>' ) {
		[ , realNick, realText ] = text.match( /^<(.*?)>(?::? |\n)([^]*)$/mu ) || [];
	}

	return { realNick, realText };
}

/*
 * 傳話
 */
discordHandler.on( 'text', async function ( context ) {
	const extra = context.extra;

	// 檢查是不是在回覆自己
	// eslint-disable-next-line max-len
	if ( extra.reply && String( forwardBots[ extra.reply.username ] && forwardBots[ extra.reply.username ][ 0 ] ) === String( extra.reply.discriminator ) ) {
		const { realNick, realText } = parseForwardBot( extra.reply.username, extra.reply.message );
		if ( realText ) {
			[ extra.reply.nick, extra.reply.message ] = [ realNick, realText ];
		}
	}

	try {
		await bridge.transportMessage( context );
	} catch ( e ) {
		winston.error( '[transport/processors/Discord]', e );
	}
} );

// 收到了來自其他群組的訊息
export default async function ( msg: BridgeMsg ): Promise<void> {
	// 元信息，用于自定义样式
	const meta: Record<string, string> = {
		nick: msg.nick,
		from: msg.from,
		to: msg.to,
		text: msg.text,
		client_short: msg.extra.clientName.shortname,
		client_full: msg.extra.clientName.fullname,
		command: msg.command,
		param: msg.param
	};
	if ( msg.extra.reply ) {
		const reply = msg.extra.reply;
		meta.reply_nick = reply.nick;
		meta.reply_user = reply.username;
		if ( reply.isText ) {
			meta.reply_text = truncate( reply.message );
		} else {
			meta.reply_text = reply.message;
		}
	}
	if ( msg.extra.forward ) {
		meta.forward_nick = msg.extra.forward.nick;
		meta.forward_user = msg.extra.forward.username;
	}

	const template: string = bridge.getMessageStyle( msg );

	const output = format( template, meta );
	const attachFileUrls = ( msg.extra.uploads || [] ).map( ( u: { url: string; } ) => ` ${ u.url }` ).join( '' );

	discordHandler.say( BridgeMsg.parseUID( msg.to_uid ).id, `${ output }${ attachFileUrls }` );
}
