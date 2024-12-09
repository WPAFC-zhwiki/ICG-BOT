import path = require( 'node:path' );

import moduleAlias = require( 'module-alias' );

moduleAlias.addAliases( {
	'@app': __dirname,
	'@config': path.join( __dirname, '../config' ),
	'@package.json': path.join( __dirname, '../package.json' ),
} );
