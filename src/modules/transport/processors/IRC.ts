import format = require( 'string-format' );
import color = require( 'irc-colors' );
import irc = require( 'irc-upd' );
import winston = require( 'winston' );
import util = require( 'util' );

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
const ircHandler = Manager.handlers.get( 'IRC' );

const options: ConfigTS[ 'transport' ][ 'options' ][ 'IRC' ] = config.options.IRC;
const colorize: ConfigTS[ 'transport' ][ 'options' ][ 'IRC' ][ 'colorize' ] = options.colorize;

// 自動加頻道
ircHandler.once( 'registered', function () {
	for ( const g in bridge.map ) {
		const cl = BridgeMsg.parseUID( g );
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
		winston.error( '[transport/processors/IRC]' + util.inspect( error ) );
	}
} );

/*
 * 頻道 Topic 變更
 */
ircHandler.on( 'topic', ( channel, topic, nick, message ) => {
	if ( message.command === 'TOPIC' && options.notify.topic ) {
		let text: string;
		if ( topic ) {
			text = `${ nick } 將頻道Topic設定為 ${ topic }`;
		} else {
			text = `${ nick } 取消了頻道的Topic`;
		}

		bridge.transportMessage( new BridgeMsg( {
			from: channel.toLowerCase(),
			to: channel.toLowerCase(),
			nick: nick,
			text: text,
			isNotice: true,
			handler: ircHandler,
			_rawdata: message
		// eslint-disable-next-line @typescript-eslint/no-empty-function
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
		bridge.transportMessage( new BridgeMsg( {
			from: channel.toLowerCase(),
			to: channel.toLowerCase(),
			nick: nick,
			text: `${ nick } 加入頻道`,
			isNotice: true,
			handler: ircHandler,
			_rawdata: message
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

ircHandler.on( 'nick', function ( oldnick, newnick, _channels, rawdata ) {
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
			bridge.transportMessage( new BridgeMsg( {
				from: chan,
				to: chan,
				nick: newnick,
				text: message,
				isNotice: true,
				handler: ircHandler,
				_rawdata: rawdata
			} ) );
		}
	}
} );

function leaveHandler( nick: string, chans: string[],
	action: string, reason: string, rawdata: irc.IMessage, removeAll?: boolean ): void {
	let message: string;
	if ( reason ) {
		message = `${ nick } 已${ action } (${ reason })`;
	} else {
		message = `${ nick } 已${ action }`;
	}

	chans.forEach( function ( ch ) {
		const chan = ch.toLowerCase();
		if ( ( options.notify.leave === 'all' && nick !== ircHandler.nick ) ||
			( options.notify.leave === 'onlyactive' && isActive( nick, chan ) )
		) {
			bridge.transportMessage( new BridgeMsg( {
				from: nick,
				to: chan,
				nick: nick,
				text: message,
				isNotice: true,
				handler: ircHandler,
				_rawdata: rawdata
			} ) );
		}

		if ( userlist[ nick ] ) {
			delete userlist[ nick ][ chan ];
		}
	} );

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

	// 给消息上色
	let output: string;
	if ( msg.extra.isAction ) {
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
					const m: number = meta.nick.split( '' ).map( function ( x: string ): number {
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
			if ( msg.extra.reply && colorize.replyto ) {
				meta.reply_nick = color[ colorize.replyto ]( meta.reply_nick );
			}
			if ( msg.extra.reply && colorize.repliedmessage ) {
				meta.reply_text = color[ colorize.repliedmessage ]( meta.reply_text );
			}
			if ( msg.extra.forward && colorize.fwdfrom ) {
				meta.forward_nick = color[ colorize.fwdfrom ]( meta.forward_nick );
			}
		}

		output = format( template, meta );

		// 檔案
		if ( msg.extra.uploads ) {
			output += msg.extra.uploads.map( function ( u: { url: string; } ) {
				return ` ${ u.url }`;
			} ).join();
		}
	}

	await ircHandler.say( BridgeMsg.parseUID( msg.to_uid ).id, output );
}
