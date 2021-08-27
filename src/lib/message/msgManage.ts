import EventEmitter, { Events } from 'src/lib/eventemitter2';
import { Context, rawmsg } from 'src/lib/handlers/Context';
import { Message as DMessage } from 'discord.js';
import { Context as TContext } from 'telegraf';
import { IMessage } from 'irc-upd';

export default new EventEmitter<Events & {
	irc( from: string, to: string, text: string, msg: Context<IMessage> ): void;
	telegram( from: string, to: string, text: string, msg: Context<TContext> ): void;
	discord( from: string, to: string, text: string, msg: Context<DMessage> ): void;
	text( client: 'IRC' | 'Telegram' | 'Discord', from: string, to: string, text: string, msg: Context<rawmsg> ): void;
}>();
