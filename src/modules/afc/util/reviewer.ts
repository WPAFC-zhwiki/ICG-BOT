import { RecentChangeStreamEvent } from 'mwn/build/eventstream';
import winston from 'winston';
import { mwbot } from './index';

let caches: string[] = [];

export async function rebuildReviewerCaches(): Promise<void> {
	const data = await mwbot.request( {
		action: 'query',
		format: 'json',
		prop: 'links',
		titles: 'WikiProject:建立條目/參與者',
		plnamespace: 2,
		pllimit: 500
	} );

	const links: {
		ns: number;
		title: string;
	}[] = data.query.pages[ 0 ].links;

	caches = [];

	links.filter( function ( link ) {
		return link.ns === 2;
	} ).forEach( function ( link ) {
		caches.push( link.title );
	} );

	winston.debug( `[afc/util/reviewer] rebuild reviewer caches, length: ${ caches.length }` );
}

export function isReviewer( user: string ): boolean {
	return caches.includes( `User:${ user }` );
}

export function hasCaches(): boolean {
	return !!caches.length;
}

new mwbot.stream( 'recentchange', {
	onopen() {
		return;
	},
	onerror( err ) {
		try {
			const errjson: string = JSON.stringify( err );
			if ( errjson === '{"type":"error"}' ) {
				return; // ignore
			}
			winston.error( '[afc/event/watchlist] Recentchange Error (Throw by EventSource): ' + errjson );
		} catch ( e ) {
			winston.error( '[afc/event/watchlist] Recentchange Error (Throw by EventSource): <Throw at console>' );
			console.log( err );
		}
	}
} ).addListener( function ( event: RecentChangeStreamEvent ): boolean {
	if (
		event.wiki === 'zhwiki' &&
		event.type === 'edit' &&
		event.title === 'WikiProject:建立條目/參與者'
	) {
		return true;
	}

	return false;
}, function (): void {
	rebuildReviewerCaches();
} );

rebuildReviewerCaches();
