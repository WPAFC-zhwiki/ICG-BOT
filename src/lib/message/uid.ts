import { Manager } from 'init';
import { Context } from 'lib/handlers/Context';

const clientFullNames = {};
for ( const [ type, handler ] of Manager.handlers ) {
	clientFullNames[ handler.id.toLowerCase() ] = type;
	clientFullNames[ type.toLowerCase() ] = type;
}

export function parseUID( u: string ): {
	client: string,
	id: string,
	uid: string
} {
	let client: string = null, id: string = null, uid: string = null;
	if ( u ) {
		const s = u.toString();
		const i = s.indexOf( '/' );

		if ( i !== -1 ) {
			client = s.substr( 0, i ).toLowerCase();
			if ( clientFullNames[ client ] ) {
				client = clientFullNames[ client ];
			}

			id = s.substr( i + 1 );
			uid = `${ client.toLowerCase() }/${ id }`;
		}
	}
	return { client, id, uid };
}

export function getUIDFromContext( context: Context, id: string | number ): string | null {
	if ( !context.handler ) {
		return null;
	}

	return `${ context.handler.type.toLowerCase() }/${ id }`;
}
