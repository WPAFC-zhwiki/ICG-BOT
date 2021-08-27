import { mwn } from 'mwn';
import { Manager } from 'src/init';
import { version, repository } from 'src/config';

import TurndownService from 'turndown';
import winston from 'winston';
import EventSource from 'eventsource';
import { RecentChangeStreamEvent } from 'mwn/build/eventstream';

const service = new TurndownService();

export const turndown: typeof TurndownService.prototype.turndown = service.turndown.bind( service );

export const IRCBold = '\x02';

/**
 * Encodes a text string as a valid Uniform Resource Identifier (URI)
 *
 * @param {string} uri A value representing an encoded URI.
 * @return {string} encode url
 */
export function encodeURI( uri: string ): string {
	return encodeURIComponent( uri )
		.replace(
			/%(2[346BF]|3[AC-F]|40|5[BDE]|60|7[BCD])/g,
			decodeURIComponent
		)
		.replace( /:$/, '%3A' );
}

const oldDecodeURI = global.decodeURI;

/**
 * Gets the unencoded version of an encoded Uniform Resource Identifier (URI).
 *
 * @param {string} encodedURI A value representing an encoded URI.
 * @return {string} decode url
 */
export function decodeURI( encodedURI: string ): string {
	return oldDecodeURI( encodedURI )
		.replace( /\s/g, '_' );
}

export { default as jQuery, default as $ } from 'src/lib/jquery';

export const mwbot = ( function (): mwn {
	const mwnconfig = Manager.config.afc.mwn;
	// eslint-disable-next-line no-shadow
	const mwbot: mwn = new mwn( Object.assign( mwnconfig, {
		silent: true
	} ) );

	if ( mwnconfig.userAgent.length === 0 ) {
		mwnconfig.userAgent = `AFC-ICG-BOT/${ version } (${ repository.replace( /^git\+/, '' ) })`;
	}

	switch ( mwnconfig.type ) {
		case 'botpassword':
			mwbot.login()
				.then( function () {
					winston.debug( `[afc/util/index] mwn login successful: ${ mwnconfig.username }@${ mwnconfig.apiUrl.split( '/api.php' ).join( '' ) }/index.php` );
				} )
				.catch( function ( err ) {
					winston.debug( `[afc/util/index] mwn login error: ${ err }` );
				} );
			break;
		case 'oauth':
			mwbot.initOAuth();
			mwbot.getTokensAndSiteInfo()
				.then( function () {
					winston.debug( '[afc/util/index] mwn: success get tokens and site info.' );
				} )
				.catch( function ( err ) {
					winston.debug( `[afc/util/index] mwn error: ${ err }` );
				} );
			break;
		default:
			mwbot.getSiteInfo()
				.then( function () {
					winston.debug( '[afc/util/index] mwn: success get site info.' );
				} );
			break;
	}

	return mwbot;
}() );

export function parseWikiLink( context: string ): string {
	return context
		.replace( /\[\[([^[\]]+)\]\]/g, function ( _all: string, text: string ) {
			return `<a href="https://zh.wikipedia.org/wiki/${ text.split( '|' )[ 0 ] }">${ text.split( '|' )[ 1 ] || text.split( '|' )[ 0 ] }</a>`;
		} )
		.replace( /&#91;/g, '[' )
		.replace( /&#93;/g, ']' );
}

const EventStream = new EventSource( 'https://stream.wikimedia.org/v2/stream/recentchange', {
	headers: {
		'User-Agent': mwbot.options.userAgent

	}
} );

EventStream.onerror = function ( err ) {
	try {
		const errjson: string = JSON.stringify( err );
		if ( errjson === '{"type":"error"}' ) {
			return; // ignore
		}
		winston.error( '[afc/event/clean] Recentchange Error (Throw by EventSource):' + errjson );
	} catch ( e ) {
		winston.error( '[afc/event/clean] Recentchange Error (Throw by EventSource): <Throw at console>' );
		console.log( err );
	}
};

let i = 0;

// eslint-disable-next-line max-len
const EventStreamManager = new Map<number, [( data: RecentChangeStreamEvent ) => boolean, ( data: RecentChangeStreamEvent ) => void]>();

// eslint-disable-next-line max-len
export function recentChange( filter: ( data: RecentChangeStreamEvent ) => boolean, action: ( data: RecentChangeStreamEvent ) => void ): void {
	EventStreamManager.set( i++, [ filter, action ] );
}

EventStream.onmessage = function ( { data } ) {
	const event: RecentChangeStreamEvent = JSON.parse( data );
	EventStreamManager.forEach( function ( [ filter, action ] ) {
		if ( filter( event ) ) {
			try {
				action( event );
			} catch ( e ) {

			}
		}
	} );
};
