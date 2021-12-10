import { IMessage } from 'irc-upd';
import { Context as TContext } from 'telegraf';
import { Message as DMessage } from 'discord.js';

import { MessageHandler } from 'src/lib/handlers/MessageHandler';

let msgId = 0;

export type rawmsg = TContext | IMessage | DMessage;

export type file = {
	/**
	 * 用於區分
	 */
	client: string;

	url?: string;
	path?: string;
	type: string;
	id: string;
	size: number;
	mime_type?: string;
};

export type ContextExtra = {
	/**
	 * 本次傳送有幾個群互聯？（由 bridge 發送）
	 */
	clients?: number;

	clientName?: {
		shortname: string;
		fullname: string;
	};
	/**
	 * 對應到目標群組之後的 to（由 bridge 發送）
	 */
	mapto?: string[];

	reply?: {
		id: string;
		nick: string;
		username?: string;
		message: string;
		isText?: boolean;
		discriminator?: string;
		_rawdata?: rawmsg;
	};

	forward?: {
		nick: string;
		username: string;
	};

	files?: file[];

	username?: string;

	isChannel?: boolean;

	/**
	 * Telegram：檔案上傳用，由 bridge 發送
	 */
	uploads?: {
		url: string;
		type: string;
	}[];

	isImage?: boolean;

	imageCaption?: string;

	/**
	 * for irc
	 */
	isAction?: boolean;

	discriminator?: string;
};

export type ContextOptin<rawdata extends rawmsg> = {
	from?: string | number;
	to?: string | number;
	nick?: string;
	text?: string;
	isPrivate?: boolean;
	extra?: ContextExtra;
	handler?: MessageHandler;
	_rawdata?: rawdata;
	command?: string;
	param?: string;
}

function getMsgId(): number {
	msgId++;
	return msgId;
}

/**
 * Context 為統一格式的訊息上下文
 *
 * 訊息的完整格式設定：
 * ```
 * {
 *     from: "",
 *     to: "",
 *     nick: "",
 *     text: "",
 *     isPrivate: false,
 *     command: "",
 *     param: "",
 *     extra: {         // 備註：本程式為淺層拷貝
 *         clients: 3,  // 本次傳送有幾個群互聯？（由 bridge 發送）
 *         clientName: {
 *             shortname: ''
 *             fullname: ''
 *         }
 *         mapto: [     // 對應到目標群組之後的 to（由 bridge 發送）
 *             "irc/#aaa",
 *             ...
 *         ],
 *         reply: {
 *             nick: "",
 *             username: "",
 *             message: "",
 *             isText: true,
 *         },
 *         forward: {
 *             nick: "",
 *             username: "",
 *         },
 *         files: [
 *             {
 *                 client: "Telegram",  // 用於區分
 *                 type: ...
 *                 ...
 *             }
 *         ]
 *         uploads: [        // Telegram：檔案上傳用，由 bridge 發送
 *             {
 *                 url: "",
 *                 type: "photo"    // photo/audio/file
 *             }
 *         ],
 *     },
 *     handler: 訊息來源的 handler,
 *     _rawdata: 處理訊息的機器人所用的內部資料，應避免使用,
 * }
 * ```
 */
export class Context<R extends rawmsg = rawmsg> implements ContextOptin<R> {
	protected _from: string = null;
	get from(): string {
		return this._from;
	}
	set from( f: string | number ) {
		this._from = String( f );
	}

	protected _to: string = null;
	get to(): string {
		return this._to;
	}
	set to( t: string | number ) {
		this._to = String( t );
	}

	public nick: string = null;

	public text = '';

	public isPrivate = false;

	public readonly isbot: boolean = false;

	public extra: ContextExtra = {};
	public readonly handler: MessageHandler = null;
	public _rawdata: R = null;
	public command = '';
	public param = '';

	private readonly _msgId: number = getMsgId();

	protected static getArgument<T>( ...args: T[] ): T | undefined {
		for ( let i = 0; i < args.length; i++ ) {
			if ( args[ i ] !== undefined ) {
				return args[ i ];
			}
		}
		return undefined;
	}

	public constructor( options: Context<R> | ContextOptin<R> = {}, overrides: ContextOptin<R> = {} ) {
		// TODO 雖然這樣很醜陋，不過暫時先這樣了
		this._from = String( Context.getArgument( overrides.from, options.from, null ) );
		this._to = String( Context.getArgument( overrides.to, options.to, null ) );

		for ( const k of [ 'nick', 'text', 'isPrivate', 'isbot', 'extra', 'handler', '_rawdata', 'command', 'param' ] ) {
			this[ k ] = Context.getArgument( overrides[ k ], options[ k ], this[ k ] );
		}

		if ( options.text !== undefined ) {
			this.command = Context.getArgument( overrides.command, this.command, '' );
			this.param = Context.getArgument( overrides.param, this.param, '' );
		}
	}

	public say( target: string, message: string, options?: Record<string, string | boolean | number> ): void {
		if ( this.handler ) {
			this.handler.say( target, message, options );
		}
	}

	public reply( message: string, options?: Record<string, string | boolean | number> ): void {
		if ( this.handler ) {
			this.handler.reply( this, message, options );
		}
	}

	public get msgId(): number {
		return this._msgId;
	}
}
