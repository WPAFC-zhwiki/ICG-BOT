import fetch, { Response } from 'node-fetch';
import winston = require( 'winston' );

import { inspect } from '@app/lib/util';

import { AFCPage } from '@app/modules/afc/util';
import issuesData from '@app/modules/afc/util/issuesData.json';

interface ApiResultV1 {
	status: number;
	apiVersion: 1;
	result: {
		title: string;
		pageid: number;
		oldid: number;
		issues: string[];
	};
}

interface ApiError {
	status: number;
	error: string;
}

class AutoReviewApiError extends Error {
	public constructor( public readonly resJson: ApiError ) {
		super( `Request fail, response: ${ JSON.stringify( resJson ) }` );
	}
}

export async function autoReview(
	page: AFCPage,
	{ user, creator }: {
		user?: string;
		creator?: string;
	} = {}
): Promise<{
	warning: string[];
	issues: string[];
}> {
	const warning: string[] = [];
	const issues: string[] = [];

	const wikitext: string = page.text;

	const $parsedHTML = await page.parseToHTML();

	if ( $parsedHTML( '.afc-submission-ignore-content' ).length ) {
		return {
			warning,
			issues: [ 'afc-test' ]
		};
	}

	try {
		await fetch(
			`https://zhwp-afc-bot.toolforge.org/api/autoreview.njs?title=${ encodeURIComponent( page.toString() ) }&apiversion=2022v01`
		)
			.then( async function ( res ): Promise<[ Response, string ]> {
				return [ res, await res.text() ];
			} )
			.then( function ( [ res, resJsonTxt ] ) {
				let resJson: ApiError | ApiResultV1;
				try {
					resJson = JSON.parse( resJsonTxt ) as ApiError | ApiResultV1;
				} catch {
					throw new Error( `Request fail, status: ${ res.status }, response: ${ resJsonTxt }` );
				}
				if ( resJson.status !== 200 ) {
					throw new AutoReviewApiError( resJson as ApiError );
				}
				issues.push( ...( resJson as ApiResultV1 ).result.issues );
			} );
	} catch ( error ) {
		winston.error( '[afc/util/autoreview] ' + inspect( error ) );
		if ( error instanceof AutoReviewApiError ) {
			warning.push( `後端API出現錯誤：[${ error.resJson.status }] ${ error.resJson.error }。` );
		} else {
			warning.push( '後端API出現錯誤。' );
		}
	}

	let title = page.mwnPage.getMainText();
	if ( $parsedHTML( '.afc-submission' ).length ) {

		if ( title === user ) {
			issues.push( 'same-name' );
		} else if ( title === creator ) {
			issues.push( 'same-name-creator' );
		} else {
			if ( page.mwnPage.namespace === 2 ) {
				const split = title.split( '/' );
				split.shift();

				if ( split.length ) {
					title = split.join( '/' );

					if ( title.includes( user ) || user && user.includes( title ) ) {
						issues.push( 'same-name' );
					} else if ( title.includes( creator ) || creator && creator.includes( title ) ) {
						issues.push( 'same-name-creator' );
					}
				}
			}
		}

		const defaults: string[] = [
			'\'\'\'此处改为条目主题\'\'\'(?:是一个)?',
			'==\\s*章节标题\\s*=='
		];
		// eslint-disable-next-line security/detect-non-literal-regexp
		const regexp = new RegExp( `(${ defaults.join( '|' ) })` );
		if ( regexp.exec( wikitext ) ) {
			issues.push( 'default-wikitext' );
		}
	}

	if ( /AFC.*(?:[测測]試|沙盒)/i.exec( title ) || $parsedHTML( '.afc-submission-only-test' ).length ) {
		issues.push( 'afc-test' );
	}

	if ( $parsedHTML( '#disambigbox' ).length ) {
		warning.push( '本頁為消歧義頁，審閱結果可能不準確。' );
	}

	return {
		warning,
		issues
	};
}

export function getIssusData( key: string, notice?: boolean ): string {
	if ( issuesData[ key ] ) {
		if ( notice ) {
			return `${ issuesData[ key ].short } (${ key })`;
		} else {
			return issuesData[ key ].long;
		}
	} else {
		if ( notice ) {
			return `⧼${ key }⧽ (${ key })`;
		} else {
			return '';
		}
	}
}
