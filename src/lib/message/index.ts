import winston = require( 'winston' );

import { Manager } from '@app/init';

export { default as hook, default as msgManage } from '@app/lib/message/msgManage';
export * from '@app/lib/message/command';
export * from '@app/lib/message/uid';

for ( const [ type ] of Manager.handlers ) {
	require( `src/lib/message/processors/${ type }` );
	winston.debug( `[message] load processor ${ type }` );
}
