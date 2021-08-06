import { RecentChangeStreamEvent } from 'mwn/build/eventstream';
import winston from 'winston';
import { mwbot, recentChange } from './index';

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

function upperFirst( str: string ) {
	return str.substring( 0, 1 ).toUpperCase() + str.substring( 1, str.length );
}

export function isReviewer( user: string ): boolean {
	return caches.includes( `User:${ upperFirst( user ) }` );
}

export function hasReviewerCaches(): boolean {
	return !!caches.length;
}

recentChange( function ( event: RecentChangeStreamEvent ): boolean {
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
