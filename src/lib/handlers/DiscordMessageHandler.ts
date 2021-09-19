import Discord from 'discord.js';
import winston = require( 'winston' );

import { ConfigTS } from 'src/config';
import { MessageHandler } from 'src/lib/handlers/MessageHandler';
import { Context, ContextExtra as ContextExtra } from 'src/lib/handlers/Context';
import { Events } from 'src/lib/event';
import { getFriendlySize } from 'src/lib/util';

export interface DiscordEvents {
	command( context: Context<Discord.Message>, comand: string, param: string ): void;
	text( context: Context<Discord.Message> ): void;
	ready( client: Discord.Client ): void;
}

export type DiscordSendMessage = string | string[] | Discord.MessageEmbed | Discord.MessageAttachment
	| Discord.MessageOptions & { split?: false };

/**
 * 使用通用介面處理 Discord 訊息
 */
export class DiscordMessageHandler extends MessageHandler<DiscordEvents & Events> {
	private readonly _token: string;
	protected readonly _client: Discord.Client;
	protected readonly _type: 'Discord' = 'Discord';
	protected readonly _id: 'D' = 'D';

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

		const client: Discord.Client = new Discord.Client();

		this._me = client.user;

		client.on( 'ready', function (): void {
			winston.info( `DiscordBot is ready, login as: ${ client.user.tag }(${ client.user.id })` );
		} );

		client.on( 'error', function ( message: Error ): void {
			winston.error( `DiscordBot Error: ${ message.message }` );
		} );

		this._token = botConfig.token;
		this._client = client;
		this._nickStyle = discordOptions.nickStyle || 'username';
		this.useProxyURL = discordOptions.useProxyURL;
		this.relayEmoji = discordOptions.relayEmoji;

		// eslint-disable-next-line @typescript-eslint/no-this-alias
		const that: this = this;

		async function processMessage( rawdata: Discord.Message ): Promise<void> {
			if (
				!that._enabled ||
				rawdata.author.id === client.user.id ||
				discordOptions.ignorebot && rawdata.author.bot ||
				discordOptions.ignore.includes( rawdata.author.id )
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
					extra.files.push( {
						client: 'Discord',
						type: 'photo',
						id: p.id,
						size: p.size,
						url: that.useProxyURL ? p.proxyURL : p.url
					} );
					text += ` <photo: ${ p.width }x${ p.height }, ${ getFriendlySize( p.size ) }>`;
				}
			}

			if ( rawdata.reference && rawdata.reference.messageID ) {
				if ( rawdata.channel.id === rawdata.reference.channelID ) {
					const msg = await rawdata.channel.messages.fetch( rawdata.reference.messageID );
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
				isPrivate: rawdata.channel.type === 'dm',
				extra: extra,
				handler: that,
				_rawdata: rawdata
			} );

			// 檢查是不是命令
			if ( rawdata.content.startsWith( '!' ) || rawdata.content.startsWith( '/' ) ) {
				const cmd = rawdata.content.substring( 1, rawdata.content.match( ' ' ) ? rawdata.content.match( ' ' ).index : rawdata.content.length );
				if ( that._commands.has( cmd ) ) {
					const callback = that._commands.get( cmd );
					let param = rawdata.content.trim().substring( cmd.length + 1 );
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
		}

		client.on( 'message', processMessage );

		client.on( 'ready', function () {
			// eslint-disable-next-line prefer-rest-params
			that.emit( 'ready', arguments[ 0 ] );
		} );
	}

	public async say( target: string, message: DiscordSendMessage ): Promise<Discord.Message> {
		if ( !this._enabled ) {
			throw new Error( 'Handler not enabled' );
		} else {
			const channel = await this._client.channels.fetch( target );
			if ( channel.isText() ) {
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
