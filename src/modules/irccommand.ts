/*
 * 在其他群組向 IRC 發命令
 */

import winston = require( 'winston' );
import { Manager } from 'init';
import * as moduleTransport from 'modules/transport';

if ( Manager.global.isEnable( 'transport' ) ) {
	const options = Manager.config.irccommand;

	const prefix = options.prefix || '';
	const echo = options.echo || true;
	const ircHandler = Manager.handlers.get( 'IRC' );

	moduleTransport.addCommand( `/${ prefix }command`, function ( context: moduleTransport.BridgeMsg ) {
		if ( !context.isPrivate ) {
			if ( context.param ) {
				if ( echo ) {
					context.reply( context.param );
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
		return Promise.resolve();
	}, options );
}
