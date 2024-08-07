import { LRUCache } from 'lru-cache';
import winston = require( 'winston' );

import { RedisWrapper } from '@app/lib/redis';

export const associateMessageUsefulClients = [ 'Telegram', 'Discord' ];
export type AssociateMessage = { client: string, chatId: string | number, messageId: string | number }[];

const redisWrapper = RedisWrapper.getInstance();

export class BridgeDatabase {
	#cache: LRUCache<string, AssociateMessage | false>;

	accessor isEnable = false;

	public constructor() {
		this.#cache = new LRUCache( {
			max: 5000,
			ttl: 86400 * 1e3
		} );
	}

	private _getKey( client: string, chatId: string | number, messageId: string | number ): string {
		return `messageAssociation/${ client }:${ messageId }@${ chatId }`;
	}

	public async getMessageAssociation(
		targetClient: string,
		chatId: string | number,
		messageId: string | number
	): Promise<AssociateMessage | false> {
		if ( !redisWrapper.isEnable || !this.isEnable ) {
			return Promise.resolve( false );
		}

		const key = this._getKey( targetClient, chatId, messageId );
		winston.debug( '[transport/RedisBridgeDatabase] Query: ' + [ targetClient, chatId, messageId ] + ' = ' + key );
		let cacheValue = this.#cache.get( key );
		if ( !cacheValue ) {
			cacheValue = await redisWrapper.getJson<AssociateMessage>( key );
			this.#cache.set( key, cacheValue );
		}
		winston.debug( '[transport/RedisBridgeDatabase] Query: ' + key + ' = ' + cacheValue );
		return cacheValue;
	}

	public async setMessageAssociation( association: AssociateMessage ): Promise<boolean> {
		if ( !redisWrapper.isEnable || !this.isEnable ) {
			return Promise.resolve( false );
		}

		winston.debug( '[transport/RedisBridgeDatabase] Insert: ' + JSON.stringify( association ) );
		const keysToAssociate = [];
		for ( const { client, chatId, messageId } of association ) {
			keysToAssociate.push( this._getKey( client, chatId, messageId ) );
		}
		const setter = redisWrapper.setPipeline();
		for ( const key of keysToAssociate ) {
			this.#cache.set( key, association );
			setter?.setJson<AssociateMessage>( key, association );
		}
		await setter?.exec();
		return true;
	}
}
