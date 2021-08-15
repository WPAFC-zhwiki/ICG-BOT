import EventEmitter, { Events } from 'lib/event';
import { Context } from 'lib/handlers/Context';
import { Message as DMessage } from 'discord.js';
import { TelegrafContext as TContext } from 'telegraf/typings/context';
import { IMessage } from 'irc-upd';

export default new EventEmitter<Events & {
	discord( from: string, to: string, text: string, msg: Context<DMessage> ): void;
	telegram( from: string, to: string, text: string, msg: Context<TContext> ): void;
	irc( from: string, to: string, text: string, msg: Context<IMessage> ): void;
}>();
