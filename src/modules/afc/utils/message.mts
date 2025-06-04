import { scheduler } from 'node:timers/promises';

import { Message as TMessage } from '@telegraf/types';
import * as cheerio from 'cheerio';
import { Message as DMessage, EmbedBuilder as DMessageEmbed, MessageEditOptions as DMessageEditOptions } from 'discord.js';
import * as mIrc from 'irc-upd';
import winston from 'winston';

import { Manager } from '@app/init.mjs';

import { Context } from '@app/lib/handlers/Context.mjs';
import { DiscordSendMessage } from '@app/lib/handlers/DiscordMessageHandler.mjs';
import { parseUID, getUIDFromContext, addCommand, getUIDFromHandler } from '@app/lib/message.mjs';
import { inspect } from '@app/lib/util.mjs';

import { $, decodeURI } from '@app/modules/afc/util.mjs';
import { escapeHTML } from '@app/modules/afc/utils/telegram-html.mjs';
import * as moduleTransport from '@app/modules/transport.mjs';

export function htmlToIRC( text: string ): string {
	const $ele = cheerio.load( text );

	$ele( 'a' ).each( function ( _index, a ) {
		const $a = $( a );
		const href = decodeURI( $a.attr( 'href' ) ).replaceAll( /^https:\/\/zh\.wikipedia\.org\/(wiki\/)?/g, 'https://zhwp.org/' );

		$a.html( ` ${ $a.html() } &lt;${ escapeHTML( href ) }&gt;` );
	} );

	$ele( 'b' ).each( function ( _index, b ): void {
		const $b = $( b );

		$b.html( mIrc.colors.wrap( 'bold', $b.html() ) );
	} );

	$ele( 'code' ).each( function ( _index, code ): void {
		const $code = $( code );

		$code.html( `\`${ $code.html() }\`` );
	} );

	return $ele.text();
}

const dc = Manager.handlers.get( 'Discord' );
const tg = Manager.handlers.get( 'Telegram' );
const irc = Manager.handlers.get( 'IRC' );

export type Response = void /* IRC */ | TMessage | DMessage;

function discordEmbedToOption( dMessage: DiscordSendMessage | DMessageEmbed ): DiscordSendMessage {
	return dMessage instanceof DMessageEmbed ? {
		embeds: [ dMessage ],
	} : dMessage;
}

export type CommandReplyFunc = ( message: {
	dMessage?: DiscordSendMessage | DMessageEmbed;
	tMessage?: string;
	iMessage?: string;
} ) => Promise<Transport>;
export type Command = ( args: string[], replyfunc: CommandReplyFunc, message: Context ) => void;

export function setCommand( cmd: string | string[], func: Command ): void {
	addCommand( cmd, function ( context ) {
		func( context.param.split( ' ' ), function ( message: {
			dMessage?: DiscordSendMessage | DMessageEmbed;
			tMessage?: string;
			iMessage?: string;
		} ): Promise<Transport> {
			return reply( context, message );
		}, context );
		return Promise.resolve();
	}, {
		enables: Manager.config.afc.enableCommands,
	} );
}

type Transport = {
	raw: Promise<Response>;
	irc: Promise<void>[];
	tg: Promise<TMessage>[];
	dc: Promise<DMessage>[];
};

export async function reply( context: Context, message: {
	dMessage?: DiscordSendMessage | DMessageEmbed;
	tMessage?: string;
	iMessage?: string;
} ): Promise<Transport> {
	const that = parseUID( getUIDFromContext( context, context.to ) );

	const output: Transport = {
		raw: Promise.resolve(),
		irc: [],
		tg: [],
		dc: [],
	};

	if ( that.client === 'Discord' && message.dMessage ) {
		output.raw = dc.say( that.id, discordEmbedToOption( message.dMessage ) );
	} else if ( that.client === 'Telegram' && message.tMessage ) {
		output.raw = tg.sayWithHTML( that.id, message.tMessage, {
			link_preview_options: {
				is_disabled: true,
			},
		} );
	} else if ( that.client === 'IRC' && message.iMessage ) {
		output.raw = irc.say( that.id, message.iMessage, {
			doNotSplitText: true,
		} );
	}

	moduleTransport.prepareBridgeMessage( context );

	// 若互聯且在公開群組調用，則讓其他群也看到
	if ( context.extra.mapTo ) {
		await scheduler.wait( 1000 );

		for ( const t of context.extra.mapTo ) {
			if ( t === that.uid ) {
				continue;
			}
			const s = parseUID( t );
			if ( s.client === 'Discord' && message.dMessage ) {
				output.dc.push( dc.say( s.id, discordEmbedToOption( message.dMessage ) ) );
			} else if ( s.client === 'Telegram' && message.tMessage ) {
				output.tg.push( tg.sayWithHTML( s.id, message.tMessage, {
					link_preview_options: {
						is_disabled: true,
					},
				} ) );
			} else if ( s.client === 'IRC' && message.iMessage ) {
				output.irc.push( irc.say( s.id, message.iMessage, {
					doNotSplitText: true,
				} ) );
			}
		}
	}

	return output;
}

const enableEventsMap: Map<string, string[]> = new Map();

const registeredEvents: string[] = [];

export function registerEvent( name: string, disableDuplicateWarn = false ): void {
	if ( registeredEvents.includes( name ) ) {
		if ( !disableDuplicateWarn ) {
			winston.warn(
				`[afc/util/msg] fail to register event "${ name }": Event has been registered.`,
				// eslint-disable-next-line unicorn/error-message
				new Error().stack.slice( 6 )
			);
		}
	} else if ( name === 'debug' ) {
		return; // ignore
	}
	registeredEvents.push( name );
}

export function send( message: {
	dMessage?: DiscordSendMessage | DMessageEmbed;
	tMessage?: string;
	iMessage?: string;
}, event: string ): Promise<Response>[] {
	let isDebug = event === 'debug';
	if ( event.endsWith( '+debug' ) ) {
		isDebug = true;
		event = event.slice( 0, -'+debug'.length );
	}
	const output: Promise<Response>[] = [];

	// 將ircMessage前後加上分隔符
	if ( message.iMessage ) {
		message.iMessage = `
——————————————————————————————
${ message.iMessage }
——————————————————————————————
`.trim();
	}
	for ( const [ chatId, enableEvents ] of enableEventsMap ) {
		if ( !enableEvents.includes( event ) ) {
			return;
		}
		const f = parseUID( chatId );
		if ( f.client === 'Discord' && message.dMessage ) {
			output.push( dc.say( f.id, discordEmbedToOption( message.dMessage ) ) );
		} else if ( f.client === 'Telegram' && message.tMessage ) {
			let messageToSend = message.tMessage;
			if ( isDebug && enableEvents.includes( 'debug' ) && Manager.config.afc.errorDebugTelegramNotifyString ) {
				messageToSend += [ '\n', ' ' ].includes( Manager.config.afc.errorDebugTelegramNotifyString.charAt( 0 ) ) ? Manager.config.afc.errorDebugTelegramNotifyString : `\n\n${ Manager.config.afc.errorDebugTelegramNotifyString }`;
			}
			output.push( tg.sayWithHTML( f.id, messageToSend, {
				link_preview_options: {
					is_disabled: true,
				},
			} ) );
		} else if ( f.client === 'IRC' && message.iMessage ) {
			output.push( irc.say( f.id, message.iMessage, {
				doNotSplitText: true,
			} ) );
		}
	}

	return output;
}

export async function pinMessage( promises: Promise<Response>[] ): Promise<void> {
	if ( !registeredEvents.includes( 'pin' ) ) {
		winston.error( '[afc/util/msg] Can\'t pin message: You didn\'t register event "pin".' );
		return;
	}

	// 故意讓每個項目同步執行的
	// eslint-disable-next-line unicorn/no-array-for-each
	promises.forEach( async function ( promise ) {
		const message = await promise;

		if ( message ) {
			if ( 'message_id' in message && 'chat' in message ) { // Telegram
				if (
					enableEventsMap.get( getUIDFromHandler( tg, message.chat.id ) )?.includes( 'pin' )
				) {
					tg.rawClient.telegram.pinChatMessage( message.chat.id, message.message_id );
				}
			} else if ( 'id' in message && 'channel' in message && // Discord

					enableEventsMap.get( getUIDFromHandler( dc, message.channel.id ) )?.includes( 'pin' )
			) {
				message.pin();
			}
		}
	} );
}

export async function editMessage( promises: Promise<Response>[] | Transport, edMessage: {
	dMessage?: string | DMessageEditOptions;
	tMessage?: string;
} ): Promise<void> {
	( Array.isArray( promises ) ? promises : [
		promises.raw, ...promises.tg, ...promises.dc,
	// 故意讓每個項目同步執行的
	// eslint-disable-next-line unicorn/no-array-for-each
	] ).forEach( async function ( promise ) {
		try {
			const message = await promise;

			if ( message ) {
				if ( 'message_id' in message && 'chat' in message ) { // Telegram
					tg.rawClient.telegram.editMessageText(
						message.chat.id,
						message.message_id,
						undefined,
						edMessage.tMessage, {
							link_preview_options: {
								is_disabled: true,
							},
							parse_mode: 'HTML',
						}
					);
				} else if ( 'id' in message && 'channel' in message ) { // Discord
					message.edit( edMessage.dMessage );
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
	for ( const v of Manager.config.afc.enableEvents ) {
		if ( typeof v === 'string' ) {
			enableEventsMap.set( parseUID( v ).uid, [ registeredEvents || [] ].flat() );

			winston.debug( `\t${ parseUID( v ).uid }: all` );
		} else {
			let events: string[];
			if ( v.include ) {
				events = v.include.filter( function ( event ) {
					if ( !registeredEvents.includes( event ) ) {
						winston.warn(
							`[afc/util/msg] fail to listen event "${ event }" on "${ v.groups.join( '", "' ) }": Event is invalid.`
						);
						return false;
					}
					return true;
				} );
			} else if ( v.exclude ) {
				events = [ registeredEvents || [] ].flat().filter( function ( event ) {
					if ( v.exclude.includes( event ) ) {
						return false;
					}
					return true;
				} );

				for ( const event of v.exclude ) {
					if ( !registeredEvents.includes( event ) ) {
						winston.warn(
							`[afc/util/msg] fail to exclude event "${ event }" on "${ v.groups.join( '", "' ) }": Event is invalid.`
						);
					}
				}
			} else {
				events = [ registeredEvents || [] ].flat();
			}

			if ( v.debug ) {
				events.push( 'debug' );
			}

			for ( const g of v.groups ) {
				winston.debug( `\t${ parseUID( g ).uid }: ${ events.join( ', ' ) }` );
				enableEventsMap.set( parseUID( g ).uid, [ events ].flat() );
			}
		}
	}
}
