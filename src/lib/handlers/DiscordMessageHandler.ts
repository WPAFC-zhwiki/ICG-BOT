import path = require( 'node:path' );

import Discord = require( 'discord.js' );
import winston = require( 'winston' );

import { ConfigTS } from '@app/config';

import extList from '@app/lib/extToMime';
import { Context, ContextExtra as ContextExtra } from '@app/lib/handlers/Context';
import { BaseEvents, MessageHandler } from '@app/lib/handlers/MessageHandler';
import { inspect, getFriendlySize } from '@app/lib/util';

export interface DiscordEvents extends BaseEvents<Discord.Message> {
	pin( info: {
		from: Discord.User,
		to: Discord.Channel;
		text: string;
	}, rawdata: Discord.Message ): void;
	command( context: Context<Discord.Message>, comand: string, param: string ): void;
	text( context: Context<Discord.Message> ): void;
	ready( client: Discord.Client ): void;
}

export type DiscordSendMessage = string | Discord.MessageCreateOptions;

/**
 * 使用通用介面處理 Discord 訊息
 */
export class DiscordMessageHandler extends MessageHandler<DiscordEvents> {
	private readonly _token: string;
	protected readonly _client: Discord.Client;
	protected readonly _type = 'Discord' as const;
	protected readonly _id = 'D' as const;

	private readonly _nickStyle: 'nickname' | 'username' | 'fullname' | 'firstname';
	public readonly useProxyURL: boolean = false;
	public readonly relayEmoji: boolean = false;

	public get rawClient(): Discord.Client {
		return this._client;
	}

	private _me: Discord.ClientUser;
	public get me(): Discord.ClientUser {
		return this._me;
	}

	public constructor( config: ConfigTS[ 'Discord' ] ) {
		super( config );

		const botConfig: ConfigTS[ 'Discord' ][ 'bot' ] = config.bot;

		const discordOptions: ConfigTS[ 'Discord' ][ 'options' ] = config.options;

		const client: Discord.Client = new Discord.Client( {
			intents: [
				Discord.GatewayIntentBits.Guilds,
				Discord.GatewayIntentBits.GuildMembers,
				// Discord.GatewayIntentBits.GuildBans,
				// Discord.GatewayIntentBits.GuildEmojisAndStickers,
				Discord.GatewayIntentBits.GuildIntegrations,
				// Discord.GatewayIntentBits.GuildWebhooks,
				// Discord.GatewayIntentBits.GuildInvites,
				// Discord.GatewayIntentBits.GuildVoiceStates,
				// Discord.GatewayIntentBits.GuildPresences,
				Discord.GatewayIntentBits.GuildMessages,
				// Discord.GatewayIntentBits.GuildMessageReactions,
				// Discord.GatewayIntentBits.GuildMessageTyping,
				Discord.GatewayIntentBits.DirectMessages,
				// Discord.GatewayIntentBits.DirectMessageReactions,
				// Discord.GatewayIntentBits.DirectMessageTyping,
				Discord.GatewayIntentBits.MessageContent
			]
		} );

		this._me = client.user;

		client.on( 'ready', function (): void {
			winston.info( `DiscordBot is ready, login as: ${ client.user.tag }(${ client.user.id })` );
		} );

		client.on( 'error', function ( message: Error ): void {
			winston.error( 'DiscordBot Error:' + inspect( message ) );
		} );

		this._token = botConfig.token;
		this._client = client;
		this._nickStyle = discordOptions.nickStyle || 'username';
		this.useProxyURL = discordOptions.useProxyURL;
		this.relayEmoji = discordOptions.relayEmoji;

		// eslint-disable-next-line @typescript-eslint/no-this-alias
		const that: this = this;

		client.on( 'messageCreate', async function ( rawdata: Discord.Message ): Promise<void> {

			if ( rawdata.partial ) {
				rawdata = await rawdata.fetch();
			}

			if (
				!that._enabled ||
				rawdata.author.id === client.user.id ||
				discordOptions.ignoreBot && rawdata.author.bot ||
				discordOptions.ignore.includes( rawdata.author.id ) ||
				// 無視置頂
				// TODO: 解析置頂訊息
				rawdata.type === Discord.MessageType.ChannelPinnedMessage ||
				// TODO: EmbedBuilder轉文字
				!rawdata.content && rawdata.embeds && rawdata.embeds.length
			) {
				return;
			}

			let text = rawdata.content;
			const extra: ContextExtra = {
				discriminator: rawdata.author.discriminator
			};

			if ( rawdata.attachments && rawdata.attachments.size ) {
				extra.files = [];
				for ( const [ , p ] of rawdata.attachments ) {
					const type = ( extList.get( path.extname( p.url ) ) || 'unknown' ).split( '/' )[ 0 ];
					extra.files.push( {
						client: 'Discord',
						type: ( extList.get( path.extname( p.url ) ) || 'unknown' ).split( '/' )[ 0 ],
						id: p.id,
						size: p.size,
						url: that.useProxyURL ? p.proxyURL : p.url
					} );
					switch ( type ) {
						case 'image':
							text += ` <Photo: ${ p.width }x${ p.height }, ${ getFriendlySize( p.size ) }>`;
							break;
						case 'video':
							text += ` <Video: ${ p.width }x${ p.height }, ${ p.duration }", ${ getFriendlySize( p.size ) }>`;
							break;
						case 'audio':
							text += ` <Audio: ${ p.duration }", ${ getFriendlySize( p.size ) }>`;
							break;
						default:
							text += ` <File: ${ getFriendlySize( p.size ) }>`;
							break;
					}
				}
			}

			if ( rawdata.reference && rawdata.reference.messageId ) {
				if ( rawdata.channel.id === rawdata.reference.channelId ) {
					const msg = await rawdata.channel.messages.fetch( rawdata.reference.messageId );
					const reply = {
						id: msg.author.id,
						nick: that.getNick( msg.member || msg.author ),
						username: msg.author.username,
						discriminator: msg.author.discriminator,
						message: that._convertToText( msg ),
						isText: msg.content && true,
						_rawdata: msg
					};

					extra.reply = reply;
				}
			}

			const context = new Context<Discord.Message>( {
				from: rawdata.author.id,
				to: rawdata.channel.id,
				nick: that.getNick( rawdata.member || rawdata.author ),
				text: text,
				isPrivate: rawdata.channel.type === Discord.ChannelType.DM,
				extra: extra,
				handler: that,
				_rawdata: rawdata
			} );

			// 檢查是不是命令
			if ( rawdata.content.startsWith( '!' ) || rawdata.content.startsWith( '/' ) ) {
				const cmd = rawdata.content.slice( 1, rawdata.content.match( ' ' ) ? rawdata.content.match( ' ' ).index : rawdata.content.length );
				if ( that._commands.has( cmd ) ) {
					const callback = that._commands.get( cmd );
					let param = rawdata.content.trim().slice( cmd.length + 1 );
					if ( param === '' || param.startsWith( ' ' ) ) {
						param = param.trim();

						context.command = cmd;
						context.param = param;

						if ( typeof callback === 'function' ) {
							callback( context, cmd, param );
						}

						that.emit( 'command', context, cmd, param );
						that.emit( `command#${ cmd }`, context, param );
					}
				}
			}

			that.emit( 'text', context );
		} );

		client.on( 'ready', function () {
			// eslint-disable-next-line prefer-rest-params
			that.emit( 'ready', arguments[ 0 ] );
		} );
	}

	public async say( target: string, message: DiscordSendMessage ): Promise<Discord.Message> {
		if ( !this._enabled ) {
			throw new Error( 'Handler not enabled' );
		} else {
			const channel = this._client.channels.cache.has( target ) ?
				this._client.channels.cache.get( target ) :
				await this._client.channels.fetch( target );
			if ( !channel ) {
				throw new ReferenceError( `Fetch chennel ${ target } fail.` );
			} else if ( channel.type === Discord.ChannelType.GuildText ) {
				return await channel.send( message );
			}
			throw new Error( `Channel ${ target } is not't a text channel.` );
		}
	}

	public async reply( context: Context, message: DiscordSendMessage, options: {
		withNick?: boolean
	} = {} ): Promise<Discord.Message> {
		if ( context.isPrivate ) {
			return await this.say( String( context.from ), message );
		} else {
			if ( options.withNick ) {
				return await this.say( String( context.to ), `${ context.nick }: ${ message }` );
			} else {
				return await this.say( String( context.to ), `${ message }` );
			}
		}
	}

	public getNick( userobj: Discord.GuildMember | {
		username: string;
		id: string;
	} ): string {
		if ( userobj ) {
			let nickname: string, id: string, username: string;
			if ( userobj instanceof Discord.GuildMember ) {
				nickname = userobj.nickname;
				id = userobj.id;
				const user = userobj.user;
				username = user.username;
			} else {
				username = userobj.username;
				id = userobj.id;
				nickname = null;
			}

			if ( this._nickStyle === 'nickname' ) {
				return nickname || username || id;
			} else if ( this._nickStyle === 'username' ) {
				return username || id;
			} else {
				return id;
			}
		} else {
			return '';
		}
	}

	public async fetchUser( user: string ): Promise<Discord.User> {
		return await this._client.users.fetch( user );
	}

	public fetchEmoji( emoji: Discord.EmojiResolvable ): Discord.GuildEmoji {
		return this._client.emojis.resolve( emoji );
	}

	private _convertToText( message: Discord.Message ): string {
		if ( message.content ) {
			return message.content;
		} else if ( message.attachments ) {
			return '<Photo>';
		} else {
			return '<Message>';
		}
	}

	public async start(): Promise<void> {
		if ( !this._started ) {
			this._started = true;
			this._client.login( this._token );
		}
	}

	public async stop(): Promise<void> {
		if ( this._started ) {
			this._started = false;
			this._client.destroy();
		}
	}
}
