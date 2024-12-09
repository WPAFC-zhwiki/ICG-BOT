import { CronJob } from 'cron';
import { MwnTitle } from 'mwn';
import winston = require( 'winston' );

import { fetch, Response } from '@app/lib/fetch';
import { inspect } from '@app/lib/util';

import { handleMwnRequestError, mwbot } from '@app/modules/afc/util/index';
import { send } from '@app/modules/afc/util/message';
import { recentChange, RecentChangeEvent } from '@app/modules/afc/util/recentchange';
import { escapeHTML } from '@app/modules/afc/util/telegram-html';

export let exOfficioReviewersCache: string[] = [];
export let blockedExOfficioReviewersCaches: string[] = [];

export let participatingReviewersCache: string[] = [];

interface ListSysopPatrollerApiResultV1 {
	status: number;
	data: string[];
}

interface ListSysopPatrollerApiError {
	status: number;
	error: string;
}

function normalizeUserName( user: string ) {
	user = user.normalize();
	let title: MwnTitle;
	try {
		title = new mwbot.Title( user, 2 );
	} catch {
		return false;
	}
	if ( title.namespace !== 2 ) {
		return false;
	}
	return title.getMainText();
}

export async function rebuildExOfficioReviewersCache(): Promise<void> {
	try {
		exOfficioReviewersCache = [];
		await fetch( 'https://zhwp-afc-bot.toolforge.org/api/list-sysop-patroller?apiversion=2024v01' )
			.then( async function ( response ): Promise<[ Response, string ]> {
				return [ response, await response.text() ];
			} )
			.then( function ( [ response, responseJsonTxt ] ) {
				let responseJson: ListSysopPatrollerApiError | ListSysopPatrollerApiResultV1;
				try {
					responseJson = JSON.parse( responseJsonTxt ) as
						| ListSysopPatrollerApiError
						| ListSysopPatrollerApiResultV1;
				} catch {
					throw new Error( `Request fail, status: ${ response.status }, response: ${ responseJsonTxt }` );
				}
				if ( responseJson.status !== 200 ) {
					throw new Error( responseJsonTxt );
				}
				exOfficioReviewersCache = ( responseJson as ListSysopPatrollerApiResultV1 ).data;
			} );

		winston.info( `[afc/util/reviewer] rebuild ex officio reviewer caches, length: ${ exOfficioReviewersCache.length }` );
	} catch ( error ) {
		winston.error( `[afc/util/reviewer] rebuild ex officio reviewer caches fail: ${ inspect( error ) }` );
		send( {
			tMessage: `rebuildExOfficioReviewersCache 失敗：${ escapeHTML( String( error ) ) }。`,
		}, 'debug' );
	}
}

export async function rebuildBlockedExOfficioReviewersCache(): Promise<void> {
	try {
		const data = await mwbot.request( {
			action: 'query',
			format: 'json',
			prop: 'links',
			titles: 'WikiProject:建立條目/參與者/黑名單',
			plnamespace: 2,
			pllimit: 500,
		} ).catch( handleMwnRequestError );

		const links: {
			ns: number;
			title: string;
		}[] = data.query.pages[ 0 ].links;

		blockedExOfficioReviewersCaches = [];

		// 黑名單可能是空的
		// 這時就沒東西
		if ( links ) {
			for ( const link of links.filter( function ( link ) {
				return link.ns === 2;
			} ) ) {
				blockedExOfficioReviewersCaches.push( normalizeUserName( link.title ) as string );
			}
		}

		winston.info( `[afc/util/reviewer] rebuild ex officio reviewer blocked caches, length: ${ blockedExOfficioReviewersCaches.length }` );
	} catch ( error ) {
		winston.error( `[afc/util/reviewer] rebuild ex officio reviewer blocked caches fail: ${ inspect( error ) }` );
		send( {
			tMessage: `rebuildBlockedExOfficioReviewersCache 失敗：${ escapeHTML( String( error ) ) }。`,
		}, 'debug' );
	}
}

export async function rebuildParticipatingReviewersCache(): Promise<void> {
	try {
		const data = await mwbot.request( {
			action: 'query',
			format: 'json',
			prop: 'links',
			titles: 'WikiProject:建立條目/參與者',
			plnamespace: 2,
			pllimit: 500,
		} ).catch( handleMwnRequestError );

		const links: {
			ns: number;
			title: string;
		}[] = data.query.pages[ 0 ].links;

		participatingReviewersCache = [];

		for ( const link of links.filter( function ( link ) {
			return link.ns === 2;
		} ) ) {
			participatingReviewersCache.push( normalizeUserName( link.title ) as string );
		}

		winston.info( `[afc/util/reviewer] rebuild participating reviewer caches, length: ${ participatingReviewersCache.length }` );
	} catch ( error ) {
		winston.error( `[afc/util/reviewer] rebuild participating reviewer caches fail: ${ inspect( error ) }` );
		send( {
			tMessage: `rebuildParticipatingReviewersCache 失敗：${ escapeHTML( String( error ) ) }。`,
		}, 'debug' );
	}
}

export function isReviewer( user: string ): boolean {
	return isParticipatingReviewer( user ) || ( isExOfficioReviewer( user ) && !isBlockedExOfficioReviewer( user ) );
}

export function isExOfficioReviewer( user: string ): boolean {
	const userName = normalizeUserName( user );
	if ( !userName ) {
		return false;
	}

	return exOfficioReviewersCache.includes( userName );
}

export function isBlockedExOfficioReviewer( user: string ): boolean {
	const userName = normalizeUserName( user );
	if ( !userName ) {
		return false;
	}
	return blockedExOfficioReviewersCaches.includes( userName );
}

export function isParticipatingReviewer( user: string ): boolean {
	const userName = normalizeUserName( user );
	if ( !userName ) {
		return false;
	}
	return participatingReviewersCache.includes( userName );
}

export function hasReviewersCache(): boolean {
	return participatingReviewersCache.length > 0 && exOfficioReviewersCache.length > 0;
}

recentChange.addProcessFunction( function ( event: RecentChangeEvent ): boolean {
	if (
		event.type === 'edit' &&
		event.title === 'WikiProject:建立條目/參與者'
	) {
		return true;
	}

	return false;
}, function (): void {
	rebuildParticipatingReviewersCache();
} );

recentChange.addProcessFunction( function ( event: RecentChangeEvent ): boolean {
	if (
		event.type === 'edit' &&
		event.title === 'WikiProject:建立條目/參與者/黑名單'
	) {
		return true;
	}

	return false;
}, function (): void {
	rebuildExOfficioReviewersCache();
} );

new CronJob( '0 35 * * * *', function () {
	rebuildExOfficioReviewersCache();
} ).start();

rebuildExOfficioReviewersCache();
rebuildBlockedExOfficioReviewersCache();
rebuildParticipatingReviewersCache();
