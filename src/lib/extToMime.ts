import mimeDb = require( 'mime-db' );

const extList = new Map<string, string>();

for ( const [ mime, value ] of Object.entries( mimeDb ) ) {
	if ( value.extensions && value.extensions.length > 0 ) {
		for ( const ext of value.extensions ) {
			extList.set( `.${ ext }`, mime );
		}
	}
}

export default extList;
