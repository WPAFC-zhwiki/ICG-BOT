import Discord = require( 'discord.js' );
import { escapeRegExp } from 'lodash';
import { LRUCache } from 'lru-cache';
import winston = require( 'winston' );

import { Manager } from '@app/init';

import { Context } from '@app/lib/handlers/Context';
import messageManage from '@app/lib/message/messageManage';
import { inspect } from '@app/lib/util';

const userInfo = new LRUCache<string, Discord.User>( {
	max: 500,
	ttl: 3600 * 1000,
} );

const discordHandler = Manager.handlers.get( 'Discord' );

type Emoji = {
	name: string;
	id: string;
};

export async function preProcess( context: Context<Discord.Message> ) {
	userInfo.set( String( context.from ), context._rawData.author );

	if ( /<a?:\w+:\d*?>/g.test( context.text ) ) {
		// 處理自定義表情符號
		const emojis: Emoji[] = [];
		const animated: Emoji[] = [];

		context.text = context.text.replaceAll( /<:(\w+):(\d*?)>/g, function ( _: string, name: string, id: string ): string {
			if ( id && emojis.filter( function ( v ) {
				return v.id === id;
			} ).length === 0 ) {
				emojis.push( { name: name, id: id } );
			}
			return `<emoji: ${ name }>`;
		} );
		context.text = context.text.replaceAll( /<a:(\w+):(\d*?)>/g, function ( _: string, name: string, id: string ): string {
			if ( id && animated.filter( function ( v ) {
				return v.id === id;
			} ).length === 0 ) {
				animated.push( { name: name, id: id } );
			}
			return `<emoji: ${ name }>`;
		} );

		if ( !context.extra.files ) {
			context.extra.files = [];
		}
		if ( discordHandler.relayEmoji ) {
			for ( const emoji of emojis ) {
				const url = `https://cdn.discordapp.com/emojis/${ emoji.id }.png`;
				const proxyURL = `https://media.discordapp.net/emojis/${ emoji.id }.png`;
				context.extra.files.push( {
					client: 'Discord',
					type: 'photo',
					id: emoji.id,
					size: 262_144,
					url: discordHandler.useProxyURL ? proxyURL : url,
				} );
			}
			for ( const emoji of animated ) {
				const url = `https://cdn.discordapp.com/emojis/${ emoji.id }.gif`;
				const proxyURL = `https://media.discordapp.net/emojis/${ emoji.id }.gif`;
				context.extra.files.push( {
					client: 'Discord',
					type: 'photo',
					id: emoji.id,
					size: 262_144,
					url: discordHandler.useProxyURL ? proxyURL : url,
				} );
			}
		}
		if ( context.extra.files.length === 0 ) {
			delete context.extra.files;
		}
	}

	if ( /<@!?\d*?>/u.test( context.text ) ) {
		// 處理 at
		let ats: string[] = [];
		const promises: ( Discord.User | Promise<Discord.User | void> )[] = [];

		context.text.replaceAll( /<@!?(\d*?)>/gu, function ( _: string, id: string ) {
			ats.push( id );
			return '';
		} );
		ats = [ ...new Set( ats ) ];

		for ( const at of ats ) {
			if ( userInfo.has( at ) ) {
				promises.push( userInfo.get( at ) );
			} else {
				promises.push( discordHandler.fetchUser( at ).catch( function ( error: Error ) {
					winston.error( `[message/process/Discord] Fail to fetch user ${ at }:` + inspect( error ) );
				} ) );
			}
		}

		try {
			for ( const info of await Promise.all( promises ) ) {
				if ( info ) {
					if ( !userInfo.has( info.id ) ) {
						userInfo.set( info.id, info );
					}

					context.text = context.text.replaceAll(
						// eslint-disable-next-line security/detect-non-literal-regexp
						new RegExp( `<@!?${ escapeRegExp( info.id ) }>`, 'gu' ),
						`<${ info.bot ? 'bot' : 'user' } @${ discordHandler.getNick( info ) }>`
					);
				}
			}
		} catch ( error ) {
			winston.error( '[message/process/Discord]' + inspect( error ) );
		}
	}
	return context;
}

discordHandler.on( 'text', async function ( context: Context<Discord.Message> ) {
	await preProcess( context );
	messageManage.emit( 'discord', context.from, context.to, context.text, context );
	messageManage.emit( 'text', 'Discord', context.from, context.to, context.text, context );

} );
