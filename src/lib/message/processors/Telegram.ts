import { Context as TContext } from 'telegraf';

import { Manager } from '@app/init';

import { Context } from '@app/lib/handlers/Context';
import messageManage from '@app/lib/message/messageManage';

const tgHandler = Manager.handlers.get( 'Telegram' );

tgHandler.on( 'text', function ( context: Context<TContext> ) {
	messageManage.emit( 'telegram', context.from, context.to, context.text, context );
	messageManage.emit( 'text', 'Telegram', context.from, context.to, context.text, context );
} );
