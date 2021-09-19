/* eslint-disable @typescript-eslint/no-this-alias */
/* eslint-disable max-len, @typescript-eslint/no-explicit-any */
/*!
 * EventEmitter2 6.4.4
 * https://github.com/EventEmitter2/EventEmitter2 commit 7dff2d6a160a636046921256fa4eef9025ae4bf8
 *
 * Copyright (c) 2013 hij1nx
 * Licensed under the MIT license.
 */
import NodeJSEventEmitter from 'events';

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
	_async?: true;
}

export interface EventAndListener {
    ( event: EventName, ...args: any[] ): void;
}

interface WaitForFilter {
	( ...values: any[] ): boolean;
}

export interface WaitForOptions {
    /**
     * @default 0
     */
    timeout: number,
    /**
     * @default null
     */
    filter: WaitForFilter,
    /**
     * @default false
     */
    handleError: boolean,
    /**
     * @default Promise
     */
    Promise: PromiseConstructor,
    /**
     * @default false
     */
    overload: boolean
}

interface CancelablePromiseConstructor extends PromiseConstructor {
	/**
	 *  * A reference to the prototype.
	 */
	readonly prototype: CancelablePromise<any>;

	/**
	 * Creates a new Promise.
	 *
	 * @param executor A callback used to initialize the promise. This callback is passed two arguments:
	 * a resolve callback used to resolve the promise with a value or the result of another promise,
	 * and a reject callback used to reject the promise with a provided reason or error.
	 */
	new <T>( executor: ( resolve: ( value: T | PromiseLike<T> ) => void, reject: ( reason?: any ) => void, onCancel: ( cb: Func ) => void ) => void ): CancelablePromise<T>;
}

export interface CancelablePromise<T> extends Promise<T>{
	cancel( reason: Error | string ): void;
}

export interface OnceOptions {
    /**
     * @default 0
     */
    timeout: number,
    /**
     * @default Promise
     */
    Promise: PromiseConstructor,
    /**
     * @default false
     */
    overload: boolean
}

export interface ListenToOptions {
    on?( event: EventName, handler: Func ): void;
    off?( event: EventName, handler: Func ): void;
    reducers: Func | Record<EventName, any>
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

function toObject<T extends string | symbol | number, S>( keys: T[], values?: S[] ): Record<T, S> {
	// eslint-disable-next-line @typescript-eslint/ban-ts-comment
	// @ts-ignore
	const obj: Record<T, S> = {};
	let key: T;
	const len:number = keys.length;
	const valuesCount: number = values ? values.length : 0;
	for ( let i = 0; i < len; i++ ) {
		key = keys[ i ];
		obj[ key ] = i < valuesCount ? values[ i ] : undefined;
	}
	return obj;
}

type EventObj<E extends Events, K extends keyof E = EventName> = {
	data: any[],
	name: EventName,
	original: K
}

type TargetObserverReducer<E extends Events, K extends keyof E = EventName> =
	( this: GeneralEventEmitter, eventObj: EventObj<E, K> ) => any;

class TargetObserver<E extends Events = Events> {
	_emitter: EventEmitter<E>;
	_target: GeneralEventEmitter;
	_listeners: Record<string|symbol, Event[]> = {};
	_listenersCount: number;
	_on: Func;
	_off: Func;

	private _onNewListener: ( event: string | symbol ) => void;
	private _onRemoveListener: ( event: string | symbol ) => void;

	constructor( emitter: EventEmitter<E>, target: GeneralEventEmitter, options: {
		on?: Func;
		off?: Func;
	} ) {
		this._emitter = emitter;
		this._target = target;
		this._listeners = {};
		this._listenersCount = 0;

		let on: Func;
		let off: Func;

		if ( options.on || options.off ) {
			on = options.on;
			off = options.off;
		}

		if ( target.addEventListener ) {
			on = target.addEventListener;
			off = target.removeEventListener;
		} else if ( target.addListener ) {
			on = target.addListener;
			off = target.removeListener;
		} else if ( target.on ) {
			on = target.on;
			off = target.off;
		}

		if ( !on && !off ) {
			throw new Error( 'target does not implement any known event API' );
		}

		if ( typeof on !== 'function' ) {
			throw new TypeError( 'on method must be a function' );
		}

		if ( typeof off !== 'function' ) {
			throw new TypeError( 'off method must be a function' );
		}

		this._on = on;
		this._off = off;

		const _observers: TargetObserver[] = emitter._observers;
		if ( _observers ) {
			_observers.push( this );
		} else {
			emitter._observers = [ this ];
		}
	}

	public subscribe<K extends keyof E>( event: K, localEvent: EventName, reducer: TargetObserverReducer<E, K> ): void;
	public subscribe( event: EventName, localEvent: EventName, reducer: TargetObserverReducer<E> ): void;
	public subscribe( event: EventName, localEvent: EventName, reducer: TargetObserverReducer<E> ): void {
		const observer: this = this;
		const target: GeneralEventEmitter = this._target;
		const emitter: EventEmitter<Events> = this._emitter;
		const listeners: Record<string | symbol, Event[]> = this._listeners;
		function handler( ...args: any[] ): void {
			const eventObj: EventObj<E> = {
				data: args,
				name: localEvent,
				original: event
			};

			if ( reducer ) {
				const result = reducer.call( target, eventObj );
				if ( result !== false ) {
					emitter.emit( eventObj.name, ...args );
				}
				return;
			}
			emitter.emit( localEvent, ...args );
		}

		if ( listeners[ event ] ) {
			throw new Error( 'Event \'' + String( event ) + '\' is already listening' );
		}

		this._listenersCount++;

		if ( emitter.confNewListener && emitter.confRemoveListener && !observer._onNewListener ) {

			this._onNewListener = function ( _event: EventName ): void {
				if ( _event === localEvent && listeners[ event ] === null ) {
					listeners[ event ] = [ handler ];
					observer._on.call( target, event, handler );
				}
			};

			emitter.on( 'newListener', this._onNewListener );

			this._onRemoveListener = function ( _event: any ): void {
				if ( _event === localEvent && !emitter.hasListeners( _event ) && listeners[ event ] ) {
					listeners[ event ] = null;
					observer._off.call( target, event, handler );
				}
			};

			delete listeners[ event ];

			emitter.on( 'removeListener', this._onRemoveListener );
		} else {
			listeners[ event ] = [ handler ];
			observer._on.call( target, event, handler );
		}
	}

	protected _findTargetIndex( observer: GeneralEventEmitter ): number {
		const observers: TargetObserver[] = this._emitter._observers;
		if ( !observers ) {
			return -1;
		}
		const len: number = observers.length;
		for ( let i = 0; i < len; i++ ) {
			if ( observers[ i ]._target === observer ) {
				return i;
			}
		}
		return -1;
	}

	public unsubscribe<K extends keyof E>( event: K ): void;
	public unsubscribe( event: EventName ): void;
	public unsubscribe( event: EventName ): void {
		const observer: this = this;
		const listeners: Record<string | symbol, Event[]> = this._listeners;
		const emitter: EventEmitter<Events> = this._emitter;
		let handler: Event[];
		let events: EventName[];
		const off: Func = this._off;
		const target: GeneralEventEmitter = this._target;
		let i: number;

		if ( event && typeof event !== 'string' ) {
			throw new TypeError( 'event must be a string' );
		}

		function clearRefs(): void {
			if ( observer._onNewListener ) {
				emitter.off( 'newListener', observer._onNewListener );
				emitter.off( 'removeListener', observer._onRemoveListener );
				observer._onNewListener = null;
				observer._onRemoveListener = null;
			}
			const index: number = emitter._findTargetIndex( target );
			emitter._observers.splice( index, 1 );
		}

		if ( event ) {
			handler = listeners[ event ];
			if ( !handler ) {
				return;
			}
			off.call( target, event, handler );
			delete listeners[ event ];
			if ( !--this._listenersCount ) {
				clearRefs();
			}
		} else {
			events = Reflect.ownKeys( listeners );
			i = events.length;
			while ( i-- > 0 ) {
				event = events[ i ];
				off.call( target, event, listeners[ event ] );
			}
			this._listeners = {};
			this._listenersCount = 0;
			clearRefs();
		}
	}
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

function constructorReducer<T>( value: T, reject: Func ): T {
	if ( typeof value !== 'function' || !hasOwnProperty.call( value, 'prototype' ) ) {
		reject( 'value must be a constructor' );
	}
	return value;
}

function makeTypeReducer( types: string[] ): ( <V>( v: V, reject: Func ) => V ) {
	const message = 'value must be type of ' + types.join( '|' );

	return function<V> ( v: V, reject: Func ): V {
		const kind: string = typeof v;
		let i: number = types.length;
		while ( i-- > 0 ) {
			if ( kind === types[ i ] ) {
				return v;
			}
		}
		reject( message );
	};
}

const functionReducer = makeTypeReducer( [ 'function' ] );

const objectFunctionReducer = makeTypeReducer( [ 'object', 'function' ] );

function isCancelablePromise( Promise: PromiseConstructor ): Promise is CancelablePromiseConstructor {
	return Promise && hasOwnProperty.call( Promise, 'prototype' ) && hasOwnProperty.call( Promise.prototype, 'cancel' );
}

function makeCancelablePromise<T>( Promise: PromiseConstructor,
	executor: ( resolve: ( value: T | PromiseLike<T> ) => void, reject: ( reason?: any ) => void, onCancel: ( cb: Func ) => void ) => void,
	options: {
		timeout: number;
		overload: boolean;
	}
): CancelablePromise<T> {
	let isCancelable: boolean;
	let callbacks: any[];
	let timer: NodeJS.Timeout;
	let subscriptionClosed: boolean;

	const promise: Promise<T> & Partial<CancelablePromise<T>> = new Promise<T>( function ( resolve: ( value: T ) => void, reject: ( reason?: any ) => void, onCancel?: ( cb: Func ) => void ) {
		options = resolveOptions<{
			timeout: number;
			overload: boolean;
		}>( options, {
			timeout: 0,
			overload: false
		}, {
			// eslint-disable-next-line no-shadow
			timeout: function ( value: number, reject: ( reason: string ) => void ) {
				value *= 1;
				if ( typeof value !== 'number' || value < 0 || !Number.isFinite( value ) ) {
					reject( 'timeout must be a positive number' );
				}
				return value;
			}
		} );

		isCancelable = !options.overload && isCancelablePromise( Promise ) && typeof onCancel === 'function';

		function cleanup(): void {
			if ( callbacks ) {
				callbacks = null;
			}
			if ( timer ) {
				clearTimeout( timer );
				timer = undefined;
			}
		}

		function _resolve( value: any ): void {
			cleanup();
			resolve( value );
		}

		function _reject( err: any ): void {
			cleanup();
			reject( err );
		}

		if ( isCancelable ) {
			executor( _resolve, _reject, onCancel );
		} else {
			callbacks = [ function ( reason: any ): void {
				_reject( reason || new Error( 'canceled' ) );
			} ];
			executor( _resolve, _reject, function ( cb: Func ): void {
				if ( subscriptionClosed ) {
					throw new Error( 'Unable to subscribe on cancel event asynchronously' );
				}
				if ( typeof cb !== 'function' ) {
					throw new TypeError( 'onCancel callback must be a function' );
				}
				callbacks.push( cb );
			} );
			subscriptionClosed = true;
		}

		if ( options.timeout > 0 ) {
			timer = setTimeout( function (): void {
				const reason: Error & {
					code?: string;
				} = new Error( 'timeout' );
				reason.code = 'ETIMEDOUT';
				timer = undefined;
				promise.cancel( reason );
				reject( reason );
			}, options.timeout );
		}
	} );

	if ( !isCancelable ) {
		promise.cancel = function ( reason: any ): void {
			if ( !callbacks ) {
				return;
			}
			const length: number = callbacks.length;
			for ( let i = 1; i < length; i++ ) {
				callbacks[ i ]( reason );
			}
			// internal callback to reject the promise
			callbacks[ 0 ]( reason );
			callbacks = null;
		};
	}

	return Object.assign( promise );
}

class Listener<E extends Events = Events, K extends keyof E = string | symbol> {
	public emitter: EventEmitter;
	public event: string | symbol;
	public listener: ListenerFn;

	public constructor( emitter: EventEmitter<E>, event: K, listener: E[ K ] );
	public constructor( emitter: EventEmitter, event: string | symbol, listener: ListenerFn );
	public constructor( emitter: EventEmitter, event: string | symbol, listener: ListenerFn ) {
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
	protected _conf: EventEmitterConfig;

	protected _events: Record<string|symbol, ListenerFn[] & {
		warned?: boolean;
	}> & {
		maxListeners?: number;
	};

	public ignoreErrors: boolean;

	protected _newListener: boolean;
	protected _removeListener: boolean;

	public get confNewListener(): boolean {
		return this._newListener;
	}
	public get confRemoveListener(): boolean {
		return this._removeListener;
	}

	public verboseMemoryLeak: boolean;

	protected _all: ListenerFn[];
	public _observers: TargetObserver<E>[];
	protected _maxListeners: number = defaultMaxListeners;

	public constructor( conf?: EventEmitterConfig ) {
		this._events = {};
		this._newListener = false;
		this._removeListener = false;
		this.verboseMemoryLeak = false;
		this._configure( conf );
	}

	protected _init(): void {
		this._events = {};
		if ( this._conf ) {
			this._configure( this._conf );
		}
	}

	protected _configure( conf?: EventEmitterConfig ): void {
		if ( conf ) {
			this._conf = conf;

			if ( conf.delimiter ) {
				this.delimiter = conf.delimiter;
			}

			if ( conf.maxListeners ) {
				this.maxListeners = conf.maxListeners;
			}

			if ( conf.newListener ) {
				this._newListener = conf.newListener;
			}

			if ( conf.removeListener ) {
				this._removeListener = conf.removeListener;
			}

			if ( conf.verboseMemoryLeak ) {
				this.verboseMemoryLeak = conf.verboseMemoryLeak;
			}

			if ( conf.verboseMemoryLeak ) {
				this.ignoreErrors = conf.ignoreErrors;
			}
		}
	}

	public static EventEmitter: typeof EventEmitter = EventEmitter;
	public static EventEmitter2: typeof EventEmitter = EventEmitter;

	public _findTargetIndex( observer: GeneralEventEmitter ): number {
		const observers: TargetObserver[] = this._observers;
		if ( !observers ) {
			this._observers = [];
			return -1;
		}
		return observers.map( function ( _observer: TargetObserver ): GeneralEventEmitter {
			return _observer._target;
		} ).indexOf( observer );
	}

	public listenTo( target: GeneralEventEmitter, events: EventName | EventName[] | Record<EventName, any>, options: ListenToOptions ): this {
		if ( typeof target !== 'object' ) {
			throw new TypeError( 'target musts be an object' );
		}

		const emitter: this = this;

		options = resolveOptions<ListenToOptions>( options, {
			on: undefined,
			off: undefined,
			reducers: undefined
		}, {
			on: functionReducer,
			off: functionReducer,
			reducers: objectFunctionReducer
		} );

		// eslint-disable-next-line no-shadow
		function listen( events: Record<EventName, any> ): void {
			if ( typeof events !== 'object' ) {
				throw new TypeError( 'events must be an object' );
			}

			const reducers = options.reducers;
			const index = emitter._findTargetIndex( target );
			let observer: TargetObserver;

			if ( index === -1 ) {
				observer = new TargetObserver( emitter, target, options );
			} else {
				observer = emitter._observers[ index ];
			}

			const keys = Reflect.ownKeys( events );
			const len = keys.length;
			let event: string | symbol;
			const isSingleReducer = typeof reducers === 'function';

			for ( let i = 0; i < len; i++ ) {
				event = keys[ i ];
				observer.subscribe(
					event,
					events[ event ] || event,
					isSingleReducer ? reducers : reducers && reducers[ event ]
				);
			}
		}

		if ( Array.isArray( events ) ) {
			listen( toObject<EventName, undefined>( events ) );
		} else if ( typeof events === 'string' ) {
			listen( toObject<string, undefined>( events.split( /\s+/ ) ) );
		} else if ( typeof events === 'symbol' ) {
			listen( {
				[ events ]: undefined
			} );
		} else {
			listen( events );
		}

		return this;
	}

	public stopListeningTo( target: GeneralEventEmitter, event: EventName ): boolean {
		const observers: TargetObserver<E>[] = this._observers;

		if ( !observers ) {
			return false;
		}

		let i: number = observers.length;
		let observer: TargetObserver;
		let matched = false;

		if ( target && typeof target !== 'object' ) {
			throw new TypeError( 'target should be an object' );
		}

		while ( i-- > 0 ) {
			observer = observers[ i ];
			if ( !target || observer._target === target ) {
				observer.unsubscribe( event );
				matched = true;
			}
		}

		return matched;
	}

	// By default EventEmitters will print a warning if more than
	// 10 listeners are added to it. This is a useful default which
	// helps finding memory leaks.
	//
	// Obviously not all Emitters should be limited to 10. This function allows
	// that to be increased. Set to zero for unlimited.
	public delimiter = '.';

	public getMaxListeners(): number {
		return this._maxListeners;
	}
	public setMaxListeners( n: number ): this {
		if ( n !== undefined ) {
			this._maxListeners = n;
			if ( !this._conf ) {
				this._conf = {};
			}
			this._conf.maxListeners = n;
		}

		return this;
	}

	public get maxListeners(): number {
		return this._maxListeners;
	}
	public set maxListeners( n: number ) {
		this.setMaxListeners( n );
	}

	public event: EventName = '';

	public once<K extends keyof E>( event: K, fn: E[ K ], options: OnOptions_Objectify ): Listener<E, K>;
	public once<K extends keyof E>( event: K, fn: E[ K ], options?: boolean | Partial<OnOptions> ): this;
	public once( event: EventName, fn: Event, options: OnOptions_Objectify ): Listener;
	public once( event: EventName, fn: Event, options?: boolean | Partial<OnOptions> ): this;
	public once( event: EventName, fn: Event, options?: boolean | Partial<OnOptions> ): this | Listener<Events, string | symbol> {
		return this._once( event, fn, false, options );
	}

	public prependOnceListener<K extends keyof E>( event: K, fn: E[ K ], options: OnOptions_Objectify ): Listener<E, K>;
	public prependOnceListener<K extends keyof E>( event: K, fn: E[ K ], options?: boolean | Partial<OnOptions> ): this;
	public prependOnceListener( event: EventName, fn: Event, options: OnOptions_Objectify ): Listener;
	public prependOnceListener( event: EventName, fn: Event, options?: boolean | Partial<OnOptions> ): this;
	public prependOnceListener( event: EventName, fn: Event, options?: boolean | Partial<OnOptions> ): this | Listener<Events, string | symbol> {
		return this._once( event, fn, true, options );
	}

	protected _once( event: EventName, fn: Event, prepend: boolean, options?: boolean | Partial<OnOptions> ): this | Listener<Events, string | symbol> {
		return this._many( event, 1, fn, prepend, options );
	}

	public many<K extends keyof E>( event: K, timesToListen: number, fn: E[ K ], options: OnOptions_Objectify ): Listener<E, K>;
	public many<K extends keyof E>( event: K, timesToListen: number, fn: E[ K ], options?: boolean | Partial<OnOptions> ): this;
	public many( event: EventName, timesToListen: number, fn: Event, options: OnOptions_Objectify ): Listener;
	public many( event: EventName, timesToListen: number, fn: Event, options?: boolean | Partial<OnOptions> ): this;
	public many<K extends keyof E>( event: K, timesToListen: number, fn: E[ K ], options?: boolean | Partial<OnOptions> ): this;
	public many( event: EventName, timesToListen: number, fn: Event, options?: boolean | Partial<OnOptions> ): this;
	public many( event: EventName, ttl: number, fn: Event, options?: boolean | Partial<OnOptions> ): this | Listener<Events, string | symbol> {
		return this._many( event, ttl, fn, false, options );
	}

	public prependMany<K extends keyof E>( event: K, timesToListen: number, fn: E[ K ], options: OnOptions_Objectify ): Listener<E, K>;
	public prependMany<K extends keyof E>( event: K, timesToListen: number, fn: E[ K ], options?: boolean | Partial<OnOptions> ): this;
	public prependMany( event: EventName, timesToListen: number, fn: Event, options: OnOptions_Objectify ): Listener;
	public prependMany( event: EventName, timesToListen: number, fn: Event, options?: boolean | Partial<OnOptions> ): this;
	public prependMany( event: EventName, ttl: number, fn: Event, options?: boolean | Partial<OnOptions> ): this | Listener {
		return this._many( event, ttl, fn, true, options );
	}

	protected _many( event: EventName, ttl: number, fn: Event, prepend: boolean, options?: boolean | Partial<OnOptions> ): this | Listener {
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

		return this._on( event, listener, prepend, options );
	}

	public emit<K extends keyof E>( type: K, ...args: Parameters<E[ K ]> ): boolean;
	public emit( type: EventName, ...args: any[] ): boolean;
	public emit( ...args: any[] ): boolean {
		if ( !this._events && !this._all ) {
			return false;
		}

		if ( !this._events ) {
			this._init();
		}

		const type: EventName = args[ 0 ];
		let clearArgs: any[];

		if ( type === 'newListener' && !this._newListener ) {
			if ( !this._events.newListener ) {
				return false;
			}
		}

		const al: number = arguments.length;
		let handler: ListenerFn[];

		if ( this._all && this._all.length ) {
			handler = this._all.slice();

			for ( let i = 0, l = handler.length; i < l; i++ ) {
				this.event = type;
				handler[ i ]( ...args );
			}
		}

		handler = this._events[ type ];
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
		} else if ( !this.ignoreErrors && !this._all && type === 'error' ) {
			if ( args[ 1 ] instanceof Error ) {
				throw args[ 1 ]; // Unhandled 'error' event
			} else {
				throw Object.assign( new Error( "Uncaught, unspecified 'error' event." ), {
					rawError: args[ 1 ]
				} );
			}
		}

		return !!this._all;
	}

	public emitAsync<K extends keyof E>( type: K, ...args: Parameters<E[ K ]> ): Promise<void[]>;
	public emitAsync( type: EventName, ...args: any[] ): Promise<void[]>;
	public async emitAsync( ...args: any[] ): Promise<( boolean|void )[]> {
		if ( !this._events && !this._all ) {
			return [ false ];
		}

		if ( !this._events ) {
			this._init();
		}

		const type: EventName = args[ 0 ];
		let clearArgs: any[];

		if ( type === 'newListener' && !this._newListener ) {
			if ( !this._events.newListener ) {
				return [ false ];
			}
		}

		const promises: ( Promise<void> | void )[] = [];

		const al = arguments.length;
		let handler: ListenerFn[];

		if ( this._all ) {
			for ( let i = 0, l = this._all.length; i < l; i++ ) {
				this.event = type;
				promises.push( this._all[ i ]( ...args ) );
			}
		}

		handler = this._events[ type ];

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
		} else if ( !this.ignoreErrors && !this._all && type === 'error' ) {
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
			this._onAny( type, !!listener );
			return this;
		} else if ( typeof listener !== 'function' ) {
			throw new Error( 'onAny only accepts instances of Function' );
		}
		return this._on( type, listener, false, options );
	}

	public addListener = this.on;
	public addEventListener = this.on;

	public prependListener<K extends keyof E>( event: K, fn: E[ K ], options: OnOptions_Objectify ): Listener<E, K>;
	public prependListener<K extends keyof E>( event: K, fn: E[ K ], options?: boolean | Partial<OnOptions> ): this;
	public prependListener( event: EventName, fn: Event, options: OnOptions_Objectify ): this;
	public prependListener( event: EventName, fn: Event, options?: boolean | Partial<OnOptions> ): this;
	public prependListener( type: EventName, listener: Event, options?: boolean | Partial<OnOptions> ): this | Listener {
		return this._on( type, listener, true, options );
	}

	public onAny( listener: EventAndListener ): this;
	public onAny( fn: EventAndListener ): this {
		return this._onAny( fn, false );
	}

	public prependAny( fn: Event ): this;
	public prependAny( fn: Event ): this {
		return this._onAny( fn, true );
	}

	protected _onAny( fn: EventAndListener, prepend?: boolean ): this {
		if ( typeof fn !== 'function' ) {
			throw new Error( 'onAny only accepts instances of Function' );
		}

		if ( !this._all ) {
			this._all = [];
		}

		// Add the function to the event listener collection.
		if ( prepend ) {
			this._all.unshift( fn );
		} else {
			this._all.push( fn );
		}

		return this;
	}

	protected _setupListener( event: EventName, listener: ListenerFn, options: boolean | OnOptions ): [ ListenerFn, Listener | this ] {
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

	protected _logPossibleMemoryLeak( count: number, eventName: EventName ): void {
		let errorMsg = '(node) warning: possible EventEmitter memory ' +
		'leak detected. ' + count + ' listeners added. ' +
		'Use emitter.setMaxListeners() to increase limit.';

		if ( this.verboseMemoryLeak ) {
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

	protected _on( type: EventName, listener: Event, prepend?: boolean, options?: boolean | Partial<OnOptions> ): this | Listener<Events, string | symbol> {
		if ( typeof listener !== 'function' ) {
			throw new Error( 'on only accepts instances of Function' );
		}

		if ( !this._events ) {
			this._init();
		}

		let returnValue: this | Listener<Events, string | symbol> = this;
		let temp: [ ListenerFn, this | Listener<Events, string | symbol> ];

		if ( options !== undefined ) {
			temp = this._setupListener( type, listener, options );
			listener = temp[ 0 ];
			returnValue = temp[ 1 ];
		}

		// To avoid recursion in the case that type == "newListeners"! Before
		// adding it to the listeners, first emit "newListeners".
		if ( this._newListener ) {
			this.emit( 'newListener', type, listener );
		}

		if ( !this._events[ type ] ) {
			// Optimize the case of one listener. Don't need the extra array object.
			this._events[ type ] = [ listener ];
		} else {
			// If we've already got an array, just add
			if ( prepend ) {
				this._events[ type ].unshift( listener );
			} else {
				this._events[ type ].push( listener );
			}

			// Check for listener leak
			if (
				!this._events[ type ].warned &&
				this._maxListeners > 0 &&
				this._events[ type ].length > this._maxListeners
			) {
				this._events[ type ].warned = true;
				this._logPossibleMemoryLeak( this._events[ type ].length, type );
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
		if ( !this._events[ type ] ) {
			return this;
		}
		handlers = this._events[ type ];
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

			this._events[ type ].splice( position, 1 );

			if ( handlers.length === 0 ) {
				delete this._events[ type ];
			}
			if ( this._removeListener ) {
				this.emit( 'removeListener', type, listener );
			}

			return this;
		}

		return this;
	}

	public offAny( fn: ListenerFn ): this {
		let i = 0, l = 0, fns: any[];
		if ( fn && this._all && this._all.length > 0 ) {
			fns = this._all;
			for ( i = 0, l = fns.length; i < l; i++ ) {
				if ( fn === fns[ i ] ) {
					fns.splice( i, 1 );
					if ( this._removeListener ) {
						this.emit( 'removeListenerAny', fn );
					}
					return this;
				}
			}
		} else {
			fns = this._all;
			if ( this._removeListener ) {
				for ( i = 0, l = fns.length; i < l; i++ ) {
					this.emit( 'removeListenerAny', fns[ i ] );
				}
			}
			this._all = [];
		}
		return this;
	}

	public removeListener = this.off;
	public removeEventListener = this.off;

	public removeAllListeners( type: keyof E ): this;
	public removeAllListeners( type?: EventName ): this;
	public removeAllListeners( type?: EventName ): this {
		if ( type === undefined ) {
			if ( this._events ) {
				this._init();
			}
			return this;
		}

		this._events[ type ] = null;
		return this;
	}

	public listeners<K extends keyof E>( type: K ): E[K][];
	public listeners( type: EventName ): ListenerFn[];
	public listeners( type: EventName ): ListenerFn[] {
		const _events = this._events;
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
		const _events = this._events;
		return _events ? Reflect.ownKeys( _events ) : [];
	}

	public listenerCount( type: EventName ): number {
		return this.listeners( type ).length;
	}

	public hasListeners( type?: keyof E ): boolean;
	public hasListeners( type?: EventName ): boolean;
	public hasListeners( type?: EventName ): boolean {
		const _events = this._events;
		const _all = this._all;

		return !!( _all && _all.length || _events && ( type === undefined ? Reflect.ownKeys( _events ).length : _events[ type ] ) );
	}

	public listenersAny(): ListenerFn[] {
		if ( this._all ) {
			return this._all;
		} else {
			return [];
		}
	}

	public waitFor<K extends keyof E>( event: K, options?: Partial<WaitForOptions> | number | Func ): CancelablePromise<Parameters<E[ K ]>>;
	public waitFor( event: EventName, options: Partial<WaitForOptions> | number | Func ): CancelablePromise<any>;
	public waitFor( event: EventName, opt: Partial<WaitForOptions> | number | Func ): CancelablePromise<any> {
		const self = this;

		let options: Partial<WaitForOptions>;
		if ( typeof opt === 'number' ) {
			options = {
				timeout: opt
			};
		} else if ( typeof opt === 'function' ) {
			options = {
				filter: opt
			};
		} else {
			options = opt;
		}

		options = resolveOptions<WaitForOptions>( options, {
			timeout: 0,
			filter: undefined,
			handleError: false,
			Promise: Promise,
			overload: false
		}, {
			filter: functionReducer,
			Promise: constructorReducer
		} );

		return makeCancelablePromise( options.Promise, function ( resolve, reject, onCancel ) {
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

			onCancel( function () {
				self.off( event, listener );
			} );

			self._on( event, listener, false );
		}, {
			timeout: options.timeout,
			overload: options.overload
		} );
	}

	public static once<T extends Events, K extends keyof T>( emitter: EventEmitter<T>, name: K, options?: Partial<OnceOptions> ): CancelablePromise<Parameters<T[ K ]>>;
	public static once( emitter: GeneralEventEmitter, name: string, options?: Partial<OnceOptions> ): CancelablePromise<any[]>;
	public static once( emitter: GeneralEventEmitter, name: string, options?: Partial<OnceOptions> ): CancelablePromise<any[]> {
		options = resolveOptions<OnceOptions>( options, {
			Promise: Promise,
			timeout: 0,
			overload: false
		}, {
			Promise: constructorReducer
		} );

		const _Promise = options.Promise;

		return makeCancelablePromise( _Promise, function ( resolve, reject, onCancel ) {
			let handler: Func;
			if ( emitter instanceof EventEmitter ) {
				handler = function ( ...args ) {
					resolve( args );
				};

				onCancel( function () {
					emitter.removeEventListener( name, handler );
				} );

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

			onCancel( function () {
				if ( errorListener ) {
					off( 'error', errorListener );
				}
				off( name, eventListener );
			} );

			on( name, eventListener );
		}, {
			timeout: options.timeout,
			overload: options.overload
		} );
	}

	public static get defaultMaxListeners(): number {
		return EventEmitter.prototype._maxListeners;
	}
	public static set defaultMaxListeners( n: number ) {
		if ( typeof n !== 'number' || n < 0 || Number.isNaN( n ) ) {
			throw new TypeError( 'n must be a non-negative number' );
		}
		EventEmitter.prototype._maxListeners = n;
	}
}
