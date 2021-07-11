import winston from 'winston';
import { Manager } from '../../init';
import { Context } from '../../lib/handlers/Context';
import { BridgeMsg } from './BridgeMsg';

function checkEnable(): void {
	if ( !Manager.global.isEnable( 'transport' ) ) {
		throw new ReferenceError( 'Module transport isn\'t enable!' );
	}
}

export type processor = ( msg: BridgeMsg, noPrefix?: boolean ) => Promise<void>;

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

export const aliases: Record<string, {
	shortname: string,
	fullname: string
}> = {};

function getBridgeMsg( msg: BridgeMsg | Context ): BridgeMsg {
	if ( msg instanceof BridgeMsg ) {
		return msg;
	} else {
		return new BridgeMsg( msg );
	}
}

function prepareMsg( msg: BridgeMsg ): Promise<void> {
	// 檢查是否有傳送目標
	const alltargets = map[ BridgeMsg.parseUID( msg.to_uid ).uid ];
	const targets = [];
	for ( const t in alltargets ) {
		if ( !alltargets[ t ].disabled ) {
			targets.push( t );
		}
	}

	// 向 msg 中加入附加訊息
	msg.extra.clients = targets.length + 1;
	msg.extra.mapto = targets;
	if ( aliases[ msg.to_uid ] ) {
		msg.extra.clientName = aliases[ msg.to_uid ];
	} else {
		msg.extra.clientName = {
			shortname: msg.handler.id,
			fullname: msg.handler.type
		};
	}

	return emitHook( 'bridge.send', msg );
}

// eslint-disable-next-line no-shadow
export function addProcessor( type: string, processor: processor ): void {
	processors.set( type, processor );
}

export function deleteProcessor( type: string ): void {
	processors.delete( type );
}

export function addHook<key extends keyof hooks>( event: key, func: hooks[ key ], priority = 100 ): void {
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

export async function emitHook( event: string, msg: BridgeMsg ): Promise<void> {
	checkEnable();

	if ( hooks[ event ] ) {
		winston.debug( `[transport/bridge.js] emit hook: ${ event }` );
		// eslint-disable-next-line no-shadow, @typescript-eslint/no-unused-vars
		for ( const [ _priority, hook ] of hooks[ event ] ) {
			await hook( msg );
		}
	}
}

export async function send( m: BridgeMsg | Context ): Promise<boolean> {
	checkEnable();

	const msg: BridgeMsg = getBridgeMsg( m );

	const currMsgId: number = msg.msgId;
	winston.debug( `[transport/bridge.js] <UserSend> #${ currMsgId } ${ msg.from_uid } ---> ${ msg.to_uid }: ${ msg.text }` );
	const extraJson: string = JSON.stringify( msg.extra );
	if ( extraJson !== 'null' && extraJson !== '{}' ) {
		winston.debug( `[transport/bridge.js] <UserSend> #${ currMsgId } extra: ${ extraJson }` );
	}
	const noPrefix = !!msg.extra.noPrefix;

	await prepareMsg( msg );

	// 全部訊息已傳送 resolve( true )，部分訊息已傳送 resolve( false )；
	// 所有訊息被拒絕傳送 reject()
	// Hook 需自行處理異常
	// 向對應目標的 handler 觸發 exchange
	const promises: Promise<void>[] = [];
	let allresolved = true;
	for ( const t of msg.extra.mapto ) {
		const msg2 = new BridgeMsg( msg, {
			to_uid: t,
			rawFrom: msg.from_uid,
			rawTo: msg.to_uid
		} );
		const new_uid = BridgeMsg.parseUID( t );
		const client = new_uid.client;

		promises.push( emitHook( 'bridge.receive', msg2 ).then( function () {
			// eslint-disable-next-line no-shadow
			const processor = processors.get( client );
			if ( processor ) {
				winston.debug( `[transport/bridge.js] <BotTransport> #${ currMsgId } ---> ${ new_uid.uid }` );
				return processor( msg2, noPrefix );
			} else {
				winston.debug( `[transport/bridge.js] <BotTransport> #${ currMsgId } -X-> ${ new_uid.uid }: No processor` );
			}
		} ) );
	}
	try {
		await Promise.all( promises );
	} catch ( e ) {
		allresolved = false;
		winston.error( '[transport/bridge.js] <BotSend> Rejected: ', e );
	}
	emitHook( 'bridge.sent', msg );
	if ( promises.length > 0 ) {
		winston.debug( `[transport/bridge.js] <BotSend> #${ currMsgId } done.` );
	} else {
		winston.debug( `[transport/bridge.js] <BotSend> #${ currMsgId } has no targets. Ignored.` );
	}
	return await Promise.resolve( allresolved );
}
