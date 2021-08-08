import LRU from 'lru-cache';
import format from 'string-format';
import winston = require( 'winston' );
import Discord = require( 'discord.js' );
import { Manager } from '../../../init';
import * as bridge from '../bridge';
import { ConfigTS } from '../../../../config/type';
import { BridgeMsg } from '../BridgeMsg';

function truncate( str: string, maxLen = 20 ) {
	str = str.replace( /\n/gu, '' );
	if ( str.length > maxLen ) {
		str = str.substring( 0, maxLen - 3 ) + '...';
	}
	return str;
}

const userInfo = new LRU<string, Discord.User>( {
	max: 500,
	maxAge: 3600000
} );

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

// 將訊息加工好並發送給其他群組
discordHandler.on( 'text', ( context ) => {
	async function send() {
		try {
			return bridge.send( context );
		} catch ( e ) {
			winston.error( e.trace );
		}
	}

	userInfo.set( String( context.from ), context._rawdata.author );

	const extra = context.extra;

	// 檢查是不是在回覆自己
	// eslint-disable-next-line max-len
	if ( extra.reply && String( forwardBots[ extra.reply.username ] && forwardBots[ extra.reply.username ][ 0 ] ) === String( extra.reply.discriminator ) ) {
		const { realNick, realText } = parseForwardBot( extra.reply.username, extra.reply.message );
		if ( realText ) {
			[ extra.reply.nick, extra.reply.message ] = [ realNick, realText ];
		}
	}

	if ( /<a?:\w+:\d*?>/g.test( context.text ) ) {
		// 處理自定義表情符號
		const emojis = [];
		const animated = [];

		context.text = context.text.replace( /<:(\w+):(\d*?)>/g, ( _, name, id ) => {
			if ( id && !emojis.filter( ( v ) => v.id === id ).length ) {
				emojis.push( { name: name, id: id } );
			}
			return `<emoji: ${ name }>`;
		} );
		context.text = context.text.replace( /<a:(\w+):(\d*?)>/g, ( _, name, id ) => {
			if ( id && !animated.filter( ( v ) => v.id === id ).length ) {
				animated.push( { name: name, id: id } );
			}
			return `<emoji: ${ name }>`;
		} );

		if ( !context.extra.files ) {
			context.extra.files = [];
		}
		if ( discordHandler.relayEmoji ) {
			for ( const emoji of emojis ) {
				const url = `https://cdn.discordapp.com/emojis/${ emoji.id }.png`;
				const proxyURL = `https://media.discordapp.net/emojis/${ emoji.id }.png`;
				context.extra.files.push( {
					client: 'Discord',
					type: 'photo',
					id: emoji.id,
					size: 262144,
					url: discordHandler.useProxyURL ? proxyURL : url
				} );
			}
			for ( const emoji of animated ) {
				const url = `https://cdn.discordapp.com/emojis/${ emoji.id }.gif`;
				const proxyURL = `https://media.discordapp.net/emojis/${ emoji.id }.gif`;
				context.extra.files.push( {
					client: 'Discord',
					type: 'photo',
					id: emoji.id,
					size: 262144,
					url: discordHandler.useProxyURL ? proxyURL : url
				} );
			}
		}
		if ( !context.extra.files.length ) {
			delete context.extra.files;
		}
	}

	if ( /<@!?\d*?>/u.test( context.text ) ) {
		// 處理 at
		let ats: string[] = [];
		const promises = [];

		context.text.replace( /<@!?(\d*?)>/gu, function ( _: string, id: string ) {
			ats.push( id );
			return '';
		} );
		ats = [ ...new Set( ats ) ];

		for ( const at of ats ) {
			if ( userInfo.has( at ) ) {
				promises.push( Promise.resolve( userInfo.get( at ) ) );
			} else {
				promises.push( discordHandler.fetchUser( at ).catch( function ( e: Error ) {
					winston.error( e.stack );
				} ) );
			}
		}

		Promise.all<Discord.User>( promises ).then( ( infos ) => {
			for ( const info of infos ) {
				if ( info ) {
					if ( !userInfo.has( info.id ) ) {
						userInfo.set( info.id, info );
					}

					context.text = context.text.replace(
						new RegExp( `<@!?${ info.id }>`, 'gu' ),
						info.bot ? `<@bot ${ discordHandler.getNick( info ) }>` : `@${ discordHandler.getNick( info ) }`
					);
				}
			}
		} ).catch( ( e ) => winston.error( e.trace ) ).then( function () {
			send();
		} );
	} else {
		send();
	}
} );

// 收到了來自其他群組的訊息
export default async function ( msg: BridgeMsg, { noPrefix, isNotice }: { noPrefix: boolean, isNotice: boolean } = {
	noPrefix: false,
	isNotice: false
} ): Promise<void> {
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

	// 自定义消息样式
	let styleMode: 'simple' | 'complex' = 'simple';
	const messageStyle = config.options.messageStyle;
	if ( msg.extra.clients >= 3 && ( msg.extra.clientName.shortname || isNotice ) ) {
		styleMode = 'complex';
	}

	let template: string;
	if ( isNotice ) {
		template = messageStyle[ styleMode ].notice;
	} else if ( msg.extra.isAction ) {
		template = messageStyle[ styleMode ].action;
	} else if ( msg.extra.reply ) {
		template = messageStyle[ styleMode ].reply;
	} else if ( msg.extra.forward ) {
		template = messageStyle[ styleMode ].forward;
	} else if ( noPrefix ) {
		template = '{text}';
	} else {
		template = messageStyle[ styleMode ].message;
	}

	const output = format( template, meta );
	const attachFileUrls = ( msg.extra.uploads || [] ).map( ( u: { url: string; } ) => ` ${ u.url }` ).join( '' );

	discordHandler.say( BridgeMsg.parseUID( msg.to_uid ).id, `${ output }${ attachFileUrls }` );
}
