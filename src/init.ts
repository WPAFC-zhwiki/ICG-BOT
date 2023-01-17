import removeToken = require( '@sunafterrainwm/winston-format-remove-telegram-apitoken' );
import winston = require( 'winston' );

import { default as config, version } from '@app/config';

import { Context } from '@app/lib/handlers/Context';
import { MessageHandler } from '@app/lib/handlers/MessageHandler';
import { inspect } from '@app/lib/util';

import { ifEnable, isEnable } from '@app/modules/enable';

export interface ExtendsMap<T extends string, S, M extends Record<T, S>> extends Map<T, S> {
	get<K extends keyof M>( key: K ): M[ K ];
	get( key: T ): S;
	set<K extends keyof M>( key: K, value: M[ K ] ): this;
	set( key: T, value: S ): this;
}

const allHandlers: ExtendsMap<string, string, Record<string, string>> = new Map( [
	[ 'IRC', 'IRCMessageHandler' ],
	[ 'Telegram', 'TelegramMessageHandler' ],
	[ 'Discord', 'DiscordMessageHandler' ]
] );

// 日志初始化
const logFormat: winston.Logform.FormatWrap = winston.format( function ( info: winston.Logform.TransformableInfo ) {
	info.level = info.level.toUpperCase();
	if ( info.stack ) {
		info.message = `${ info.message }\n${ info.stack }`;
	}
	return info;
} );

winston.add( new winston.transports.Console( {
	format: winston.format.combine(
		removeToken( {
			apiRoot: config.Telegram?.bot?.apiRoot
		} ),
		logFormat(),
		winston.format.colorize(),
		winston.format.timestamp( {
			format: 'YYYY-MM-DD HH:mm:ss'
		} ),
		winston.format.printf( ( info ) => `${ info.timestamp } [${ info.level }] ${ info.message }` )
	)
} ) );

process.on( 'unhandledRejection', function ( _reason, promise ) {
	promise.catch( function ( error ) {
		winston.error( 'Unhandled Rejection:' + inspect( error ) );
	} );
} );

process.on( 'uncaughtException', function ( error ) {
	winston.error( 'Uncaught exception:' + inspect( error ) );
} );

process.on( 'rejectionHandled', function () {
	// 忽略
} );

process.on( 'warning', function ( warning ) {
	winston.warn( inspect( warning ) );
} );

// 日志等级、文件设置
if ( config.logging && config.logging.level ) {
	winston.level = config.logging.level;
} else {
	winston.level = 'info';
}

if ( config.logging && config.logging.logfile ) {
	const files: winston.transports.FileTransportInstance = new winston.transports.File( {
		filename: config.logging.logfile,
		format: winston.format.combine(
			logFormat(),
			winston.format.timestamp( {
				format: 'YYYY-MM-DD HH:mm:ss'
			} ),
			winston.format.printf( function ( info ) {
				return `${ info.timestamp } [${ info.level }] ${ info.message }`;
			} )
		)
	} );
	winston.add( files );
}

export type handlers = {
	IRC: import( '@app/lib/handlers/IRCMessageHandler' ).IRCMessageHandler;
	Telegram: import( '@app/lib/handlers/TelegramMessageHandler' ).TelegramMessageHandler;
	Discord: import( '@app/lib/handlers/DiscordMessageHandler' ).DiscordMessageHandler;
}

type handlerClasses = {
	IRC: {
		object: typeof import( '@app/lib/handlers/IRCMessageHandler' ).IRCMessageHandler;
		options: typeof config.IRC;
	};
	Telegram: {
		object: typeof import( '@app/lib/handlers/TelegramMessageHandler' ).TelegramMessageHandler;
		options: typeof config.Telegram;
	};
	Discord: {
		object: typeof import( '@app/lib/handlers/DiscordMessageHandler' ).DiscordMessageHandler;
		options: typeof config.Discord;
	};
}

// 所有擴充套件包括傳話機器人都只與該物件打交道
export const Manager: {
	handlers: ExtendsMap<string, MessageHandler, handlers>,

	handlerClasses: ExtendsMap<string, {
		object: typeof MessageHandler;
		options: typeof config.IRC | typeof config.Telegram | typeof config.Discord;
	// eslint-disable-next-line @typescript-eslint/ban-ts-comment
	// @ts-ignore
	}, handlerClasses>,

	config: typeof config,

	global: {
		Context: typeof Context;
		Message: typeof MessageHandler;
		ifEnable: typeof ifEnable;
		isEnable: typeof isEnable;
	}
} = {
	handlers: new Map(),
	handlerClasses: new Map(),
	config: config,
	global: {
		Context,
		Message: MessageHandler,
		ifEnable,
		isEnable
	}
};

// 欢迎信息
winston.info( 'AFC-ICG-BOT: A bot helps AFC groups' );
winston.info( `Version: ${ version }` );
winston.info( '' );

// 启动各机器人
const enabledClients: string[] = [];
for ( const type of allHandlers.keys() ) {
	if ( config[ type ] && !config[ type ].disabled ) {
		enabledClients.push( type );
	}
}
winston.info( `Enabled clients: ${ enabledClients.join( ', ' ) }` );

for ( const client of enabledClients ) {
	winston.info( `Starting ${ client } bot...` );

	const options = config[ client ];
	// eslint-disable-next-line @typescript-eslint/no-var-requires
	const Handler: typeof MessageHandler = require( `./lib/handlers/${ allHandlers.get( client ) }` )[ allHandlers.get( client ) ];
	const handler: MessageHandler = new Handler( options );
	handler.start();

	Manager.handlers.set( client, handler );
	Manager.handlerClasses.set( client, {
		object: Handler,
		options: options
	} );

	winston.info( `${ client } bot has started.` );
}
