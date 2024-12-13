import fs from 'node:fs';
import path from 'node:path';

import winston from 'winston';

import isTSMode from '__isTSMode__';

winston.debug( '[afc] Loading commands:' );

const checkExtension = isTSMode ? '.mts' : '.mjs';

// eslint-disable-next-line security/detect-non-literal-fs-filename
const commandFiles = fs
	.readdirSync( path.join( import.meta.dirname, 'afc/commands' ) )
	.filter( ( file ) => path.extname( file ) === checkExtension );

for ( const file of commandFiles ) {
	await import( `@app/modules/afc/commands/${ file }` );
	winston.debug( `[afc] - ${ path.parse( file ).name }` );
}

winston.debug( '[afc] Loading events:' );

// eslint-disable-next-line security/detect-non-literal-fs-filename
const eventFiles = fs
	.readdirSync( path.join( import.meta.dirname, 'afc/events' ) )
	.filter( ( file ) => path.extname( file ) === checkExtension );

for ( const file of eventFiles ) {
	await import( `@app/modules/afc/events/${ file }` );
	winston.debug( `[afc] - ${ path.parse( file ).name }` );
}

import { checkRegister } from '@app/modules/afc/util.mjs';

checkRegister();
