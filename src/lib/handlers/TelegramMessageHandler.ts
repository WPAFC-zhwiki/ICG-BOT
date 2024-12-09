import fs = require( 'node:fs' );
import https = require( 'node:https' );
import Tls = require( 'node:tls' );

import * as TT from '@telegraf/types';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { Telegraf, Context as TContext, Telegram } from 'telegraf';
import { ExtraPhoto, ExtraReplyMessage } from 'telegraf/typings/telegram-types';
import winston = require( 'winston' );

import { ConfigTS } from '@app/config';

import { Context } from '@app/lib/handlers/Context';
import { MessageHandler, Command, BaseEvents } from '@app/lib/handlers/MessageHandler';
import { inspect, getFriendlySize, getFriendlyLocation } from '@app/lib/util';

type FilterFunctionPropertyName<O extends object> = {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	[K in keyof O]: O[K] extends ( ...args: any ) => any ? K : never;
}[keyof O];

export type TelegramFallbackBots = 'Link Channel' | 'Group' | 'Channel' | false;

export interface TelegramEvents extends BaseEvents<TContext> {
	pin( info: {
		from: {
			id: number;
			nick: string;
			username?: string;
		},
		to: number;
		text: string;
	}, context: TContext ): void;
	leave( group: number, from: {
		id: number;
		nick: string;
		username?: string;
	}, target: {
			id: number;
			nick: string;
			username?: string;
		}, context: TContext ): void;
	join( group: number, from: {
		id: number;
		nick: string;
		username?: string;
	}, target: {
			id: number;
			nick: string;
			username?: string;
		}, context: TContext ): void;
	richMessage( context: Context<TContext> ): void;
	channelPost( channel: TT.Chat.ChannelChat, message: TT.Message, context: TContext ): void;
	groupChannelText( channel: TT.Chat.ChannelChat, context: Context<TContext> ): void;
	groupChannelRichMessage( channel: TT.Chat.ChannelChat, context: Context<TContext> ): void;
}

export type TelegramSendMessageOptions<E extends ExtraPhoto | ExtraReplyMessage = ExtraReplyMessage> = E & {
	withNick?: boolean
};

/**
 * 使用通用介面處理 Telegram 訊息
 */
export class TelegramMessageHandler extends MessageHandler<TelegramEvents> {
	declare protected readonly _client: Telegraf<TContext>;
	protected readonly _type = 'Telegram' as const;
	protected readonly _id = 'T' as const;

	readonly #start: {
		mode: 'webhook';
		params: {
			domain: string;
			path?: string;
			tlsOptions: Tls.TlsOptions;
			port: string | number;
		};
	} | {
		mode: 'poll';
	};

	#username: string;
	#nickStyle: 'username' | 'fullname' | 'firstname';
	#startTime: number = Date.now() / 1000;

	public get rawClient(): Telegraf<TContext> {
		return this._client;
	}

	#me: TT.User;
	public get me(): TT.User {
		return this.#me;
	}

	public constructor( config: ConfigTS[ 'Telegram' ] ) {
		super( config );

		const botConfig: ConfigTS[ 'Telegram' ][ 'bot' ] = config.bot || {
			token: '',
			timeout: 0,
			webhook: {
				port: 0,
			},
			apiRoot: 'https://api.telegram.org',
		};
		const tgOptions: ConfigTS[ 'Telegram' ][ 'options' ] = config.options || {
			nickStyle: 'username',
		};

		// 配置文件兼容性处理
		for ( const key of [ 'proxy', 'webhook', 'apiRoot' ] ) {
			botConfig[ key ] = botConfig[ key ] || tgOptions[ key ];
		}

		// 代理
		let myAgent: https.Agent = https.globalAgent;
		if ( botConfig.proxy && botConfig.proxy.host ) {
			const url = new URL( 'https://example.org/' );
			url.hostname = botConfig.proxy.host;
			url.port = String( botConfig.proxy.port );
			myAgent = new HttpsProxyAgent( url );
		}

		const client = new Telegraf( botConfig.token, {
			telegram: {
				agent: myAgent,
				apiRoot: botConfig.apiRoot || 'https://api.telegram.org',
			},
			handlerTimeout: botConfig.timeout,
		} );

		client.telegram.getMe().then( ( me ) => {
			this.#username = me.username;
			this.#me = me;
			winston.info( `TelegramBot is ready, login as: ${ me.first_name }${ me.last_name ? ` ${ me.last_name }` : '' }@${ me.username }(${ me.id })` );
		} );

		client.catch( function ( error ) {
			if ( error instanceof Error ) {
				error.message = error.message.replaceAll(
					/\/bot(\d+):[^/]+\//g,
					'/bot$1:<password>/'
				);
			}
			winston.error( 'TelegramBot error:' + inspect( error ) );
		} );

		if ( botConfig.webhook && botConfig.webhook.port > 0 ) {
			const webhookConfig = botConfig.webhook;

			// 启动Webhook服务器
			let tlsOptions: Tls.TlsOptions;
			if ( webhookConfig.ssl && webhookConfig.ssl.certPath ) {
				tlsOptions = {
					key: fs.readFileSync( webhookConfig.ssl.keyPath ),
					cert: fs.readFileSync( webhookConfig.ssl.certPath ),
				};
				if ( webhookConfig.ssl.caPath ) {
					tlsOptions.ca = [
						fs.readFileSync( webhookConfig.ssl.caPath ),
					];
				}
			}

			this.#start = {
				mode: 'webhook',
				params: {
					domain: webhookConfig.domain,
					path: webhookConfig.path,
					tlsOptions: tlsOptions,
					port: webhookConfig.port,
				},
			};
		} else {
			// 使用轮询机制
			this.#start = {
				mode: 'poll',
			};
		}

		this._client = client;
		this.#nickStyle = tgOptions.nickStyle || 'username';

		client.on( 'message', async ( ctx, next ) => {
			if ( this._enabled && ctx.message && ctx.chat ) {
				if ( ctx.message.date < this.#startTime ) {
					return;
				}

				const context: Context<TContext> = new Context<TContext>( {
					from: ctx.message.from.id,
					to: ctx.chat.id,
					messageId: ctx.message.message_id,
					nick: this.#getNick( ctx.message.from ),
					text: '',
					isPrivate: ( ctx.chat.id > 0 ),
					extra: {
						username: ctx.message.from.username,
					},
					handler: this,
					_rawData: ctx,
				} );

				if ( ctx.from.id === 777_000 ) {
					if (
						'forward_origin' in ctx.message &&
						ctx.message.forward_origin.type === 'channel' &&
						// for typing
						ctx.message.forward_origin.chat.type === 'channel' &&
						// 區分頻道訊息還是自動發言
						!ctx.message.is_automatic_forward
					) {
						context.from = ctx.message.forward_origin.chat.id;
						context.nick = 'Channel';
						context.extra.username = ctx.message.forward_origin.chat.username;
						context.extra.isChannel = true;
					} else if (
						'sender_chat' in ctx.message &&
						ctx.message.sender_chat.type === 'channel'
					) {
						context.from = ctx.message.sender_chat.id;
						context.nick = `Channel ${ ctx.message.sender_chat.title }`;
						context.extra.username = ctx.message.sender_chat.username;
					}
				}

				if ( 'forward_origin' in ctx.message ) {
					switch ( ctx.message.forward_origin.type ) {
						case 'user': {
							const fwd: TT.User = ctx.message.forward_origin.sender_user;
							context.extra.forward = {
								nick: this.#getNick( fwd ),
								username: fwd.username,
							};

							break;
						}
						case 'channel': {
							const fwdChat = ctx.message.forward_origin.chat as TT.Chat.ChannelChat;
							if ( !( ctx.message.is_automatic_forward && ctx.message.sender_chat?.id === fwdChat.id ) ) {
							// 不標記實際上根本沒有用「轉傳」的訊息
								context.extra.forward = {
									nick: `Channel ${ fwdChat.title }`,
									username: fwdChat.username,
								};
							}

							break;
						}
						case 'chat': {
							const fwdChat: TT.Chat = ctx.message.forward_origin.sender_chat as TT.Chat.SupergroupChat;
							context.extra.forward = {
								nick: fwdChat.title,
								username: fwdChat.username,
							};

							break;
						}
						case 'hidden_user': {
							context.extra.forward = {
								nick: ctx.message.forward_origin.sender_user_name,
								username: undefined,
							};

							break;
						}
						default: {
							context.extra.forward = {
								nick: '(Unknown)',
								username: undefined,
							};
						}
					}
				} else if ( 'reply_to_message' in ctx.message ) {
					const reply = ctx.message.reply_to_message;
					context.extra.reply = {
						origClient: this._type,
						origChatId: ctx.message.chat.id,
						origMessageId: reply.message_id,
						nick: this.#getNick( reply.from ),
						username: reply.from.username,
						message: this.#convertToText( reply ),
						isText: 'text' in reply && !!reply.text,
						id: String( reply.from.id ),
						_rawData: undefined,
					};
				}

				if ( 'text' in ctx.message ) {
					if ( !context.text ) {
						context.text = ctx.message.text;
					}

					// 解析命令

					let [ , cmd, , parameter ] = ctx.message.text.match( /^\/([A-Za-z0-9_@]+)(\s+(.*)|\s*)$/u ) || [];
					if ( cmd ) {
						// 如果包含 Bot 名，判断是否为自己
						const [ , c, , n ] = cmd.match( /^([A-Za-z0-9_]+)(|@([A-Za-z0-9_]+))$/u ) || [];
						if ( ( n && ( n.toLowerCase() === String( this.#username ).toLowerCase() ) ) || !n ) {
							parameter = parameter || '';

							context.command = c;
							context.param = parameter;

							if ( typeof this._commands.get( c ) === 'function' ) {
								this._commands.get( c )( context, c, parameter || '' );
							}

							this.emit( 'command', context, c, parameter || '' );
							this.emit( `command#${ c }`, context, parameter || '' );
						}
					}

					if ( context.extra.isChannel ) {
						this.emit(
							'groupChannelText',
							'forward_from_chat' in ctx.message && ctx.message.forward_from_chat,
							context
						);
					} else {
						this.emit( 'text', context );
					}
				} else {
					const message = ctx.message;

					if ( 'photo' in message ) {
						let sz = 0;
						for ( const p of message.photo ) {
							if ( p.file_size > sz ) {
								await this.#setFile( context, p, 'photo' );
								context.text = `<photo: ${ p.width }x${ p.height }, ${ getFriendlySize( p.file_size ) }>`;
								sz = p.file_size;
							}
						}

						if ( message.caption ) {
							context.text += ' ' + message.caption;
						}
						context.extra.isImage = true;
						context.extra.imageCaption = message.caption;
					} else if ( 'sticker' in message ) {
						context.text = `${ message.sticker.emoji }<Sticker>`;
						await this.#setFile( context, message.sticker, 'sticker' );
						context.extra.isImage = true;
					} else if ( 'audio' in message ) {
						context.text = `<Audio: ${ message.audio.duration }", ${ getFriendlySize( message.audio.file_size ) }>`;
						await this.#setFile( context, message.audio, 'audio' );
					} else if ( 'voice' in message ) {
						context.text = `<Voice: ${ message.voice.duration }", ${ getFriendlySize( message.voice.file_size ) }>`;
						await this.#setFile( context, message.voice, 'voice' );
					} else if ( 'video' in message ) {
						context.text = `<Video: ${ message.video.width }x${ message.video.height }, ${ message.video.duration }", ${ getFriendlySize( message.video.file_size ) }>`;
						await this.#setFile( context, message.video, 'video' );
					} else if ( 'document' in message ) {
						context.text = `<File: ${ message.document.file_name }, ${ getFriendlySize( message.document.file_size ) }>`;
						await this.#setFile( context, message.document, 'document' );
					} else if ( 'contact' in message ) {
						context.text = `<Contact: ${ message.contact.first_name }, ${ message.contact.phone_number }>`;
					} else if ( 'venue' in message ) {
						context.text = `<Venue: ${ message.venue.title }, ${ message.venue.address }, ${ getFriendlyLocation(
							message.venue.location.latitude, message.venue.location.longitude ) }>`;
					} else if ( 'location' in message ) {
						context.text = `<Location: ${ getFriendlyLocation( message.location.latitude, message.location.longitude ) }>`;
					} else if ( 'pinned_message' in message ) {
						this.emit( 'pin', {
							from: {
								id: message.from.id,
								nick: this.#getNick( message.from ),
								username: message.from.username,
							},
							to: ctx.chat.id,
							text: this.#convertToText( message.pinned_message ),
						}, ctx );
					} else if ( 'left_chat_member' in message ) {
						this.emit( 'leave', ctx.chat.id, {
							id: message.from.id,
							nick: this.#getNick( message.from ),
							username: message.from.username,
						}, {
							id: message.left_chat_member.id,
							nick: this.#getNick( message.left_chat_member ),
							username: message.left_chat_member.username,
						}, ctx );
					} else if ( 'new_chat_members' in message ) {
						this.emit( 'join', ctx.chat.id, {
							id: message.from.id,
							nick: this.#getNick( message.from ),
							username: message.from.username,
						}, {
							id: message.new_chat_members[ 0 ].id,
							nick: this.#getNick( message.new_chat_members[ 0 ] ),
							username: message.new_chat_members[ 0 ].username,
						}, ctx );
					}

					if ( context.extra.isChannel ) {
						this.emit(
							'groupChannelRichMessage',
							'forward_from_chat' in ctx.message && ctx.message.forward_from_chat,
							context
						);
					} else {
						this.emit( 'richMessage', context );
					}
				}
			}
			return next();
		} );

		client.on( 'channel_post', ( context ) => {
			if ( context.chat.type === 'channel' ) { // typescript bug
				this.emit( 'channelPost', context.chat, context.channelPost, context );
			}
		} );
	}

	async #setFile(
		context: Context,
		message: ( TT.PhotoSize | TT.Sticker | TT.Audio | TT.Voice | TT.Video | TT.Document ) & {
			mime_type?: string;
		},
		type: string
	): Promise<void> {
		context.extra.files = [ {
			client: 'Telegram',
			// eslint-disable-next-line unicorn/no-await-expression-member
			url: ( await this.getFileLink( message.file_id ) ).href,
			type: type,
			id: message.file_id,
			size: message.file_size,
			mime_type: message.mime_type,
		} ];
		context.extra.fileIdUploads = [ ( chatId: string | number, messageId: number ) => {
			const replyOptions: TelegramSendMessageOptions = {
				reply_parameters: {
					message_id: messageId,
				},
			};
			switch ( type ) {
				case 'photo': {
					return this._client.telegram.sendPhoto( chatId, message.file_id, replyOptions );
				}
				case 'sticker': {
					return this._client.telegram.sendSticker( chatId, message.file_id, replyOptions );
				}
				case 'audio': {
					return this._client.telegram.sendAudio( chatId, message.file_id, replyOptions );
				}
				case 'voice': {
					return this._client.telegram.sendVoice( chatId, message.file_id, replyOptions );
				}
				case 'video': {
					return this._client.telegram.sendVideo( chatId, message.file_id, replyOptions );
				}
				case 'document': {
					return this._client.telegram.sendDocument( chatId, message.file_id, replyOptions );
				}
				default: {
					return Promise.resolve();
				}
			}
		} ];
	}

	#getNick( user: TT.User ): string {
		if ( user ) {
			const username: string = ( user.username || '' ).trim();
			const firstname: string = ( user.first_name || '' ).trim() || ( user.last_name || '' ).trim();
			const fullname: string = `${ user.first_name || '' } ${ user.last_name || '' }`.trim();

			if ( this.#nickStyle === 'fullname' ) {
				return fullname || username;
			} else if ( this.#nickStyle === 'firstname' ) {
				return firstname || username;
			} else {
				return username || fullname;
			}
		} else {
			return '';
		}
	}

	#convertToText( message: Partial<TT.Message> ) {
		if ( 'audio' in message ) {
			return '<Audio>';
		} else if ( 'photo' in message ) {
			return '<Photo>';
		} else if ( 'document' in message ) {
			return '<Document>';
		} else if ( 'game' in message ) {
			return '<Game>';
		} else if ( 'sticker' in message ) {
			return `${ message.sticker.emoji }<Sticker>`;
		} else if ( 'video' in message ) {
			return '<Video>';
		} else if ( 'voice' in message ) {
			return '<Voice>';
		} else if ( 'contact' in message ) {
			return '<Contact>';
		} else if ( 'venue' in message ) {
			return '<Venue>';
		} else if ( 'location' in message ) {
			return '<Location>';
		} else if ( 'pinned_message' in message ) {
			return '<Pinned Message>';
		} else if ( 'new_chat_members' in message ) {
			return '<New member>';
		} else if ( 'left_chat_member' in message ) {
			return '<Removed member>';
		} else if ( 'text' in message ) {
			return message.text;
		} else {
			return '<Message>';
		}
	}

	public getMessageOriginDescription( message: TT.Message ): [ TelegramFallbackBots, number ] {
		if ( 'forward_origin' in message ) {
			if ( message.is_automatic_forward ) {
				return [ 'Link Channel', message.sender_chat.id ];
			} else if ( message.forward_origin.type === 'chat' ) {
				return [ 'Group', message.forward_origin.sender_chat.id ];
			} else if ( message.forward_origin.type === 'channel' ) {
				return [ 'Channel', message.forward_origin.chat.id ];
			}
		}

		return [ false, message.from.id ];
	}

	public get username(): string {
		return this.#username;
	}

	public set username( v: string ) {
		this.#username = v;
	}

	public get nickStyle(): string {
		return this.#nickStyle;
	}

	public set nickStyle( v: string ) {
		this.nickStyle = v;
	}

	public addCommand( command: string, func?: Command<TContext> ): this {
		// 自動過濾掉 command 中的非法字元
		const cmd = command.replaceAll( /[^A-Za-z0-9_]/gu, '' );
		return super.addCommand( cmd, func );
	}

	public deleteCommand( command: string ): this {
		const cmd = command.replaceAll( /[^A-Za-z0-9_]/gu, '' );
		return super.deleteCommand( cmd );
	}

	public aliasCommand( command: string, rawCommand: string ): this {
		// 自動過濾掉 command 中的非法字元
		const rawCmd = rawCommand.replaceAll( /[^A-Za-z0-9_]/gu, '' );
		return super.aliasCommand( command, rawCmd );
	}

	public registerInlineQuery( ...args: Parameters<Telegraf<TContext>[ 'inlineQuery' ]> ): void {
		this._client.inlineQuery( ...args );
	}

	#checkClientEnable(): void | never {
		if ( !this._enabled ) {
			throw new Error( 'Handler not enabled' );
		}
	}

	static #wrapApiFunction<M extends FilterFunctionPropertyName<Telegram>>(
		that: TelegramMessageHandler,
		method: M
	) {
		return ( ...args: Parameters<Telegram[ M ]> ): ReturnType<Telegram[ M ]> => {
			that.#checkClientEnable();
			// @ts-expect-error TS2322
			return that._client.telegram[ method ]( ...args );
		};
	}

	public say(
		target: string | number,
		message: string, options?: TelegramSendMessageOptions
	): Promise<TT.Message.TextMessage> {
		this.#checkClientEnable();
		return this._client.telegram.sendMessage( target, message, options );
	}

	public sayWithHTML(
		target: string | number,
		message: string,
		options?: TelegramSendMessageOptions
	): Promise<TT.Message> {
		options = options || {};
		options.parse_mode = 'HTML';
		return this.say( target, message, options );
	}

	public sendPhoto = TelegramMessageHandler.#wrapApiFunction( this, 'sendPhoto' );

	public sendAudio = TelegramMessageHandler.#wrapApiFunction( this, 'sendAudio' );

	public sendVideo = TelegramMessageHandler.#wrapApiFunction( this, 'sendVideo' );

	public sendAnimation = TelegramMessageHandler.#wrapApiFunction( this, 'sendAnimation' );

	public sendDocument = TelegramMessageHandler.#wrapApiFunction( this, 'sendDocument' );

	#replyBuildTextAndOptions<E extends Record<string, unknown>>(
		context: Context<TContext>,
		message: string,
		options?: Partial<E> & TelegramSendMessageOptions<ExtraReplyMessage>
	) : [ text: string, options: Partial<E> & TelegramSendMessageOptions<ExtraReplyMessage> ] | never {
		options = options || {};
		if ( ( context._rawData && context._rawData.message ) ) {
			if ( context.isPrivate ) {
				return [ String( message ), options ];
			} else {
				if ( options.reply_parameters ) {
					winston.warn( '[TelegramMessageHandler] Duplicate setting reply option detected.' );
					// throw new Error( 'Duplicate setting reply option detected.' );
				}
				options.reply_parameters = {
					message_id: context._rawData.message.message_id,
				};
				return options.withNick ? [ String( `${ context.nick }: ${ message }` ), options ] : [ String( message ), options ];
			}
		} else {
			throw new Error( 'No messages to reply' );
		}
	}

	public reply(
		context: Context<TContext>,
		message: string,
		options?: ExtraReplyMessage
	): Promise<TT.Message> {
		[ message, options ] = this.#replyBuildTextAndOptions( context, message, options );
		return this.say( context.to, message, options );
	}

	public getChatAdministrators( group: string | number ): Promise<TT.ChatMember[]> {
		return this._client.telegram.getChatAdministrators( group );
	}

	public getFile( fileId: string ): Promise<TT.File> {
		return this._client.telegram.getFile( fileId );
	}

	public getFileLink( fileId: string ): Promise<URL> {
		return this._client.telegram.getFileLink( fileId );
	}

	public leaveChat( chatId: string | number ): Promise<boolean> {
		return this._client.telegram.leaveChat( chatId );
	}

	public async start(): Promise<void> {
		if ( !this._started ) {
			this._started = true;

			if ( this.#start.mode === 'webhook' ) {
				this._client.launch( {
					webhook: {
						domain: this.#start.params.domain,
						hookPath: this.#start.params.path,
						tlsOptions: this.#start.params.tlsOptions,
						port: Number( this.#start.params.port ),
					},
				} );
			} else {
				this._client.launch();
			}
		}
	}

	public async stop(): Promise<void> {
		if ( this._started ) {
			this._started = false;
			this._client.stop();
		}
	}
}
