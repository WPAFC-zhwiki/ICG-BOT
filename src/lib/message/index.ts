export { default as hook } from 'lib/message/msgManage';
export * from 'lib/message/command';
export * from 'lib/message/uid';
import { Manager } from 'init';
import winston from 'winston';

for ( const [ type ] of Manager.handlers ) {
	require( `./processors/${ type }` );
	winston.debug( `[message] load processor ${ type }` );
}
