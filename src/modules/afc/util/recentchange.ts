import { ApiParams, MwnDate } from 'mwn';
import { ApiQueryRecentChangesParams } from 'types-mediawiki/api_params';

import { mwbot } from 'src/modules/afc/util/index';

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

export declare type RecentChangeResponse = {
	type: 'edit' | 'log' | 'categorize' | 'new';
	rcid: number;
	timestamp?: string;

	comment: string;
	parsedcomment: string;

	user: string;
	userid: number;
	bot?: '';

	ns: number;
	title: string;
	pageid: number;
	revid: number;
	old_revid: number;
	oldlen: number;
	newlen: number;
	minor?: '';
	new?: '';

	tags: string[];
	sha1?: string;
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
	logid?: number;
    logtype?: string;
    logaction?: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    logparams: any;
};

export declare type RecentChangeEvent = {
	type: 'edit' | 'log' | 'categorize' | 'new';
	id: number;
	timestamp?: number;

	comment: string;
	parsedcomment: string;

	user: string;
	bot: boolean;

	namespace: number;
	title: string;
	revision?: {
		old?: number;
		new: number;
	};
	length?: {
		old?: number;
		new: number;
	};
	minor: boolean;

	log_id?: number;
	log_type?: string;
	log_action?: string;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	log_params?: any;
};

type RCFunction<T> = ( event: RecentChangeEvent, rawresponse: RecentChangeResponse ) => T;
type RCFilterFunction = RCFunction<boolean>;
type RCProcessFunction = RCFunction<void>;

class RecentChanges {
	private _filter: ApiParams & ApiQueryRecentChangesParams = {
		action: 'query',
		list: 'recentchanges',
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

	private _timeOut: NodeJS.Timer;

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
			this._filter.rcstart = new mwbot.date( filter.since ).toISOString();
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

	public addProcessFunction( filter: RCFilterFunction, func: RCProcessFunction ) {
		if ( !this._timeOut ) {
			this._startTimestamp = new Date();
			this._timeOut = setInterval( ( function ( this: RecentChanges ) {
				this._request();
			} ).bind( this ), 5000 );
		}

		this._processer.set( filter, func );
	}

	private _buildRcEvent( rc: RecentChangeResponse ): RecentChangeEvent {
		const event: RecentChangeEvent = {
			type: rc.type,
			title: rc.title,
			namespace: rc.ns,
			comment: rc.comment,
			parsedcomment: rc.parsedcomment,
			user: rc.user,
			id: rc.rcid,
			bot: 'bot' in rc,
			minor: 'minor' in rc,
			timestamp: +new Date( rc.timestamp ) / 1000
		};

		switch ( rc.type ) {
			case 'new':
				event.length = {
					new: rc.newlen
				};

				event.revision = {
					new: rc.revid
				};
				break;

			case 'edit':
				event.length = {
					old: rc.oldlen,
					new: rc.newlen
				};

				event.revision = {
					old: rc.old_revid,
					new: rc.revid
				};
				break;

			case 'categorize':
				break;

			case 'log':
				event.log_id = rc.logid;
				event.log_type = rc.logtype;
				event.log_action = rc.logaction;
				event.log_params = rc.logparams;
				break;

			default:
				break;
		}

		return event;
	}

	private async _request(): Promise<void> {
		const data = await mwbot.request( this._filter );

		const recentchanges: RecentChangeResponse[] = data.query.recentchanges;

		if ( recentchanges.length ) {
			for ( const rc of recentchanges ) {
				if ( this._fired.includes( rc.rcid ) || new Date( rc.timestamp ) < this._startTimestamp ) {
					continue;
				}
				this._fired.push( rc.rcid );
				this._fire( this._buildRcEvent( rc ), rc );
			}
		}
	}

	private _fire( event: RecentChangeEvent, res: RecentChangeResponse ): void {
		this._processer.forEach( function ( func, fliter ): void {
			if ( fliter( event, res ) ) {
				func( event, res );
			}
		} );
	}
}

export const recentChange = new RecentChanges();
