/*
 * 在其他群組向 IRC 發命令
 */

import winston from 'winston';

import { Manager } from '@app/init.mjs';

import { Context } from '@app/lib/handlers/Context.mjs';
import { addCommand, parseUID } from '@app/lib/message.mjs';

import { prepareBridgeMessage } from '@app/modules/transport.mjs';

const ircHandler = Manager.handlers.get( 'IRC' );

if ( ircHandler && Manager.global.isEnable( 'transport' ) ) {
	const options = Manager.config.irccommand;

	const prefix = options.prefix || '';
	const echo = options.echo || true;

	addCommand( `${ prefix }command`, async function ( context: Context ) {
		if ( !context.isPrivate ) {
			prepareBridgeMessage( context );
			if ( context.param && context.extra?.mapTo?.length ) {
				if ( echo ) {
					context.reply( context.param, {
						noPrefix: true,
					} );
				}

				let sentCount = 0;
				for ( const c of context.extra.mapTo ) {
					const client = parseUID( c );
					if ( client.client === 'IRC' ) {
						sentCount++;
						ircHandler.say( client.id, context.param );
						winston.debug( `[irccommand] Message #${ context.msgId }: IRC command has sent to ${ client.id }. Param = ${ context.param }` );
					}
				}

				if ( sentCount === 0 ) {
					winston.debug( `[irccommand] Message #${ context.msgId }: No IRC targets.` );
				}
			} else {
				context.reply( `用法: /${ prefix }command <命令>` );
			}
		}
	}, options );
}
