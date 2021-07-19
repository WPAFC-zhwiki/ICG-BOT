/*
 * 互聯機器人
 */

import { Manager } from 'init';
import winston = require( 'winston' );

import { BridgeMsg } from './transport/BridgeMsg.js';
export { BridgeMsg } from './transport/BridgeMsg.js';

import * as bridge from './transport/bridge';
export * from './transport/bridge';
export * from './transport/command';
import './transport/file';
import './transport/paeeye';

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

	for ( const group of groups ) {
	// 建立聯繫
		for ( const c1 of group ) {
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
		}
	}

	// 移除被禁止的聯繫
	const disables = options.disables || {};
	for ( const c1 in disables ) {
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
	}

	// 调试日志
	winston.debug( '' );
	winston.debug( '[transport.js] Bridge Map:' );
	for ( const client1 in map ) {
		for ( const client2 in map[ client1 ] ) {
			if ( map[ client1 ][ client2 ].disabled ) {
				winston.debug( `${ client1 } -X-> ${ client2 }` );
			} else {
				winston.debug( `${ client1 } ---> ${ client2 }` );
			}
		}
	}

	/**
	 * 用戶端別名
	 */
	const aliases: Record<string, bridge.alias> = {};

	// 處理用戶端別名
	for ( const a in options.aliases ) {
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
	}

	bridge.setAliases( aliases );

	// 调试日志
	winston.debug( '' );
	winston.debug( '[transport.js] Aliases:' );
	let aliasesCount = 0;
	for ( const alias in aliases ) {
		winston.debug( `${ alias }: ${ aliases[ alias ].shortname } ---> ${ aliases[ alias ].fullname }` );
		aliasesCount++;
	}
	if ( aliasesCount === 0 ) {
		winston.debug( 'None' );
	}

	// 載入各用戶端的處理程式，並連接到 bridge 中
	for ( const [ type ] of Manager.handlers ) {
	// eslint-disable-next-line @typescript-eslint/no-var-requires
		const processor: bridge.processor = require( `./transport/processors/${ type }.js` ).default;
		winston.debug( `[transport.js] load processor ${ type }` );
		bridge.addProcessor( type, processor );
	}
} );
