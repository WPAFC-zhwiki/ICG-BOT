import winston = require( 'winston' );

import { Manager } from '@app/init';

import { Context } from '@app/lib/handlers/Context';
import { parseUID, getUIDFromContext } from '@app/lib/message/uid';

type commandTS = {
	options: {
		disables: string[],
		enables?: string[]
	},
	callback: ( message: Context ) => void;
};

const commands: Map<string, commandTS> = new Map();

const clientFullNames = {};
for ( const [ type, handler ] of Manager.handlers ) {
	clientFullNames[ handler.id.toLowerCase() ] = type;
	clientFullNames[ type.toLowerCase() ] = type;
}

export function addCommand(
	command: string | string[],
	callback: ( message: Context ) => void,
	options_: {
		allowedClients?: string[];
		disallowedClients?: string[];
		enables?: string[];
		disables?: string[];
	} = {}
): void {
	const clients: string[] = [];
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

	if ( !Array.isArray( command ) ) {
		command = [ command ];
	}
	for ( const c of command ) {
		if ( !commands.has( c ) ) {
			for ( const client of clients ) {
				if ( clientFullNames[ client ] && Manager.handlers.has( clientFullNames[ client ] ) ) {
					Manager.handlers.get<'IRC' | 'Telegram' | 'Discord'>( clientFullNames[ client ] ).addCommand( c, emitCommand );
				} else {
					winston.info( `[command] Can't bind "${ command }" to client ${ clientFullNames[ client ] }: You didn't enable it.` );
				}
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
			const client = parseUID( group );
			if ( client.uid ) {
				options.enables.push( client.uid );
			}
		}
	} else if ( options_.disables ) {
		for ( const group of options_.disables ) {
			const client = parseUID( group );
			if ( client.uid ) {
				options.disables.push( client.uid );
			}
		}
	}

	const cmd: commandTS = {
		options: options,
		callback,
	};

	for ( const c of command ) {
		commands.set( c, cmd );
	}
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

function emitCommand( context: Context, cmd: string ) {
	const fCmd = commands.get( cmd );
	const { disables, enables } = fCmd.options;
	let func: ( ( message: Context ) => void ) | undefined;

	const toUid = getUIDFromContext( context, context.to );

	// 判斷當前群組是否在處理範圍內
	if ( disables.includes( toUid as string ) ) {
		winston.debug( `[command] Message #${ context.msgId } command ignored (in disables).` );
	}

	if ( !enables || ( enables && enables.includes( toUid as string ) ) ) {
		func = fCmd.callback;
	} else {
		winston.debug( `[command] Message #${ context.msgId } command ignored (not in enables).` );
	}

	if ( func && ( typeof func === 'function' ) ) {
		winston.debug( `[command] Message #${ context.msgId } command: ${ cmd }` );
		func( context );
	}
}
