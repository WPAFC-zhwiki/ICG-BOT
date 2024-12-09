import redis = require( 'ioredis' );
import winston = require( 'winston' );

import config from '@app/config';
import { ConfigTS } from '@config/config.type';

import { inspect } from '@app/lib/util';

let instance: RedisWrapper;

export class RedisWrapper {
	#client?: redis.Redis;
	#isEnable: boolean;
	#config: ConfigTS['redisCache'];

	private constructor() {
		this.#config = config.redisCache;
		this.#isEnable = !!this.#config.enable;
		if ( this.#isEnable ) {
			this.#client = new redis.Redis( this.#config.upstream );
			this.#client.on( 'error', ( error ) => {
				winston.error( '[redis] Error: ' + inspect( error ) );
			} );
		}
	}

	public static getInstance() {
		if ( !instance ) {
			instance = new this();
		}
		return instance;
	}

	public get isEnable() {
		return this.#isEnable;
	}

	public _getPrefixedKey( key: string ): string {
		return `${ this.#config.prefix || 'afc-icg-bot/' }${ key }`;
	}

	public async get( key: string ): Promise<string | false> {
		if ( !this.#isEnable ) {
			return false;
		}
		const prefixedKey = this._getPrefixedKey( key );
		const value = await this.#client.get( prefixedKey );
		if ( !value ) {
			return false;
		}

		return value;
	}

	public async getJson<T>( key: string ): Promise<T | false> {
		const value = await this.get( key );
		if ( !value ) {
			return false;
		}
		let json: T;
		try {
			json = JSON.parse( value ) satisfies T;
		} catch {
			await this.#client.del( key ).catch( () => {
				// ignore
			} );
			return false;
		}
		return json;
	}

	public async set( key: string, value: string ): Promise<boolean> {
		if ( !this.#isEnable ) {
			return false;
		}
		const prefixedKey = this._getPrefixedKey( key );
		return await this.#client.set( prefixedKey, value ) === 'OK';
	}

	public async setJson<T>( key: string, value: T ): Promise<boolean> {
		return this.set( key, JSON.stringify( value ) );
	}

	public setPipeline(): IRedisSetPipelineWrapper {
		if ( this.#isEnable ) {
			return new RedisSetPipelineWrapper( this, this.#client.pipeline() );
		}
		return new NullRedisSetPipelineWrapper();
	}
}

interface IRedisSetPipelineWrapper {
	set( key: string, value: string ): this;
	setJson<T>( key: string, value: T ): this;
	exec(): ReturnType<redis.ChainableCommander['exec']>;
}

class RedisSetPipelineWrapper implements IRedisSetPipelineWrapper {
	#parent: RedisWrapper;
	#commander: redis.ChainableCommander;

	public constructor( parent: RedisWrapper, commander: redis.ChainableCommander ) {
		this.#parent = parent;
		this.#commander = commander;
	}

	public set( key: string, value: string ): this {
		const prefixedKey = this.#parent._getPrefixedKey( key );
		this.#commander.set( prefixedKey, value );
		return this;
	}

	public setJson<T>( key: string, value: T ): this {
		return this.set( key, JSON.stringify( value ) );
	}

	public exec() {
		return this.#commander.exec();
	}
}

class NullRedisSetPipelineWrapper implements IRedisSetPipelineWrapper {
	public set(): this {
		return this;
	}

	public setJson(): this {
		return this;
	}

	public exec() {
		// eslint-disable-next-line unicorn/no-null
		return Promise.resolve( null );
	}
}
