import assert from 'node:assert';

import { LRUCache } from 'lru-cache';
import redis = require( 'redis' );
import winston = require( 'winston' );

import type { MessageAssociation } from '@app/config';

import { inspect } from '@app/lib/util';

import { AbstractBridgeDatabase, AssociateMessage } from '@app/modules/transport/BridgeDatabase/AbstractBridgeDatabase';

let instance: RedisBridgeDatabase;

export class RedisBridgeDatabase extends AbstractBridgeDatabase<MessageAssociation.MessageAssociationRedis> {
	#client: redis.RedisClientType;
	#cache: LRUCache<string, AssociateMessage | false>;
	private constructor() {
		super( 'redis' );
		this.#client = redis.createClient( {
			url: this._config.redisUpstream
		} );
		this.#client.on( 'error', ( error ) => {
			winston.error( '[transport/RedisBridgeDatabase] Error: ' + inspect( error ) );
		} );
		this.#cache = new LRUCache( {
			maxSize: 5000,
			ttl: 86400 * 1e3
		} );
	}

	static getInstance() {
		if ( !instance ) {
			instance = new this();
		}
		return instance;
	}

	async start() {
		return await this.#client.connect();
	}

	async stop() {
		return await this.#client.disconnect();
	}

	private _getKey( client: string, chatId: string | number, messageId: string | number ): string {
		return `${ this._config.redisPrefix || 'afc-icg-bot/' }messageAssociation/${ client }:${ messageId }@${ chatId }`;
	}

	async getMessageAssociation(
		targetClient: string,
		chatId: string | number,
		messageId: string | number
	): Promise<AssociateMessage | false> {
		const key = this._getKey( targetClient, chatId, messageId );
		let cacheValue = this.#cache.get( key );
		if ( !cacheValue ) {
			cacheValue = await ( async () => {
				const value = await this.#client.get( key );
				if ( !value ) {
					return false;
				}
				let json: AssociateMessage;
				try {
					json = JSON.parse( value );
					assert( Array.isArray( json ) );
				} catch {
					await this.#client.del( key ).catch( () => {
						// ignore
					} );
					return false;
				}
				return json;
			} )();
			this.#cache.set( key, cacheValue );
		}
		return cacheValue;
	}

	async setMessageAssociation( association: AssociateMessage ): Promise<boolean> {
		const keysToAssociate = [];
		for ( const { client, chatId, messageId } of association ) {
			keysToAssociate.push( this._getKey( client, chatId, messageId ) );
		}
		const setPromises = [];
		for ( const key of keysToAssociate ) {
			this.#cache.set( key, association );
			setPromises.push( this.#client.set( key, JSON.stringify( association ) ) );
		}
		await Promise.all( setPromises );
		return true;
	}
}
