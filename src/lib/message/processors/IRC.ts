import { Manager } from 'src/init';
import { Context } from 'src/lib/handlers/Context';
import { IMessage } from 'irc-upd';

import msgManage from 'src/lib/message/msgManage';

const ircHandler = Manager.handlers.get( 'IRC' );

ircHandler.on( 'text', function ( context: Context<IMessage> ) {
	msgManage.emit( 'irc', context.from, context.to, context.text, context );
	msgManage.emit( 'text', 'IRC', context.from, context.to, context.text, context );
} );
