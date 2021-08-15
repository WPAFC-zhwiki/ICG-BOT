import { Manager } from 'init';
import { Context } from 'lib/handlers/Context';
import { TelegrafContext as TContext } from 'telegraf/typings/context';
import msgManage from 'lib/message/msgManage';

const tgHandler = Manager.handlers.get( 'Telegram' );

tgHandler.on( 'text', function ( context: Context<TContext> ) {
	msgManage.emit( 'telegram', context.from, context.to, context.text, context );
} );
