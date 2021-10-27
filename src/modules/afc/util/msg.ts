import { Message as TMessage } from 'telegraf/typings/telegram-types';
import { Message as DMessage, MessageEmbed as DMessageEmbed } from 'discord.js';

import { Manager } from 'src/init';
import { Context } from 'src/lib/handlers/Context';
import { parseUID, getUIDFromContext, addCommand } from 'src/lib/message';
import * as moduleTransport from 'src/modules/transport';
import { IRCBold, $, decodeURI } from 'src/modules/afc/util/index';

const dc = Manager.handlers.get( 'Discord' );
const tg = Manager.handlers.get( 'Telegram' );
const irc = Manager.handlers.get( 'IRC' );

const enableCommands: string[] = Manager.config.afc.enables.concat( Manager.config.afc.enableCommands || [] );

export type Response = void /* IRC */ | TMessage | DMessage;

type command = ( args: string[], replyfunc: ( msg: {
	dMsg?: string | DMessageEmbed;
	tMsg?: string;
	iMsg?: string;
} ) => void, msg: Context ) => void;

export function setCommand( cmd: string, func: command ): void {
	addCommand( `${ cmd }`, function ( context ) {
		func( context.param.split( ' ' ), function ( msg: {
			dMsg?: string | DMessageEmbed;
			tMsg?: string;
			iMsg?: string;
		} ) {
			reply( context, msg );
		}, context );
		return Promise.resolve();
	}, {
		enables: enableCommands
	} );
}

type Transport = {
	raw: Promise<Response>;
	irc: Promise<void>[];
	tg: Promise<TMessage>[];
	dc: Promise<DMessage>[];
};

export async function reply( context: Context, msg: {
	dMsg?: string | DMessageEmbed;
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

	if ( context.handler.id === 'Discord' && msg.dMsg ) {
		output.raw = dc.say( that.id, msg.dMsg );
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
				output.dc.push( dc.say( s.id, msg.dMsg ) );
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

const enableEvents: string[] = Manager.config.afc.enables.concat( Manager.config.afc.enableEvents || [] );
const debugGroups: string[] = Manager.config.afc.debugGroups || [];

export function send( msg: {
	dMsg?: string | DMessageEmbed;
	tMsg?: string;
	iMsg?: string;
}, debug?: boolean ): Promise<Response>[] {
	const output: Promise<Response>[] = [];
	( debug ? debugGroups : enableEvents ).forEach( function ( k ) {
		const f = parseUID( k );
		if ( f.client === 'Discord' && msg.dMsg ) {
			output.push( dc.say( f.id, msg.dMsg ) );
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

function htmlExcape( str: string ) {
	return $( '<div>' ).text( str ).html();
}

export function htmlToIRC( text: string ): string {
	const $ele = $( '<div>' ).append( $.parseHTML( text ) );

	$ele.find( 'a' ).each( function ( _i, a ) {
		const $a: JQuery<HTMLAnchorElement> = $( a );
		const href = decodeURI( $a.attr( 'href' ) ).replace( /^https:\/\/zh\.wikipedia\.org\/(wiki\/)?/g, 'https://zhwp.org/' );

		$a.html( ` ${ $a.html() } &lt;${ htmlExcape( href ) }&gt;` );
	} );

	$ele.find( 'b' ).each( function ( _i: number, b: HTMLElement ): void {
		const $b: JQuery<HTMLElement> = $( b );

		$b.html( `${ IRCBold }${ $b.html() }${ IRCBold }` );
	} );

	return $ele.text();
}
