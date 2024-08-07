import path = require( 'node:path' );
import util = require( 'node:util' );

export function getFriendlySize( size: number ): string {
	if ( size <= 1126 ) {
		return `${ size.toLocaleString() } B`;
	} else if ( size <= 1153433 ) {
		return `${ ( size / 1024 ).toLocaleString() } KB`;
	} else if ( size <= 1181116006 ) {
		return `${ ( size / 1048576 ).toLocaleString() } MB`;
	} else {
		return `${ ( size / 1073741824 ).toLocaleString() } GB`;
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
	return util.inspect( object, {
		showHidden: false,
		colors: false,
		depth: 1
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
	const res = await Promise.resolve( response );
	let resJsonTxt = await res.text();
	let resJson: T;
	try {
		resJson = JSON.parse( resJsonTxt ) satisfies T;
	} catch {
		if ( [ 502, 503, 504 ].includes( res.status ) && res.headers.get( 'Content-Type' )?.includes( 'html' ) ) {
			// 不要把502 503 504錯誤頁面的html吐出來
			const errorMsg = {
				502: 'Bad Gateway',
				503: 'Service Unavailable',
				504: 'Gateway Timeout'
			};
			resJsonTxt = `<!-- redacted -->${ errorMsg[ res.status ] }`;
		} else {
			resJsonTxt = resJsonTxt.slice( 0, 1000 );
		}
		throw new Error( `Request fail, status: ${ res.status }, response: ${ resJsonTxt }` );
	}
	return resJson;
}
