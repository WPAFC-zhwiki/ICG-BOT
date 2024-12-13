import { IMessage } from 'irc-upd';

import { Manager } from '@app/init.mjs';

import { Context } from '@app/lib/handlers/Context.mjs';
import messageManage from '@app/lib/message/messageManage.mjs';

const ircHandler = Manager.handlers.get( 'IRC' );

ircHandler.on( 'text', function ( context: Context<IMessage> ) {
	messageManage.emit( 'irc', context.from, context.to, context.text, context );
	messageManage.emit( 'text', 'IRC', context.from, context.to, context.text, context );
} );
