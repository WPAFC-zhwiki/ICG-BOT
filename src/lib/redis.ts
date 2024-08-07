import redis = require( 'redis' );
import winston = require( 'winston' );

import config from '@app/config';
import { ConfigTS } from '@config/config.type';

import { inspect } from '@app/lib/util';

let instance: RedisWrapper;

export class RedisWrapper {
	#client?: redis.RedisClientType;
	#isEnable: boolean;
	#config: ConfigTS['redisCache'];
	#startPromise: Promise<void> | null = null;

	private constructor() {
		this.#config = config.redisCache;
		this.#isEnable = !!this.#config.enable;
		if ( this.#isEnable ) {
			this.#client = redis.createClient( {
				url: this.#config.upstream
			} );
			this.#client.on( 'error', ( error ) => {
				winston.error( '[transport/RedisBridgeDatabase] Error: ' + inspect( error ) );
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

	public get startPromise() {
		if ( !this.isEnable ) {
			return Promise.resolve();
		}
		return this.#startPromise || Promise.reject( new Error( 'Redis client isn\'t start.' ) );
	}

	public async start() {
		if ( this.#isEnable ) {
			this.#startPromise = new Promise<void>( ( resolve, reject ) => {
				this.#client.connect().then( () => {
					resolve();
				}, reject );
			} );
			await this.#startPromise;
		}
	}

	public async stop() {
		if ( this.#isEnable ) {
			this.#startPromise = null;
			await this.#client.disconnect();
		}
	}

	private _getPrefixedKey( key: string ): string {
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
}
