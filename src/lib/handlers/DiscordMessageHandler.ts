import path = require( 'node:path' );

import Discord = require( 'discord.js' );
import winston = require( 'winston' );

import { ConfigTS } from '@app/config';

import extList from '@app/lib/extensionToMime';
import { Context, ContextExtra as ContextExtra } from '@app/lib/handlers/Context';
import { BaseEvents, MessageHandler } from '@app/lib/handlers/MessageHandler';
import { inspect, getFriendlySize, getFileNameFromUrl } from '@app/lib/util';

export interface DiscordEvents extends BaseEvents<Discord.Message> {
	pin( info: {
		from: Discord.User,
		to: Discord.Channel;
		text: string;
	}, rawData: Discord.Message ): void;
	command( context: Context<Discord.Message>, comand: string, parameter: string ): void;
	text( context: Context<Discord.Message> ): void;
	ready( client: Discord.Client ): void;
}

export type DiscordSendMessage = string | Discord.MessageCreateOptions;

/**
 * 使用通用介面處理 Discord 訊息
 */
export class DiscordMessageHandler extends MessageHandler<DiscordEvents> {
	private readonly _token: string;
	declare protected readonly _client: Discord.Client;
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
				Discord.GatewayIntentBits.MessageContent,
			],
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

		client.on( 'messageCreate', async ( rawData: Discord.Message ): Promise<void> => {
			if ( rawData.partial ) {
				rawData = await rawData.fetch();
			}

			if (
				!this._enabled ||
				rawData.author.id === client.user.id ||
				discordOptions.ignoreBot && rawData.author.bot ||
				discordOptions.ignore.includes( rawData.author.id ) ||
				// 無視置頂
				// TODO: 解析置頂訊息
				rawData.type === Discord.MessageType.ChannelPinnedMessage ||
				// TODO: EmbedBuilder轉文字
				!rawData.content && rawData.embeds && rawData.embeds.length > 0
			) {
				return;
			}

			let text = rawData.content;
			const extra: ContextExtra = {
				discriminator: rawData.author.discriminator,
			};

			if ( rawData.attachments && rawData.attachments.size > 0 ) {
				extra.files = [];
				for ( const [ , p ] of rawData.attachments ) {
					const type = ( extList.get( path.extname( getFileNameFromUrl( p.url ) ) ) || 'unknown' ).split( '/' )[ 0 ];
					extra.files.push( {
						client: 'Discord',
						type,
						id: p.id,
						size: p.size,
						url: this.useProxyURL ? p.proxyURL : p.url,
					} );
					switch ( type ) {
						case 'image': {
							text += ` <Photo: ${ p.width }x${ p.height }, ${ getFriendlySize( p.size ) }>`;
							break;
						}
						case 'video': {
							text += ` <Video: ${ p.width }x${ p.height }, ${ getFriendlySize( p.size ) }>`;
							break;
						}
						case 'audio': {
							text += ` <Audio: ${ getFriendlySize( p.size ) }>`;
							break;
						}
						default: {
							text += ` <Attachment: ${ getFriendlySize( p.size ) }>`;
							break;
						}
					}
				}
			}

			if (
				rawData.reference &&
				rawData.reference.messageId &&
				rawData.channel.id === rawData.reference.channelId
			) {
				const message = await rawData.channel.messages.fetch( rawData.reference.messageId );

				extra.reply = {
					origClient: this._type,
					origChatId: rawData.channel.id,
					origMessageId: message.id,
					id: message.author.id,
					nick: this.getNick( message.member || message.author ),
					username: message.author.username,
					discriminator: message.author.discriminator,
					message: this._convertToText( message ),
					isText: message.content && true,
					_rawData: message,
				};
			}

			const context = new Context<Discord.Message>( {
				from: rawData.author.id,
				to: rawData.channel.id,
				messageId: rawData.id,
				nick: this.getNick( rawData.member || rawData.author ),
				text: text,
				isPrivate: rawData.channel.type === Discord.ChannelType.DM,
				extra: extra,
				handler: this,
				_rawData: rawData,
			} );

			// 檢查是不是命令
			if ( rawData.content.startsWith( '!' ) || rawData.content.startsWith( '/' ) ) {
				const cmd = rawData.content.slice( 1, rawData.content.match( ' ' ) ? rawData.content.match( ' ' ).index : rawData.content.length );
				if ( this._commands.has( cmd ) ) {
					const callback = this._commands.get( cmd );
					let parameter = rawData.content.trim().slice( cmd.length + 1 );
					if ( parameter === '' || parameter.startsWith( ' ' ) ) {
						parameter = parameter.trim();

						context.command = cmd;
						context.param = parameter;

						if ( typeof callback === 'function' ) {
							callback( context, cmd, parameter );
						}

						this.emit( 'command', context, cmd, parameter );
						this.emit( `command#${ cmd }`, context, parameter );
					}
				}
			}

			this.emit( 'text', context );
		} );

		client.on( 'ready', () => {
			// eslint-disable-next-line prefer-rest-params
			this.emit( 'ready', arguments[ 0 ] );
		} );
	}

	public async say( target: string, message: DiscordSendMessage ): Promise<Discord.Message> {
		if ( this._enabled ) {
			const channel = this._client.channels.cache.has( target ) ?
				this._client.channels.cache.get( target ) :
				await this._client.channels.fetch( target );
			if ( !channel ) {
				throw new ReferenceError( `Fetch chennel ${ target } fail.` );
			} else if ( channel.type === Discord.ChannelType.GuildText ) {
				return await channel.send( message );
			}
			throw new Error( `Channel ${ target } is not't a text channel.` );
		} else {
			throw new Error( 'Handler not enabled' );
		}
	}

	public async reply( context: Context, message: DiscordSendMessage, options: {
		withNick?: boolean
	} = {} ): Promise<Discord.Message> {
		return context.isPrivate ? ( await this.say( String( context.from ), message ) ) : ( await ( options.withNick ? this.say( String( context.to ), `${ context.nick }: ${ message }` ) : this.say( String( context.to ), `${ message }` ) ) );
	}

	public getNick( userObject: Discord.GuildMember | {
		username: string;
		id: string;
	} ): string {
		if ( userObject ) {
			let nickname: string, id: string, username: string;
			if ( userObject instanceof Discord.GuildMember ) {
				nickname = userObject.nickname;
				id = userObject.id;
				const user = userObject.user;
				username = user.username;
			} else {
				username = userObject.username;
				id = userObject.id;
				nickname = undefined;
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
