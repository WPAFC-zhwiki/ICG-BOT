import winston = require( 'winston' );

import { fetch } from '@app/lib/fetch';
import { inspect, parseHttpResponseJson } from '@app/lib/util';

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
	public constructor( public readonly responseJson: ApiError ) {
		super( `Request fail, response: ${ JSON.stringify( responseJson ) }` );
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

	if ( $parsedHTML( '.afc-submission-ignore-content' ).length > 0 ) {
		return {
			warning,
			issues: [ 'afc-test' ],
		};
	}

	try {
		await fetch(
			`https://zhwp-afc-bot.toolforge.org/api/autoreview.njs?title=${ encodeURIComponent( page.toString() ) }&apiversion=2022v01`
		)
			.then<ApiError | ApiResultV1>( parseHttpResponseJson )
			.then( function ( responseJson ) {
				if ( responseJson.status !== 200 ) {
					throw new AutoReviewApiError( responseJson as ApiError );
				}
				issues.push( ...( responseJson as ApiResultV1 ).result.issues );
			} );
	} catch ( error ) {
		winston.error( '[afc/util/autoreview] ' + inspect( error ) );
		if ( error instanceof AutoReviewApiError ) {
			warning.push( `後端API出現錯誤：[${ error.responseJson.status }] ${ error.responseJson.error }。` );
		} else {
			warning.push( '後端API出現錯誤。' );
		}
	}

	let title = page.mwnPage.getMainText();
	if ( $parsedHTML( '.afc-submission' ).length > 0 ) {

		if ( title === user ) {
			issues.push( 'same-name' );
		} else if ( title === creator ) {
			issues.push( 'same-name-creator' );
		} else {
			if ( page.mwnPage.namespace === 2 ) {
				const split = title.split( '/' );
				split.shift();

				if ( split.length > 0 ) {
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
			String.raw`==\s*章节标题\s*==`,
		];
		// eslint-disable-next-line security/detect-non-literal-regexp
		const regexp = new RegExp( `(${ defaults.join( '|' ) })` );
		if ( regexp.test( wikitext ) ) {
			issues.push( 'default-wikitext' );
		}
	}

	if ( /AFC.*(?:[测測]試|沙盒)/i.test( title ) || $parsedHTML( '.afc-submission-only-test' ).length > 0 ) {
		issues.push( 'afc-test' );
	}

	if ( $parsedHTML( '#disambigbox' ).length > 0 ) {
		warning.push( '本頁為消歧義頁，審閱結果可能不準確。' );
	}

	return {
		warning,
		issues,
	};
}

export function getIssusData( key: string, notice?: boolean ): string {
	if ( issuesData[ key ] ) {
		return notice ? `${ issuesData[ key ].short } (${ key })` : issuesData[ key ].long;
	} else {
		return notice ? `⧼${ key }⧽ (${ key })` : '';
	}
}
