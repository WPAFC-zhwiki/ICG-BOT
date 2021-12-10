import fs = require( 'fs' );
import https = require( 'https' );
import { cloneDeep as copyObject } from 'lodash';
import { Telegraf, Context as TContext, Telegram } from 'telegraf';
import { ExtraPhoto, ExtraReplyMessage } from 'telegraf/typings/telegram-types';
import * as TT from 'typegram';
import Tls = require( 'tls' );
import winston = require( 'winston' );

import { ConfigTS } from 'src/config';
import { MessageHandler, Command, BaseEvents } from 'src/lib/handlers/MessageHandler';
import { Context } from 'src/lib/handlers/Context';
import { getFriendlySize, getFriendlyLocation } from 'src/lib/util';
import HttpsProxyAgent from 'src/lib/proxy.js';

export interface TelegramEvents extends BaseEvents<TContext> {
	pin( info: {
		from: {
			id: number;
			nick: string;
			username?: string;
		},
		to: number;
		text: string;
	}, ctx: TContext ): void;
	leave( group: number, from: {
		id: number;
		nick: string;
		username?: string;
	}, target: {
		id: number;
		nick: string;
		username?: string;
	}, ctx: TContext ): void;
	join( group: number, from: {
		id: number;
		nick: string;
		username?: string;
	}, target: {
		id: number;
		nick: string;
		username?: string;
	}, ctx: TContext ): void;
	richMessage( context: Context<TContext> ): void;
	channelPost( channel: TT.Chat.ChannelChat, msg: TT.Message, ctx: TContext ): void;
	groupChannelText( channel: TT.Chat.ChannelChat, context: Context<TContext> ): void;
	groupChannelRichMessage( channel: TT.Chat.ChannelChat, context: Context<TContext> ): void;
}

export interface SendMessageOpipons extends ExtraReplyMessage {
	withNick?: boolean
}

/**
 * 使用通用介面處理 Telegram 訊息
 */
export class TelegramMessageHandler extends MessageHandler<TelegramEvents> {
	protected readonly _client: Telegraf<TContext>;
	protected readonly _type: 'Telegram' = 'Telegram';
	protected readonly _id: 'T' = 'T';

	private readonly _start: {
		mode: 'webhook';
		params: {
			path: string;
			tlsOptions: Tls.TlsOptions;
			port: string | number;
		};
	} | {
		mode: 'poll';
	}

	private _username: string;
	private _nickStyle: 'username' | 'fullname' | 'firstname';
	private _startTime: number = new Date().getTime() / 1000;

	public get rawClient(): Telegraf<TContext> {
		return this._client;
	}

	private _me: TT.User;
	public get me(): TT.User {
		return this._me;
	}

	public constructor( config: ConfigTS[ 'Telegram' ] ) {
		super( config );

		const botConfig: ConfigTS[ 'Telegram' ][ 'bot' ] = config.bot || {
			token: '',
			timeout: 0,
			webhook: {
				port: 0
			},
			apiRoot: 'https://api.telegram.org'
		};
		const tgOptions: ConfigTS[ 'Telegram' ][ 'options' ] = config.options || {
			nickStyle: 'username'
		};

		// 配置文件兼容性处理
		for ( const key of [ 'proxy', 'webhook', 'apiRoot' ] ) {
			botConfig[ key ] = botConfig[ key ] || tgOptions[ key ];
		}

		// 代理
		let myAgent: https.Agent = https.globalAgent;
		if ( botConfig.proxy && botConfig.proxy.host ) {
			myAgent = new HttpsProxyAgent( {
				proxyHost: botConfig.proxy.host,
				proxyPort: botConfig.proxy.port
			} );
		}

		const client = new Telegraf( botConfig.token, {
			telegram: {
				agent: myAgent,
				apiRoot: botConfig.apiRoot || 'https://api.telegram.org'
			},
			handlerTimeout: botConfig.timeout
		} );

		client.telegram.getMe().then( function ( me ) {
			that._username = me.username;
			that._me = me;
			winston.info( `TelegramBot is ready, login as: ${ me.first_name }${ me.last_name ? ` ${ me.last_name }` : '' }@${ me.username }(${ me.id })` );
		} );

		client.catch( function ( err ) {
			if ( err instanceof Error ) {
				err.message = err.message.replace(
					/\/\/api\.telegram\.org\/bot(\d+):[A-Za-z0-9]+\//g,
					'//api.telegram.org/bot$1:<password>/'
				);
			}
			winston.error( 'TelegramBot error:', err );
		} );

		if ( botConfig.webhook && botConfig.webhook.port > 0 ) {
			const webhookConfig = botConfig.webhook;
			// 自动设置Webhook网址
			if ( webhookConfig.url ) {
				if ( webhookConfig.ssl.certPath ) {
					client.telegram.setWebhook( webhookConfig.url, {
						certificate: {
							source: webhookConfig.ssl.certPath
						}
					} );
				} else {
					client.telegram.setWebhook( webhookConfig.url );
				}
			}

			// 启动Webhook服务器
			let tlsOptions: Tls.TlsOptions = null;
			if ( webhookConfig.ssl && webhookConfig.ssl.certPath ) {
				tlsOptions = {
					key: fs.readFileSync( webhookConfig.ssl.keyPath ),
					cert: fs.readFileSync( webhookConfig.ssl.certPath )
				};
				if ( webhookConfig.ssl.caPath ) {
					tlsOptions.ca = [
						fs.readFileSync( webhookConfig.ssl.caPath )
					];
				}
			}

			this._start = {
				mode: 'webhook',
				params: {
					path: webhookConfig.path,
					tlsOptions: tlsOptions,
					port: webhookConfig.port
				}
			};
		} else {
			// 使用轮询机制
			this._start = {
				mode: 'poll'
			};
		}

		this._client = client;
		this._nickStyle = tgOptions.nickStyle || 'username';

		// eslint-disable-next-line @typescript-eslint/no-this-alias
		const that: this = this;

		async function setFile( context: Context,
			msg: ( TT.PhotoSize | TT.Sticker | TT.Audio | TT.Voice | TT.Video | TT.Document ) & {
				mime_type?: string;
			},
			type: string ): Promise<void> {
			context.extra.files = [ {
				client: 'Telegram',
				url: ( await that.getFileLink( msg.file_id ) ).href,
				type: type,
				id: msg.file_id,
				size: msg.file_size,
				mime_type: msg.mime_type
			} ];
		}

		client.on( 'message', async function ( ctx, next ) {
			if ( that._enabled && ctx.message && ctx.chat ) {
				if ( ctx.message.date < that._startTime ) {
					return;
				}

				const context: Context<TContext> = new Context<TContext>( {
					from: ctx.message.from.id,
					to: ctx.chat.id,
					nick: that._getNick( ctx.message.from ),
					text: '',
					isPrivate: ( ctx.chat.id > 0 ),
					extra: {
						username: ctx.message.from.username
					},
					handler: that,
					_rawdata: ctx
				} );

				if ( ctx.from.id === 777000 ) {
					if (
						'forward_from_chat' in ctx.message &&
						ctx.message.forward_from_chat.type === 'channel'
					) {
						context.from = ctx.message.forward_from_chat.id;
						context.nick = 'Channel';
						context.extra.username = ctx.message.forward_from_chat.username;
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

				if ( 'reply_to_message' in ctx.message ) {
					const reply: TT.ReplyMessage = ctx.message.reply_to_message;
					context.extra.reply = {
						nick: that._getNick( reply.from ),
						username: reply.from.username,
						message: that._convertToText( reply ),
						isText: 'text' in reply && !!reply.text,
						id: String( reply.from.id ),
						_rawdata: null
					};

					if (
						reply.from.id === 777000 &&
						'forward_from_chat' in reply &&
						reply.forward_from_chat.type === 'channel'
					) {
						context.extra.reply.nick = `Channel ${ reply.forward_from_chat.title }`;
						context.extra.reply.username = reply.forward_from_chat.username;
					} else {
						context.extra.reply = {
							nick: that._getNick( reply.from ),
							username: reply.from.username,
							message: that._convertToText( reply ),
							isText: 'text' in reply && !!reply.text,
							id: String( reply.from.id ),
							_rawdata: null
						};
					}
				} else if ( 'forward_from' in ctx.message ) {
					const fwd: TT.User = ctx.message.forward_from;
					const fwdChat: TT.Chat = ctx.message.forward_from_chat;
					if (
						fwd.id === 777000 &&
						fwdChat &&
						fwdChat.type === 'channel'
					) {
						context.extra.forward = {
							nick: `Channel ${ fwdChat.title }`,
							username: fwdChat.username
						};
					} else {
						context.extra.forward = {
							nick: that._getNick( fwd ),
							username: fwd.username
						};
					}
				}

				if ( 'text' in ctx.message ) {
					if ( !context.text ) {
						context.text = ctx.message.text;
					}

					// 解析命令
					// eslint-disable-next-line prefer-const
					let [ , cmd, , param ] = ctx.message.text.match( /^\/([A-Za-z0-9_@]+)(\s+(.*)|\s*)$/u ) || [];
					if ( cmd ) {
						// 如果包含 Bot 名，判断是否为自己
						const [ , c, , n ] = cmd.match( /^([A-Za-z0-9_]+)(|@([A-Za-z0-9_]+))$/u ) || [];
						if ( ( n && ( n.toLowerCase() === String( that._username ).toLowerCase() ) ) || !n ) {
							param = param || '';

							context.command = c;
							context.param = param;

							if ( typeof that._commands.get( c ) === 'function' ) {
								that._commands.get( c )( context, c, param || '' );
							}

							that.emit( 'command', context, c, param || '' );
							that.emit( `command#${ c }`, context, param || '' );
						}
					}

					if ( context.extra.isChannel ) {
						that.emit(
							'groupChannelText',
							'forward_from_chat' in ctx.message && ctx.message.forward_from_chat,
							context
						);
					} else {
						that.emit( 'text', context );
					}
				} else {
					const message: TT.Message = ctx.message;

					if ( 'photo' in message ) {
						let sz = 0;
						for ( const p of message.photo ) {
							if ( p.file_size > sz ) {
								await setFile( context, p, 'photo' );
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
						await setFile( context, message.sticker, 'sticker' );
						context.extra.isImage = true;
					} else if ( 'audio' in message ) {
						context.text = `<Audio: ${ message.audio.duration }", ${ getFriendlySize( message.audio.file_size ) }>`;
						await setFile( context, message.audio, 'audio' );
					} else if ( 'voice' in message ) {
						context.text = `<Voice: ${ message.voice.duration }", ${ getFriendlySize( message.voice.file_size ) }>`;
						await setFile( context, message.voice, 'voice' );
					} else if ( 'video' in message ) {
						context.text = `<Video: ${ message.video.width }x${ message.video.height }, ${ message.video.duration }", ${ getFriendlySize( message.video.file_size ) }>`;
						await setFile( context, message.video, 'video' );
					} else if ( 'document' in message ) {
						context.text = `<File: ${ message.document.file_name }, ${ getFriendlySize( message.document.file_size ) }>`;
						await setFile( context, message.document, 'document' );
					} else if ( 'contact' in message ) {
						context.text = `<Contact: ${ message.contact.first_name }, ${ message.contact.phone_number }>`;
					} else if ( 'venue' in message ) {
						context.text = `<Venue: ${ message.venue.title }, ${ message.venue.address }, ${ getFriendlyLocation(
							message.venue.location.latitude, message.venue.location.longitude ) }>`;
					} else if ( 'location' in message ) {
						context.text = `<Location: ${ getFriendlyLocation( message.location.latitude, message.location.longitude ) }>`;
					} else if ( 'pinned_message' in message ) {
						that.emit( 'pin', {
							from: {
								id: message.from.id,
								nick: that._getNick( message.from ),
								username: message.from.username
							},
							to: ctx.chat.id,
							text: that._convertToText( message.pinned_message )
						}, ctx );
					} else if ( 'left_chat_member' in message ) {
						that.emit( 'leave', ctx.chat.id, {
							id: message.from.id,
							nick: that._getNick( message.from ),
							username: message.from.username
						}, {
							id: message.left_chat_member.id,
							nick: that._getNick( message.left_chat_member ),
							username: message.left_chat_member.username
						}, ctx );
					} else if ( 'new_chat_members' in message ) {
						that.emit( 'join', ctx.chat.id, {
							id: message.from.id,
							nick: that._getNick( message.from ),
							username: message.from.username
						}, {
							id: message.new_chat_members[ 0 ].id,
							nick: that._getNick( message.new_chat_members[ 0 ] ),
							username: message.new_chat_members[ 0 ].username
						}, ctx );
					}

					if ( context.extra.isChannel ) {
						that.emit(
							'groupChannelRichMessage',
							'forward_from_chat' in ctx.message && ctx.message.forward_from_chat,
							context
						);
					} else {
						that.emit( 'richMessage', context );
					}
				}
			}
			return next();
		} );

		client.on( 'channel_post', function ( ctx ) {
			if ( ctx.chat.type === 'channel' ) { // typescript bug
				that.emit( 'channelPost', ctx.chat, ctx.channelPost, ctx );
			}
		} );
	}

	private _getNick( user: TT.User ): string {
		if ( user ) {
			const username: string = ( user.username || '' ).trim();
			const firstname: string = ( user.first_name || '' ).trim() || ( user.last_name || '' ).trim();
			const fullname: string = `${ user.first_name || '' } ${ user.last_name || '' }`.trim();

			if ( this._nickStyle === 'fullname' ) {
				return fullname || username;
			} else if ( this._nickStyle === 'firstname' ) {
				return firstname || username;
			} else {
				return username || fullname;
			}
		} else {
			return '';
		}
	}

	private _convertToText( message: Partial<TT.Message> ) {
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

	public get username(): string {
		return this._username;
	}

	public set username( v: string ) {
		this._username = v;
	}

	public get nickStyle(): string {
		return this._nickStyle;
	}

	public set nickStyle( v: string ) {
		this.nickStyle = v;
	}

	public addCommand( command: string, func?: Command<TContext> ): this {
		// 自動過濾掉 command 中的非法字元
		const cmd = command.replace( /[^A-Za-z0-9_]/gu, '' );
		return super.addCommand( cmd, func );
	}

	public deleteCommand( command: string ): this {
		const cmd = command.replace( /[^A-Za-z0-9_]/gu, '' );
		return super.deleteCommand( cmd );
	}

	public aliasCommand( command: string, rawCommand: string ): this {
		// 自動過濾掉 command 中的非法字元
		const rawCmd = rawCommand.replace( /[^A-Za-z0-9_]/gu, '' );
		return super.aliasCommand( command, rawCmd );
	}

	public registerInlineQuery( ...args: Parameters<Telegraf<TContext>[ 'inlineQuery' ]> ): void {
		this._client.inlineQuery( ...args );
	}

	private async _say( method: string, target: string | number,
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		message: any, options?: SendMessageOpipons ): Promise<any> {
		if ( !this._enabled ) {
			throw new Error( 'Handler not enabled' );
		} else {
			return await this._client.telegram[ method ]( target, message, options );
		}
	}

	public say( target: string | number, message: string, options?: SendMessageOpipons ): Promise<TT.Message> {
		return this._say( 'sendMessage', target, message, options );
	}

	public sayWithHTML( target: string | number, message: string,
		options?: SendMessageOpipons ): Promise<TT.Message> {
		const options2: SendMessageOpipons = copyObject( options || {} );
		options2.parse_mode = 'HTML';
		return this.say( target, message, options2 );
	}

	public sendPhoto( ...args: Parameters<Telegram[ 'sendPhoto' ]> ): Promise<TT.Message.PhotoMessage> {
		return this._client.telegram.sendPhoto( ...args );
	}

	public sendAudio( ...args: Parameters<Telegram[ 'sendAudio' ]> ): Promise<TT.Message.AudioMessage> {
		return this._client.telegram.sendAudio( ...args );
	}
	public sendVideo( ...args: Parameters<Telegram[ 'sendVideo' ]> ): Promise<TT.Message.VideoMessage> {
		return this._client.telegram.sendVideo( ...args );
	}

	public sendAnimation( ...args: Parameters<Telegram[ 'sendAnimation' ]> ): Promise<TT.Message.AnimationMessage> {
		return this._client.telegram.sendAnimation( ...args );
	}

	public sendDocument( ...args: Parameters<Telegram[ 'sendDocument' ]> ): Promise<TT.Message.DocumentMessage> {
		return this._client.telegram.sendDocument( ...args );
	}

	private async _reply( method: string, context: Context<TContext>,
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		message: any, options?: SendMessageOpipons ): Promise<any> {
		if ( ( context._rawdata && context._rawdata.message ) ) {
			if ( context.isPrivate ) {
				return await this._say( method, context.to, message, options );
			} else {
				const options2: SendMessageOpipons = copyObject( options || {} );
				options2.reply_to_message_id = context._rawdata.message.message_id;
				if ( options2.withNick ) {
					return await this._say( method, context.to, `${ context.nick }: ${ message }`, options2 );
				} else {
					return await this._say( method, context.to, `${ message }`, options2 );
				}
			}
		} else {
			throw new Error( 'No messages to reply' );
		}
	}

	public reply( context: Context<TContext>,
		message: string, options?: ExtraReplyMessage ): Promise<TT.Message> {
		return this._reply( 'sendMessage', context, message, options );
	}

	public replyWithPhoto( context: Context<TContext>,
		photo: TT.InputFile, options?: ExtraPhoto ): Promise<TT.Message.PhotoMessage> {
		return this._reply( 'sendPhoto', context, photo, options );
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

			if ( this._start.mode === 'webhook' ) {
				this._client.launch( {
					webhook: {
						hookPath: this._start.params.path,
						tlsOptions: this._start.params.tlsOptions,
						port: Number( this._start.params.port )
					}
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
