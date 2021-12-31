import winston = require( 'winston' );

import { Manager } from 'src/init';
import { Context } from 'src/lib/handlers/Context';
import { parseUID, getUIDFromContext } from 'src/lib/message/uid';

type commandTS = {
	options: {
		disables: string[],
		enables?: string[]
	},
	callback: ( msg: Context ) => void;
};

const commands: Map<string, commandTS> = new Map();

const clientFullNames = {};
for ( const [ type, handler ] of Manager.handlers ) {
	clientFullNames[ handler.id.toLowerCase() ] = type;
	clientFullNames[ type.toLowerCase() ] = type;
}

export function addCommand( command: string, callback: ( msg: Context ) => void, opts: {
	allowedClients?: string[];
	disallowedClients?: string[];
	enables?: string[];
	disables?: string[];
} = {} ): void {
	const clients: string[] = [];
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
			if ( !disallowedClients.includes( type.toLowerCase() ) ) {
				clients.push( type.toLowerCase() );
			}
		}
	}

	if ( !commands.has( command ) ) {
		for ( const client of clients ) {
			if ( clientFullNames[ client ] && Manager.handlers.has( clientFullNames[ client ] ) ) {
				Manager.handlers.get<'IRC'|'Telegram'|'Discord'>( clientFullNames[ client ] ).addCommand( command, emitCommand );
			} else {
				winston.info( `[command] Can't bind "${ command }" to client ${ clientFullNames[ client ] }: You didn't enable it.` );
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
			const client = parseUID( group );
			if ( client.uid ) {
				options.enables.push( client.uid );
			}
		}
	} else if ( opts.disables ) {
		for ( const group of opts.disables ) {
			const client = parseUID( group );
			if ( client.uid ) {
				options.disables.push( client.uid );
			}
		}
	}

	const cmd: commandTS = {
		options: options,
		callback
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

function emitCommand( context: Context, cmd: string ) {
	const Fcmd = commands.get( cmd );
	const { disables, enables } = Fcmd.options;
	let func: ( msg: Context ) => void = null;

	const to_uid = getUIDFromContext( context, context.to );

	// 判斷當前群組是否在處理範圍內
	if ( disables.includes( to_uid ) ) {
		winston.debug( `[command] Msg #${ context.msgId } command ignored (in disables).` );
	}

	if ( !enables || ( enables && enables.includes( to_uid ) ) ) {
		func = Fcmd.callback;
	} else {
		winston.debug( `[command] Msg #${ context.msgId } command ignored (not in enables).` );
	}

	if ( func && ( typeof func === 'function' ) ) {
		winston.debug( `[command] Msg #${ context.msgId } command: ${ cmd }` );
		func( context );
	}
}
