/*
 * 在其他群組查 IRC 的情況
 */

import winston = require( 'winston' );
import { Manager } from 'init';
import * as moduleTransport from 'modules/transport';

const ircHandler = Manager.handlers.get( 'IRC' );

function getChans( context: moduleTransport.BridgeMsg ) {
	const r: string[] = [];
	for ( const c of context.extra.mapto ) {
		const client = moduleTransport.BridgeMsg.parseUID( c );
		if ( client.client === 'IRC' ) {
			r.push( client.id );
		}
	}
	return r;
}

async function processWhois( context: moduleTransport.BridgeMsg ) {
	if ( context.param ) {
		ircHandler.whois( context.param ).then( ( info ) => {
			let output: string[] = [ `${ info.nick }: Unknown nick` ];

			if ( info.user ) {
				output = [
					`${ info.nick } (${ info.user }@${ info.host })`,
					`Server: ${ info.server } (${ info.serverinfo })`
				];

				if ( info.realname ) {
					output.push( `Realname: ${ info.realname }` );
				}
			}

			const outputStr = output.join( '\n' );
			winston.debug( `[ircquery] Msg #${ context.msgId } whois: ${ outputStr }` );
			context.reply( outputStr );
		} );
	} else {
		context.reply( '用法：/ircwhois IRC暱称' );
	}
}

async function processNames( context: moduleTransport.BridgeMsg ) {
	const chans = getChans( context );

	for ( const chan of chans ) {
		const users = ircHandler.chans[ chan ].users;
		const userlist = [];

		for ( const user in users ) {
			if ( users[ user ] !== '' ) {
				userlist.push( `(${ users[ user ] })${ user }` );
			} else if ( users[ user ] !== undefined ) {
				userlist.push( user );
			}
		}
		userlist.sort( ( a, b ) => {
			if ( a.startsWith( '(@)' ) && !b.startsWith( '(@)' ) ) {
				return -1;
			} else if ( b.startsWith( '(@)' ) && !a.startsWith( '(@)' ) ) {
				return 1;
			} else if ( a.startsWith( '(+)' ) && !b.startsWith( '(+)' ) ) {
				return -1;
			} else if ( b.startsWith( '(+)' ) && !a.startsWith( '(+)' ) ) {
				return 1;
			} else {
				return a.toLowerCase() < b.toLowerCase() ? -1 : 1;
			}
		} );

		const outputStr = `Users on ${ chan }: ${ userlist.join( ', ' ) }`;
		context.reply( outputStr );
		winston.debug( `[ircquery] Msg #${ context.msgId } names: ${ outputStr }` );
	}
}

async function processTopic( context: moduleTransport.BridgeMsg ) {
	const chans = getChans( context );
	for ( const chan of chans ) {
		const topic: string = Object.assign( ircHandler.chans[ chan ] ).topic;

		if ( topic ) {
			context.reply( `Topic for channel ${ chan }: ${ topic }` );
			winston.debug( `[ircquery] Msg #${ context.msgId } topic: ${ topic }` );
		} else {
			context.reply( `No topic for ${ chan }` );
			winston.debug( `[ircquery] Msg #${ context.msgId } topic: No topic` );
		}
	}
}

if ( Manager.global.isEnable( 'transport' ) && ircHandler ) {
	const prefix = Manager.config.ircquery.prefix || '';

	moduleTransport.addCommand( `/${ prefix }topic`, processTopic, Manager.config.ircquery );
	moduleTransport.addCommand( `/${ prefix }names`, processNames, Manager.config.ircquery );
	moduleTransport.addCommand( `/${ prefix }whois`, processWhois, Manager.config.ircquery );
}
