/* eslint quote-props: ["error", "always"] */
/**
 * AFC-ICG-BOT
 * https://github.com/WPAFC-zhwiki/ICG-BOT
 */
import moduleAlias from 'module-alias';
import path = require( 'path' );
import winston = require( 'winston' );
import util = require( 'util' );

moduleAlias.addAliases( {
	'src': __dirname,
	'config': path.join( __dirname, '../config' ),
	'package.json': path.join( __dirname, '../package.json' )
} );

import { Manager } from 'src/init';
import 'src/lib/message';

/**
 * 載入擴充套件
 */
winston.info( '' );
winston.info( 'Loading modules...' );
for ( const module of Manager.config.modules ) {
	try {
		winston.info( `Loading module: ${ module }` );
		require( `src/modules/${ module }` );
	} catch ( error ) {
		winston.error( `Error while loading plugin ${ module }: `, util.inspect( error ) );
	}
}

if ( !Manager.config.modules || Manager.config.modules.length === 0 ) {
	winston.info( 'No modules loaded.' );
}
