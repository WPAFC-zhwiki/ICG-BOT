import https from 'https';
import * as fs from 'fs';
import * as Tls from 'tls';
import { Telegraf, Context as TContext, Telegram } from 'telegraf';
import * as TT from 'telegraf/typings/telegram-types';
import winston = require( 'winston' );

import { ConfigTS } from 'src/config';
import { MessageHandler, Command, BaseEvents } from 'src/lib/handlers/MessageHandler';
import { Context } from 'src/lib/handlers/Context';
import { getFriendlySize, getFriendlyLocation, copyObject } from 'src/lib/util';
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
	richmessage( context: Context ): void;
}

export interface SendMessageOpipons extends TT.ExtraSendMessage, TT.ExtraReplyMessage {
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
		mode: 'webhook',
		params: {
			path: string,
			tlsOptions: Tls.TlsOptions,
			port: string | number
		}
	} | {
		mode: 'poll',
		params: {
			timeout: number,
			limit: number
		}
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
			limit: 0,
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
			}
		} );

		client.telegram.getMe().then( function ( me ) {
			that._username = me.username;
			that._me = me;
			winston.info( `TelegramBot is ready, login as: ${ me.first_name }${ me.last_name ? ` ${ me.last_name }` : '' }@${ me.username }(${ me.id })` );
		} );

		client.catch( function ( err: Error ) {
			winston.error( `TelegramBot error: ${ err.message }`, err );
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
				mode: 'poll',
				params: {
					timeout: botConfig.timeout || 30,
					limit: botConfig.limit || 100
				}
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
				url: await that.getFileLink( msg.file_id ),
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

				const context = new Context<TContext>( {
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

				if ( ctx.message.reply_to_message ) {
					const reply: Partial<TT.Message> & TT.ReplyMessage = ctx.message.reply_to_message;
					const replyTo = that._getNick( reply.from );
					const replyMessage = that._convertToText( reply );

					context.extra.reply = {
						nick: replyTo,
						username: reply.from.username,
						message: replyMessage,
						isText: reply.text && true,
						id: String( reply.from.id ),
						_rawdata: null
					};
				} else if ( ctx.message.forward_from ) {
					const fwd: TT.User = ctx.message.forward_from;
					const fwdFrom: string = that._getNick( fwd );

					context.extra.forward = {
						nick: fwdFrom,
						username: fwd.username
					};
				}

				if ( ctx.message.text ) {
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

					that.emit( 'text', context );
				} else {
					const message: TT.Message = ctx.message;

					if ( message.photo ) {
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
					} else if ( message.sticker ) {
						context.text = `${ message.sticker.emoji }<Sticker>`;
						await setFile( context, message.sticker, 'sticker' );
						context.extra.isImage = true;
					} else if ( message.audio ) {
						context.text = `<Audio: ${ message.audio.duration }", ${ getFriendlySize( message.audio.file_size ) }>`;
						await setFile( context, message.audio, 'audio' );
					} else if ( message.voice ) {
						context.text = `<Voice: ${ message.voice.duration }", ${ getFriendlySize( message.voice.file_size ) }>`;
						await setFile( context, message.voice, 'voice' );
					} else if ( message.video ) {
						context.text = `<Video: ${ message.video.width }x${ message.video.height }, ${ message.video.duration }", ${ getFriendlySize( message.video.file_size ) }>`;
						await setFile( context, message.video, 'video' );
					} else if ( message.document ) {
						context.text = `<File: ${ message.document.file_name }, ${ getFriendlySize( message.document.file_size ) }>`;
						await setFile( context, message.document, 'document' );
					} else if ( message.contact ) {
						context.text = `<Contact: ${ message.contact.first_name }, ${ message.contact.phone_number }>`;
					} else if ( message.location ) {
						context.text = `<Location: ${ getFriendlyLocation( message.location.latitude, message.location.longitude ) }>`;
					} else if ( message.venue ) {
						context.text = `<Venue: ${ message.venue.title }, ${ message.venue.address }, ${ getFriendlyLocation(
							message.venue.location.latitude, message.venue.location.longitude ) }>`;
					} else if ( message.pinned_message ) {
						that.emit( 'pin', {
							from: {
								id: message.from.id,
								nick: that._getNick( message.from ),
								username: message.from.username
							},
							to: ctx.chat.id,
							text: that._convertToText( message.pinned_message )
						}, ctx );
					} else if ( message.left_chat_member ) {
						that.emit( 'leave', ctx.chat.id, {
							id: message.from.id,
							nick: that._getNick( message.from ),
							username: message.from.username
						}, {
							id: message.left_chat_member.id,
							nick: that._getNick( message.left_chat_member ),
							username: message.left_chat_member.username
						}, ctx );
					} else if ( message.new_chat_members ) {
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

					if ( context.text ) {
						that.emit( 'richmessage', context );
					}
				}
			}
			return next();
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
		if ( message.audio ) {
			return '<Audio>';
		} else if ( message.photo ) {
			return '<Photo>';
		} else if ( message.document ) {
			return '<Document>';
		} else if ( message.game ) {
			return '<Game>';
		} else if ( message.sticker ) {
			return `${ message.sticker.emoji }<Sticker>`;
		} else if ( message.video ) {
			return '<Video>';
		} else if ( message.voice ) {
			return '<Voice>';
		} else if ( message.contact ) {
			return '<Contact>';
		} else if ( message.location ) {
			return '<Location>';
		} else if ( message.venue ) {
			return '<Venue>';
		} else if ( message.pinned_message ) {
			return '<Pinned Message>';
		} else if ( message.new_chat_members ) {
			return '<New member>';
		} else if ( message.left_chat_member ) {
			return '<Removed member>';
		} else if ( message.text ) {
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

	public sendPhoto( ...args: Parameters<Telegram[ 'sendPhoto' ]> ): Promise<TT.MessagePhoto> {
		return this._client.telegram.sendPhoto( ...args );
	}

	public sendAudio( ...args: Parameters<Telegram[ 'sendAudio' ]> ): Promise<TT.MessageAudio> {
		return this._client.telegram.sendAudio( ...args );
	}
	public sendVideo( ...args: Parameters<Telegram[ 'sendVideo' ]> ): Promise<TT.MessageVideo> {
		return this._client.telegram.sendVideo( ...args );
	}

	public sendAnimation( ...args: Parameters<Telegram[ 'sendAnimation' ]> ): Promise<TT.MessageAnimation> {
		return this._client.telegram.sendAnimation( ...args );
	}

	public sendDocument( ...args: Parameters<Telegram[ 'sendDocument' ]> ): Promise<TT.MessageDocument> {
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
		message: string, options?: TT.ExtraReplyMessage ): Promise<TT.Message> {
		return this._reply( 'sendMessage', context, message, options );
	}

	public replyWithPhoto( context: Context<TContext>,
		photo: TT.InputFile, options?: TT.ExtraPhoto ): Promise<TT.MessagePhoto> {
		return this._reply( 'sendPhoto', context, photo, options );
	}

	public getChatAdministrators( group: string | number ): Promise<TT.ChatMember[]> {
		return this._client.telegram.getChatAdministrators( group );
	}

	public getFile( fileId: string ): Promise<TT.File> {
		return this._client.telegram.getFile( fileId );
	}

	public getFileLink( fileId: string ): Promise<string> {
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
				this._client.launch( {
					polling: {
						timeout: this._start.params.timeout,
						limit: this._start.params.limit
					}
				} );
			}
		}
	}

	public async stop(): Promise<void> {
		if ( this._started ) {
			this._started = false;
			await this._client.stop();
		}
	}
}
