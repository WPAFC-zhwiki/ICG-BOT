/* eslint-disable no-unused-expressions */
import Discord = require( 'discord.js' );

import { Manager } from 'src/init';
import { Context } from 'src/lib/handlers/Context';
import { parseUID, getUIDFromContext, addCommand } from 'src/lib/message';
import * as moduleTransport from 'src/modules/transport';
import { IRCBold, $, decodeURI } from 'src/modules/afc/util/index';

const dc = Manager.handlers.get( 'Discord' );
const tg = Manager.handlers.get( 'Telegram' );
const irc = Manager.handlers.get( 'IRC' );

const enableCommands: string[] = Manager.config.afc.enables.concat( Manager.config.afc.enableCommands || [] );

type command = ( args: string[], replyfunc: ( msg: {
	dMsg?: string | Discord.MessageEmbed;
	tMsg?: string;
	iMsg?: string;
} ) => void, msg: Context ) => void;

export function setCommand( cmd: string, func: command ): void {
	addCommand( `${ cmd }`, function ( context ) {
		func( context.param.split( ' ' ), function ( msg: {
			dMsg?: string | Discord.MessageEmbed;
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

export async function reply( context: Context, msg: {
	dMsg?: string | Discord.MessageEmbed;
	tMsg?: string;
	iMsg?: string;
} ): Promise<void> {
	const that = parseUID( getUIDFromContext( context, context.to ) );

	if ( context.handler.id === 'Discord' ) {
		msg.dMsg && dc.say( that.id, msg.dMsg );
	} else if ( that.client === 'Telegram' ) {
		msg.tMsg && tg.sayWithHTML( that.id, msg.tMsg, {
			disable_web_page_preview: true
		} );
	} else if ( that.client === 'IRC' ) {
		msg.iMsg && msg.iMsg.split( '\n' ).forEach( function ( m ) {
			irc.say( that.id, m );
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
			if ( s.client === 'Discord' ) {
				msg.dMsg && dc.say( s.id, msg.dMsg );
			} else if ( s.client === 'Telegram' ) {
				msg.tMsg && tg.sayWithHTML( s.id, msg.tMsg, {
					disable_web_page_preview: true
				} );
			} else if ( s.client === 'IRC' ) {
				msg.iMsg && msg.iMsg.split( '\n' ).forEach( function ( m ) {
					irc.say( s.id, m );
				} );
			}
		}
	}
}

const enableEvents: string[] = Manager.config.afc.enables.concat( Manager.config.afc.enableEvents || [] );
const debugGroups: string[] = Manager.config.afc.debugGroups || [];

export async function send( msg: {
	dMsg?: string | Discord.MessageEmbed;
	tMsg?: string;
	iMsg?: string;
}, debug?: boolean ): Promise<void> {
	( debug ? debugGroups : enableEvents ).forEach( function ( k ) {
		const f = parseUID( k );
		if ( f.client === 'Discord' ) {
			msg.dMsg && dc.say( f.id, msg.dMsg );
		} else if ( f.client === 'Telegram' ) {
			msg.tMsg && tg.sayWithHTML( f.id, msg.tMsg, {
				disable_web_page_preview: true
			} );
		} else if ( f.client === 'IRC' ) {
			msg.iMsg && msg.iMsg.split( '\n' ).forEach( function ( m ) {
				irc.say( f.id, m );
			} );
		}
	} );
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
