/* eslint-disable max-len, @typescript-eslint/no-explicit-any, @typescript-eslint/no-this-alias */
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

export interface ListenerFn extends Event {
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
}

function resolveOptions<T>( options: Partial<T>, schema: T, reducers: Partial<Record<keyof T, Func>>, allowUnknown?: boolean ): T;
function resolveOptions<T>( options: never, schema: T, reducers?: Partial<Record<keyof T, Func>>, allowUnknown?: boolean ): T;
function resolveOptions<T>( options: Partial<T> | never, schema: T, reducers?: Partial<Record<keyof T, Func>>, allowUnknown?: boolean ): T {
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
	let reducer: ( arg0: any, arg1: ( reason: any ) => void ) => any;

	function reject( reason: string ): void {
		throw new Error( 'Invalid "' + String( option ) + '" option value' + ( reason ? '. Reason: ' + reason : '' ) );
	}

	for ( let i = 0; i < length; i++ ) {
		option = keys[ i ];
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
	public listener: ListenerFn;

	public constructor( emitter: EventEmitter<E>, event: K, listener: E[ K ] );
	public constructor( emitter: EventEmitter, event: EventName, listener: ListenerFn );
	public constructor( emitter: EventEmitter, event: EventName, listener: ListenerFn ) {
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

	#events: Record<string|symbol, ListenerFn[] & {
		warned?: boolean;
	}> & {
		maxListeners?: number;
	};
	#all: ListenerFn[];
	#maxListeners: number = defaultMaxListeners;

	public constructor( conf?: EventEmitterConfig ) {
		this.#events = {};
		this.#newListener = false;
		this.#removeListener = false;
		this.#verboseMemoryLeak = false;
		this.#configure( conf );
	}

	#init(): void {
		this.#events = {};
		if ( this.#conf ) {
			this.#configure( this.#conf );
		}
	}

	#configure( conf?: EventEmitterConfig ): void {
		if ( conf ) {
			this.#conf = conf;

			if ( conf.delimiter ) {
				this.delimiter = conf.delimiter;
			}

			if ( conf.maxListeners ) {
				this.maxListeners = conf.maxListeners;
			}

			if ( conf.newListener ) {
				this.#newListener = conf.newListener;
			}

			if ( conf.removeListener ) {
				this.#removeListener = conf.removeListener;
			}

			if ( conf.verboseMemoryLeak ) {
				this.#verboseMemoryLeak = conf.verboseMemoryLeak;
			}

			if ( conf.verboseMemoryLeak ) {
				this.#ignoreErrors = conf.ignoreErrors;
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

	public once<K extends keyof E>( event: K, fn: E[ K ], options: OnOptions_Objectify ): Listener<E, K>;
	public once<K extends keyof E>( event: K, fn: E[ K ], options?: boolean | Partial<OnOptions> ): this;
	public once( event: EventName, fn: Event, options: OnOptions_Objectify ): Listener;
	public once( event: EventName, fn: Event, options?: boolean | Partial<OnOptions> ): this;
	public once( event: EventName, fn: Event, options?: boolean | Partial<OnOptions> ): this | Listener {
		return this.#once( event, fn, false, options );
	}

	public prependOnceListener<K extends keyof E>( event: K, fn: E[ K ], options: OnOptions_Objectify ): Listener<E, K>;
	public prependOnceListener<K extends keyof E>( event: K, fn: E[ K ], options?: boolean | Partial<OnOptions> ): this;
	public prependOnceListener( event: EventName, fn: Event, options: OnOptions_Objectify ): Listener;
	public prependOnceListener( event: EventName, fn: Event, options?: boolean | Partial<OnOptions> ): this;
	public prependOnceListener( event: EventName, fn: Event, options?: boolean | Partial<OnOptions> ): this | Listener {
		return this.#once( event, fn, true, options );
	}

	#once( event: EventName, fn: Event, prepend: boolean, options?: boolean | Partial<OnOptions> ): this | Listener {
		return this.#many( event, 1, fn, prepend, options );
	}

	public many<K extends keyof E>( event: K, timesToListen: number, fn: E[ K ], options: OnOptions_Objectify ): Listener<E, K>;
	public many<K extends keyof E>( event: K, timesToListen: number, fn: E[ K ], options?: boolean | Partial<OnOptions> ): this;
	public many( event: EventName, timesToListen: number, fn: Event, options: OnOptions_Objectify ): Listener;
	public many( event: EventName, timesToListen: number, fn: Event, options?: boolean | Partial<OnOptions> ): this;
	public many<K extends keyof E>( event: K, timesToListen: number, fn: E[ K ], options?: boolean | Partial<OnOptions> ): this;
	public many( event: EventName, timesToListen: number, fn: Event, options?: boolean | Partial<OnOptions> ): this;
	public many( event: EventName, ttl: number, fn: Event, options?: boolean | Partial<OnOptions> ): this | Listener {
		return this.#many( event, ttl, fn, false, options );
	}

	public prependMany<K extends keyof E>( event: K, timesToListen: number, fn: E[ K ], options: OnOptions_Objectify ): Listener<E, K>;
	public prependMany<K extends keyof E>( event: K, timesToListen: number, fn: E[ K ], options?: boolean | Partial<OnOptions> ): this;
	public prependMany( event: EventName, timesToListen: number, fn: Event, options: OnOptions_Objectify ): Listener;
	public prependMany( event: EventName, timesToListen: number, fn: Event, options?: boolean | Partial<OnOptions> ): this;
	public prependMany( event: EventName, ttl: number, fn: Event, options?: boolean | Partial<OnOptions> ): this | Listener {
		return this.#many( event, ttl, fn, true, options );
	}

	#many( event: EventName, ttl: number, fn: Event, prepend: boolean, options?: boolean | Partial<OnOptions> ): this | Listener {
		const self: this = this;

		if ( typeof fn !== 'function' ) {
			throw new Error( 'many only accepts instances of Function' );
		}

		function listener( ...args: any ): void {
			if ( --ttl === 0 ) {
				self.off( event, listener );
			}
			return fn( ...args );
		}

		listener._origin = fn;

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

		if ( type === 'newListener' && !this.#newListener ) {
			if ( !this.#events.newListener ) {
				return false;
			}
		}

		const al: number = arguments.length;
		let handler: ListenerFn[];

		if ( this.#all && this.#all.length ) {
			handler = this.#all.slice();

			for ( let i = 0, l = handler.length; i < l; i++ ) {
				this.event = type;
				handler[ i ]( ...args );
			}
		}

		handler = this.#events[ type ];
		if ( handler ) {
			// need to make copy of handlers because list can change in the middle
			// of emit call
			handler = handler.slice();
		}

		if ( handler && handler.length ) {
			clearArgs = new Array( al - 1 );
			for ( let j = 1; j < al; j++ ) {
				clearArgs[ j - 1 ] = args[ j ];
			}
			for ( let i = 0, l = handler.length; i < l; i++ ) {
				this.event = type;
				handler[ i ]( ...clearArgs );
			}
			return true;
		} else if ( !this.#ignoreErrors && !this.#all && type === 'error' ) {
			if ( args[ 1 ] instanceof Error ) {
				throw args[ 1 ]; // Unhandled 'error' event
			} else {
				throw Object.assign( new Error( "Uncaught, unspecified 'error' event." ), {
					rawError: args[ 1 ]
				} );
			}
		}

		return !!this.#all;
	}

	public emitAsync<K extends keyof E>( type: K, ...args: Parameters<E[ K ]> ): Promise<void[]>;
	public emitAsync( type: EventName, ...args: any[] ): Promise<void[]>;
	public async emitAsync( ...args: any[] ): Promise<( boolean|void )[]> {
		if ( !this.#events && !this.#all ) {
			return [ false ];
		}

		if ( !this.#events ) {
			this.#init();
		}

		const type: EventName = args[ 0 ];
		let clearArgs: any[];

		if ( type === 'newListener' && !this.#newListener ) {
			if ( !this.#events.newListener ) {
				return [ false ];
			}
		}

		const promises: ( Promise<void> | void )[] = [];

		const al = arguments.length;
		let handler: ListenerFn[];

		if ( this.#all ) {
			for ( let i = 0, l = this.#all.length; i < l; i++ ) {
				this.event = type;
				promises.push( this.#all[ i ]( ...args ) );
			}
		}

		handler = this.#events[ type ];

		if ( handler && handler.length ) {
			handler = handler.slice();
			clearArgs = new Array( al - 1 );
			for ( let j = 1; j < al; j++ ) {
				clearArgs[ j - 1 ] = args[ j ];
			}
			for ( let i = 0, l = handler.length; i < l; i++ ) {
				this.event = type;
				promises.push( handler[ i ]( ...clearArgs ) );
			}
		} else if ( !this.#ignoreErrors && !this.#all && type === 'error' ) {
			if ( args[ 1 ] instanceof Error ) {
				throw args[ 1 ]; // Unhandled 'error' event
			} else {
				throw new Error( 'Uncaught, unspecified \'error\' event.' );
			}
		}

		return Promise.all( promises );
	}

	public emitSync = this.emitAsync;

	public on<K extends keyof E>( event: K, fn: E[ K ], options: OnOptions_Objectify ): Listener<E, K>;
	public on<K extends keyof E>( event: K, fn: E[ K ], options?: boolean | Partial<OnOptions> ): this;
	public on( event: EventName, fn: Event, options: OnOptions_Objectify ): Listener;
	public on( event: EventName, fn: Event, options?: boolean | Partial<OnOptions> ): this;
	public on( listener: Event, prepend?: boolean ): this;
	public on( type: EventName | Event, listener?: Event | boolean, options?: boolean | Partial<OnOptions> ): this | Listener {
		if ( typeof type === 'function' ) {
			this.#onAny( type, !!listener );
			return this;
		} else if ( typeof listener !== 'function' ) {
			throw new Error( 'onAny only accepts instances of Function' );
		}
		return this.#on( type, listener, false, options );
	}

	public addListener = this.on;
	public addEventListener = this.on;

	public prependListener<K extends keyof E>( event: K, fn: E[ K ], options: OnOptions_Objectify ): Listener<E, K>;
	public prependListener<K extends keyof E>( event: K, fn: E[ K ], options?: boolean | Partial<OnOptions> ): this;
	public prependListener( event: EventName, fn: Event, options: OnOptions_Objectify ): this;
	public prependListener( event: EventName, fn: Event, options?: boolean | Partial<OnOptions> ): this;
	public prependListener( type: EventName, listener: Event, options?: boolean | Partial<OnOptions> ): this | Listener {
		return this.#on( type, listener, true, options );
	}

	public onAny( listener: EventAndListener ): this;
	public onAny( fn: EventAndListener ): this {
		return this.#onAny( fn, false );
	}

	public prependAny( fn: Event ): this;
	public prependAny( fn: Event ): this {
		return this.#onAny( fn, true );
	}

	#onAny( fn: EventAndListener, prepend?: boolean ): this {
		if ( typeof fn !== 'function' ) {
			throw new Error( 'onAny only accepts instances of Function' );
		}

		if ( !this.#all ) {
			this.#all = [];
		}

		// Add the function to the event listener collection.
		if ( prepend ) {
			this.#all.unshift( fn );
		} else {
			this.#all.push( fn );
		}

		return this;
	}

	#setupListener( event: EventName, listener: ListenerFn, options: boolean | OnOptions ): [ ListenerFn, Listener | this ] {
		let promisify: boolean;
		let async: boolean;
		let nextTick: boolean;
		let objectify: boolean;
		const context: EventEmitter<Events> = this;

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
			const _listener: ListenerFn = listener;
			const _origin: Event = listener._origin || listener;

			if ( nextTick && !true ) {
				throw new Error( 'process.nextTick is not supported' );
			}

			if ( promisify === undefined ) {
				promisify = listener.constructor.name === 'AsyncFunction';
			}

			listener = function ( ...args ): void | Promise<void> {
				// eslint-disable-next-line no-shadow
				const event = context.event;

				return promisify ? ( nextTick ? Promise.resolve() : new Promise( function ( resolve ): void {
					setImmediate( resolve );
				} ).then( function (): void {
					context.event = event;
					return _listener.apply( context, args );
				} ) ) : ( nextTick ? process.nextTick : setImmediate )( function (): void {
					context.event = event;
					_listener.apply( context, args );
				} );
			};

			listener._async = true;
			listener._origin = _origin;
		}

		return [ listener, objectify ? new Listener( this, event, listener ) : this ];
	}

	#logPossibleMemoryLeak( count: number, eventName: EventName ): void {
		let errorMsg = '(node) warning: possible EventEmitter memory ' +
		'leak detected. ' + count + ' listeners added. ' +
		'Use emitter.setMaxListeners() to increase limit.';

		if ( this.#verboseMemoryLeak ) {
			errorMsg += ' Event name: ' + String( eventName ) + '.';
		}

		if ( typeof process !== 'undefined' && process.emitWarning ) {
			const e: Error & {
				emitter?: EventEmitter;
				count?: number;
			} = new Error( errorMsg );
			e.name = 'MaxListenersExceededWarning';
			e.emitter = this;
			e.count = count;
			process.emitWarning( e );
		} else {
			console.error( errorMsg );

			if ( console.trace ) {
				console.trace();
			}
		}
	}

	#on( type: EventName, listener: Event, prepend?: boolean, options?: boolean | Partial<OnOptions> ): this | Listener {
		if ( typeof listener !== 'function' ) {
			throw new Error( 'on only accepts instances of Function' );
		}

		if ( !this.#events ) {
			this.#init();
		}

		let returnValue: this | Listener = this;
		let temp: [ ListenerFn, this | Listener ];

		if ( options !== undefined ) {
			temp = this.#setupListener( type, listener, options );
			listener = temp[ 0 ];
			returnValue = temp[ 1 ];
		}

		// To avoid recursion in the case that type == "newListeners"! Before
		// adding it to the listeners, first emit "newListeners".
		if ( this.#newListener ) {
			this.emit( 'newListener', type, listener );
		}

		if ( !this.#events[ type ] ) {
			// Optimize the case of one listener. Don't need the extra array object.
			this.#events[ type ] = [ listener ];
		} else {
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
		}

		return returnValue;
	}

	public off<K extends keyof E>( event: K, fn: E[ K ], options?: boolean | Partial<OnOptions> ): this;
	public off( event: EventName, fn: Event, options?: boolean | Partial<OnOptions> ): this;
	public off( type: EventName, listener: Event ): this {
		if ( typeof listener !== 'function' ) {
			throw new Error( 'removeListener only takes instances of Function' );
		}

		let handlers: ListenerFn[];
		const leafs: { _listeners: ListenerFn[] }[] = [];

		// does not use listeners(), so no side effect of creating _events[type]
		if ( !this.#events[ type ] ) {
			return this;
		}
		handlers = this.#events[ type ];
		leafs.push( { _listeners: handlers } );

		for ( let iLeaf = 0; iLeaf < leafs.length; iLeaf++ ) {
			const leaf = leafs[ iLeaf ];
			handlers = leaf._listeners;
			let position = -1;

			for ( let i = 0, length = handlers.length; i < length; i++ ) {
				if ( handlers[ i ] === listener ||
					( handlers[ i ].listener && handlers[ i ].listener === listener ) ||
					( handlers[ i ]._origin && handlers[ i ]._origin === listener ) ) {
					position = i;
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

	public offAny( fn: ListenerFn ): this {
		let i = 0, l = 0, fns: any[];
		if ( fn && this.#all && this.#all.length > 0 ) {
			fns = this.#all;
			for ( i = 0, l = fns.length; i < l; i++ ) {
				if ( fn === fns[ i ] ) {
					fns.splice( i, 1 );
					if ( this.#removeListener ) {
						this.emit( 'removeListenerAny', fn );
					}
					return this;
				}
			}
		} else {
			fns = this.#all;
			if ( this.#removeListener ) {
				for ( i = 0, l = fns.length; i < l; i++ ) {
					this.emit( 'removeListenerAny', fns[ i ] );
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

		this.#events[ type ] = null;
		return this;
	}

	public listeners<K extends keyof E>( type: K ): E[K][];
	public listeners( type: EventName ): ListenerFn[];
	public listeners( type: EventName ): ListenerFn[] {
		const _events = this.#events;
		let keys: EventName[];
		let listeners: ListenerFn[];
		let allListeners: ListenerFn[];
		let i: number;

		if ( type === undefined ) {
			if ( !_events ) {
				return [];
			}

			keys = Reflect.ownKeys( _events );
			i = keys.length;
			allListeners = [];
			while ( i-- > 0 ) {
				listeners = _events[ keys[ i ] ];
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
	public rawListeners( type: EventName ): ListenerFn[];
	public rawListeners( type: EventName ): ListenerFn[] {
		return this.listeners( type ).map( function ( fn: ListenerFn ) {
			return fn._origin || fn.listener || fn;
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

		return !!( _all && _all.length || _events && ( type === undefined ? Reflect.ownKeys( _events ).length : _events[ type ] ) );
	}

	public listenersAny(): ListenerFn[] {
		if ( this.#all ) {
			return this.#all;
		} else {
			return [];
		}
	}

	public waitFor<K extends keyof E>( event: K, options?: Partial<WaitForOptions<E[K]>> | WaitForFilter<E[K]> ): Promise<Parameters<E[ K ]>>;
	public waitFor( event: EventName, options: Partial<WaitForOptions> | WaitForFilter ): Promise<any>;
	public waitFor( event: EventName, opt: Partial<WaitForOptions> | WaitForFilter ): Promise<any> {
		const self = this;

		let options: Partial<WaitForOptions>;
		if ( typeof opt === 'function' ) {
			options = {
				filter: opt
			};
		} else {
			options = opt;
		}

		options = resolveOptions<WaitForOptions>( options, {
			filter: undefined,
			handleError: false
		}, {
			filter: functionReducer
		} );

		return new Promise( function ( resolve, reject ) {
			function listener( ...args: any[] ) {
				const filter = options.filter;
				if ( filter && !filter( ...args ) ) {
					return;
				}
				self.off( event, listener );
				if ( options.handleError ) {
					const err = args[ 0 ];
					if ( err ) {
						reject( err );
					} else {
						resolve( args.slice( 1 ) );
					}
				} else {
					resolve( args );
				}
			}

			self.#on( event, listener, false );
		} );
	}

	public static once<T extends Events, K extends keyof T>( emitter: EventEmitter<T>, name: K ): Promise<Parameters<T[ K ]>>;
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

			let errorListener: ( err: any ) => void;

			if ( name !== 'error' ) {
				let ettl = 1;

				errorListener = function ( err: any ) {
					if ( --ettl === 0 ) {
						off( name, errorListener );
					}

					off( name, eventListener );
					reject( err );
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
