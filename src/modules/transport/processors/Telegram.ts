import path = require( 'path' );
import format = require( 'string-format' );
import { Context as TContext } from 'telegraf';
import winston = require( 'winston' );
import util = require( 'util' );

import { Manager } from 'src/init';
import { ConfigTS } from 'src/config';
import { Context } from 'src/lib/handlers/Context';
import { TelegramSendMessageOpipons } from 'src/lib/handlers/TelegramMessageHandler';
import jQuery from 'src/lib/jquery';
import delay from 'src/lib/delay';
import * as bridge from 'src/modules/transport/bridge';
import { BridgeMsg } from 'src/modules/transport/BridgeMsg';

function htmlEscape( str: string ): string {
	return jQuery( '<div>' ).text( str ).html();
}

function truncate( str: string, maxLen = 20 ) {
	str = str.replace( /\n/gu, '' );
	if ( str.length > maxLen ) {
		str = str.slice( 0, maxLen - 3 ) + '...';
	}
	return str;
}

const config: ConfigTS[ 'transport' ] = Manager.config.transport;
const tgHandler = Manager.handlers.get( 'Telegram' );

const options: ConfigTS[ 'transport' ][ 'options' ][ 'Telegram' ] = config.options.Telegram;

const forwardBots: Record<string, '[]' | '<>' | 'self'> = options.forwardBots;

// 如果是互聯機器人，那麼提取真實的使用者名稱和訊息內容
function parseForwardBot( username: string, text: string ) {
	let realText: string, realNick: string;
	const symbol = forwardBots[ username ];
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

( async function () {
	while ( !tgHandler.username ) {
		await delay( 100 );
	}

	// 我們自己也是傳話機器人
	forwardBots[ tgHandler.username ] = 'self';
}() );

function prepareText( context: Context, checkCommand = true ) {
	const extra = context.extra;
	if ( checkCommand && context.text.match( /^\/([A-Za-z0-9_@]+)(\s+(.*)|\s*)$/u ) && !options.forwardCommands ) {
		return;
	}

	// 檢查是不是自己在回覆自己，然後檢查是不是其他互聯機器人在說話
	if ( extra.reply && forwardBots[ extra.reply.username ] ) {
		const { realNick, realText } = parseForwardBot( extra.reply.username, extra.reply.message );
		if ( realNick ) {
			[ extra.reply.nick, extra.reply.message ] = [ realNick, realText ];
		}
	} else if ( extra.forward && forwardBots[ extra.forward.username ] ) {
		const { realNick, realText } = parseForwardBot( extra.forward.username, context.text );
		if ( realNick ) {
			[ extra.forward.nick, context.text ] = [ realNick, realText ];
		}
	}
}

tgHandler.on( 'text', async function ( context ) {
	prepareText( context );

	try {
		await bridge.transportMessage( context );
	} catch ( error ) {
		winston.error( '[transport/processors/Telegram]', util.inspect( error ) );
	}
} );

tgHandler.on( 'richMessage', async function ( context: Context ) {
	prepareText( context, false );

	try {
		await bridge.transportMessage( context );
	} catch ( error ) {
		winston.error( '[transport/processors/Telegram]', util.inspect( error ) );
	}
} );

// Pinned message
tgHandler.on( 'pin', function ( info: {
	from: {
		id: number;
		nick: string;
		username?: string;
	};
	to: number;
	text: string;
}, ctx: TContext ) {
	if ( options.notify.pin ) {
		bridge.transportMessage( new BridgeMsg( {
			from: info.from.id,
			to: info.to,
			nick: info.from.nick,
			text: `${ info.from.nick } pinned: ${ info.text.replace( /\n/gu, ' ' ) }`,
			isNotice: true,
			handler: tgHandler,
			_rawdata: ctx
		} ) ).catch( function ( err ) {
			throw err;
		} );
	}
} );

// 加入與離開
tgHandler.on( 'join', function ( group: number, from: {
	id: number;
	nick: string;
	username?: string;
}, target: {
	id: number;
	nick: string;
	username?: string;
}, ctx: TContext ) {
	let text: string;
	if ( from.id === target.id ) {
		text = `${ target.nick } 加入群組`;
	} else {
		text = `${ from.nick } 邀請 ${ target.nick } 加入群組`;
	}

	if ( options.notify.join ) {
		bridge.transportMessage( new BridgeMsg<TContext>( {
			from: target.id,
			to: group,
			nick: target.nick,
			text: text,
			isNotice: true,
			handler: tgHandler,
			_rawdata: ctx
		} ) ).catch( function ( err ) {
			throw err;
		} );
	}
} );

tgHandler.on( 'leave', function ( group: number, from: {
	id: number;
	nick: string;
	username?: string;
}, target: {
	id: number;
	nick: string;
	username?: string;
}, ctx: TContext ) {
	let text: string;
	if ( from.id === target.id ) {
		text = `${ target.nick } 離開群組`;
	} else {
		text = `${ target.nick } 被 ${ from.nick } 移出群組`;
	}

	if ( options.notify.leave ) {
		bridge.transportMessage( new BridgeMsg( {
			from: target.id,
			to: group,
			nick: target.nick,
			text: text,
			isNotice: true,
			handler: tgHandler,
			_rawdata: ctx
		} ) ).catch( function ( err ) {
			throw err;
		} );
	}
} );

if ( config.options.Telegram.forwardChannels ) {
	tgHandler.on( 'groupChannelText', async function ( _chan, context ) {
		prepareText( context );

		try {
			await bridge.transportMessage( context, false );
		} catch ( error ) {
			winston.error( '[transport/processors/Telegram]', util.inspect( error ) );
		}
	} );

	tgHandler.on( 'groupChannelRichMessage', async function ( _chan, context: Context ) {
		prepareText( context, false );

		try {
			await bridge.transportMessage( context );
		} catch ( error ) {
			winston.error( '[transport/processors/Telegram]', util.inspect( error ) );
		}
	} );
}

// 收到了來自其他群組的訊息
export default async function ( msg: BridgeMsg ): Promise<void> {
	// 元信息，用于自定义样式
	const meta: Record<string, string> = {
		nick: `<b>${ htmlEscape( msg.nick ) }</b>`,
		from: htmlEscape( msg.from ),
		to: htmlEscape( msg.to ),
		text: htmlEscape( msg.text ),
		client_short: htmlEscape( msg.extra.clientName.shortname ),
		client_full: htmlEscape( msg.extra.clientName.fullname ),
		command: htmlEscape( msg.command ),
		param: htmlEscape( msg.param )
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

	const template: string = htmlEscape( bridge.getMessageStyle( msg ) );
	const output: string = format( template, meta );
	const to: string = BridgeMsg.parseUID( msg.to_uid ).id;
	const newRawMsg = await tgHandler.sayWithHTML( to, output );

	// 如果含有相片和音訊
	if ( msg.extra.uploads ) {
		const replyOption: TelegramSendMessageOpipons = {
			reply_to_message_id: newRawMsg.message_id
		};

		for ( const upload of msg.extra.uploads ) {
			if ( upload.type === 'audio' ) {
				await tgHandler.sendAudio( to, upload.url, replyOption );
			} else if ( upload.type === 'photo' ) {
				if ( path.extname( upload.url ) === '.gif' ) {
					await tgHandler.sendAnimation( to, upload.url, replyOption );
				} else {
					await tgHandler.sendPhoto( to, upload.url, replyOption );
				}
			} else {
				await tgHandler.sendDocument( to, upload.url, replyOption );
			}
		}
	}
}
