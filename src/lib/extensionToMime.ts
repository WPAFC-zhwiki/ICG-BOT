import mimeDatabase = require( 'mime-db' );

const extensionList = new Map<string, string>();

for ( const [ mime, value ] of Object.entries( mimeDatabase ) ) {
	if ( value.extensions && value.extensions.length > 0 ) {
		for ( const extension of value.extensions ) {
			extensionList.set( `.${ extension }`, mime );
		}
	}
}

export default extensionList;
