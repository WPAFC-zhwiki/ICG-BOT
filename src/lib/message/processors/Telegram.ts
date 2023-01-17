import { Context as TContext } from 'telegraf';

import { Manager } from '@app/init';

import { Context } from '@app/lib/handlers/Context';
import msgManage from '@app/lib/message/msgManage';

const tgHandler = Manager.handlers.get( 'Telegram' );

tgHandler.on( 'text', function ( context: Context<TContext> ) {
	msgManage.emit( 'telegram', context.from, context.to, context.text, context );
	msgManage.emit( 'text', 'Telegram', context.from, context.to, context.text, context );
} );
