import { mwn } from 'mwn';
import { Manager } from 'src/init';
import { version, repository } from 'src/config';

import TurndownService from 'turndown';
import winston = require( 'winston' );

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
			// $&+/:<=>@[]^`{|}
			/%(2[46BF]|3[AC-E]|40|5[BDE]|60|7[BCD])/g,
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

	if ( mwnconfig.userAgent.length === 0 ) {
		mwnconfig.userAgent = `AFC-ICG-BOT/${ version } (${ repository.replace( /^git\+/, '' ) })`;
	}

	// eslint-disable-next-line no-shadow
	const mwbot: mwn = new mwn( {
		...mwnconfig,
		silent: true
	} );

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
