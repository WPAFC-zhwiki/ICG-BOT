/* eslint quote-props: ["error", "always"] */
/**
 * AFC-ICG-BOT
 * https://github.com/WPAFC-zhwiki/ICG-BOT
 */
import path = require( 'node:path' );

import winston = require( 'winston' );

// eslint-disable-next-line import/order
import './registerModuleAlias.js';

import { Manager } from '@app/init';

import '@app/lib/message';
import { inspect } from '@app/lib/util';

/**
 * 載入擴充套件
 */
winston.info( '' );
winston.info( 'Loading modules...' );
for ( const module of Manager.config.modules ) {
	let realPath: string;
	try {
		realPath = require.resolve( `@app/modules/${ module }` );
	} catch {
		// ignore
	}

	if ( /^\.\.($|[\\/])/.test( path.relative( path.join( __dirname, 'modules' ), realPath ) ) ) {
		winston.error( `Module ${ module } has been blocked because security reason. Module could only load from "${ path.join( __dirname, 'modules' ) + path.sep }".` );
		continue;
	}

	try {
		winston.info( `Loading module: ${ module }` );
		// eslint-disable-next-line security/detect-non-literal-require, @typescript-eslint/no-require-imports
		require( `@app/modules/${ module }` );
	} catch ( error ) {
		winston.error( `Error while loading plugin ${ module }: ` + inspect( error ) );
	}
}

if ( !Manager.config.modules || Manager.config.modules.length === 0 ) {
	winston.info( 'No modules loaded.' );
}
