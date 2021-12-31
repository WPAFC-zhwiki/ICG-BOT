import LRU = require( 'lru-cache' );
import winston = require( 'winston' );
import Discord = require( 'discord.js' );

import { Manager } from 'src/init';
import { Context } from 'src/lib/handlers/Context';
import msgManage from 'src/lib/message/msgManage';

const userInfo = new LRU<string, Discord.User>( {
	max: 500,
	maxAge: 3600000
} );

const discordHandler = Manager.handlers.get( 'Discord' );

type Emoji = {
	name: string;
	id: string;
};

export async function preProcess( context: Context<Discord.Message> ) {
	userInfo.set( String( context.from ), context._rawdata.author );

	if ( /<a?:\w+:\d*?>/g.test( context.text ) ) {
		// 處理自定義表情符號
		const emojis: Emoji[] = [];
		const animated: Emoji[] = [];

		context.text = context.text.replace( /<:(\w+):(\d*?)>/g, function ( _: string, name: string, id: string ): string {
			if ( id && !emojis.filter( function ( v ) {
				return v.id === id;
			} ).length ) {
				emojis.push( { name: name, id: id } );
			}
			return `<emoji: ${ name }>`;
		} );
		context.text = context.text.replace( /<a:(\w+):(\d*?)>/g, function ( _: string, name: string, id: string ): string {
			if ( id && !animated.filter( function ( v ) {
				return v.id === id;
			} ).length ) {
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
					size: 262144,
					url: discordHandler.useProxyURL ? proxyURL : url
				} );
			}
			for ( const emoji of animated ) {
				const url = `https://cdn.discordapp.com/emojis/${ emoji.id }.gif`;
				const proxyURL = `https://media.discordapp.net/emojis/${ emoji.id }.gif`;
				context.extra.files.push( {
					client: 'Discord',
					type: 'photo',
					id: emoji.id,
					size: 262144,
					url: discordHandler.useProxyURL ? proxyURL : url
				} );
			}
		}
		if ( !context.extra.files.length ) {
			delete context.extra.files;
		}
	}

	if ( /<@!?\d*?>/u.test( context.text ) ) {
		// 處理 at
		let ats: string[] = [];
		const promises: ( Discord.User | Promise<Discord.User | void> )[] = [];

		context.text.replace( /<@!?(\d*?)>/gu, function ( _: string, id: string ) {
			ats.push( id );
			return '';
		} );
		ats = [ ...new Set( ats ) ];

		for ( const at of ats ) {
			if ( userInfo.has( at ) ) {
				promises.push( userInfo.get( at ) );
			} else {
				promises.push( discordHandler.fetchUser( at ).catch( function ( e: Error ) {
					winston.error( `[message/process/Discord] Fail to fetch user ${ at }:`, e.stack );
				} ) );
			}
		}

		try {
			for ( const info of await Promise.all( promises ) ) {
				if ( info ) {
					if ( !userInfo.has( info.id ) ) {
						userInfo.set( info.id, info );
					}

					context.text = context.text.replace(
						new RegExp( `<@!?${ info.id }>`, 'gu' ),
						`<${ info.bot ? 'bot' : 'user' } @${ discordHandler.getNick( info ) }>`
					);
				}
			}
		} catch ( e ) {
			winston.error( '[message/process/Discord]', e );
		}
	}
	return context;
}

discordHandler.on( 'text', async function ( context: Context<Discord.Message> ) {
	await preProcess( context );
	msgManage.emit( 'discord', context.from, context.to, context.text, context );
	msgManage.emit( 'text', 'Discord', context.from, context.to, context.text, context );

} );
