import winston = require( 'winston' );
import { Manager } from '../../init';
import * as bridge from './bridge';
import { BridgeMsg } from './BridgeMsg';

type commandTS = {
	options: {
		disables: string[],
		enables?: string[]
	},
	callbacks: Record<string, bridge.hook>
};

const commands: Map<string, commandTS> = new Map();
const commands_telegram: Map<string, commandTS> = new Map();

const clientFullNames = {};
for ( const [ type, handler ] of Manager.handlers ) {
	clientFullNames[ handler.id.toLowerCase() ] = type;
	clientFullNames[ type.toLowerCase() ] = type;
}

function getNameForTelegram( cmd: string ) {
	return cmd.replace( /[^A-Za-z0-9_]/gu, '' );
}

export function addCommand( command: string, callbacks:
Record<string, bridge.hook> | ( ( msg: BridgeMsg ) => Promise<void> ), opts: {
	allowedClients?: string[];
	disallowedClients?: string[];
	enables?: string[];
	disables?: string[];
} = {} ): void {
	let cb: Record<string, bridge.hook>;

	if ( typeof callbacks === 'object' ) {
		cb = callbacks;
	} else {
		cb = { sent: callbacks };
	}

	const clients = [];
	if ( opts.allowedClients ) {
		for ( const client of opts.allowedClients ) {
			clients.push( client.toString().toLowerCase() );
		}
	} else {
		const disallowedClients = [];
		for ( const client of ( opts.disallowedClients || [] ) ) {
			disallowedClients.push( client.toString().toLowerCase() );
		}

		for ( const [ type ] of Manager.handlers ) {
			if ( disallowedClients.indexOf( type.toLowerCase() ) === -1 ) {
				clients.push( type.toLowerCase() );
			}
		}
	}

	if ( !commands.has( command ) ) {
		for ( const client of clients ) {
			if ( clientFullNames[ client ] && Manager.handlers.has( clientFullNames[ client ] ) ) {
				Manager.handlers.get( clientFullNames[ client ] ).addCommand( command );
			}
		}
	}

	const options: {
		enables?: string[];
		disables: string[];
	} = {
		disables: []
	};

	if ( opts.enables ) {
		options.enables = [];
		for ( const group of opts.enables ) {
			const client = BridgeMsg.parseUID( group );
			if ( client.uid ) {
				options.enables.push( client.uid );
			}
		}
	} else if ( opts.disables ) {
		for ( const group of opts.disables ) {
			const client = BridgeMsg.parseUID( group );
			if ( client.uid ) {
				options.disables.push( client.uid );
			}
		}
	}

	const cmd: commandTS = {
		options: options,
		callbacks: cb
	};

	commands.set( command, cmd );
	commands_telegram.set( getNameForTelegram( command ), cmd );
}

export function deleteCommand( command: string ): void {
	if ( commands.has( command ) ) {
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		for ( const [ _type, handler ] of Manager.handlers ) {
			handler.deleteCommand( command );
		}
		commands.delete( command );
		commands_telegram.delete( getNameForTelegram( command ) );
	}
}

export function getCommand( command: string ): commandTS {
	return commands.get( command );
}

function getCmd( msg: BridgeMsg ) {
	// Telegram 需要特殊處理
	if ( msg.handler.type === 'Telegram' ) {
		return commands_telegram.get( msg.command );
	} else {
		return commands.get( msg.command );
	}
}

function sethook( event: string ) {
	return function ( msg: BridgeMsg ) {
		if ( msg.command ) {
			const cmd = getCmd( msg );

			if ( !cmd ) {
				return Promise.resolve();
			}

			const { disables, enables } = cmd.options;
			let func: bridge.hook = null;

			// 判斷當前群組是否在處理範圍內
			if ( disables.indexOf( msg.to_uid ) !== -1 ) {
				winston.debug( `[transport/command] Msg #${ msg.msgId } command ignored (in disables).` );
				return Promise.resolve();
			}

			if ( !enables || ( enables && enables.indexOf( msg.to_uid ) !== -1 ) ) {
				func = cmd.callbacks[ event ];
			} else {
				winston.debug( `[transport/command] Msg #${ msg.msgId } command ignored (not in enables).` );
			}

			if ( func && ( typeof func === 'function' ) ) {
				winston.debug( `[transport/command] Msg #${ msg.msgId } command: ${ msg.command }` );
				return func( msg );
			} else {
				return Promise.resolve();
			}
		}
	};
}

Manager.global.ifEnable( 'transport', function () {
	bridge.addHook( 'bridge.send', sethook( 'send' ) );
	bridge.addHook( 'bridge.receive', sethook( 'receive' ) );
	bridge.addHook( 'bridge.sent', sethook( 'sent' ) );
} );
