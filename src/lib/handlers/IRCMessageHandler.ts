import { scheduler } from 'node:timers/promises';

import color = require( 'irc-colors' );
import irc = require( 'irc-upd' );
import lodash = require( 'lodash' );
import winston = require( 'winston' );

import { ConfigTS } from '@app/config';

import { Context } from '@app/lib/handlers/Context';
import { BaseEvents, MessageHandler } from '@app/lib/handlers/MessageHandler';

export interface IRCEvents extends BaseEvents<irc.IMessage> {
	join( channel: string, nick: string, message: irc.IMessage ): void;
	nick( oldnick: string, newnick: string, channels: string[], message: irc.IMessage ): void;
	quit( nick: string, reason: string, channels: string[], message: irc.IMessage ): void;
	part( channel: string, nick: string, reason: string, message: irc.IMessage ): void;
	kick( channel: string, nick: string, by: string, reason: string, message: irc.IMessage ): void;
	kill( nick: string, reason: string, channels: string[], message: irc.IMessage ): void;
	topic( channel: string, topic: string, nick: string, message: irc.IMessage ): void;
	registered( message: irc.IMessage ): void;
}

type Me = {
	nick: string;
	userName: string;
	realName: string;
	chans: irc.IChans;
};

/**
 * 使用通用接口处理 IRC 消息
 */
export class IRCMessageHandler extends MessageHandler<IRCEvents> {
	declare protected readonly _client: irc.Client;
	protected readonly _type = 'IRC' as const;
	protected readonly _id = 'I' as const;

	private _maxLines: number;

	private readonly _splitsep: {
		prefix: string;
		postfix: string;
	} = {
			prefix: '',
			postfix: 'string',
		};

	public get rawClient(): irc.Client {
		return this._client;
	}

	private _me: Me;
	public get me(): Me {
		return this._me;
	}

	public constructor( config: ConfigTS[ 'IRC' ] ) {
		super( config );

		// 加载机器人
		const botConfig: ConfigTS[ 'IRC' ][ 'bot' ] = config.bot;
		const ircOptions: ConfigTS[ 'IRC' ][ 'options' ] = config.options;
		const client = new irc.Client( botConfig.server, botConfig.nick, {
			userName: botConfig.userName,
			realName: botConfig.realName,
			port: botConfig.port,
			autoRejoin: true,
			channels: botConfig.channels || [],
			secure: botConfig.secure || false,
			floodProtection: botConfig.floodProtection || true,
			floodProtectionDelay: botConfig.floodProtectionDelay || 300,
			sasl: botConfig.sasl,
			password: botConfig.sasl_password,
			// eslint-disable-next-line unicorn/text-encoding-identifier-case
			encoding: botConfig.encoding || 'utf-8',
			autoConnect: false,
		} );

		client.on( 'registered', async () => {
			winston.info( 'IRCBot has been registered' );
			while ( client.nick === client.hostMask ) {
				await scheduler.wait( 100 );
			}
			this._me.nick = client.nick;
			winston.info( `IRCBot is ready, login as: ${ client.nick }!${ client.hostMask }.` );
		} );

		client.on( 'join', function ( channel, nick ) {
			if ( nick === client.nick ) {
				winston.info( `IRCBot has joined channel: ${ channel } as ${ nick }` );
			}
		} );

		client.on( 'error', function ( message ) {
			winston.error( 'IRCBot error:' + JSON.stringify( message ) );
		} );

		// 加载设置

		this._client = client;
		this._maxLines = ircOptions.maxLines || 4;

		this._me = {
			nick: this._client.nick,
			userName: botConfig.userName,
			realName: botConfig.realName,
			chans: this.chans,
		};

		// 绑定事件
		const processMessage = ( from: string, to: string, text: string, rawData: irc.IMessage, isAction = false ) => {

			if (
				!this._enabled ||
				from === client.nick ||
				ircOptions.ignore.map( function ( name ) {
					// eslint-disable-next-line security/detect-non-literal-regexp
					return new RegExp( `^${ lodash.escapeRegExp( name ) }\\d*$` );
				} ).some( function ( reg ) {
					return reg.exec( from );
				} )
			) {
				return;
			}

			// 去除訊息中的格式字元
			const plainText: string = color.stripColorsAndStyle( text );

			const context = new Context<irc.IMessage>( {
				from: from,
				to: to === client.nick ? to : to.toLowerCase(),
				nick: from,
				text: plainText,
				isPrivate: to === client.nick,
				extra: {},
				handler: this,
				_rawData: rawData,
			} );
			context.messageId = context.programMessageId; // 以 programMessageId 代替根本不存在的 messageId 方便映射

			if ( isAction ) {
				context.extra.isAction = true;
			}

			// 檢查是不是命令
			if ( plainText.startsWith( '!' ) ) {
				const cmd = plainText.slice( 1, plainText.match( ' ' ) ? plainText.match( ' ' ).index : plainText.length );
				if ( this._commands.has( cmd ) ) {
					const callback = this._commands.get( cmd );
					let parameter = plainText.trim().slice( cmd.length + 1 );
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
		};

		client.on( 'message', processMessage );
		client.on( 'action', ( from: string, to: string, text: string, rawData: irc.IMessage ) => {
			processMessage( from, to, text, rawData, true );
		} );

		client.on( 'join', ( channel: string, nick: string, message: irc.IMessage ) => {
			this.emit( 'join', channel, nick, message );
		} );

		client.on( 'nick', ( oldNick: string, newNick: string, channels: string[], message: irc.IMessage ) => {
			this.emit( 'nick', oldNick, newNick, channels, message );
		} );

		client.on( 'quit', ( nick: string, reason: string, channels: string[], message: irc.IMessage ) => {
			this.emit( 'quit', nick, reason, channels, message );
		} );

		client.on( 'part', ( channel: string, nick: string, reason: string, message: irc.IMessage ) => {
			this.emit( 'part', channel, nick, reason, message );
		} );

		client.on( 'kick', ( channel: string, nick: string, by: string, reason: string, message: irc.IMessage ) => {
			this.emit( 'kick', channel, nick, by, reason, message );
		} );

		client.on( 'kill', ( nick: string, reason: string, channels: string[], message: irc.IMessage ) => {
			this.emit( 'kill', nick, reason, channels, message );
		} );

		client.on( 'topic', ( channel: string, topic: string, nick: string, message: irc.IMessage ) => {
			this.emit( 'topic', channel, topic, nick, message );
		} );

		client.on( 'registered', ( message: irc.IMessage ) => {
			this.emit( 'registered', message );
		} );
	}

	public get maxLines(): number {
		return this._maxLines;
	}

	public set maxLines( value: number ) {
		this._maxLines = value;
	}

	public get splitPrefix(): string {
		return this._splitsep.prefix;
	}

	public set splitPrefix( p: string ) {
		this._splitsep.prefix = p;
	}

	public get splitPostfix(): string {
		return this._splitsep.postfix;
	}

	public set splitPostfix( p: string ) {
		this._splitsep.postfix = p;
	}

	public get nick(): string {
		return this._client.nick;
	}

	public async say( target: string, message: string, options: {
		isAction?: boolean;
		doNotSplitText?: boolean;
	} = {} ): Promise<void> {
		if ( !this._enabled ) {
			throw new Error( 'Handler not enabled' );
		} else if ( target.length > 0 ) {
			const lines = options.doNotSplitText ?
				message.split( '\n' ).map( ( s ) => {
					return this.splitText( s, 449, this._maxLines );
				} ).flat( Infinity ) :
				this.splitText( message, 449, this._maxLines );
			if ( options.isAction ) {
				this._client.action( target, lines.join( '\n' ) );
			} else {
				this._client.say( target, lines.join( '\n' ) );
			}
		} else {
			return;
		}
	}

	public async reply( context: Context, message: string, options: {
		isPrivate?: boolean;
		withNick?: boolean;
		isAction?: boolean;
	} = {} ): Promise<void> {
		if ( context.isPrivate ) {
			await this.say( String( context.from ), message, options );
		} else {
			return await ( options.withNick ? this.say( String( context.to ), `${ context.nick }: ${ message }`, options ) : this.say( String( context.to ), `${ message }`, options ) );
		}
	}

	public get chans(): irc.IChans {
		return this._client.chans;
	}

	public whois( nick: string ): Promise<irc.IWhoisData> {
		return new Promise( ( resolve ) => {
			this._client.whois( nick, resolve );
		} );
	}

	private getByteSize( code: number ): number {
		if ( code <= 0x7F ) {
			return 1;
		}
		if ( code <= 0x7_FF ) {
			return 2;
		}
		if ( code <= 0xFF_FF ) {
			return 3;
		}
		if ( code <= 0x10_FF_FF ) {
			return 4;
		}
		return 5;
	}

	public splitText( text: string, maxBytesPerLine = 449, maxLines = 0 ): string[] {
		const text2: string = text.replaceAll( /\n+/gu, '\n' ).replaceAll( /\n*$/gu, '' );
		const lines: string[] = [];
		let line: string[] = [];
		let bytes = 0;
		const seplen: number = this._splitsep.prefix.length + this._splitsep.postfix.length;

		if ( maxBytesPerLine < 10 ) {
			return [];
		}

		for ( const ch of text2 ) {
			if ( ch === '\n' ) {
				lines.push( line.join( '' ) );
				line = [];
				bytes = 0;
				if ( maxLines > 0 && lines.length === maxLines + 1 ) {
					break;
				}
			} else {
				const b: number = this.getByteSize( ch.codePointAt( 0 ) );

				if ( bytes + b > maxBytesPerLine - seplen ) {
					line.push( this._splitsep.postfix );
					lines.push( line.join( '' ) );
					line = [ this._splitsep.prefix, ch ];
					bytes = b;
					if ( maxLines > 0 && lines.length === maxLines ) {
						lines.push( line.join( '' ) );
						break;
					}
				} else {
					line.push( ch );
					bytes += b;
				}
			}
		}

		if ( maxLines > 0 && lines.length > maxLines ) {
			lines.pop();
			lines.push( '...' );
		} else if ( line.length > 0 ) {
			if ( maxLines > 0 && lines.length === maxLines ) {
				lines.push( '...' );
			} else {
				lines.push( line.join( '' ) );
			}
		}

		return lines;
	}

	public join( channel: string, callback?: irc.handlers.IJoinChannel ): void {
		this._client.join( channel, callback );
	}

	public part( channel: string, message: string, callback: irc.handlers.IPartChannel ): void {
		this._client.part( channel, message, callback );
	}

	public async start(): Promise<void> {
		if ( !this._started ) {
			this._started = true;
			this._client.connect();
		}
	}

	public async stop(): Promise<void> {
		if ( !this._started ) {
			this._started = false;

			this._client.disconnect( 'disconnect by operator.', function () {} );
		}
	}
}
