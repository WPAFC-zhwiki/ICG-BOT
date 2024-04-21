import type { Message as DMessage } from 'discord.js';
import type { IMessage } from 'irc-upd';
import type { Context as TContext } from 'telegraf';

import EventEmitter, { type Events } from '@app/lib/eventemitter2';
import type { Context, RawMsg } from '@app/lib/handlers/Context';

export default new EventEmitter<Events & {
	irc( from: string, to: string, text: string, msg: Context<IMessage> ): void;
	telegram( from: string, to: string, text: string, msg: Context<TContext> ): void;
	discord( from: string, to: string, text: string, msg: Context<DMessage> ): void;
	text( client: 'IRC' | 'Telegram' | 'Discord', from: string, to: string, text: string, msg: Context<RawMsg> ): void;
}>();
