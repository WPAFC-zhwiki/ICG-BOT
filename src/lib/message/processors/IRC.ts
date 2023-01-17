import { IMessage } from 'irc-upd';

import { Manager } from '@app/init';

import { Context } from '@app/lib/handlers/Context';
import msgManage from '@app/lib/message/msgManage';

const ircHandler = Manager.handlers.get( 'IRC' );

ircHandler.on( 'text', function ( context: Context<IMessage> ) {
	msgManage.emit( 'irc', context.from, context.to, context.text, context );
	msgManage.emit( 'text', 'IRC', context.from, context.to, context.text, context );
} );
