/* eslint quote-props: ["error", "always"] */
/**
 * AFC-ICG-BOT
 * https://github.com/WPAFC-zhwiki/ICG-BOT
 */
import path from 'node:path';

import winston from 'winston';

import { Manager } from '@app/init.mjs';

import '@app/lib/message.mjs';
import { inspect } from '@app/lib/util.mjs';

/**
 * 載入擴充套件
 */
winston.info( '' );
winston.info( 'Loading modules...' );
for ( const module of Manager.config.modules ) {
	let realPath: string;
	try {
		realPath = import.meta.resolve( `@app/modules/${ module }` );

		if ( /^\.\.($|[\\/])/.test( path.relative( path.join( import.meta.dirname, 'modules' ), realPath ) ) ) {
			winston.error( `Module ${ module } has been blocked because security reason. Module could only load from "${ path.join( import.meta.dirname, 'modules' ) + path.sep }".` );
			continue;
		}
	} catch {
		// ignore
	}

	try {
		winston.info( `Loading module: ${ module }` );
		await import( `@app/modules/${ module }.mjs` );
	} catch ( error ) {
		winston.error( `Error while loading plugin ${ module }: ` + inspect( error ) );
	}
}

if ( !Manager.config.modules || Manager.config.modules.length === 0 ) {
	winston.info( 'No modules loaded.' );
}
