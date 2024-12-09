import winston = require( 'winston' );

import { Manager } from '@app/init';

export { default as hook, default as messageManage } from '@app/lib/message/messageManage';
export * from '@app/lib/message/command';
export * from '@app/lib/message/uid';

for ( const [ type ] of Manager.handlers ) {
	// eslint-disable-next-line security/detect-non-literal-require, @typescript-eslint/no-require-imports
	require( `@app/lib/message/processors/${ type }` );
	winston.debug( `[message] load processor ${ type }` );
}
