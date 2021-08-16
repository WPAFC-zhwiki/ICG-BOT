import winston from 'winston';
import { Manager } from '../../init';
import { Context, rawmsg } from '../../lib/handlers/Context';
import { BridgeMsg } from './BridgeMsg';
import { EventArgument } from 'lib/event';

function checkEnable(): void {
	if ( !Manager.global.isEnable( 'transport' ) ) {
		throw new ReferenceError( 'Module transport isn\'t enable!' );
	}
}

// eslint-disable-next-line max-len
export type processor = ( msg: BridgeMsg, { withNick, isNotice }: { withNick: boolean, isNotice: boolean } ) => Promise<void>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type hook = ( ...args: any[] ) => Promise<any>;

export interface hooks extends Record<string, hook> {
	'bridge.receive': ( msg: BridgeMsg ) => Promise<void>;
	'bridge.send': ( msg: BridgeMsg ) => Promise<void>;
	'bridge.sent': ( msg: BridgeMsg ) => Promise<void>;
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

function getBridgeMsg<T extends rawmsg>( msg: BridgeMsg<T> | Context<T> ): BridgeMsg<T> {
	if ( msg instanceof BridgeMsg ) {
		return msg;
	} else {
		return new BridgeMsg<T>( msg );
	}
}

export function prepareBridgeMsg( msg: BridgeMsg ): Promise<void>;
export function prepareBridgeMsg( msg: Context ): void;
export function prepareBridgeMsg( msg: Context ): Promise<void> | void {
	if ( Object.prototype.hasOwnProperty.call( msg.extra, 'mapto' ) ) {
		return Promise.resolve();
	}

	// 檢查是否有傳送目標
	const to_uid = BridgeMsg.getUIDFromContext( msg, msg.to );
	const alltargets = map[ to_uid ];
	const targets = [];
	for ( const t in alltargets ) {
		if ( !alltargets[ t ].disabled ) {
			targets.push( t );
		}
	}

	// 向 msg 中加入附加訊息
	msg.extra.clients = targets.length + 1;
	msg.extra.mapto = targets;
	if ( aliases[ to_uid ] ) {
		msg.extra.clientName = aliases[ to_uid ];
	} else {
		msg.extra.clientName = {
			shortname: msg.handler.id,
			fullname: msg.handler.type
		};
	}

	if ( msg instanceof BridgeMsg ) {
		return emitHook( 'bridge.send', msg );
	}
}

// eslint-disable-next-line no-shadow
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

export async function emitHook<V extends keyof hooks>( event: V, ...args: EventArgument<hooks[V]> ): Promise<void> {
	checkEnable();

	if ( hooks[ event ] ) {
		winston.debug( `[transport/bridge] emit hook: ${ event }` );
		// eslint-disable-next-line no-shadow, @typescript-eslint/no-unused-vars
		for ( const [ _priority, hook ] of hooks[ event ] ) {
			await hook( ...args );
		}
	}
}

function sendMessage( msg: BridgeMsg, isbridge = false ): Promise<void>[] {
	const withNick = !!msg.withNick;
	const isNotice = !!msg.isNotice;
	const currMsgId = msg.msgId;

	// 全部訊息已傳送 resolve( true )，部分訊息已傳送 resolve( false )；
	// 所有訊息被拒絕傳送 reject()
	// Hook 需自行處理異常
	// 向對應目標的 handler 觸發 exchange
	const promises: Promise<void>[] = [];
	for ( const t of msg.extra.mapto ) {
		const msg2 = new BridgeMsg( msg, {
			to_uid: t,
			rawFrom: msg.from_uid,
			rawTo: msg.to_uid
		} );
		const new_uid = BridgeMsg.parseUID( t );
		const client = new_uid.client;

		const msgid = `#${ msg2.msgId } (from: #${ currMsgId })`;

		if ( isbridge ) {
			promises.push( emitHook( 'bridge.receive', msg2 ).then( function () {
				// eslint-disable-next-line no-shadow
				const processor = processors.get( client );
				if ( processor ) {
					winston.debug( `[transport/bridge] <BotTransport> ${ msgid } ---> ${ new_uid.uid }` );
					return processor( msg2, { withNick, isNotice } );
				} else {
					winston.debug( `[transport/bridge] <BotTransport> ${ msgid } -X-> ${ new_uid.uid }: No processor` );
				}
			} ) );
		} else {
			// eslint-disable-next-line no-shadow
			const processor = processors.get( client );
			if ( processor ) {
				winston.debug( `[transport/bridge] <BotSend> ${ msgid } ---> ${ new_uid.uid }` );
				promises.push( processor( msg2, { withNick, isNotice } ) );
			} else {
				winston.debug( `[transport/bridge] <BotSend> ${ msgid } -X-> ${ new_uid.uid }: No processor` );
			}
		}
	}

	return promises;
}

export async function send( m: BridgeMsg | Context, bot?: symbol ): Promise<boolean> {
	checkEnable();

	const msg: BridgeMsg = getBridgeMsg( m );

	const currMsgId: number = msg.msgId;

	let isbridge: boolean;

	if ( bot === Manager.global.bot ) {
		delete msg.extra.username; // 刪掉讓日誌變混亂的username

		isbridge = false;
		winston.debug( `[transport/bridge] <BotSend> #${ currMsgId } ---> ${ msg.to_uid }: ${ msg.text }` );
		const extraJson: string = JSON.stringify( msg.extra );
		if ( extraJson !== 'null' && extraJson !== '{}' ) {
			winston.debug( `[transport/bridge] <BotSend> #${ currMsgId } extra: ${ extraJson }` );
		}
	} else {
		isbridge = true;
		winston.debug( `[transport/bridge] <UserSend> #${ currMsgId } ${ msg.from_uid } ---> ${ msg.to_uid }: ${ msg.text }` );
		const extraJson: string = JSON.stringify( msg.extra );
		if ( extraJson !== 'null' && extraJson !== '{}' ) {
			winston.debug( `[transport/bridge] <UserSend> #${ currMsgId } extra: ${ extraJson }` );
		}

		if ( String( msg.from_uid ).match( /undefined|null/ ) || String( msg.to_uid ).match( /undefined|null/ ) ) {
			throw new TypeError( `Can't not send Msg #${ currMsgId } where target is null or undefined.` );
		}
	}

	try {
		await prepareBridgeMsg( msg );
	} catch ( e ) {
		return;
	}

	let allresolved = false;

	const promises = sendMessage( msg, isbridge );

	try {
		await Promise.all( promises );
	} catch ( e ) {
		allresolved = false;
		winston.error( '[transport/bridge] <BotSend> Rejected: ', e );
	}

	emitHook( 'bridge.sent', msg );
	if ( promises.length > 0 ) {
		winston.debug( `[transport/bridge] <BotSend> #${ currMsgId } done.` );
	} else {
		winston.debug( `[transport/bridge] <BotSend> #${ currMsgId } has no targets. Ignored.` );
	}
	return await Promise.resolve( allresolved );
}
