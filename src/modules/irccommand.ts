/*
 * 在其他群組向 IRC 發命令
 */

import winston = require( 'winston' );
import { Manager } from 'init';
import * as moduleTransport from 'modules/transport';
import { addCommand } from 'lib/message';
import { Context } from 'lib/handlers/Context';

const ircHandler = Manager.handlers.get( 'IRC' );

if ( ircHandler && Manager.global.isEnable( 'transport' ) ) {
	const options = Manager.config.irccommand;

	const prefix = options.prefix || '';
	const echo = options.echo || true;

	addCommand( `${ prefix }command`, async function ( context: Context ) {
		if ( !context.isPrivate ) {
			moduleTransport.prepareBridgeMsg( context );
			if ( context.param && context.extra?.mapto?.length ) {
				if ( echo ) {
					context.reply( context.param, {
						noPrefix: true
					} );
				}

				let sentCount = 0;
				for ( const c of context.extra.mapto ) {
					const client = moduleTransport.BridgeMsg.parseUID( c );
					if ( client.client === 'IRC' ) {
						sentCount++;
						ircHandler.say( client.id, context.param );
						winston.debug( `[irccommand] Msg #${ context.msgId }: IRC command has sent to ${ client.id }. Param = ${ context.param }` );
					}
				}

				if ( sentCount === 0 ) {
					winston.debug( `[irccommand] Msg #${ context.msgId }: No IRC targets.` );
				}
			} else {
				context.reply( `用法: /${ prefix }command <命令>` );
			}
		}
	}, options );
}
