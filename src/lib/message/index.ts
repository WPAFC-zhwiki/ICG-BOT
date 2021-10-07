import winston = require( 'winston' );

import { Manager } from 'src/init';

export { default as hook, default as msgManage } from 'src/lib/message/msgManage';
export * from 'src/lib/message/command';
export * from 'src/lib/message/uid';

for ( const [ type ] of Manager.handlers ) {
	require( `src/lib/message/processors/${ type }` );
	winston.debug( `[message] load processor ${ type }` );
}
