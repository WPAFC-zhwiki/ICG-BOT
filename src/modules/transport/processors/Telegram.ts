import path = require( 'node:path' );
import { scheduler } from 'node:timers/promises';

import format = require( 'string-format' );
import { Context as TContext } from 'telegraf';
import winston = require( 'winston' );

import { ConfigTS } from '@app/config';
import { Manager } from '@app/init';

import { Context } from '@app/lib/handlers/Context';
import { TelegramSendMessageOptions } from '@app/lib/handlers/TelegramMessageHandler';
import { inspect } from '@app/lib/util';

import * as bridge from '@app/modules/transport/bridge';
import { BridgeMessage } from '@app/modules/transport/BridgeMessage';

function escapeHTML( str: string ): string {
	return str
		.replaceAll( '&', '&amp;' )
		.replaceAll( '<', '&lt;' )
		.replaceAll( '>', '&gt;' );
}

const config: ConfigTS[ 'transport' ] = Manager.config.transport;
const tgHandler = Manager.handlers.get( 'Telegram' );

const options: ConfigTS[ 'transport' ][ 'options' ][ 'Telegram' ] = config.options.Telegram;

const forwardBots: Record<string, '[]' | '<>' | 'self'> = options.forwardBots;

// 如果是互聯機器人，那麼提取真實的使用者名稱和訊息內容
function parseForwardBot( username: string, text: string ) {
	let realText: string, realNick: string;
	const symbol = forwardBots[ username ];
	switch ( symbol ) {
		case 'self': {
		// TODO 更換匹配方式
		// [ , , realNick, realText ] = text.match(/^(|<.> )\[(.*?)\] ([^]*)$/mu) || [];
			[ , realNick, realText ] = text.match( /^\[(.*?)\] ([^]*)$/mu ) || [];

			break;
		}
		case '[]': {
			[ , realNick, realText ] = text.match( /^\[(.*?)\](?::? |\n)([^]*)$/mu ) || [];

			break;
		}
		case '<>': {
			[ , realNick, realText ] = text.match( /^<(.*?)>(?::? |\n)([^]*)$/mu ) || [];

			break;
		}
	// No default
	}

	return { realNick, realText };
}

( async function setUsername() {
	while ( !tgHandler.username ) {
		await scheduler.wait( 100 );
	}

	// 我們自己也是傳話機器人
	forwardBots[ tgHandler.username ] = 'self';
}() );

function prepareText( context: Context, checkCommand = true ) {
	const extra = context.extra;
	if ( checkCommand && /^\/([A-Za-z0-9_@]+)(\s+(.*)|\s*)$/u.test( context.text ) && !options.forwardCommands ) {
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
		winston.error( '[transport/processors/Telegram]' + inspect( error ) );
	}
} );

tgHandler.on( 'richMessage', async function ( context: Context ) {
	prepareText( context, false );

	try {
		await bridge.transportMessage( context );
	} catch ( error ) {
		winston.error( '[transport/processors/Telegram]' + inspect( error ) );
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
}, context: TContext ) {
	if ( options.notify.pin ) {
		bridge.transportMessage( new BridgeMessage( {
			from: info.from.id,
			to: info.to,
			nick: info.from.nick,
			text: `${ info.from.nick } pinned: ${ info.text.replaceAll( '\n', ' ' ) }`,
			isNotice: true,
			handler: tgHandler,
			_rawData: context,
		} ) ).catch( function ( error ) {
			throw error;
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
}, context: TContext ) {
	let text: string;
	text = from.id === target.id ? `${ target.nick } 加入群組` : `${ from.nick } 邀請 ${ target.nick } 加入群組`;

	if ( options.notify.join ) {
		bridge.transportMessage( new BridgeMessage<TContext>( {
			from: target.id,
			to: group,
			nick: target.nick,
			text: text,
			isNotice: true,
			handler: tgHandler,
			_rawData: context,
		} ) ).catch( function ( error ) {
			throw error;
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
}, context: TContext ) {
	let text: string;
	text = from.id === target.id ? `${ target.nick } 離開群組` : `${ target.nick } 被 ${ from.nick } 移出群組`;

	if ( options.notify.leave ) {
		bridge.transportMessage( new BridgeMessage( {
			from: target.id,
			to: group,
			nick: target.nick,
			text: text,
			isNotice: true,
			handler: tgHandler,
			_rawData: context,
		} ) ).catch( function ( error ) {
			throw error;
		} );
	}
} );

if ( config.options.Telegram.forwardChannels ) {
	tgHandler.on( 'groupChannelText', async function ( _chan, context ) {
		prepareText( context );

		try {
			await bridge.transportMessage( context, false );
		} catch ( error ) {
			winston.error( '[transport/processors/Telegram]' + inspect( error ) );
		}
	} );

	tgHandler.on( 'groupChannelRichMessage', async function ( _chan, context: Context ) {
		prepareText( context, false );

		try {
			await bridge.transportMessage( context );
		} catch ( error ) {
			winston.error( '[transport/processors/Telegram]' + inspect( error ) );
		}
	} );
}

// 收到了來自其他群組的訊息
export default async function onMessage( message: BridgeMessage ): Promise<number> {
	// 元信息，用于自定义样式
	const meta: Record<string, string> = {
		nick: `<b>${ escapeHTML( message.nick ) }</b>`,
		from: escapeHTML( message.from ),
		to: escapeHTML( message.to ),
		text: escapeHTML( message.text ),
		client_short: escapeHTML( message.extra.clientName.shortname ),
		client_full: escapeHTML( message.extra.clientName.fullname ),
		command: escapeHTML( message.command ),
		param: escapeHTML( message.param ),
	};
	let associationReplyMessageId: number | undefined;
	if ( message.extra.reply ) {
		const reply = message.extra.reply;
		const associationMessageId = await bridge.fetchMessageAssociation(
			reply.origClient,
			reply.origChatId,
			reply.origMessageId,
			tgHandler.type,
			message.to
		);
		if ( associationMessageId ) {
			associationReplyMessageId = typeof associationMessageId === 'string' ?
				Number.parseInt( associationMessageId, 10 ) :
				associationMessageId;
		} else {
			/*
			meta.reply_nick = reply.nick;
			meta.reply_user = reply.username;
			if ( reply.isText ) {
				meta.reply_text = bridge.truncate( reply.message );
			} else {
				meta.reply_text = reply.message;
			}
			*/
		}
	}
	if ( message.extra.forward ) {
		meta.forward_nick = message.extra.forward.nick;
		meta.forward_user = message.extra.forward.username;
	}

	const template: string = escapeHTML( bridge.getMessageStyle( message, true ) );
	const output: string = format( template, meta );
	const to: string = BridgeMessage.parseUID( message.to_uid ).id;
	const newRawMessage = associationReplyMessageId ?
		await tgHandler.sayWithHTML( to, output, {
			reply_parameters: {
				message_id: associationReplyMessageId,
			},
		} ) :
		await tgHandler.sayWithHTML( to, output );

	// 如果含有相片和音訊
	if ( message.extra.fileIdUploads ) {
		// 優先 file_id 上傳法
		for ( const upload of message.extra.fileIdUploads ) {
			await upload( newRawMessage.chat.id, newRawMessage.message_id );
		}
	} else if ( message.extra.uploads ) {
		const replyOption: TelegramSendMessageOptions = {
			reply_parameters: {
				message_id: associationReplyMessageId,
			},
		};

		for ( const upload of message.extra.uploads ) {
			switch ( upload.type ) {
				case 'audio': {
					await tgHandler.sendAudio( to, upload.url, replyOption );

					break;
				}
				case 'photo':
				case 'image': {
					await ( path.extname( upload.url ) === '.gif' ? tgHandler.sendAnimation( to, upload.url, replyOption ) : tgHandler.sendPhoto( to, upload.url, replyOption ) );

					break;
				}
				case 'video': {
					await tgHandler.sendVideo( to, upload.url, replyOption );

					break;
				}
				default: {
					await tgHandler.sendDocument( to, upload.url, replyOption );
				}
			}
		}
	}

	return newRawMessage.message_id;
}
