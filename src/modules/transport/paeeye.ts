import winston = require( 'winston' );

import { Manager } from 'src/init';
import { ConfigTS } from 'src/config';
import * as bridge from 'src/modules/transport/bridge';
import { BridgeMsg } from 'src/modules/transport/BridgeMsg';

Manager.global.ifEnable( 'transport', function () {
	bridge.addHook( 'bridge.send', function ( msg: BridgeMsg ) {
		return new Promise<void>( function ( resolve, reject ) {
			const paeeye: ConfigTS[ 'transport' ][ 'options' ][ 'paeeye' ] = Manager.config.transport.options.paeeye;

			if (
				(
					paeeye.prepend && msg.text.startsWith( paeeye.prepend ) ||
					paeeye.inline && msg.text.includes( paeeye.inline ) ||
					paeeye.regexp && msg.text.match( paeeye.regexp )
				)
			) {
				winston.debug( `[transport/paeeye] #${ msg.msgId }: Ignored.` );
				reject( false );
				return;
			} else if (
				msg.extra.reply &&
				(
					paeeye.prepend && msg.extra.reply.message.startsWith( paeeye.prepend ) ||
					paeeye.inline && msg.extra.reply.message.includes( paeeye.inline ) ||
					paeeye.regexp && msg.extra.reply.message.match( paeeye.regexp )
				)
			) {
				winston.debug( `[transport/paeeye] #${ msg.msgId }: Ignored.` );
				reject( false );
				return;
			}

			resolve();
		} );
	} );
} );
