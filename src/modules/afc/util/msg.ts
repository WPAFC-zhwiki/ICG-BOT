import { Message as TMessage } from '@telegraf/types';
import cheerio = require( 'cheerio' );
import { Message as DMessage, EmbedBuilder as DMessageEmbed, MessageEditOptions as DMessageEditOptions } from 'discord.js';
import mIrc = require( 'irc-upd' );
import winston = require( 'winston' );

import { Manager } from '@app/init';

import { Context } from '@app/lib/handlers/Context';
import { DiscordSendMessage } from '@app/lib/handlers/DiscordMessageHandler';
import { parseUID, getUIDFromContext, addCommand, getUIDFromHandler } from '@app/lib/message';
import { inspect } from '@app/lib/util';

import { $, decodeURI } from '@app/modules/afc/util/index';
import { HTMLNoNeedEscape, tEscapeHTML } from '@app/modules/afc/util/telegram-html';
import * as moduleTransport from '@app/modules/transport';

export function htmlToIRC( text: string ): string {
	const $ele = cheerio.load( text );

	$ele( 'a' ).each( function ( _i, a ) {
		const $a = $( a );
		const href = decodeURI( $a.attr( 'href' ) ).replace( /^https:\/\/zh\.wikipedia\.org\/(wiki\/)?/g, 'https://zhwp.org/' );

		$a.html( tEscapeHTML` ${ new HTMLNoNeedEscape( $a.html() ) } &lt;${ href }&gt;` );
	} );

	$ele( 'b' ).each( function ( _i, b ): void {
		const $b = $( b );

		$b.html( mIrc.colors.wrap( 'bold', $b.html() ) );
	} );

	$ele( 'code' ).each( function ( _i, code ): void {
		const $code = $( code );

		$code.html( `\`${ $code.html() }\`` );
	} );

	return $ele.text();
}

const dc = Manager.handlers.get( 'Discord' );
const tg = Manager.handlers.get( 'Telegram' );
const irc = Manager.handlers.get( 'IRC' );

export type Response = void /* IRC */ | TMessage | DMessage;

function discordEmbedToOption( dMsg: DiscordSendMessage | DMessageEmbed ): DiscordSendMessage {
	return dMsg instanceof DMessageEmbed ? {
		embeds: [ dMsg ]
	} : dMsg;
}

export type CommandReplyFunc = ( msg: {
	dMsg?: DiscordSendMessage | DMessageEmbed;
	tMsg?: string;
	iMsg?: string;
} ) => Promise<Transport>;
export type Command = ( args: string[], replyfunc: CommandReplyFunc, msg: Context ) => void;

export function setCommand( cmd: string | string[], func: Command ): void {
	addCommand( cmd, function ( context ) {
		func( context.param.split( ' ' ), function ( msg: {
			dMsg?: DiscordSendMessage | DMessageEmbed;
			tMsg?: string;
			iMsg?: string;
		} ): Promise<Transport> {
			return reply( context, msg );
		}, context );
		return Promise.resolve();
	}, {
		enables: Manager.config.afc.enableCommands
	} );
}

type Transport = {
	raw: Promise<Response>;
	irc: Promise<void>[];
	tg: Promise<TMessage>[];
	dc: Promise<DMessage>[];
};

export async function reply( context: Context, msg: {
	dMsg?: DiscordSendMessage | DMessageEmbed;
	tMsg?: string;
	iMsg?: string;
} ): Promise<Transport> {
	const that = parseUID( getUIDFromContext( context, context.to ) );

	const output: Transport = {
		raw: Promise.resolve(),
		irc: [],
		tg: [],
		dc: []
	};

	if ( that.client === 'Discord' && msg.dMsg ) {
		output.raw = dc.say( that.id, discordEmbedToOption( msg.dMsg ) );
	} else if ( that.client === 'Telegram' && msg.tMsg ) {
		output.raw = tg.sayWithHTML( that.id, msg.tMsg, {
			disable_web_page_preview: true
		} );
	} else if ( that.client === 'IRC' && msg.iMsg ) {
		output.raw = irc.say( that.id, msg.iMsg, {
			doNotSplitText: true
		} );
	}

	moduleTransport.prepareBridgeMsg( context );

	// 若互聯且在公開群組調用，則讓其他群也看到
	if ( context.extra.mapto ) {
		await ( new Promise<void>( function ( resolve ) {
			setTimeout( function () {
				resolve();
			}, 1000 );
		} ) );

		for ( const t of context.extra.mapto ) {
			if ( t === that.uid ) {
				continue;
			}
			const s = parseUID( t );
			if ( s.client === 'Discord' && msg.dMsg ) {
				output.dc.push( dc.say( s.id, discordEmbedToOption( msg.dMsg ) ) );
			} else if ( s.client === 'Telegram' && msg.tMsg ) {
				output.tg.push( tg.sayWithHTML( s.id, msg.tMsg, {
					disable_web_page_preview: true
				} ) );
			} else if ( s.client === 'IRC' && msg.iMsg ) {
				output.irc.push( irc.say( s.id, msg.iMsg, {
					doNotSplitText: true
				} ) );
			}
		}
	}

	return output;
}

const enableEvents: Record<string, string[]> = {};

const registeredEvents: string[] = [];

export function registerEvent( name: string, disableDuplicateWarn = false ): void {
	if ( registeredEvents.includes( name ) ) {
		if ( !disableDuplicateWarn ) {
			winston.warn( `[afc/util/msg] fail to register event "${ name }": Event has been registered.`, new Error().stack.slice( 6 ) );
		}
	} else if ( name === 'debug' ) {
		return; // ignore
	}
	registeredEvents.push( name );
}

export function send( msg: {
	dMsg?: DiscordSendMessage | DMessageEmbed;
	tMsg?: string;
	iMsg?: string;
}, event: string ): Promise<Response>[] {
	const output: Promise<Response>[] = [];

	// 將ircMessage前後加上分隔符
	if ( msg.iMsg ) {
		msg.iMsg = `
——————————————————————————————
${ msg.iMsg }
——————————————————————————————
`.trim();
	}
	Object.keys( enableEvents ).forEach( function ( k ) {
		if ( !enableEvents[ k ].includes( event ) ) {
			return;
		}
		const f = parseUID( k );
		if ( f.client === 'Discord' && msg.dMsg ) {
			output.push( dc.say( f.id, discordEmbedToOption( msg.dMsg ) ) );
		} else if ( f.client === 'Telegram' && msg.tMsg ) {
			output.push( tg.sayWithHTML( f.id, msg.tMsg, {
				disable_web_page_preview: true
			} ) );
		} else if ( f.client === 'IRC' && msg.iMsg ) {
			output.push( irc.say( f.id, msg.iMsg, {
				doNotSplitText: true
			} ) );
		}
	} );
	return output;
}

export async function pinMessage( promises: Promise<Response>[] ): Promise<void> {
	if ( !registeredEvents.includes( 'pin' ) ) {
		winston.error( '[afc/util/msg] Can\'t pin message: You didn\'t register event "pin".' );
		return;
	}

	promises.forEach( async function ( promise ) {
		const msg = await promise;

		if ( msg ) {
			if ( 'message_id' in msg && 'chat' in msg ) { // Telegram
				if (
					enableEvents[ getUIDFromHandler( tg, msg.chat.id ) ] &&
					enableEvents[ getUIDFromHandler( tg, msg.chat.id ) ].includes( 'pin' )
				) {
					tg.rawClient.telegram.pinChatMessage( msg.chat.id, msg.message_id );
				}
			} else if ( 'id' in msg && 'channel' in msg ) { // Discord
				if (
					enableEvents[ getUIDFromHandler( dc, msg.channel.id ) ] &&
					enableEvents[ getUIDFromHandler( dc, msg.channel.id ) ].includes( 'pin' )
				) {
					msg.pin();
				}
			}
		}
	} );
}

export async function editMessage( promises: Promise<Response>[] | Transport, edMsg: {
	dMsg?: string | DMessageEditOptions;
	tMsg?: string;
} ): Promise<void> {
	( Array.isArray( promises ) ? promises : [
		promises.raw, ...promises.tg, ...promises.dc
	] ).forEach( async function ( promise ) {
		try {
			const msg = await promise;

			if ( msg ) {
				if ( 'message_id' in msg && 'chat' in msg ) { // Telegram
					tg.rawClient.telegram.editMessageText( msg.chat.id, msg.message_id, null, edMsg.tMsg, {
						disable_web_page_preview: true,
						parse_mode: 'HTML'
					} );
				} else if ( 'id' in msg && 'channel' in msg ) { // Discord
					msg.edit( edMsg.dMsg );
				}
			}
		} catch ( error ) {
			winston.error( '[afc/util/msg]' + inspect( error ) );
		}
	} );
}

export function checkRegister(): void {
	winston.debug( '[afc/util/msg] Command enable list:' );
	Manager.config.afc.enableCommands = Manager.config.afc.enableCommands.map( function ( g ) {
		winston.debug( `\t${ parseUID( g ).uid }` );
		return parseUID( g ).uid;
	} );
	winston.debug( '[afc/util/msg] Event enable list:' );
	Manager.config.afc.enableEvents.forEach( function ( v ) {
		if ( typeof v === 'string' ) {
			enableEvents[ parseUID( v ).uid ] = [].concat( registeredEvents || [] );

			winston.debug( `\t${ parseUID( v ).uid }: all` );
		} else {
			let events: string[];
			if ( v.include ) {
				events = v.include.filter( function ( e ) {
					if ( !registeredEvents.includes( e ) ) {
						winston.warn( `[afc/util/msg] fail to listen event "${ e }" on "${ v.groups.join( '", "' ) }": Event is invaild.` );
						return false;
					}
					return true;
				} );
			} else if ( v.exclude ) {
				events = [].concat( registeredEvents || [] ).filter( function ( e ) {
					if ( v.exclude.includes( e ) ) {
						return false;
					}
					return true;
				} );

				v.exclude.forEach( function ( e ) {
					if ( !registeredEvents.includes( e ) ) {
						winston.warn( `[afc/util/msg] fail to exclude event "${ e }" on "${ v.groups.join( '", "' ) }": Event is invaild.` );
					}
				} );
			} else {
				events = [].concat( registeredEvents || [] );
			}

			if ( v.debug ) {
				events.push( 'debug' );
			}

			v.groups.forEach( function ( g ) {
				winston.debug( `\t${ parseUID( g ).uid }: ${ events.join( ', ' ) }` );
				enableEvents[ parseUID( g ).uid ] = events;
			} );
		}
	} );
}
