import color from 'irc-colors';
import * as irc from 'irc-upd';
import format from 'string-format';
import winston from 'winston';

import { ConfigTS } from '@app/config.mjs';
import { Manager } from '@app/init.mjs';

import { inspect } from '@app/lib/util.mjs';

import * as bridge from '@app/modules/transport/bridge.mjs';
import { BridgeMessage } from '@app/modules/transport/BridgeMessage.mjs';

const config: ConfigTS[ 'transport' ] = Manager.config.transport;
const ircHandler = Manager.handlers.get( 'IRC' );

const options: ConfigTS[ 'transport' ][ 'options' ][ 'IRC' ] = config.options.IRC;
const colorize: ConfigTS[ 'transport' ][ 'options' ][ 'IRC' ][ 'colorize' ] = options.colorize;

// 自動加頻道
ircHandler.once( 'registered', function () {
	for ( const g in bridge.map ) {
		const cl = BridgeMessage.parseUID( g );
		if ( cl.client === 'IRC' && !ircHandler.rawClient.chans[ cl.id.toLowerCase() ] ) {
			ircHandler.join( cl.id );
		}
	}
} );

ircHandler.splitPrefix = '->';
ircHandler.splitPostfix = '->';
if ( colorize.enabled && colorize.linesplit ) {
	ircHandler.splitPrefix = color[ colorize.linesplit ]( ircHandler.splitPrefix );
	ircHandler.splitPostfix = color[ colorize.linesplit ]( ircHandler.splitPostfix );
}

/*
 * 傳話
 */
ircHandler.on( 'text', async function ( context ) {
	try {
		await bridge.transportMessage( context );
	} catch ( error ) {
		winston.error( '[transport/processors/IRC]' + inspect( error ) );
	}
} );

/*
 * 頻道 Topic 變更
 */
ircHandler.on( 'topic', ( channel, topic, nick, message ) => {
	if ( message.command === 'TOPIC' && options.notify.topic ) {
		let text: string;
		text = topic ? `${ nick } 將頻道Topic設定為 ${ topic }` : `${ nick } 取消了頻道的Topic`;

		bridge.transportMessage( new BridgeMessage( {
			from: channel.toLowerCase(),
			to: channel.toLowerCase(),
			nick: nick,
			text: text,
			isNotice: true,
			handler: ircHandler,
			_rawData: message,

		} ) ).catch( function () {} );
	}
} );

/*
 * 監視加入/離開頻道
 */
const awaySpan = 1000 * ( options.notify.timeBeforeLeave || 0 );
const userlist: Record<string, Record<string, number>> = {};

ircHandler.on( 'join', async function ( channel, nick, message ) {
	if ( options.notify.join && nick !== ircHandler.nick ) {
		bridge.transportMessage( new BridgeMessage( {
			from: channel.toLowerCase(),
			to: channel.toLowerCase(),
			nick: nick,
			text: `${ nick } 加入頻道`,
			isNotice: true,
			handler: ircHandler,
			_rawData: message,
		} ) );
	}

	// 記錄使用者發言的時間與頻道
	if ( !userlist[ nick ] ) {
		userlist[ nick ] = {};
	}

	userlist[ nick ][ channel ] = 0;
} );

ircHandler.on( 'text', function ( context ) {
	if ( context.isPrivate ) {
		return;
	}

	// 記錄使用者發言的時間與頻道
	if ( !userlist[ context.from ] ) {
		userlist[ context.from ] = {};
	}

	userlist[ context.from ][ String( context.to ).toLowerCase() ] = Date.now();
} );

function isActive( nick: string | number, channel: string ) {
	const now = Date.now();
	return userlist[ nick ] && userlist[ nick ][ channel ] &&
			awaySpan > 0 && ( now - userlist[ nick ][ channel ] <= awaySpan );
}

ircHandler.on( 'nick', function ( oldnick, newnick, _channels, rawData ) {
	// 記錄使用者更名情況
	if ( userlist[ oldnick ] ) {
		userlist[ newnick ] = userlist[ oldnick ];
		delete userlist[ oldnick ];
	}

	const message = `${ oldnick } 更名為 ${ newnick }`;

	for ( const ch in userlist[ newnick ] ) {
		const chan = ch.toLowerCase();

		if ( ( options.notify.rename === 'all' ) ||
			( options.notify.rename === 'onlyactive' && userlist[ newnick ] && userlist[ newnick ][ chan ] )
		) {
			bridge.transportMessage( new BridgeMessage( {
				from: chan,
				to: chan,
				nick: newnick,
				text: message,
				isNotice: true,
				handler: ircHandler,
				_rawData: rawData,
			} ) );
		}
	}
} );

function leaveHandler( nick: string, chans: string[],
	action: string, reason: string, rawData: irc.IMessage, removeAll?: boolean ): void {
	let message: string;
	message = reason ? `${ nick } 已${ action } (${ reason })` : `${ nick } 已${ action }`;

	for ( const ch of chans ) {
		const chan = ch.toLowerCase();
		if ( ( options.notify.leave === 'all' && nick !== ircHandler.nick ) ||
			( options.notify.leave === 'onlyactive' && isActive( nick, chan ) )
		) {
			bridge.transportMessage( new BridgeMessage( {
				from: nick,
				to: chan,
				nick: nick,
				text: message,
				isNotice: true,
				handler: ircHandler,
				_rawData: rawData,
			} ) );
		}

		if ( userlist[ nick ] ) {
			delete userlist[ nick ][ chan ];
		}
	}

	if ( removeAll ) {
		delete userlist[ nick ];
	}
}

ircHandler.on( 'quit', ( nick, reason, channels, message ) => {
	leaveHandler( nick, channels, '離開IRC', reason, message, true );
} );

ircHandler.on( 'part', ( channel, nick, reason, message ) => {
	leaveHandler( nick, [ channel ], '離開頻道', reason, message );
} );

ircHandler.on( 'kick', ( channel, nick, by, reason, message ) => {
	leaveHandler( nick, [ channel ], `被 ${ by } 踢出頻道`, reason, message );
} );

ircHandler.on( 'kill', ( nick, reason, channels, message ) => {
	leaveHandler( nick, channels, '被kill', reason, message, true );
} );

// 收到了來自其他群組的訊息
export default async function onMessage( message: BridgeMessage ): Promise<false> {
	// 元信息，用于自定义样式
	const meta: Record<string, string> = {
		nick: message.nick,
		from: message.from,
		to: message.to,
		text: message.text,
		client_short: message.extra.clientName.shortname,
		client_full: message.extra.clientName.fullname,
		command: message.command,
		param: message.param,
	};
	if ( message.extra.reply ) {
		const reply = message.extra.reply;
		meta.reply_nick = reply.nick;
		meta.reply_user = reply.username;
		meta.reply_text = reply.isText ? bridge.truncate( reply.message ) : reply.message;
	}
	if ( message.extra.forward ) {
		meta.forward_nick = message.extra.forward.nick;
		meta.forward_user = message.extra.forward.username;
	}

	const template: string = bridge.getMessageStyle( message );

	// 给消息上色
	let output: string;
	if ( message.extra.isAction ) {
		output = format( template, meta );
		if ( colorize.enabled && colorize.broadcast ) {
			output = color[ colorize.broadcast ]( output );
		}
	} else {
		if ( colorize.enabled ) {
			if ( colorize.client ) {
				meta.client_short = color[ colorize.client ]( meta.client_short );
				meta.client_full = color[ colorize.client ]( meta.client_full );
			}
			if ( colorize.nick ) {
				if ( colorize.nick === 'colorful' ) {
					// hash
					const m: number = [ ...meta.nick ].map( function ( x: string ): number {
						return x.codePointAt( 0 );
					} ).reduce( function ( x: number, y: number ): number {
						return x + y;
					} );
					const n: number = colorize.nickcolors.length;

					meta.nick = color[ colorize.nickcolors[ m % n ] ]( meta.nick );
				} else {
					meta.nick = color[ colorize.nick ]( meta.nick );
				}
			}
			if ( message.extra.reply && colorize.replyto ) {
				meta.reply_nick = color[ colorize.replyto ]( meta.reply_nick );
			}
			if ( message.extra.reply && colorize.repliedmessage ) {
				meta.reply_text = color[ colorize.repliedmessage ]( meta.reply_text );
			}
			if ( message.extra.forward && colorize.fwdfrom ) {
				meta.forward_nick = color[ colorize.fwdfrom ]( meta.forward_nick );
			}
		}

		output = format( template, meta );

		// 檔案
		if ( message.extra.uploads ) {
			output += message.extra.uploads.map( function ( u: { url: string; } ) {
				return ` ${ u.url }`;
			} ).join( ',' );
		}
	}

	await ircHandler.say( BridgeMessage.parseUID( message.to_uid ).id, output );

	return false;
}
