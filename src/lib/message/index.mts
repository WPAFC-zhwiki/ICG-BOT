import winston from 'winston';

import { Manager } from '@app/init.mjs';

export { default as hook, default as messageManage } from '@app/lib/message/messageManage.mjs';
export * from '@app/lib/message/command.mjs';
export * from '@app/lib/message/uid.mjs';

for ( const [ type ] of Manager.handlers ) {
	await import( `@app/lib/message/processors/${ type }.mjs` );
	winston.debug( `[message] load processor ${ type }` );
}
