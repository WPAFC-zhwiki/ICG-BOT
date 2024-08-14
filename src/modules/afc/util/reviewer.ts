import { CronJob } from 'cron';
import { MwnTitle } from 'mwn';
import winston = require( 'winston' );

import { inspect } from '@app/lib/util';

import { handleMwnRequestError, mwbot } from '@app/modules/afc/util/index';
import { recentChange, RecentChangeEvent } from '@app/modules/afc/util/recentchange';

import { send } from './msg';
import { escapeHTML } from './telegram-html';

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
	} catch ( error ) {
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
			.then( async function ( res ): Promise<[ Response, string ]> {
				return [ res, await res.text() ];
			} )
			.then( function ( [ res, resJsonTxt ] ) {
				let resJson: ListSysopPatrollerApiError | ListSysopPatrollerApiResultV1;
				try {
					resJson = JSON.parse( resJsonTxt ) as ListSysopPatrollerApiError | ListSysopPatrollerApiResultV1;
				} catch {
					throw new Error( `Request fail, status: ${ res.status }, response: ${ resJsonTxt }` );
				}
				if ( resJson.status !== 200 ) {
					throw new Error( resJsonTxt );
				}
				exOfficioReviewersCache = ( resJson as ListSysopPatrollerApiResultV1 ).data;
			} );

		winston.info( `[afc/util/reviewer] rebuild ex officio reviewer caches, length: ${ exOfficioReviewersCache.length }` );
	} catch ( error ) {
		winston.error( `[afc/util/reviewer] rebuild ex officio reviewer caches fail: ${ inspect( error ) }` );
		send( {
			tMsg: `rebuildExOfficioReviewersCache 失敗：${ escapeHTML( String( error ) ) }。 @sunafterrainwm`
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
			pllimit: 500
		} ).catch( handleMwnRequestError );

		const links: {
			ns: number;
			title: string;
		}[] = data.query.pages[ 0 ].links;

		blockedExOfficioReviewersCaches = [];

		// 黑名單可能是空的
		// 這時就沒東西
		if ( links ) {
			links.filter( function ( link ) {
				return link.ns === 2;
			} ).forEach( function ( link ) {
				blockedExOfficioReviewersCaches.push( normalizeUserName( link.title ) as string );
			} );
		}

		winston.info( `[afc/util/reviewer] rebuild ex officio reviewer blocked caches, length: ${ blockedExOfficioReviewersCaches.length }` );
	} catch ( error ) {
		winston.error( `[afc/util/reviewer] rebuild ex officio reviewer blocked caches fail: ${ inspect( error ) }` );
		send( {
			tMsg: `rebuildBlockedExOfficioReviewersCache 失敗：${ escapeHTML( String( error ) ) }。 @sunafterrainwm`
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
			pllimit: 500
		} ).catch( handleMwnRequestError );

		const links: {
		ns: number;
		title: string;
	}[] = data.query.pages[ 0 ].links;

		participatingReviewersCache = [];

		links.filter( function ( link ) {
			return link.ns === 2;
		} ).forEach( function ( link ) {
			participatingReviewersCache.push( normalizeUserName( link.title ) as string );
		} );

		winston.info( `[afc/util/reviewer] rebuild participating reviewer caches, length: ${ participatingReviewersCache.length }` );
	} catch ( error ) {
		winston.error( `[afc/util/reviewer] rebuild participating reviewer caches fail: ${ inspect( error ) }` );
		send( {
			tMsg: `rebuildParticipatingReviewersCache 失敗：${ escapeHTML( String( error ) ) }。 @sunafterrainwm`
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
	return !!participatingReviewersCache.length && !!exOfficioReviewersCache.length;
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
