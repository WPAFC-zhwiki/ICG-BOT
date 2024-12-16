import { deserializeError, errorConstructors } from 'serialize-error';
import tsNode from 'ts-node';

errorConstructors.set( 'TSError', tsNode.TSError );

export function throwError( errorData ) {
	const error = deserializeError( errorData );
	throw error;
}
