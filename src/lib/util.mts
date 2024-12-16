import path from 'node:path';
import { inspect as utilInspect } from 'node:util';

import { Response } from '@app/lib/fetch.mjs';

export function getFriendlySize( size: number ): string {
	if ( size <= 1126 ) {
		return `${ size.toLocaleString() } B`;
	} else if ( size <= 1_153_433 ) {
		return `${ ( size / 1024 ).toLocaleString() } KB`;
	} else if ( size <= 1_181_116_006 ) {
		return `${ ( size / 1_048_576 ).toLocaleString() } MB`;
	} else {
		return `${ ( size / 1_073_741_824 ).toLocaleString() } GB`;
	}
}

export function getFriendlyLocation( latitude: number, longitude: number ): string {
	let y: string | number = latitude;
	let x: string | number = longitude;

	y = y < 0 ? `${ -y }°S` : `${ y }°N`;
	x = x < 0 ? `${ -x }°W` : `${ x }°E`;

	return `${ y }, ${ x }`;
}

export function inspect( object: unknown ) {
	return utilInspect( object, {
		showHidden: false,
		colors: false,
		depth: 1,
	} );
}

export function getFileNameFromUrl( urlString: string ) {
	let url: URL;
	try {
		url = new URL( urlString, 'https://localhost/' );
	} catch {
		// eslint-disable-next-line security/detect-unsafe-regex
		return ( urlString.match( /^(?:.*[\\/])?([^\\/?#&]+)(?:[?#&].*)?$/ ) || [] )[ 1 ] || urlString;
	}
	return path.basename( url.pathname );
}

export async function parseHttpResponseJson<T>( response: Response ) {
	let responseJsonTxt = await response.text();
	let responseJson: T;
	try {
		responseJson = JSON.parse( responseJsonTxt ) satisfies T;
	} catch {
		if ( [ 502, 503, 504 ].includes( response.status ) && response.headers.get( 'Content-Type' )?.includes( 'html' ) ) {
			// 不要把502 503 504錯誤頁面的html吐出來
			const errorMessage = {
				502: 'Bad Gateway',
				503: 'Service Unavailable',
				504: 'Gateway Timeout',
			};
			responseJsonTxt = `<!-- redacted -->${ errorMessage[ response.status ] }`;
		} else {
			responseJsonTxt = responseJsonTxt.slice( 0, 1000 );
		}
		throw new Error( `Request fail, status: ${ response.status }, response: ${ responseJsonTxt }` );
	}
	return responseJson;
}

/**
 * 建立一個帶有原始錯誤訊息與堆棧但不包含其他屬性的錯誤
 *
 * @param {Error} error
 * @param {string?} [overrideMessage] 覆蓋錯誤訊息
 * @return {Error}
 */
export function createShadowError( error: Error, overrideMessage: string | undefined = undefined ): Error {
	const shadowError = Object.create( Error.prototype ) satisfies Error;
	shadowError.name = error.name;
	shadowError.message = overrideMessage ?? error.message;
	Object.defineProperty( shadowError, 'stack', {
		get() {
			return error.stack;
		},
		set( value: string ) {
			error.stack = value;
		},
	} );
	return shadowError;
}
