import { Manager } from '@app/init.mjs';

import { Context } from '@app/lib/handlers/Context.mjs';
import { MessageHandler } from '@app/lib/handlers/MessageHandler.mjs';

const clientFullNames: Record<string, string> = {};
for ( const [ type, handler ] of Manager.handlers ) {
	clientFullNames[ handler.id.toLowerCase() ] = type;
	clientFullNames[ type.toLowerCase() ] = type;
}

export function parseUID( u: string | false ): {
	client: string,
	id: string,
	uid: string
} | {
	client: undefined,
	id: undefined,
	uid: undefined
} {
	let client: string | undefined, id: string | undefined, uid: string | undefined;
	if ( u ) {
		const s: string = u.toString();
		const index: number = s.indexOf( '/' );

		if ( index !== -1 ) {
			client = s.slice( 0, index ).toLowerCase();
			if ( clientFullNames[ client ] ) {
				client = clientFullNames[ client ];
			}

			id = s.slice( index + 1 );
			uid = `${ client.toLowerCase() }/${ id }`;
		}
	}
	return { client, id, uid };
}

export function getUIDFromContext( context: Context, id: string | number ): string | false {
	if ( context.handler ) {
		return getUIDFromHandler( context.handler, id );
	}

	return false;
}

export function getUIDFromHandler( handler: MessageHandler, id: string | number ): string {
	return `${ handler.type.toLowerCase() }/${ id }`;
}
