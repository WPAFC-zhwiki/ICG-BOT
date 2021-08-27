import { Manager } from 'src/init';
import { Context } from 'src/lib/handlers/Context';
import { Context as TContext } from 'telegraf';
import msgManage from 'src/lib/message/msgManage';

const tgHandler = Manager.handlers.get( 'Telegram' );

tgHandler.on( 'text', function ( context: Context<TContext> ) {
	msgManage.emit( 'telegram', context.from, context.to, context.text, context );
	msgManage.emit( 'text', 'Telegram', context.from, context.to, context.text, context );
} );
