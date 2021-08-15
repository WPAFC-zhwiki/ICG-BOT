import { Manager } from 'init';
import { IMessage } from 'irc-upd';
import { Context } from 'lib/handlers/Context';
import msgManage from 'lib/message/msgManage';

const ircHandler = Manager.handlers.get( 'IRC' );

ircHandler.on( 'text', function ( context: Context<IMessage> ) {
	msgManage.emit( 'irc', context.from, context.to, context.text, context );
} );
