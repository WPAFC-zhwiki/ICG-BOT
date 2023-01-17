import cheerio = require( 'cheerio' );
import fetch from 'node-fetch';
import winston = require( 'winston' );

import { inspect } from '@app/lib/util';

import { AFCPage, mwbot } from '@app/modules/afc/util';
import issuesData from '@app/modules/afc/util/issuesData.json';

interface ApiResult {
	statue: number;
	result: {
		title: string;
		pageid: number;
		oldid: number;
		issues: string[];
	}
}

export async function autoReview(
	page: AFCPage,
	{ user, creator, rev: revId }: {
		user?: string;
		creator?: string;
		rev?: number;
	} = {}
): Promise<{
	warning: string[];
	issues: string[];
}> {
	const warning: string[] = [];
	const issues: string[] = [];

	const wikitext: string = page.text;

	const html: string = await mwbot.parseTitle( page.toString(), {
		uselang: 'zh-hant',
		oldid: revId
	} );
	const $parseHTML = cheerio.load( html );

	if ( $parseHTML( '.afc-submission-ignore-content' ).length ) {
		return {
			warning,
			issues: [ 'afc-test' ]
		};
	}

	try {
		await fetch(
			`https://zhwp-afc-bot.toolforge.org/api/autoreview.njs?title=${ encodeURIComponent( page.toString() ) }&apiversion=2022v01`
		).then( async function ( res ): Promise<ApiResult> {
			if ( res.status !== 200 ) {
				throw new Error( `Request fail, response: ${ await res.text() }` );
			}
			return await res.json() as ApiResult;
		} ).then( function ( resJson ) {
			issues.push( ...resJson.result.issues );
		} );
	} catch ( error ) {
		winston.error( '[afc/util/autoreview] ' + inspect( error ) );
		warning.push( '後端API出現錯誤。' );
	}

	let title = page.mwnPage.getMainText();
	if ( $parseHTML( '.afc-submission' ).length ) {

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
		const regexp = new RegExp( `(${ defaults.join( '|' ) })` );
		if ( regexp.exec( wikitext ) ) {
			issues.push( 'default-wikitext' );
		}
	}

	if ( /AFC.*(?:[测測]試|沙盒)/i.exec( title ) || $parseHTML( '.afc-submission-only-test' ).length ) {
		issues.push( 'afc-test' );
	}

	if ( $parseHTML( '#disambigbox' ).length ) {
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
