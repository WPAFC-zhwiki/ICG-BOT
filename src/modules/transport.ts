/*
 * 互聯機器人
 */

import winston = require( 'winston' );

import { Manager } from 'src/init';
import { BridgeMsg } from 'src/modules/transport/BridgeMsg';
import * as bridge from 'src/modules/transport/bridge';
import 'src/modules/transport/file';
import 'src/modules/transport/paeeye';

export * from 'src/modules/transport/BridgeMsg';
export * from 'src/modules/transport/bridge';
export * from 'src/modules/transport/command';

const options = Manager.config.transport;

BridgeMsg.setHandlers( Manager.handlers );

export const handlers = Manager.handlers;

/*
		理清各群之間的關係：根據已知資料，建立一對一的關係（然後將 disable 的關係去除），便於查詢。例如：

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

Manager.global.ifEnable( 'transport', function () {
	const groups = options.groups || [];

	Object.keys( groups ).forEach( function ( group ) {
		// 建立聯繫
		Object.keys( group ).forEach( function ( c1 ) {
			const client1 = BridgeMsg.parseUID( c1 ).uid;

			if ( client1 ) {
				for ( const c2 of group ) {
					const client2 = BridgeMsg.parseUID( c2 ).uid;
					if ( client1 === client2 ) {
						continue;
					}
					if ( !map[ client1 ] ) {
						map[ client1 ] = {};
					}

					map[ client1 ][ client2 ] = {
						disabled: false
					};
				}
			}
		} );
	} );

	// 移除被禁止的聯繫
	const disables = options.disables || {};
	Object.keys( disables ).forEach( function ( c1 ) {
		const client1 = BridgeMsg.parseUID( c1 ).uid;

		if ( client1 && map[ client1 ] ) {
			let list = disables[ c1 ];
			if ( typeof list === 'string' ) {
				list = [ list ];
			}

			for ( const c2 of list ) {
				const client2 = BridgeMsg.parseUID( c2 ).uid;
				if ( map[ client1 ][ client2 ] ) {
					map[ client1 ][ client2 ].disabled = true;
				}
			}
		}
	} );

	// 调试日志
	winston.debug( '' );
	winston.debug( '[transport] Bridge Map:' );
	Object.keys( map ).forEach( function ( client1 ) {
		Object.keys( map[ client1 ] ).forEach( function ( client2 ) {
			if ( map[ client1 ][ client2 ].disabled ) {
				winston.debug( `\t${ client1 } -X-> ${ client2 }` );
			} else {
				winston.debug( `\t${ client1 } ---> ${ client2 }` );
			}
		} );
	} );

	/**
	 * 用戶端別名
	 */
	const aliases: Record<string, bridge.alias> = {};

	// 處理用戶端別名
	Object.keys( options.aliases ).forEach( function ( a ) {
		const cl = BridgeMsg.parseUID( a ).uid;
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
				fullname
			};
		}
	} );

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
	for ( const [ type ] of Manager.handlers ) {
	// eslint-disable-next-line @typescript-eslint/no-var-requires
		const processor: bridge.processor = require( `./transport/processors/${ type }` ).default;
		winston.debug( `[transport] load processor ${ type }` );
		bridge.addProcessor( type, processor );
	}
} );
