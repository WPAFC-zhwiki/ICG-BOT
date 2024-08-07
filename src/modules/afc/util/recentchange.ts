import { ApiParams, MwnDate } from 'mwn';
import { ApiQueryRecentChangesParams } from 'types-mediawiki/api_params';
import winston = require( 'winston' );

import { RedisWrapper } from '@app/lib/redis';
import { inspect } from '@app/lib/util';

import { mwbot } from '@app/modules/afc/util/index';

type OneOrMore<T> = T | T[];

export declare type RecentChangeFilter = {
	type?: OneOrMore<'edit' | 'log' | 'categorize' | 'new'>;
	namespace?: OneOrMore<number>;
	title?: string;
	since?: Date | MwnDate | string;
	user?: string;
	tag?: string;
	rcprop?: OneOrMore<
		| 'comment'
		| 'flags'
		| 'ids'
		| 'loginfo'
		| 'oresscores'
		| 'parsedcomment'
		| 'patrolled'
		| 'redirect'
		| 'sha1'
		| 'sizes'
		| 'tags'
		| 'timestamp'
		| 'title'
		| 'user'
		| 'userid'
	>;
	rcshow?: OneOrMore<
		| '!anon'
		| '!autopatrolled'
		| '!bot'
		| '!minor'
		| '!oresreview'
		| '!patrolled'
		| '!redirect'
		| 'anon'
		| 'autopatrolled'
		| 'bot'
		| 'minor'
		| 'oresreview'
		| 'patrolled'
		| 'redirect'
		| 'unpatrolled'
	>;
};

// eslint-disable-next-line @typescript-eslint/no-namespace
export declare namespace RecentChangeEvent {
	interface BaseEvent {
		rcid: number;
		timestamp?: string;

		/** summary */
		comment?: string;
		/** parsed-summary */
		parsedcomment?: string;
	}

	interface UserEvent {
		user: string;
		userid: number;
		bot: boolean;
	}

	interface TitleEvent {
		ns: number;
		title: string;
		pageid: number;
		revid: number;
		old_revid: number;
		oldlen: number;
		newlen: number;
		redirect?: boolean;
		minor?: boolean;
		new?: boolean;
	}

	interface RevisionEvent extends BaseEvent, UserEvent {
		ns: number;
		title: string;
		pageid: number;
		revid: number;
		old_revid: number;
		oldlen: number;
		newlen: number;
		redirect?: boolean;
		minor?: boolean;
		new?: boolean;

		tags: string[];
		sha1?: string;
	}

	interface OresScoresEvent {
		oresscores?: {
			damaging: {
				true: number;
				false: number;
			},
			goodfaith: {
				true: number;
				false: number;
			}
		};
	}

	export interface NewEvent extends RevisionEvent, OresScoresEvent {
		/**
		 * type of event
		 */
		type: 'new';
	}

	export interface EditEvent extends RevisionEvent, OresScoresEvent {
		/**
		 * type of event
		 */
		type: 'edit';

		old_revid: 0;
		oldlen: 0;
	}

	export interface CategorizeEvent extends RevisionEvent {
		/**
		 * type of event
		 */
		type: 'categorize';

		ns: 14;
	}

	export interface LogEvent extends BaseEvent, UserEvent {
		/**
		 * type of event
		 */
		type: 'log';

		logid?: number;
		logtype?: string;
		logaction?: string;
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		logparams: any;
	}
}
export declare type RecentChangeEvent =
	| RecentChangeEvent.NewEvent
	| RecentChangeEvent.EditEvent
	| RecentChangeEvent.CategorizeEvent
	| RecentChangeEvent.LogEvent;

type RCFunction<E, T> = ( event: E ) => T;
type RCFilterFunction = RCFunction<RecentChangeEvent, boolean>;
type RCProcessFunction<E = RecentChangeEvent> = RCFunction<E, void>;

const recentChangeLastReadKey = 'afc/recentChange/LastRead';

class RecentChanges {
	private get _params(): ApiParams & ApiQueryRecentChangesParams {
		return Object.assign( {
			action: 'query',
			list: 'recentchanges',
			...this._filter
		} );
	}

	private _filter: Partial<ApiQueryRecentChangesParams> = {
		rcprop: [
			'comment', 'flags', 'ids', 'loginfo',
			'parsedcomment', 'redirect', 'sha1',
			'sizes', 'tags', 'timestamp', 'title', 'user', 'userid'
		],
		rclimit: 'max'
	};

	private readonly _processer: Map<RCFilterFunction, RCProcessFunction> = new Map();

	private readonly _fired: number[] = [];

	private _startTimestamp: Date;

	private _timeOut: NodeJS.Timer | 1;

	public setRequestFilter( filter: RecentChangeFilter ) {
		if ( filter.type ) {
			this._filter.rctype = filter.type;
		} else {
			delete this._filter.rctype;
		}

		if ( filter.namespace ) {
			this._filter.rcnamespace = filter.namespace;
		} else {
			delete this._filter.rcnamespace;
		}

		if ( filter.title ) {
			this._filter.rctitle = filter.title;
		} else {
			delete this._filter.rctitle;
		}

		if ( filter.since ) {
			this._filter.rcstart = new mwbot.Date( filter.since ).toISOString();
		} else {
			delete this._filter.rcstart;
		}

		if ( filter.user ) {
			this._filter.rcuser = filter.user;
		} else {
			delete this._filter.rcuser;
		}

		if ( filter.tag ) {
			this._filter.rctag = filter.tag;
		} else {
			delete this._filter.rctag;
		}

		if ( filter.rcprop ) {
			this._filter.rcprop = [ 'timestamp', ...( filter.rcprop instanceof Array ? filter.rcprop : [ filter.rcprop ] ) ];
			this._filter.rcprop = [ ...new Set( this._filter.rcprop ) ];
		} else {
			delete this._filter.rcprop;
		}

		if ( filter.rcshow ) {
			this._filter.rcshow = filter.rcshow;
		} else {
			delete this._filter.rcshow;
		}
	}

	private async _getInitialTimestamp() {
		const redisWrapper = RedisWrapper.getInstance();
		if ( redisWrapper.isEnable ) {
			try {
				const lastTimestamp = await redisWrapper.get( recentChangeLastReadKey );
				if ( lastTimestamp && !Number.isNaN( Date.parse( lastTimestamp ) ) ) {
					winston.info( `[afc/recentchange] RecentChange start from cache timestamp ${ lastTimestamp }.` );
					return new Date( lastTimestamp );
				}
			} catch ( error ) {
				winston.error( `[afc/recentchange] Fail to get last initial timestamp: ${ inspect( error ) }.` );
			}
		}
		return new Date();
	}

	private async _updateInitialTimestamp( date: Date ) {
		const redisWrapper = RedisWrapper.getInstance();
		if ( redisWrapper.isEnable ) {
			try {
				await redisWrapper.set( recentChangeLastReadKey, date.toISOString() );
				winston.info( `[afc/recentchange] RecentChange cache timestamp has been update to ${ date.toISOString() }.` );
			} catch ( error ) {
				winston.error( '[afc/recentchange] Fail to update last initial timestamp: ' + inspect( error ) );
			}
		}
	}

	private _mayStartProcess() {
		if ( !this._timeOut ) {
			// 佔位符
			this._timeOut = 1;
			this._getInitialTimestamp()
				.then( ( startTimestamp ) => {
					this._startTimestamp = startTimestamp;
					this._timeOut = setInterval( ( () => {
						this._request();
					} ), 5000 );
				} );
		}
	}

	public addProcessFunction<E extends RecentChangeEvent = RecentChangeEvent>(
		filter: RCFilterFunction,
		func: RCProcessFunction<E>
	) {
		this._mayStartProcess();
		this._processer.set( filter, func as RCProcessFunction );
	}

	private async _request(): Promise<void> {
		try {
			mwbot.Title.checkData();
		} catch ( e ) {
			await mwbot.getSiteInfo();
		}

		const now = new Date();
		const data = await mwbot.request( this._params );

		const recentchanges: RecentChangeEvent[] = data.query.recentchanges;

		if ( recentchanges.length ) {
			for ( const rc of recentchanges ) {
				if (
					this._fired.includes( rc.rcid ) ||
					new Date( rc.timestamp ) < this._startTimestamp ||
					// 避免重複捕獲
					new Date( rc.timestamp ) >= now
				) {
					continue;
				}
				this._fired.push( rc.rcid );
				this._fire( rc );
			}
		}
		this._updateInitialTimestamp( now );
	}

	private _fire( event: RecentChangeEvent ): void {
		this._processer.forEach( function ( func, fliter ): void {
			if ( fliter( event ) ) {
				func( event );
			}
		} );
	}
}

export const recentChange = new RecentChanges();
