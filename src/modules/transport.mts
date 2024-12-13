/*
 * 互聯機器人
 */

import winston from 'winston';

import { Manager } from '@app/init.mjs';

import * as bridge from '@app/modules/transport/bridge.mjs';
import { associateMessageUsefulClients } from '@app/modules/transport/BridgeDatabase.mjs';
import { BridgeMessage } from '@app/modules/transport/BridgeMessage.mjs';
import '@app/modules/transport/file.mjs';
import '@app/modules/transport/paeeye.mjs';

export * from '@app/modules/transport/BridgeMessage.mjs';
export * from '@app/modules/transport/bridge.mjs';
export * from '@app/modules/transport/command.mjs';

const options = Manager.config.transport;

BridgeMessage.setHandlers( Manager.handlers );

export const handlers = Manager.handlers;

/*
釐清各群之間的關係：根據已知資料，建立一對一的關係（然後將 disable 的關係去除），便於查詢。例如：

	map: {
		'irc/#channel1': {
			'qq/123123123': {
				disabled: false,
			},
			'telegram/-123123123': {
				disabled: false,
			}
		},
		'irc/#channel2': {
			...
		},
		'qq/123123123': {
			'irc/#channel1': {
				disabled: false,
			},
			...
		},
		...
	}
	 */
const map = bridge.map;

if ( Manager.global.isEnable( 'transport' ) ) {
	const groups = options.groups || [];

	for ( const group of groups ) {
		// 建立聯繫
		for ( const c1 of group ) {
			const client1 = BridgeMessage.parseUID( c1 ).uid;

			if ( client1 ) {
				for ( const c2 of group ) {
					const client2 = BridgeMessage.parseUID( c2 ).uid;
					if ( client1 === client2 ) {
						continue;
					}
					if ( !map[ client1 ] ) {
						map[ client1 ] = {};
					}

					map[ client1 ][ client2 ] = {
						disabled: false,
					};
				}
			}
		}
	}

	// 移除被禁止的聯繫
	const disables = options.disables || {};
	for ( const c1 of Object.keys( disables ) ) {
		const client1 = BridgeMessage.parseUID( c1 ).uid;

		if ( client1 && map[ client1 ] ) {
			let list = disables[ c1 ];
			if ( typeof list === 'string' ) {
				list = [ list ];
			}

			for ( const c2 of list ) {
				const client2 = BridgeMessage.parseUID( c2 ).uid;
				if ( map[ client1 ][ client2 ] ) {
					map[ client1 ][ client2 ].disabled = true;
				}
			}
		}
	}

	// 调试日志
	winston.debug( '' );
	winston.debug( '[transport] Bridge Map:' );
	for ( const client1 of Object.keys( map ) ) {
		for ( const client2 of Object.keys( map[ client1 ] ) ) {
			if ( map[ client1 ][ client2 ].disabled ) {
				winston.debug( `\t${ client1 } -X-> ${ client2 }` );
			} else {
				winston.debug( `\t${ client1 } ---> ${ client2 }` );
			}
		}
	}

	/**
	 * 用戶端別名
	 */
	const aliases: Record<string, bridge.alias> = {};

	// 處理用戶端別名
	for ( const a of Object.keys( options.aliases ) ) {
		const cl = BridgeMessage.parseUID( a ).uid;
		if ( cl ) {
			const names = options.aliases[ a ];
			let shortname: string;
			let fullname: string;

			if ( typeof names === 'string' ) {
				shortname = fullname = names;
			} else {
				shortname = names[ 0 ];
				fullname = names[ 1 ] || shortname;
			}

			aliases[ cl ] = {
				shortname,
				fullname,
			};
		}
	}

	bridge.setAliases( aliases );

	// 调试日志
	winston.debug( '' );
	winston.debug( '[transport] Aliases:' );
	let aliasesCount = 0;
	for ( const alias in aliases ) {
		winston.debug( `\t${ alias }: ${ aliases[ alias ].shortname } ---> ${ aliases[ alias ].fullname }` );
		aliasesCount++;
	}
	if ( aliasesCount === 0 ) {
		winston.debug( 'None' );
	}

	// 載入各用戶端的處理程式，並連接到 bridge 中
	let clientAssociateMessageUsefulCount = 0;
	for ( const [ type ] of Manager.handlers ) {
		if ( associateMessageUsefulClients.includes( type ) ) {
			clientAssociateMessageUsefulCount++;
		}
		// eslint-disable-next-line unicorn/no-await-expression-member
		const processor: bridge.processor = ( await import( `@app/transport/processors/${ type }.mjs` ) ).default;
		winston.debug( `[transport] load processor ${ type }` );
		bridge.addProcessor( type, processor );
	}

	if ( clientAssociateMessageUsefulCount ) {
		bridge.bridgeDatabase.isEnable = true;
	}
}
