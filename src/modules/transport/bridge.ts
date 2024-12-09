import winston = require( 'winston' );

import { Manager } from '@app/init';

import { Context, RawMessage } from '@app/lib/handlers/Context';
import { inspect } from '@app/lib/util';

import { BridgeMessage } from '@app/modules/transport/BridgeMessage';

import { BridgeDatabase, AssociateMessage } from './BridgeDatabase';

function checkEnable(): void {
	if ( !Manager.global.isEnable( 'transport' ) ) {
		throw new ReferenceError( 'Module transport isn\'t enable!' );
	}
}

export type processor = ( message: BridgeMessage ) => Promise</* message id */ false | string | number>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type hook = ( ...args: any[] ) => Promise<any>;

export interface hooks extends Record<string, hook> {
	'bridge.receive': ( message: BridgeMessage ) => Promise<void>;
	'bridge.send': ( message: BridgeMessage ) => Promise<void>;
	'bridge.sent': ( message: BridgeMessage ) => Promise<void>;
}

export const processors: Map<string, processor> = new Map();
const hooks: Record<string | number, Map<number, hook>> = {};
const hooks2: WeakMap<hook, { event: keyof hooks, priority: number }> = new WeakMap();

export const map: Record<string, Record<string, {
	disabled: boolean;
}>> = {};

export type alias = {
	shortname: string,
	fullname: string
};

export const aliases: Record<string, alias> = {};

export function setAliases( a: Record<string, alias> ): void {
	Object.assign( aliases, a );
}

function getBridgeMessage<T extends RawMessage>( message: BridgeMessage<T> | Context<T> ): BridgeMessage<T> {
	return message instanceof BridgeMessage ? message : new BridgeMessage<T>( message );
}

export function prepareBridgeMessage( message: BridgeMessage ): Promise<void>;
export function prepareBridgeMessage( message: Context ): void;
export function prepareBridgeMessage( message: Context ): Promise<void> | void {
	if ( Object.prototype.hasOwnProperty.call( message.extra, 'mapTo' ) ) {
		return Promise.resolve();
	}

	// 檢查是否有傳送目標
	const toUid = BridgeMessage.getUIDFromContext( message, message.to );
	if ( !toUid ) {
		// 傳入 uid 無效
		return Promise.resolve();
	}
	const allTargets = map[ toUid ];
	const targets: string[] = [];
	for ( const t in allTargets ) {
		if ( !allTargets[ t ].disabled ) {
			targets.push( t );
		}
	}

	// 向 msg 中加入附加訊息
	message.extra.clients = targets.length + 1;
	message.extra.mapTo = targets;
	message.extra.clientName = aliases[ toUid ] ?? {
		shortname: message.handler.id,
		fullname: message.handler.type,
	};

	if ( message instanceof BridgeMessage ) {
		return emitHook( 'bridge.send', message );
	}
}

export function getMessageStyle( message: BridgeMessage, skipReplyCheck = false ): string {
	// 自定义消息样式
	let styleMode: 'simple' | 'complex' = 'simple';
	const messageStyle = Manager.config.transport.options.messageStyle;
	if ( message.extra.clients >= 3 && ( message.extra.clientName.shortname || message.extra.isNotice ) ) {
		styleMode = 'complex';
	}

	if ( message.extra.plainText ) {
		return '{text}';
	} else if ( message.extra.isNotice ) {
		return messageStyle[ styleMode ].notice;
	} else if ( message.extra.isAction ) {
		return messageStyle[ styleMode ].action;
	} else if ( message.extra.reply && !skipReplyCheck ) {
		return messageStyle[ styleMode ].reply;
	} else if ( message.extra.forward ) {
		return messageStyle[ styleMode ].forward;
	} else {
		return messageStyle[ styleMode ].message;
	}
}

export function addProcessor( type: string, processor: processor ): void {
	processors.set( type, processor );
}

export function deleteProcessor( type: string ): void {
	processors.delete( type );
}

export function addHook<V extends keyof hooks>( event: V, func: hooks[ V ], priority = 100 ): void {
	// Event:
	// bridge.send：剛發出，尚未準備傳話
	// bridge.receive：已確認目標
	if ( !hooks[ event ] ) {
		hooks[ event ] = new Map();
	}
	const m = hooks[ event ];
	if ( m && typeof func === 'function' ) {
		let p = priority;
		while ( m.has( p ) ) {
			p++;
		}
		m.set( p, func );
		hooks2.set( func, { event: event, priority: p } );
	}
}

export function deleteHook( func: hook ): void {
	if ( hooks2.has( func ) ) {
		const h = hooks2.get( func );
		hooks[ h.event ].delete( h.priority );
		hooks2.delete( func );
	}
}

export async function emitHook<V extends keyof hooks>( event: V, ...args: Parameters<hooks[V]> ): Promise<void> {
	checkEnable();

	if ( hooks[ event ] ) {
		winston.debug( `[transport/bridge] emit hook: ${ event }` );
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		for ( const [ _priority, hook ] of hooks[ event ] ) {
			await hook( ...args );
		}
	}
}

type SendMessageReturn = {
	client: string;
	chatId: string | number;
	messageId: string | number | false;
};

function sendMessage( message: BridgeMessage, isbridge = false ): Promise<SendMessageReturn>[] {
	const currentMessageId = message.msgId;

	// 全部訊息已傳送 resolve( true )，部分訊息已傳送 resolve( false )；
	// 所有訊息被拒絕傳送 reject()
	// Hook 需自行處理異常
	// 向對應目標的 handler 觸發 exchange
	const promises: Promise<SendMessageReturn>[] = [];
	for ( const t of message.extra.mapTo ) {
		const message2 = new BridgeMessage( message, {
			to_uid: t,
			rawFrom: message.from_uid,
			rawTo: message.to_uid,
		} );
		const new_uid = BridgeMessage.parseUID( t );
		const client = new_uid.client;

		const msgid = `#${ message2.msgId } (from: #${ currentMessageId })`;

		if ( isbridge ) {
			promises.push( emitHook( 'bridge.receive', message2 ).then( function () {

				const processor = processors.get( client );
				if ( processor ) {
					winston.debug( `[transport/bridge] <BotTransport> ${ msgid } ---> ${ new_uid.uid }` );
					return processor( message2 );
				} else {
					winston.debug( `[transport/bridge] <BotTransport> ${ msgid } -X-> ${ new_uid.uid }: No processor` );
				}
				return false;
			} ).then( ( messageId ) => ( { client, chatId: new_uid.id, messageId } ) ) );
		} else {

			const processor = processors.get( client );
			if ( processor ) {
				winston.debug( `[transport/bridge] <BotSend> ${ msgid } ---> ${ new_uid.uid }` );
				promises.push(
					processor( message2 )
						.then( ( messageId ) => ( { client, chatId: new_uid.id, messageId } ) )
				);
			} else {
				winston.debug( `[transport/bridge] <BotSend> ${ msgid } -X-> ${ new_uid.uid }: No processor` );
			}
		}
	}

	return promises;
}

export async function transportMessage( m: BridgeMessage | Context, bot?: boolean ): Promise<boolean> {
	checkEnable();

	const message: BridgeMessage = getBridgeMessage( m );

	const currentMessageId: number = message.msgId;

	let isBridge: boolean;

	if ( bot ) {
		delete message.extra.username; // 刪掉讓日誌變混亂的username

		isBridge = false;
		winston.debug( `[transport/bridge] <BotSend> #${ currentMessageId } ---> ${ message.to_uid }: ${ message.text }` );
		const extraJson: string = JSON.stringify( message.extra, Object.keys( message.extra ).filter( function ( key ) {
			return key !== '_rawData';
		} ) );
		if ( extraJson !== 'null' && extraJson !== '{}' ) {
			winston.debug( `[transport/bridge] <BotSend> #${ currentMessageId } extra: ${ extraJson }` );
		}
	} else {
		isBridge = true;
		winston.debug( `[transport/bridge] <UserSend> #${ currentMessageId } ${ message.from_uid } ---> ${ message.to_uid }: ${ message.text }` );
		const extraJson: string = JSON.stringify( message.extra );
		if ( extraJson !== 'null' && extraJson !== '{}' ) {
			winston.debug( `[transport/bridge] <UserSend> #${ currentMessageId } extra: ${ extraJson }` );
		}

		if ( /undefined|null/.test( String( message.from_uid ) ) || /undefined|null/.test( String( message.to_uid ) ) ) {
			throw new TypeError( `Can't not send Message #${ currentMessageId } where target is null or undefined.` );
		}
	}

	try {
		await prepareBridgeMessage( message );
	} catch ( error ) {
		winston.error( `[transport/bridge] Fail to run prepareBridgeMessage on Message #${ currentMessageId }: ${ inspect( error ) }` );
		return;
	}

	let allResolved = false;

	const promises = sendMessage( message, isBridge );

	try {
		const associateMessage = [ ...( await Promise.all( promises ) ), {
			client: message.handler.type,
			chatId: message.to,
			messageId: message.messageId ?? false,
		} ]
			.filter( ( data ) => data.messageId !== false ) as AssociateMessage;
		if ( associateMessage ) {
			await bridgeDatabase.setMessageAssociation( associateMessage );
		}
	} catch ( error ) {
		allResolved = false;
		winston.error( '[transport/bridge] <BotSend> Rejected: ' + inspect( error ) );
	}

	emitHook( 'bridge.sent', message );
	if ( promises.length > 0 ) {
		winston.debug( `[transport/bridge] <BotSend> #${ currentMessageId } done.` );
	} else {
		winston.debug( `[transport/bridge] <BotSend> #${ currentMessageId } has no targets. Ignored.` );
	}
	return await Promise.resolve( allResolved );
}

export const bridgeDatabase = new BridgeDatabase();

export async function fetchMessageAssociation(
	fromClient: string,
	fromChatId: string | number,
	fromMessageId: string | number,
	toClient: string,
	toChatId: string | number
): Promise<string | number | false> {
	const associations = await bridgeDatabase.getMessageAssociation( fromClient, fromChatId, fromMessageId );
	if ( !associations ) {
		return false;
	}
	for ( const association of associations ) {
		if (
			association.client === toClient &&
			String( association.chatId ) === String( toChatId )
		) {
			return association.messageId;
		}
	}
	return false;
}

export function truncate( str: string, maxLength = 20 ) {
	str = str.replaceAll( '\n', '' );
	if ( str.length > maxLength ) {
		str = str.slice( 0, maxLength - 3 ) + '...';
	}
	return str;
}
