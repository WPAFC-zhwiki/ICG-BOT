/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-this-alias */
/*!
 * EventEmitter2 6.4.4
 * https://github.com/EventEmitter2/EventEmitter2 commit 7dff2d6a160a636046921256fa4eef9025ae4bf8
 *
 * Copyright (c) 2013 hij1nx
 * Licensed under the MIT license.
 */
import NodeJSEventEmitter from 'node:events';

const hasOwnProperty = Object.hasOwnProperty;
const defaultMaxListeners = 10;

export interface EventEmitterConfig {
	/**
	 * @default '.'
	 * @description the delimiter used to segment namespaces.
	 */
	delimiter?: string;
	/**
	 * @default false
	 * @description set this to `true` if you want to emit the newListener events.
	 */
	newListener?: boolean;
	/**
	 * @default false
	 * @description set this to `true` if you want to emit the removeListener events.
	 */
	removeListener?: boolean,
	/**
	 * @default 10
	 * @description the maximum amount of listeners that can be assigned to an event.
	 */
	maxListeners?: number
	/**
	 * @default false
	 * @description show event name in memory leak message
	 * when more than maximum amount of listeners is assigned, default false
	 */
	verboseMemoryLeak?: boolean
	/**
	 * @default false
	 * @description disable throwing uncaughtException if an error event is emitted and it has no listeners
	 */
	ignoreErrors?: boolean
}

type Func = ( ...args: any[] ) => any;

type EventName = string | symbol;

export type Event = ( ...args: any[] ) => void;

export type Events = Record<EventName, Event>;

export interface ListenerFunction extends Event {
	listener?: Event;
	_origin?: Event;
	_async?: boolean;
}

export interface EventAndListener {
	( event: EventName, ...args: any[] ): void;
}

type WaitForFilter<E extends Event = Event> = ( ...values: Parameters<E> ) => boolean;

export interface WaitForOptions<E extends Event = Event> {
	/**
	 * @default null
	 */
	filter: WaitForFilter<E>,
	/**
	 * @default false
	 */
	handleError: boolean,
}

export interface EventEmitterLike {
	addEventListener?: Func;
	removeEventListener?: Func;
	addListener?: Func;
	removeListener?: Func;
	on?: Func;
	off?: Func;
}

export type GeneralEventEmitter = EventEmitterLike & ( {
	addEventListener: Func;
	removeEventListener: Func;
} | {
	addListener: Func;
	removeListener: Func;
} | {
	on: Func;
	off: Func;
} );

export interface OnOptions {
	async?: boolean;
	promisify?: boolean;
	nextTick?: boolean;
	objectify?: boolean;
}

type OnOptions_Objectify = Partial<OnOptions> & {
	objectify: true;
};

function resolveOptions<T>(
	options: Partial<T>,
	schema: T,
	reducers: Partial<Record<keyof T, Func>>,
	allowUnknown?: boolean
): T;
function resolveOptions<T>(
	options: undefined,
	schema: T,
	reducers?: Partial<Record<keyof T, Func>>,
	allowUnknown?: boolean
): T;
function resolveOptions<T>(
	options: Partial<T> | undefined,
	schema: T,
	reducers?: Partial<Record<keyof T, Func>>,
	allowUnknown?: boolean
): T {
	const computedOptions: T = Object.assign( {}, schema );

	if ( !options ) {
		return computedOptions;
	}

	if ( typeof options !== 'object' ) {
		throw new TypeError( 'options must be an object' );
	}

	const keys: string[] = Object.keys( options );
	const length: number = keys.length;
	let option: PropertyKey, value: any;
	let reducer: ( argument0: any, argument1: ( reason: any ) => void ) => any;

	function reject( reason: string ): void {
		throw new Error( 'Invalid "' + String( option ) + '" option value' + ( reason ? '. Reason: ' + reason : '' ) );
	}

	for ( let index = 0; index < length; index++ ) {
		option = keys[ index ];
		if ( !allowUnknown && !hasOwnProperty.call( schema, option ) ) {
			throw new Error( 'Unknown "' + option + '" option' );
		}
		value = options[ option ];
		if ( value !== undefined ) {
			reducer = reducers[ option ];
			computedOptions[ option ] = reducer ? reducer( value, reject ) : value;
		}
	}
	return computedOptions;
}

function functionReducer( func: Func, reject: Func ): void {
	if ( typeof func !== 'function' ) {
		reject( 'value must be type of function' );
	}
}

class Listener<E extends Events = Events, K extends keyof E = EventName> {
	public emitter: EventEmitter;
	public event: EventName;
	public listener: ListenerFunction;

	public constructor( emitter: EventEmitter<E>, event: K, listener: E[ K ] );
	public constructor( emitter: EventEmitter, event: EventName, listener: ListenerFunction );
	public constructor( emitter: EventEmitter, event: EventName, listener: ListenerFunction ) {
		this.emitter = emitter;
		this.event = event;
		this.listener = listener;
	}

	public off(): this {
		this.emitter.off( this.event, this.listener );
		return this;
	}
}

export default class EventEmitter<E extends Events = Events> implements Required<EventEmitterLike>, NodeJSEventEmitter {
	#conf: EventEmitterConfig;
	#ignoreErrors: boolean;
	#newListener: boolean;
	#removeListener: boolean;
	#verboseMemoryLeak: boolean;

	#events: Record<string | symbol, ListenerFunction[] & {
		warned?: boolean;
	}> & {
		maxListeners?: number;
	};
	#all: ListenerFunction[];
	#maxListeners: number = defaultMaxListeners;

	public constructor( config?: EventEmitterConfig ) {
		this.#events = {};
		this.#newListener = false;
		this.#removeListener = false;
		this.#verboseMemoryLeak = false;
		this.#configure( config );
	}

	#init(): void {
		this.#events = {};
		if ( this.#conf ) {
			this.#configure( this.#conf );
		}
	}

	#configure( config?: EventEmitterConfig ): void {
		if ( config ) {
			this.#conf = config;

			if ( config.delimiter ) {
				this.delimiter = config.delimiter;
			}

			if ( config.maxListeners ) {
				this.maxListeners = config.maxListeners;
			}

			if ( config.newListener ) {
				this.#newListener = config.newListener;
			}

			if ( config.removeListener ) {
				this.#removeListener = config.removeListener;
			}

			if ( config.verboseMemoryLeak ) {
				this.#verboseMemoryLeak = config.verboseMemoryLeak;
			}

			if ( config.verboseMemoryLeak ) {
				this.#ignoreErrors = config.ignoreErrors;
			}
		}
	}

	public static EventEmitter: typeof EventEmitter = EventEmitter;
	public static EventEmitter2: typeof EventEmitter = EventEmitter;

	// By default EventEmitters will print a warning if more than
	// 10 listeners are added to it. This is a useful default which
	// helps finding memory leaks.
	//
	// Obviously not all Emitters should be limited to 10. This function allows
	// that to be increased. Set to zero for unlimited.
	public delimiter = '.';

	public getMaxListeners(): number {
		return this.#maxListeners;
	}
	public setMaxListeners( n: number ): this {
		if ( n !== undefined ) {
			this.#maxListeners = n;
			if ( !this.#conf ) {
				this.#conf = {};
			}
			this.#conf.maxListeners = n;
		}

		return this;
	}

	public get maxListeners(): number {
		return this.#maxListeners;
	}
	public set maxListeners( n: number ) {
		this.setMaxListeners( n );
	}

	public event: EventName = '';

	public once<K extends keyof E>( event: K, func: E[ K ], options: OnOptions_Objectify ): Listener<E, K>;
	public once<K extends keyof E>( event: K, func: E[ K ], options?: boolean | Partial<OnOptions> ): this;
	public once( event: EventName, func: Event, options: OnOptions_Objectify ): Listener;
	public once( event: EventName, func: Event, options?: boolean | Partial<OnOptions> ): this;
	public once( event: EventName, func: Event, options?: boolean | Partial<OnOptions> ): this | Listener {
		return this.#once( event, func, false, options );
	}

	public prependOnceListener<K extends keyof E>(
		event: K,
		func: E[ K ],
		options: OnOptions_Objectify
	): Listener<E, K>;
	public prependOnceListener<K extends keyof E>(
		event: K,
		func: E[ K ],
		options?: boolean | Partial<OnOptions>
	): this;
	public prependOnceListener(
		event: EventName,
		func: Event, options: OnOptions_Objectify
	): Listener;
	public prependOnceListener(
		event: EventName,
		func: Event, options?: boolean | Partial<OnOptions>
	): this;
	public prependOnceListener(
		event: EventName,
		func: Event, options?: boolean | Partial<OnOptions>
	): this | Listener {
		return this.#once( event, func, true, options );
	}

	#once(
		event: EventName,
		func: Event,
		prepend: boolean,
		options?: boolean | Partial<OnOptions>
	): this | Listener {
		return this.#many( event, 1, func, prepend, options );
	}

	public many<K extends keyof E>(
		event: K, timesToListen: number,
		func: E[ K ],
		options: OnOptions_Objectify
	): Listener<E, K>;
	public many<K extends keyof E>(
		event: K, timesToListen: number,
		func: E[ K ],
		options?: boolean | Partial<OnOptions>
	): this;
	public many( event: EventName, timesToListen: number, func: Event, options: OnOptions_Objectify ): Listener;
	public many( event: EventName, timesToListen: number, func: Event, options?: boolean | Partial<OnOptions> ): this;
	public many<K extends keyof E>(
		event: K,
		timesToListen: number,
		func: E[ K ],
		options?: boolean | Partial<OnOptions>
	): this;
	public many( event: EventName, timesToListen: number, func: Event, options?: boolean | Partial<OnOptions> ): this;
	public many( event: EventName, ttl: number, func: Event, options?: boolean | Partial<OnOptions> ): this | Listener {
		return this.#many( event, ttl, func, false, options );
	}

	public prependMany<K extends keyof E>(
		event: K, timesToListen: number,
		func: E[ K ],
		options: OnOptions_Objectify
	): Listener<E, K>;
	public prependMany<K extends keyof E>(
		event: K,
		timesToListen: number,
		func: E[ K ],
		options?: boolean | Partial<OnOptions>
	): this;
	public prependMany(
		event: EventName,
		timesToListen: number,
		func: Event,
		options: OnOptions_Objectify
	): Listener;
	public prependMany(
		event: EventName,
		timesToListen: number,
		func: Event,
		options?: boolean | Partial<OnOptions>
	): this;
	public prependMany(
		event: EventName,
		ttl: number,
		func: Event,
		options?: boolean | Partial<OnOptions>
	): this | Listener {
		return this.#many( event, ttl, func, true, options );
	}

	#many(
		event: EventName,
		ttl: number,
		func: Event,
		prepend: boolean,
		options?: boolean | Partial<OnOptions>
	): this | Listener {
		if ( typeof func !== 'function' ) {
			throw new TypeError( 'many only accepts instances of Function' );
		}

		const listener = ( ...args: any ): void => {
			if ( --ttl === 0 ) {
				this.off( event, listener );
			}
			return func( ...args );
		};

		listener._origin = func;

		return this.#on( event, listener, prepend, options );
	}

	public emit<K extends keyof E>( type: K, ...args: Parameters<E[ K ]> ): boolean;
	public emit( type: EventName, ...args: any[] ): boolean;
	public emit( ...args: any[] ): boolean {
		if ( !this.#events && !this.#all ) {
			return false;
		}

		if ( !this.#events ) {
			this.#init();
		}

		const type: EventName = args[ 0 ];
		let clearArgs: any[];

		if ( type === 'newListener' && !this.#newListener && !this.#events.newListener ) {
			return false;
		}

		const al: number = arguments.length;
		let handler: ListenerFunction[];

		if ( this.#all && this.#all.length > 0 ) {
			handler = [ ...this.#all ];

			for ( let index = 0, l = handler.length; index < l; index++ ) {
				this.event = type;
				handler[ index ]( ...args );
			}
		}

		handler = this.#events[ type ];
		if ( handler ) {
			// need to make copy of handlers because list can change in the middle
			// of emit call
			handler = [ ...handler ];
		}

		if ( handler && handler.length > 0 ) {
			clearArgs = Array.from( { length: al - 1 } );
			for ( let index = 1; index < al; index++ ) {
				clearArgs[ index - 1 ] = args[ index ];
			}
			for ( let index = 0, l = handler.length; index < l; index++ ) {
				this.event = type;
				handler[ index ]( ...clearArgs );
			}
			return true;
		} else if ( !this.#ignoreErrors && !this.#all && type === 'error' ) {
			throw args[ 1 ] instanceof Error ?
				args[ 1 ] :
				Object.assign( new Error( "Uncaught, unspecified 'error' event." ), {
					rawError: args[ 1 ],
				} );
		}

		return !!this.#all;
	}

	public emitAsync<K extends keyof E>( type: K, ...args: Parameters<E[ K ]> ): Promise<void[]>;
	public emitAsync( type: EventName, ...args: any[] ): Promise<void[]>;
	public async emitAsync( ...args: any[] ): Promise<( boolean | void )[]> {
		if ( !this.#events && !this.#all ) {
			return [ false ];
		}

		if ( !this.#events ) {
			this.#init();
		}

		const type: EventName = args[ 0 ];
		let clearArgs: any[];

		if ( type === 'newListener' && !this.#newListener && !this.#events.newListener ) {
			return [ false ];
		}

		const promises: ( Promise<void> | void )[] = [];

		const al = arguments.length;
		let handler: ListenerFunction[];

		if ( this.#all ) {
			for ( let index = 0, l = this.#all.length; index < l; index++ ) {
				this.event = type;
				promises.push( this.#all[ index ]( ...args ) );
			}
		}

		handler = this.#events[ type ];

		if ( handler && handler.length > 0 ) {
			handler = [ ...handler ];
			clearArgs = Array.from( { length: al - 1 } );
			for ( let index = 1; index < al; index++ ) {
				clearArgs[ index - 1 ] = args[ index ];
			}
			for ( let index = 0, l = handler.length; index < l; index++ ) {
				this.event = type;
				promises.push( handler[ index ]( ...clearArgs ) );
			}
		} else if ( !this.#ignoreErrors && !this.#all && type === 'error' ) {
			throw args[ 1 ] instanceof Error ?
				args[ 1 ] :
				new TypeError( 'Uncaught, unspecified \'error\' event.' );
		}

		return Promise.all( promises );
	}

	public emitSync = this.emitAsync;

	public on<K extends keyof E>( event: K, func: E[ K ], options: OnOptions_Objectify ): Listener<E, K>;
	public on<K extends keyof E>( event: K, func: E[ K ], options?: boolean | Partial<OnOptions> ): this;
	public on( event: EventName, func: Event, options: OnOptions_Objectify ): Listener;
	public on( event: EventName, func: Event, options?: boolean | Partial<OnOptions> ): this;
	public on( listener: Event, prepend?: boolean ): this;
	public on(
		type: EventName | Event,
		listener?: Event | boolean,
		options?: boolean | Partial<OnOptions>
	): this | Listener {
		if ( typeof type === 'function' ) {
			this.#onAny( type, !!listener );
			return this;
		} else if ( typeof listener !== 'function' ) {
			throw new TypeError( 'onAny only accepts instances of Function' );
		}
		return this.#on( type, listener, false, options );
	}

	public addListener = this.on;
	public addEventListener = this.on;

	public prependListener<K extends keyof E>( event: K, func: E[ K ], options: OnOptions_Objectify ): Listener<E, K>;
	public prependListener<K extends keyof E>( event: K, func: E[ K ], options?: boolean | Partial<OnOptions> ): this;
	public prependListener( event: EventName, func: Event, options: OnOptions_Objectify ): this;
	public prependListener( event: EventName, func: Event, options?: boolean | Partial<OnOptions> ): this;
	public prependListener(
		type: EventName,
		listener: Event,
		options?: boolean | Partial<OnOptions>
	): this | Listener {
		return this.#on( type, listener, true, options );
	}

	public onAny( listener: EventAndListener ): this;
	public onAny( func: EventAndListener ): this {
		return this.#onAny( func, false );
	}

	public prependAny( func: Event ): this;
	public prependAny( func: Event ): this {
		return this.#onAny( func, true );
	}

	#onAny( func: EventAndListener, prepend?: boolean ): this {
		if ( typeof func !== 'function' ) {
			throw new TypeError( 'onAny only accepts instances of Function' );
		}

		if ( !this.#all ) {
			this.#all = [];
		}

		// Add the function to the event listener collection.
		if ( prepend ) {
			this.#all.unshift( func );
		} else {
			this.#all.push( func );
		}

		return this;
	}

	#setupListener(
		event: EventName,
		listener: ListenerFunction,
		options: boolean | OnOptions
	): [ ListenerFunction, Listener | this ] {
		let promisify: boolean;
		let async: boolean;
		let nextTick: boolean;
		let objectify: boolean;

		if ( options === true ) {
			promisify = true;
		} else if ( options === false ) {
			async = true;
		} else {
			if ( !options || typeof options !== 'object' ) {
				throw new TypeError( 'options should be an object or true' );
			}
			async = options.async;
			promisify = options.promisify;
			nextTick = options.nextTick;
			objectify = options.objectify;
		}

		if ( async || nextTick || promisify ) {
			const _listener: ListenerFunction = listener;
			const _origin: Event = listener._origin || listener;

			if ( nextTick && !true ) {
				throw new Error( 'process.nextTick is not supported' );
			}

			if ( promisify === undefined ) {
				promisify = listener.constructor.name === 'AsyncFunction';
			}

			listener = ( ...args ): void | Promise<void> => {
				const event = this.event;

				return promisify ? ( nextTick ? Promise.resolve() : new Promise( function ( resolve ): void {
					setImmediate( resolve );
				} ).then( (): void => {
					this.event = event;
					return _listener.apply( this, args );
				} ) ) : ( nextTick ? process.nextTick : setImmediate )( (): void => {
					this.event = event;
					_listener.apply( this, args );
				} );
			};

			listener._async = true;
			listener._origin = _origin;
		}

		return [ listener, objectify ? new Listener( this, event, listener ) : this ];
	}

	#logPossibleMemoryLeak( count: number, eventName: EventName ): void {
		let errorMessage = '(node) warning: possible EventEmitter memory ' +
		'leak detected. ' + count + ' listeners added. ' +
		'Use emitter.setMaxListeners() to increase limit.';

		if ( this.#verboseMemoryLeak ) {
			errorMessage += ' Event name: ' + String( eventName ) + '.';
		}

		if ( typeof process !== 'undefined' && process.emitWarning ) {
			process.emitWarning( Object.assign(
				new Error( errorMessage ),
				{
					name: 'MaxListenersExceededWarning',
					emitter: this,
					count,
				}
			) );
		} else {
			console.error( errorMessage );

			if ( console.trace ) {
				console.trace();
			}
		}
	}

	#on(
		type: EventName,
		listener: Event,
		prepend?: boolean,
		options?: boolean | Partial<OnOptions>
	): this | Listener {
		if ( typeof listener !== 'function' ) {
			throw new TypeError( 'on only accepts instances of Function' );
		}

		if ( !this.#events ) {
			this.#init();
		}

		// eslint-disable-next-line unicorn/no-this-assignment
		let returnValue: this | Listener = this;
		let temporary: [ ListenerFunction, this | Listener ];

		if ( options !== undefined ) {
			temporary = this.#setupListener( type, listener, options );
			listener = temporary[ 0 ];
			returnValue = temporary[ 1 ];
		}

		// To avoid recursion in the case that type == "newListeners"! Before
		// adding it to the listeners, first emit "newListeners".
		if ( this.#newListener ) {
			this.emit( 'newListener', type, listener );
		}

		if ( this.#events[ type ] ) {
			// If we've already got an array, just add
			if ( prepend ) {
				this.#events[ type ].unshift( listener );
			} else {
				this.#events[ type ].push( listener );
			}

			// Check for listener leak
			if (
				!this.#events[ type ].warned &&
				this.#maxListeners > 0 &&
				this.#events[ type ].length > this.#maxListeners
			) {
				this.#events[ type ].warned = true;
				this.#logPossibleMemoryLeak( this.#events[ type ].length, type );
			}
		} else {
			// Optimize the case of one listener. Don't need the extra array object.
			this.#events[ type ] = [ listener ];
		}

		return returnValue;
	}

	public off<K extends keyof E>( event: K, func: E[ K ], options?: boolean | Partial<OnOptions> ): this;
	public off( event: EventName, func: Event, options?: boolean | Partial<OnOptions> ): this;
	public off( type: EventName, listener: Event ): this {
		if ( typeof listener !== 'function' ) {
			throw new TypeError( 'removeListener only takes instances of Function' );
		}

		let handlers: ListenerFunction[];
		const leafs: { _listeners: ListenerFunction[] }[] = [];

		// does not use listeners(), so no side effect of creating _events[type]
		if ( !this.#events[ type ] ) {
			return this;
		}
		handlers = this.#events[ type ];
		leafs.push( { _listeners: handlers } );

		for ( const leaf of leafs ) {
			handlers = leaf._listeners;
			let position = -1;

			for ( let index = 0, length = handlers.length; index < length; index++ ) {
				if ( handlers[ index ] === listener ||
					( handlers[ index ].listener && handlers[ index ].listener === listener ) ||
					( handlers[ index ]._origin && handlers[ index ]._origin === listener ) ) {
					position = index;
					break;
				}
			}

			if ( position < 0 ) {
				continue;
			}

			this.#events[ type ].splice( position, 1 );

			if ( handlers.length === 0 ) {
				delete this.#events[ type ];
			}
			if ( this.#removeListener ) {
				this.emit( 'removeListener', type, listener );
			}

			return this;
		}

		return this;
	}

	public offAny( func: ListenerFunction ): this {
		let index = 0, l = 0, fns: any[];
		if ( func && this.#all && this.#all.length > 0 ) {
			fns = this.#all;
			for ( index = 0, l = fns.length; index < l; index++ ) {
				if ( func === fns[ index ] ) {
					fns.splice( index, 1 );
					if ( this.#removeListener ) {
						this.emit( 'removeListenerAny', func );
					}
					return this;
				}
			}
		} else {
			fns = this.#all;
			if ( this.#removeListener ) {
				for ( index = 0, l = fns.length; index < l; index++ ) {
					this.emit( 'removeListenerAny', fns[ index ] );
				}
			}
			this.#all = [];
		}
		return this;
	}

	public removeListener = this.off;
	public removeEventListener = this.off;

	public removeAllListeners( type: keyof E ): this;
	public removeAllListeners( type?: EventName ): this;
	public removeAllListeners( type?: EventName ): this {
		if ( type === undefined ) {
			if ( this.#events ) {
				this.#init();
			}
			return this;
		}

		this.#events[ type ] = undefined;
		return this;
	}

	public listeners<K extends keyof E>( type: K ): E[K][];
	public listeners( type: EventName ): ListenerFunction[];
	public listeners( type: EventName ): ListenerFunction[] {
		const _events = this.#events;
		let keys: EventName[];
		let listeners: ListenerFunction[];
		let allListeners: ListenerFunction[];
		let index: number;

		if ( type === undefined ) {
			if ( !_events ) {
				return [];
			}

			keys = Reflect.ownKeys( _events );
			index = keys.length;
			allListeners = [];
			while ( index-- > 0 ) {
				listeners = _events[ keys[ index ] ];
				allListeners.push( ...listeners );
			}
			return allListeners;
		} else {
			if ( !_events ) {
				return [];
			}

			listeners = _events[ type ];

			if ( !listeners ) {
				return [];
			}

			return listeners;
		}
	}

	public rawListeners<K extends keyof E>( type: K ): E[K][];
	public rawListeners( type: EventName ): ListenerFunction[];
	public rawListeners( type: EventName ): ListenerFunction[] {
		return this.listeners( type ).map( function ( func: ListenerFunction ) {
			return func._origin || func.listener || func;
		} );
	}

	public eventNames(): EventName[] {
		const _events = this.#events;
		return _events ? Reflect.ownKeys( _events ) : [];
	}

	public listenerCount( type: EventName ): number {
		return this.listeners( type ).length;
	}

	public hasListeners( type?: keyof E ): boolean;
	public hasListeners( type?: EventName ): boolean;
	public hasListeners( type?: EventName ): boolean {
		const _events = this.#events;
		const _all = this.#all;

		return !!(
			_all && _all.length > 0 ||
			_events && ( type === undefined ? Reflect.ownKeys( _events ).length : _events[ type ] )
		);
	}

	public listenersAny(): ListenerFunction[] {
		return this.#all ?? [];
	}

	public waitFor<K extends keyof E>(
		event: K,
		options?: Partial<WaitForOptions<E[K]>> | WaitForFilter<E[K]>
	): Promise<Parameters<E[ K ]>>;
	public waitFor( event: EventName, options: Partial<WaitForOptions> | WaitForFilter ): Promise<any>;
	public waitFor( event: EventName, opt: Partial<WaitForOptions> | WaitForFilter ): Promise<any> {
		let options: Partial<WaitForOptions>;
		options = typeof opt === 'function' ? {
			filter: opt,
		} : opt;

		options = resolveOptions<WaitForOptions>( options, {
			filter: undefined,
			handleError: false,
		}, {
			filter: functionReducer,
		} );

		return new Promise( ( resolve, reject ) => {
			const listener = ( ...args: any[] ) => {
				const filter = options.filter;
				if ( filter && !filter( ...args ) ) {
					return;
				}
				this.off( event, listener );
				if ( options.handleError ) {
					const error = args[ 0 ];
					if ( error ) {
						reject( error );
					} else {
						resolve( args.slice( 1 ) );
					}
				} else {
					resolve( args );
				}
			};

			this.#on( event, listener, false );
		} );
	}

	public static once<T extends Events, K extends keyof T>(
		emitter: EventEmitter<T>,
		name: K
	): Promise<Parameters<T[ K ]>>;
	public static once( emitter: GeneralEventEmitter, name: string ): Promise<any[]>;
	public static once( emitter: GeneralEventEmitter, name: string ): Promise<any[]> {
		return new Promise( function ( resolve, reject ) {
			let handler: Func;
			if ( emitter instanceof EventEmitter ) {
				handler = function ( ...args ) {
					resolve( args );
				};

				emitter.once( name, handler );
				return;
			}

			const on = ( emitter.addEventListener || emitter.addListener || emitter.on ).bind( emitter );
			const off = ( emitter.removeEventListener || emitter.removeListener || emitter.off ).bind( emitter );

			let ttl = 1;

			function eventListener( ...args: any[] ) {
				if ( --ttl === 0 ) {
					off( name, eventListener );
				}

				if ( errorListener ) {
					off( 'error', errorListener );
				}

				resolve( args );
			}

			let errorListener: ( error: any ) => void;

			if ( name !== 'error' ) {
				let ettl = 1;

				errorListener = function ( error: any ) {
					if ( --ettl === 0 ) {
						off( name, errorListener );
					}

					off( name, eventListener );
					reject( error );
				};

				on( 'error', errorListener );
			}

			on( name, eventListener );
		} );
	}

	public static get defaultMaxListeners(): number {
		return EventEmitter.prototype.#maxListeners;
	}
	public static set defaultMaxListeners( n: number ) {
		if ( typeof n !== 'number' || n < 0 || Number.isNaN( n ) ) {
			throw new TypeError( 'n must be a non-negative number' );
		}
		EventEmitter.prototype.#maxListeners = n;
	}
}
