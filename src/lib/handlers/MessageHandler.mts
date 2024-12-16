import { Client as DiscordClient } from 'discord.js';
import { Client as IRCClient } from 'irc-upd';
import { Telegraf as TelegrafClient, Context as TContext } from 'telegraf';

import EventEmitter, { Events } from '@app/lib/eventemitter2.mjs';
import { Context, RawMessage } from '@app/lib/handlers/Context.mjs';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Command<RD extends RawMessage = any> = (
	context: Context<RD>,
	cmd: string,
	parameter: string
) => void;

export type Telegram = TelegrafClient<TContext>;
export type Discord = DiscordClient;
export type IRC = IRCClient;

export interface BaseEvents<RD extends RawMessage> extends Events {
	command( context: Context<RD>, comand: string, parameter: string ): void;
	[ key: `command#${ string }` ]: ( context: Context<RD>, comand: string, parameter: string ) => void;
	text( context: Context<RD> ): void;
}

/**
 * 使用統一介面處理訊息
 *
 * MessageHandler 的目的是為不同種類的機器人提供統一的介面。在統一的 context 之下，它們也可以忽略訊息來源的軟件，以自己能夠
 * 接受的方式輸出其他群組的訊息
 *
 * 接受以下事件：
 *
 * text: context
 * command: context
 * command#命令: context
 *
 * context 須使用統一格式
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any, unicorn/prefer-event-target
export class MessageHandler<E extends BaseEvents<any> = BaseEvents<RawMessage>> extends EventEmitter<E> {
	declare protected _client: Telegram | Discord | IRC;
	protected _type: string;
	protected _id: string;
	protected _enabled = true;
	protected _started = false;

	protected readonly _commands: Map<string, Command> = new Map();

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	public constructor( optin: unknown ) {
		super();
	}

	public get rawClient(): Telegram | Discord | IRC {
		return this._client;
	}

	public get type(): string {
		return this._type;
	}

	public get id(): string {
		return this._id;
	}

	public get enabled(): boolean {
		return this._enabled;
	}

	public set enabled( value: boolean ) {
		this._enabled = value && true;
	}

	public get started(): boolean {
		return this._started;
	}

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	public async say( target: string | number, message: string, options?: Record<string, unknown> ): Promise<unknown> {
		if ( this._enabled ) {
			return;
		} else {
			throw new Error( 'Handler not enabled' );
		}
	}

	public async reply( context: Context, message: string, options?: Record<string, unknown> ): Promise<unknown> {
		return await this.say( context.from, message, options );
	}

	public addCommand( command: string, func?: Command ): this {
		if ( ( !command ) || ( command.trim() === '' ) ) {
			return this;
		}

		if ( typeof func === 'function' ) {
			this._commands.set( command, func );
		} else {
			this._commands.set( command, function () {
				return true;
			} );
		}
		return this;
	}

	public aliasCommand( command: string, rawCommand: string ): this {
		if ( ( !rawCommand ) || ( rawCommand.trim() === '' ) ) {
			return this;
		}

		const func = this._commands.get( rawCommand );

		if ( !func ) {
			return this;
		}
		return this.addCommand( command, func );
	}

	public deleteCommand( command: string ): this {
		this._commands.delete( command );
		return this;
	}

	public async start(): Promise<void> {
		this._started = true;
	}

	public async stop(): Promise<void> {
		this._started = false;
	}
}
