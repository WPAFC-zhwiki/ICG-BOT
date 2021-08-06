/* eslint-disable @typescript-eslint/no-explicit-any */
import InternalEventEmitter from 'events';

export interface EventEmitterOptions {
	/**
	 * Enables automatic capturing of promise rejection.
	 */
	captureRejections?: boolean;
}

type Event = ( ...args: any ) => void;
export type Events = Record<string | symbol, Event>;

export type EventArgument<T> = T extends ( ...args: infer P ) => void ? P : any[];

declare class EventEmitter<events extends Events = Events> extends InternalEventEmitter {
	addListener<V extends keyof events>( event: V, listener: events[ V ] ): this;
	on<V extends keyof events>( event: V, listener: events[ V ] ): this;
	once<V extends keyof events>( event: V, listener: events[ V ] ): this;
	removeListener<V extends keyof events>( event: V, listener: events[ V ] ): this;
	off<V extends keyof events>( event: V, listener: events[ V ] ): this;
	removeAllListeners<V extends keyof events>( event?: V ): this;
	listeners<V extends keyof events>( event: V ): events[ V ][];
	rawListeners<V extends keyof events>( event: V ): events[ V ][];
	emit<V extends keyof events>( event: V, ...args: EventArgument<events[ V ]> ): boolean;
	listenerCount<V extends keyof events>( event: V ): number;
}

export default EventEmitter;
