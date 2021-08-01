/* eslint-disable no-unused-expressions */
import { Manager } from 'init';
import * as moduleTransport from 'modules/transport';

import Discord from 'discord.js';

const dc = Manager.handlers.get( 'Discord' );
const tg = Manager.handlers.get( 'Telegram' );
const irc = Manager.handlers.get( 'IRC' );

const enableCommands: string[] = Manager.config.afc.enables.concat( Manager.config.afc.enableCommands || [] );

type command = ( args: string[], replyfunc: ( msg: {
	dMsg?: string | Discord.MessageEmbed;
	tMsg?: string;
	iMsg?: string;
} ) => void, msg: moduleTransport.BridgeMsg ) => void;

export function setCommand( cmd: string, func: command ): void {
	moduleTransport.addCommand( `!${ cmd }`, function ( bridgeMsg ) {
		func( bridgeMsg.param.split( ' ' ), function ( msg: {
			dMsg?: string | Discord.MessageEmbed;
			tMsg?: string;
			iMsg?: string;
		} ) {
			reply( bridgeMsg, msg );
		}, bridgeMsg );
		return Promise.resolve();
	}, {
		enables: enableCommands.filter( function ( c ) {
			return moduleTransport.BridgeMsg.parseUID( c ).client !== 'Telegram';
		} )
	} );

	moduleTransport.addCommand( `/${ cmd }`, function ( bridgeMsg ) {
		func( bridgeMsg.param.split( ' ' ), function ( msg: {
			dMsg?: string | Discord.MessageEmbed;
			tMsg?: string;
			iMsg?: string;
		} ) {
			reply( bridgeMsg, msg );
		}, bridgeMsg );
		return Promise.resolve();
	}, {
		enables: enableCommands.filter( function ( c ) {
			return moduleTransport.BridgeMsg.parseUID( c ).client !== 'IRC';
		} )
	} );
}

export async function reply( context: moduleTransport.BridgeMsg, msg: {
	dMsg?: string | Discord.MessageEmbed;
	tMsg?: string;
	iMsg?: string;
} ): Promise<void> {
	const that = moduleTransport.BridgeMsg.parseUID( context.rawTo );

	if ( that.client === 'Discord' ) {
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

	// 若互聯且在公開群組調用，則讓其他群也看到
	if ( context.extra.mapto ) {
		await ( new Promise<void>( function ( resolve ) {
			setTimeout( function () {
				resolve();
			}, 1000 );
		} ) );

		for ( const t of context.extra.mapto ) {
			if ( t === context.to_uid ) {
				continue;
			}
			const s = moduleTransport.BridgeMsg.parseUID( t );
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

export async function send( msg: {
	dMsg?: string | Discord.MessageEmbed;
	tMsg?: string;
	iMsg?: string;
} ): Promise<void> {
	enableEvents.forEach( function ( k ) {
		const f = moduleTransport.BridgeMsg.parseUID( k );
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
