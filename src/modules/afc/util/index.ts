import { isAxiosError } from 'axios';
import cheerio = require( 'cheerio' );
import { Mwn } from 'mwn';
import { MwnError } from 'mwn/build/error';
import TurndownService from 'turndown';
import winston = require( 'winston' );

import { version, repository } from '@app/config';
import { Manager } from '@app/init';

import { createShadowError } from '@app/lib/util';

const service = new TurndownService();

export function turndown( html: string | TurndownService.Node ) {
	return service.turndown( html );
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
			// $&+/:<=>@[]^`{|}
			/%(2[46BF]|3[AC-E]|40|5[BDE]|60|7[BCD])/g,
			decodeURIComponent
		)
		.replace( /:$/, '%3A' );
}

/**
 * Gets the unencoded version of an encoded Uniform Resource Identifier (URI).
 *
 * @param {string} encodedURI A value representing an encoded URI.
 * @return {string} decode url
 */
export function decodeURI( encodedURI: string ): string {
	return global.decodeURI( encodedURI )
		.replace( /\s/g, '_' );
}

export const $ = cheerio.load( '' );

export const mwbot = ( function (): Mwn {
	const mwnconfig = Manager.config.afc.mwn;

	if ( mwnconfig.userAgent.length === 0 ) {
		mwnconfig.userAgent = `AFC-ICG-BOT/${ version } (${ repository.replace( /^git\+/, '' ) })`;
	}

	// eslint-disable-next-line no-shadow
	const mwbot: Mwn = new Mwn( {
		...mwnconfig,
		silent: true
	} );

	switch ( mwnconfig.type ) {
		case 'botpassword':
			mwbot.login()
				.catch( handleMwnRequestError )
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
				.catch( handleMwnRequestError )
				.then( function () {
					winston.debug( '[afc/util/index] mwn: success get tokens and site info.' );
				} )
				.catch( function ( err ) {
					winston.debug( `[afc/util/index] mwn error: ${ err }` );
				} );
			break;
		default:
			mwbot.getSiteInfo()
				.catch( handleMwnRequestError )
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

/**
 * 隱藏 AxiosError 內的敏感內容並拋出錯誤
 *
 * @param {Error} error
 * @return {false | never} false 表不是 AxiosError 所以什麼事都沒有做
 */
function redactedAndThrowAxiosError( error: unknown ): false | Error {
	if ( !isAxiosError( error ) ) {
		return false;
	}

	if ( error.status && error.status >= 500 ) {
		// 伺服器出錯就省略其他內容
		throw createShadowError( error );
	}

	delete error.config;
	delete error.request?.headers;
	delete error.request?.httpAgent;
	delete error.request?.httpsAgent;
	delete error.response?.headers;
	delete error.response?.config;
	delete error.response?.request;
	delete error.isAxiosError;
	delete error.toJSON;
	throw error;
}

/**
 * 隱藏 MwnError 內的敏感內容並拋出錯誤
 *
 * @param {Error} error
 * @return {false | never} false 表不是 MwnError 所以什麼事都沒有做
 */
function redactedAndThrowMwnError( error: unknown ): false | never {
	if ( !error || !( error instanceof MwnError ) ) {
		return false;
	}

	delete error.docref;
	delete error.request?.headers;
	delete error.request?.httpAgent;
	delete error.request?.httpsAgent;
	const requestParams = error.request?.params;
	if ( requestParams && typeof requestParams === 'object' ) {
		for ( const key of Reflect.ownKeys( requestParams ) ) {
			if ( typeof key === 'symbol' || key.toLowerCase().includes( 'token' ) ) {
				delete requestParams[ key ];
			}
		}
	}
	delete error.response?.headers;
	delete error.response?.config;
	delete error.response?.request;
	delete error.response?.request;
	delete error.response?.data?.tokens;
	delete error.response?.data?.query?.tokens;
	throw error;
}

/**
 * 隱藏 mwn 請求錯誤的敏感內容後拋出
 *
 * @param {unknown} error
 * @return {never}
 */
export function handleMwnRequestError( error: unknown ): never {
	redactedAndThrowAxiosError( error );
	redactedAndThrowMwnError( error );
	if ( error && error instanceof Error ) {
		throw createShadowError( error );
	}
	throw error;
}
