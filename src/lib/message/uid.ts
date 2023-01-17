import { Manager } from '@app/init';

import { Context } from '@app/lib/handlers/Context';
import { MessageHandler } from '@app/lib/handlers/MessageHandler';

const clientFullNames: Record<string, string> = {};
for ( const [ type, handler ] of Manager.handlers ) {
	clientFullNames[ handler.id.toLowerCase() ] = type;
	clientFullNames[ type.toLowerCase() ] = type;
}

export function parseUID( u: string ): {
	client: string,
	id: string,
	uid: string
} | {
	client: null,
	id: null,
	uid: null
} {
	let client: string = null, id: string = null, uid: string = null;
	if ( u ) {
		const s: string = u.toString();
		const i: number = s.indexOf( '/' );

		if ( i !== -1 ) {
			client = s.slice( 0, i ).toLowerCase();
			if ( clientFullNames[ client ] ) {
				client = clientFullNames[ client ];
			}

			id = s.slice( i + 1 );
			uid = `${ client.toLowerCase() }/${ id }`;
		}
	}
	return { client, id, uid };
}

export function getUIDFromContext( context: Context, id: string | number ): string | null {
	if ( !context.handler ) {
		return null;
	}

	return getUIDFromHandler( context.handler, id );
}

export function getUIDFromHandler( handler: MessageHandler, id: string | number ): string | null {
	return `${ handler.type.toLowerCase() }/${ id }`;
}
