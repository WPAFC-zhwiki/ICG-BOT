import { Context as TContext } from 'telegraf';

import { Manager } from '@app/init.mjs';

import { Context } from '@app/lib/handlers/Context.mjs';
import messageManage from '@app/lib/message/messageManage.mjs';

const tgHandler = Manager.handlers.get( 'Telegram' );

tgHandler.on( 'text', function ( context: Context<TContext> ) {
	messageManage.emit( 'telegram', context.from, context.to, context.text, context );
	messageManage.emit( 'text', 'Telegram', context.from, context.to, context.text, context );
} );
