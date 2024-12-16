import type * as TT from '@telegraf/types';
import { Message as DMessage } from 'discord.js';
import { IMessage } from 'irc-upd';
import { Context as TContext } from 'telegraf';

import { MessageHandler } from '@app/lib/handlers/MessageHandler.mjs';

let messageId = 0;

export type RawMessage = TContext | IMessage | DMessage;

export type File = {
	/**
	 * 用於區分
	 */
	client: string;

	origFilename?: string;
	/** Telegram */
	fileId?: string;
	url?: string;
	path?: string;
	type: string;
	id: string;
	size: number;
	mime_type?: string;
};

export type UploadedFile = {
	url: string;
	fileId?: string;
	displayFilename: string;
	type: string;
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
	mapTo?: string[];

	reply?: {
		origClient: string;
		origChatId: string | number;
		origMessageId: string | number;
		id: string;
		nick: string;
		username?: string;
		message: string;
		isText?: boolean;
		discriminator?: string;
		_rawData?: RawMessage;
	};

	forward?: {
		nick: string;
		username: string;
	};

	files?: File[];

	username?: string;

	isChannel?: boolean;

	/**
	 * 跨客戶端檔案上傳用，由 bridge 發送
	 */
	uploads?: UploadedFile[];

	/**
	 * Telegram：file_id 上傳法
	 */
	fileIdUploads?: ( ( chatId: string | number, messageId: number ) => Promise<TT.Message | void> )[];

	isImage?: boolean;

	imageCaption?: string;

	/**
	 * for irc
	 */
	isAction?: boolean;

	discriminator?: string;
};

export type ContextOptions<RD extends RawMessage> = {
	from?: string | number;
	to?: string | number;
	messageId?: string | number;
	nick?: string;
	text?: string;
	isPrivate?: boolean;
	extra?: ContextExtra;
	handler?: MessageHandler;
	_rawData?: RD;
	command?: string;
	param?: string;
};

function getMessageId(): number {
	messageId++;
	return messageId;
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
 *         mapTo: [     // 對應到目標群組之後的 to（由 bridge 發送）
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
 *     _rawData: 處理訊息的機器人所用的內部資料，應避免使用,
 * }
 * ```
 */
export class Context<R extends RawMessage = RawMessage> implements ContextOptions<R> {
	protected _from: string = undefined;
	public get from(): string {
		return this._from;
	}
	public set from( f: string | number ) {
		this._from = String( f );
	}

	protected _to: string = undefined;
	public get to(): string {
		return this._to;
	}
	public set to( t: string | number ) {
		this._to = String( t );
	}

	public nick: string = undefined;

	public text = '';

	public isPrivate = false;

	public readonly isBot: boolean = false;

	public extra: ContextExtra = {};
	public readonly handler: MessageHandler = undefined;
	public _rawData: R = undefined;
	public command = '';
	public param = '';

	private readonly _msgId: number = getMessageId();

	public messageId: number | string | null = undefined;
	private readonly _programMessageId = `Message#${ String( this._msgId ) }@${ String( Date.now() ) }`;
	public get programMessageId(): string | number {
		return this.messageId || this._programMessageId;
	}

	protected static getArgument<T>( ...args: T[] ): T | undefined {
		for ( const argument of args ) {
			if ( argument !== undefined ) {
				return argument;
			}
		}
		return undefined;
	}

	public constructor( options: Context<R> | ContextOptions<R> = {}, overrides: ContextOptions<R> = {} ) {
		// TODO 雖然這樣很醜陋，不過暫時先這樣了
		this._from = String( Context.getArgument( overrides.from, options.from ) );
		this._to = String( Context.getArgument( overrides.to, options.to ) );

		for ( const k of [
			'nick', 'text', 'isPrivate', 'isBot', 'extra',
			'handler', '_rawData', 'command', 'param', 'messageId',
		] ) {
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
