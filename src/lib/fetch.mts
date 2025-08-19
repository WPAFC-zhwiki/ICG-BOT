import {
	setGlobalDispatcher,
	Agent,
	fetch as internalFetch,
	Request,
	Response,
	type RequestInfo,
	type RequestInit,
	type BodyMixin
} from 'undici';
import undiciPackageJson from 'undici/package.json' with { type: 'json' };

import { Manager } from '@app/init.mjs';

setGlobalDispatcher(
	new Agent( {
		allowH2: true,
	} )
);

// patch RequestInit to match global fetch's options
declare module 'undici' {
	interface RequestInit {
		cache?: RequestCache;
	}
}

export const defaultFetchUserAgent = `${ Manager.baseUserAgent } undici/${ undiciPackageJson.version }`;

const defaultTimeout = 20_000;

const timeoutAttached = Symbol( 'TimeoutAttached' );

export function signalAttachTimeout( signal?: AbortSignal, timeout: number = defaultTimeout ): AbortSignal {
	if ( signal && timeoutAttached in signal ) {
		return signal;
	}
	let timeoutSignal = AbortSignal.timeout( timeout );
	timeoutSignal = signal ? AbortSignal.any( [ signal, timeoutSignal ] ) : timeoutSignal;
	Object.defineProperty( timeoutSignal, timeoutAttached, {
		value: true,
		enumerable: false,
	} );
	return timeoutSignal;
}

class RequestWrapper extends Request {
	public constructor( input: RequestInfo, init?: RequestInit ) {
		init = init || {};
		if ( !( input instanceof Request ) ) {
			init.referrer = init.referrer || '';
			init.signal = init.signal || AbortSignal.timeout( 15_000 );
			if ( !( init.signal instanceof AbortSignal ) ) {
				// RequestInit: Expected signal ("AbortSignal {}") to be an instance of AbortSignal.
				init.signal = AbortSignal.any( [ init.signal ] );
			}
			if ( init.body && !init.duplex ) {
				// patch
				init.duplex = 'half';
			}
		}
		super( input, init );
		if ( !this.headers.has( 'User-Agent' ) ) {
			this.headers.set( 'User-Agent', defaultFetchUserAgent );
		}
	}
}

async function fetch( request: Request ): Promise<Response> {
	try {
		return await internalFetch( request );
	} catch ( error ) {
		if ( error && typeof error === 'object' && error instanceof Error ) {
			// 精簡網址
			const u = request.url.split( '?' )[ 0 ];
			if ( error.message.includes( 'fetch failed' ) ) {
				throw new Error( `Fail to request "${ u }": ${ error.cause }`, { cause: error } );
			} else if ( error instanceof DOMException ) {
				throw new DOMException( `Fail to request "${ u }": ${ error.message }`, error.name );
			}
		}
		throw error;
	}
}

async function fetchWrapper( input: RequestInfo, init?: RequestInit ): Promise<Response> {
	return fetch( new RequestWrapper( input, init ) );
}

export { fetchWrapper as fetch, RequestWrapper as Request };

/**
 * Garbage collect the body of a Request/Response.
 *
 * @param {BodyMixin} bodyAble
 */
export function safeCancelBody( bodyAble?: BodyMixin ): void {
	if ( !bodyAble || !bodyAble.body || bodyAble.bodyUsed ) {
		return;
	}
	try {
		bodyAble.body?.cancel().catch( () => {} );
	} catch {
		// ignore
	}
}

export {
	type RequestInit, type RequestInfo,
	type BodyInit,
	Headers, type HeadersInit,
	Response, type ResponseInit,
	FormData,
} from 'undici';
