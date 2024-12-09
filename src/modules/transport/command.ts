import winston = require( 'winston' );

import { Manager } from '@app/init';

import * as bridge from '@app/modules/transport/bridge';
import { BridgeMessage } from '@app/modules/transport/BridgeMessage';

type commandTS = {
	options: {
		disables: string[],
		enables?: string[]
	},
	callbacks: Record<string, bridge.hook>
};

const commands: Map<string, commandTS> = new Map();

const clientFullNames = {};
for ( const [ type, handler ] of Manager.handlers ) {
	clientFullNames[ handler.id.toLowerCase() ] = type;
	clientFullNames[ type.toLowerCase() ] = type;
}

export function addCommand( command: string, callbacks:
Record<string, bridge.hook> | ( ( message: BridgeMessage ) => Promise<void> ), options_: {
	allowedClients?: string[];
	disallowedClients?: string[];
	enables?: string[];
	disables?: string[];
} = {} ): void {
	let callback: Record<string, bridge.hook>;

	callback = typeof callbacks === 'object' ? callbacks : { sent: callbacks };

	const clients = [];
	if ( options_.allowedClients ) {
		for ( const client of options_.allowedClients ) {
			clients.push( client.toString().toLowerCase() );
		}
	} else {
		const disallowedClients = [];
		for ( const client of ( options_.disallowedClients || [] ) ) {
			disallowedClients.push( client.toString().toLowerCase() );
		}

		for ( const [ type ] of Manager.handlers ) {
			if ( !disallowedClients.includes( type.toLowerCase() ) ) {
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
		disables: [],
	};

	if ( options_.enables ) {
		options.enables = [];
		for ( const group of options_.enables ) {
			const client = BridgeMessage.parseUID( group );
			if ( client.uid ) {
				options.enables.push( client.uid );
			}
		}
	} else if ( options_.disables ) {
		for ( const group of options_.disables ) {
			const client = BridgeMessage.parseUID( group );
			if ( client.uid ) {
				options.disables.push( client.uid );
			}
		}
	}

	const cmd: commandTS = {
		options: options,
		callbacks: callback,
	};

	commands.set( command, cmd );
}

export function deleteCommand( command: string ): void {
	if ( commands.has( command ) ) {
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		for ( const [ _type, handler ] of Manager.handlers ) {
			handler.deleteCommand( command );
		}
		commands.delete( command );
	}
}

export function getCommand( command: string ): commandTS {
	return commands.get( command );
}

function getCommandFromMessage( message: BridgeMessage ) {
	return commands.get( message.command );
}

function setHook( event: string ) {
	return function ( message: BridgeMessage ) {
		if ( message.command ) {
			const cmd = getCommandFromMessage( message );

			if ( !cmd ) {
				return Promise.resolve();
			}

			const { disables, enables } = cmd.options;
			let func: bridge.hook;

			// 判斷當前群組是否在處理範圍內
			if ( disables.includes( message.to_uid ) ) {
				winston.debug( `[transport/command] Message #${ message.msgId } command ignored (in disables).` );
				return Promise.resolve();
			}

			if ( !enables || ( enables && !enables.includes( message.to_uid ) ) ) {
				func = cmd.callbacks[ event ];
			} else {
				winston.debug( `[transport/command] Message #${ message.msgId } command ignored (not in enables).` );
			}

			if ( func && ( typeof func === 'function' ) ) {
				winston.debug( `[transport/command] Message #${ message.msgId } command: ${ message.command }` );
				return func( message );
			} else {
				return Promise.resolve();
			}
		}
	};
}

Manager.global.ifEnable( 'transport', function () {
	bridge.addHook( 'bridge.send', setHook( 'send' ) );
	bridge.addHook( 'bridge.receive', setHook( 'receive' ) );
	bridge.addHook( 'bridge.sent', setHook( 'sent' ) );
} );
