import { mwn } from 'mwn';
import { Manager } from 'init';
import { version, repository } from 'config';

import TurndownService from 'turndown';
import winston from 'winston';

const service = new TurndownService();

export const turndown: typeof TurndownService.prototype.turndown = service.turndown.bind( service );

export const IRCBold = '\x02';

export function htmlToIRC( text: string ): string {
	return text
		.replace( /<a href="([^"]+)">([^<]+)<\/a>/g, ' $2 <$1> ' )
		.replace( /https:\/\/zh\.wikipedia\.org\/(wiki\/)?/g, 'https://zhwp.org/' )
		.replace( /<b>(.*?)<\/b>/g, `${ IRCBold }$1${ IRCBold }` );
}

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

export { default as jQuery, default as $ } from 'lib/jquery.js';

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
					winston.debug( `[afc/util/index.js] mwn login successful: ${ mwnconfig.username }@${ mwnconfig.apiUrl.split( '/api.php' ).join( '' ) }/index.php` );
				} )
				.catch( function ( err ) {
					winston.debug( `[afc/util/index.js] mwn login error: ${ err }` );
				} );
			break;
		case 'oauth':
			mwbot.initOAuth();
			mwbot.getTokensAndSiteInfo()
				.then( function () {
					winston.debug( '[afc/util/index.js] mwn: success get tokens and site info.' );
				} )
				.catch( function ( err ) {
					winston.debug( `[afc/util/index.js] mwn error: ${ err }` );
				} );
			break;
		default:
			mwbot.getSiteInfo()
				.then( function () {
					winston.debug( '[afc/util/index.js] mwn: success get site info.' );
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
