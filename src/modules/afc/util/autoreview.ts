import { MwnPage } from 'mwn';
import fetch from 'node-fetch';
import winston = require( 'winston' );
import util = require( 'util' );

import issuesData from 'src/modules/afc/util/issuesData.json';
import { oldAutoReview } from 'src/modules/afc/util/autoreview-old';

interface ApiResult {
	statue: number;
	result: {
		title: string;
		pageid: number;
		oldid: number;
		issues: string[];
	}
}

// eslint-disable-next-line max-len
export async function autoReview( page: MwnPage, wikitext: string, $parseHTML: JQuery<JQuery.Node[]|HTMLElement>, { user, creator }: {
	user?: string;
	creator?: string;
} = {} ): Promise<string[]> {
	const issues: string[] = [];

	try {
		await fetch(
			`https://zhwp-afc-bot.toolforge.org/api/autoreview.njs?title=${ encodeURIComponent( page.toString() ) }`
		).then( async function ( res ): Promise<ApiResult> {
			if ( res.status !== 200 ) {
				throw new Error( `Request fail, response: ${ await res.text() }` );
			}
			return await res.json() as ApiResult;
		} ).then( function ( resJson ) {
			issues.push( ...resJson.result.issues );
		} );
	} catch ( error ) {
		winston.error( '[afc/util/autoreview]' + util.inspect( error ) );
		issues.push( ...( await oldAutoReview( page, wikitext, $parseHTML ) ).issues );
	}

	if ( $parseHTML.find( '.afc-submission' ) ) {
		let title = page.getMainText();

		if ( title === user ) {
			issues.push( 'same-name' );
		} else if ( title === creator ) {
			issues.push( 'same-name-creator' );
		} else {
			if ( page.namespace === 2 ) {
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
		const regexp = new RegExp( `(${ defaults.join( '|' ) })` );
		if ( regexp.exec( wikitext ) ) {
			issues.push( 'default-wikitext' );
		}

		if ( /AFC.*(?:[测測]試|沙盒)/i.exec( title ) || /{{(?:Template:)?Afctest(?:\||}})/i.exec( wikitext ) ) {
			issues.push( 'afc-test' );
		}
	}

	return issues;
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
