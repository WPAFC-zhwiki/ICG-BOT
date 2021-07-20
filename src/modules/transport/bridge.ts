import winston from 'winston';
import { Manager } from '../../init';
import { Context } from '../../lib/handlers/Context';
import { BridgeMsg } from './BridgeMsg';

function checkEnable(): void {
	if ( !Manager.global.isEnable( 'transport' ) ) {
		throw new ReferenceError( 'Module transport isn\'t enable!' );
	}
}

// eslint-disable-next-line max-len
export type processor = ( msg: BridgeMsg, { noPrefix, isNotice }: { noPrefix: boolean, isNotice: boolean } ) => Promise<void>;

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

function getBridgeMsg( msg: BridgeMsg | Context ): BridgeMsg {
	if ( msg instanceof BridgeMsg ) {
		return msg;
	} else {
		return new BridgeMsg( msg );
	}
}

export function prepareBridgeMsg( msg: BridgeMsg ): Promise<void> {
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
		winston.debug( `[transport/bridge] emit hook: ${ event }` );
		// eslint-disable-next-line no-shadow, @typescript-eslint/no-unused-vars
		for ( const [ _priority, hook ] of hooks[ event ] ) {
			await hook( msg );
		}
	}
}

function sendMessage( msg: BridgeMsg, isbridge = false ): Promise<void>[] {
	const noPrefix = !!msg.extra.noPrefix;
	const isNotice = !!msg.extra.isNotice;
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

		if ( isbridge ) {
			promises.push( emitHook( 'bridge.receive', msg2 ).then( function () {
				// eslint-disable-next-line no-shadow
				const processor = processors.get( client );
				if ( processor ) {
					winston.debug( `[transport/bridge] <BotTransport> #${ currMsgId } ---> ${ new_uid.uid }` );
					return processor( msg2, { noPrefix, isNotice } );
				} else {
					winston.debug( `[transport/bridge] <BotTransport> #${ currMsgId } -X-> ${ new_uid.uid }: No processor` );
				}
			} ) );
		} else {
			// eslint-disable-next-line no-shadow
			const processor = processors.get( client );
			if ( processor ) {
				winston.debug( `[transport/bridge] <BotSend> #${ currMsgId } ---> ${ new_uid.uid }` );
				promises.push( processor( msg2, { noPrefix, isNotice } ) );
			} else {
				winston.debug( `[transport/bridge] <BotSend> #${ currMsgId } -X-> ${ new_uid.uid }: No processor` );
			}
		}
	}

	return promises;
}

export async function send( m: BridgeMsg | Context ): Promise<boolean> {
	checkEnable();

	const msg: BridgeMsg = getBridgeMsg( m );

	const currMsgId: number = msg.msgId;
	winston.debug( `[transport/bridge] <UserSend> #${ currMsgId } ${ msg.from_uid } ---> ${ msg.to_uid }: ${ msg.text }` );
	const extraJson: string = JSON.stringify( msg.extra );
	if ( extraJson !== 'null' && extraJson !== '{}' ) {
		winston.debug( `[transport/bridge] <UserSend> #${ currMsgId } extra: ${ extraJson }` );
	}

	if ( String( msg.from_uid ).match( /undefined|null/ ) || String( msg.to_uid ).match( /undefined|null/ ) ) {
		throw new TypeError( `Can't not send Msg #${ currMsgId } where target is null or undefined.` );
	}

	await prepareBridgeMsg( msg );

	let allresolved = false;

	const promises = sendMessage( msg, true );

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

export function reply( context: BridgeMsg | Context, text: string, { isNotice, noPrefix }: {
	isNotice?: boolean;
	noPrefix?: boolean;
} = {} ): void {
	isNotice = !!isNotice;
	noPrefix = !!noPrefix;

	winston.debug( `[transport/bridge] <CommandReply> #${ context.msgId }: ${ text }` );

	context.handler.reply( context, text );

	const msg2 = new BridgeMsg( context, {
		text: text,
		rawFrom: context.from,
		rawTo: context.to,
		isNotice: isNotice,
		noPrefix: noPrefix
	} );

	winston.debug( `[transport/bridge] <CommandReplyTransport> #${ context.msgId } ---> #${ msg2.msgId }: ${ text }` );

	Manager.global.ifEnable( 'transport', function () {
		Promise.all( sendMessage( msg2 ) ).catch( function ( e ) {
			winston.error( '[transport/bridge] <BotSend> Rejected: ', e );
		} );
	} );
}
