/**
 * AFC-ICG-BOT
 * https://github.com/sunny00217wm/AFC-zhwiki-ICG-Bot
 */
import moduleAlias from 'module-alias';
moduleAlias.addPath( __dirname );

import winston = require( 'winston' );

import { Manager } from 'init';
import 'lib/message';

/**
 * 載入擴充套件
 */
winston.info( '' );
winston.info( 'Loading modules...' );
for ( const module of Manager.config.modules ) {
	try {
		winston.info( `Loading module: ${ module }` );
		require( `./modules/${ module }` );
	} catch ( ex ) {
		winston.error( `Error while loading plugin ${ module }: `, ex );
	}
}

if ( !Manager.config.modules || Manager.config.modules.length === 0 ) {
	winston.info( 'No modules loaded.' );
}
