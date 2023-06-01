import color = require( 'irc-colors' );
import irc = require( 'irc-upd' );
import lodash = require( 'lodash' );
import winston = require( 'winston' );

import { ConfigTS } from '@app/config';

import delay from '@app/lib/delay';
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
	protected readonly _client: irc.Client;
	protected readonly _type = 'IRC' as const;
	protected readonly _id = 'I' as const;

	private _maxLines: number;

	private readonly _splitsep: {
		prefix: string;
		postfix: string;
	} = {
			prefix: '',
			postfix: 'string'
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
			encoding: botConfig.encoding || 'UTF-8',
			autoConnect: false
		} );

		// eslint-disable-next-line @typescript-eslint/no-this-alias
		const that = this;

		client.on( 'registered', async function () {
			winston.info( 'IRCBot has been registered' );
			while ( client.nick === client.hostMask ) {
				await delay( 100 );
			}
			that._me.nick = client.nick;
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
			chans: this.chans
		};

		// 绑定事件
		function processMessage( from: string, to: string, text: string, rawdata: irc.IMessage, isAction = false ) {

			if (
				!that._enabled ||
				from === client.nick ||
				ircOptions.ignore.map( function ( name ) {
					// eslint-disable-next-line security/detect-non-literal-regexp
					return new RegExp( `^${ lodash.escapeRegExp( name ) }\\d*$` );
				} ).filter( function ( reg ) {
					return reg.exec( from );
				} ).length
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
				handler: that,
				_rawdata: rawdata
			} );

			if ( isAction ) {
				context.extra.isAction = true;
			}

			// 檢查是不是命令
			if ( plainText.startsWith( '!' ) ) {
				const cmd = plainText.slice( 1, plainText.match( ' ' ) ? plainText.match( ' ' ).index : plainText.length );
				if ( that._commands.has( cmd ) ) {
					const callback = that._commands.get( cmd );
					let param = plainText.trim().slice( cmd.length + 1 );
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
		client.on( 'action', ( from: string, to: string, text: string, rawdata: irc.IMessage ) => {
			processMessage( from, to, text, rawdata, true );
		} );

		client.on( 'join', function ( channel: string, nick: string, message: irc.IMessage ) {
			that.emit( 'join', channel, nick, message );
		} );

		client.on( 'nick', function ( oldnick: string, newnick: string, channels: string[], message: irc.IMessage ) {
			that.emit( 'nick', oldnick, newnick, channels, message );
		} );

		client.on( 'quit', function ( nick: string, reason: string, channels: string[], message: irc.IMessage ) {
			that.emit( 'quit', nick, reason, channels, message );
		} );

		client.on( 'part', function ( channel: string, nick: string, reason: string, message: irc.IMessage ) {
			that.emit( 'part', channel, nick, reason, message );
		} );

		client.on( 'kick', function ( channel: string, nick: string, by: string, reason: string, message: irc.IMessage ) {
			that.emit( 'kick', channel, nick, by, reason, message );
		} );

		client.on( 'kill', function ( nick: string, reason: string, channels: string[], message: irc.IMessage ) {
			that.emit( 'kill', nick, reason, channels, message );
		} );

		client.on( 'topic', function ( channel: string, topic: string, nick: string, message: irc.IMessage ) {
			that.emit( 'topic', channel, topic, nick, message );
		} );

		client.on( 'registered', function ( message: irc.IMessage ) {
			that.emit( 'registered', message );
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
		// eslint-disable-next-line @typescript-eslint/no-this-alias
		const that = this;
		if ( !that._enabled ) {
			throw new Error( 'Handler not enabled' );
		} else if ( !target.length ) {
			return;
		} else {
			const lines = options.doNotSplitText ?
				[ ...message.split( '\n' ).map( function ( s ) {
					return that.splitText( s, 449, that._maxLines );
				} ).flat( Infinity ) ] :
				that.splitText( message, 449, that._maxLines );
			if ( options.isAction ) {
				that._client.action( target, lines.join( '\n' ) );
			} else {
				that._client.say( target, lines.join( '\n' ) );
			}
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
			if ( options.withNick ) {
				return await this.say( String( context.to ), `${ context.nick }: ${ message }`, options );
			} else {
				return await this.say( String( context.to ), `${ message }`, options );
			}
		}
	}

	public get chans(): irc.IChans {
		return this._client.chans;
	}

	public whois( nick: string ): Promise<irc.IWhoisData> {
		// eslint-disable-next-line @typescript-eslint/no-this-alias
		const that: this = this;
		return new Promise( function ( resolve ) {
			that._client.whois( nick, resolve );
		} );
	}

	public splitText( text: string, maxBytesPerLine = 449, maxLines = 0 ): string[] {
		const text2: string = text.replace( /\n+/gu, '\n' ).replace( /\n*$/gu, '' );
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
				const code: number = ch.codePointAt( 0 );
				const b: number = ( code <= 0x7F ) ? 1 : (
					( code <= 0x7FF ) ? 2 : (
						( code <= 0xFFFF ) ? 3 : (
							( code <= 0x10FFFF ) ? 4 : 5
						)
					)
				);

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
			// eslint-disable-next-line @typescript-eslint/no-empty-function
			this._client.disconnect( 'disconnect by operator.', function () { } );
		}
	}
}
