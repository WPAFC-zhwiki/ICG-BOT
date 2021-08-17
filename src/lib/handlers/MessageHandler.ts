import EventEmitter, { Events } from '../event';
export { Events } from '../event';
import { Telegraf as TelegrafClient, Context as TContext } from 'telegraf';
import { Client as DiscordClient } from 'discord.js';
import { Client as IRCClient } from 'irc-upd';
import { Context, rawmsg } from 'lib/handlers/Context';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Command<rawdata extends rawmsg = any> = ( context: Context<rawdata>, cmd: string, param: string ) => void;

export type Telegraf = TelegrafClient<TContext>;
export type Telegram = Telegraf['telegram'];
export type Discord = DiscordClient;
export type IRC = IRCClient;

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
export class MessageHandler<events extends Events = Events> extends EventEmitter<events> {
	protected _client: Telegraf | Discord | IRC = null;
	protected _type: string;
	protected _id: string;
	protected _enabled = true;
	protected _started = false;

	protected readonly _commands: Map<string, Command> = new Map();

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	public constructor( optin: unknown ) {
		super();
	}

	public get rawClient(): Telegraf | Discord | IRC {
		return this._client;
	}

	public get type(): string {
		return this._type;
	}

	public set type( value: string ) {
		this._type = value;
	}

	public get id(): string {
		return this._id;
	}

	public set id( value: string ) {
		this._id = value;
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
