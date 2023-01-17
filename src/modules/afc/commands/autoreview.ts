import Discord = require( 'discord.js' );
import { MwnPage } from 'mwn';
import winston = require( 'winston' );

import { mwbot, autoReview, getIssusData, encodeURI, turndown, htmlToIRC, setCommand, AFCPage } from '@app/modules/afc/util';

import { editMessage } from '../util/msg';

function htmllink( title: string, text?: string ) {
	return `<a href="https://zh.wikipedia.org/wiki/${ encodeURI( title ) }">${ text || title }</a>`;
}

function mdlink( title: string, text?: string ) {
	return `[${ text || title }](https://zh.wikipedia.org/wiki/${ encodeURI( title ) })`;
}

setCommand( 'autoreview', async function ( args, reply ) {
	let title = args.join( ' ' ).split( '#' )[ 0 ];

	title = title.slice( 0, 1 ).toUpperCase() + title.slice( 1, title.length );

	if ( !title.length ) {
		reply( {
			tMsg: '請輸入頁面名稱！',
			dMsg: new Discord.EmbedBuilder( {
				color: Discord.Colors.Red,
				description: '請輸入頁面名稱！'
			} ),
			iMsg: '請輸入頁面名稱！'
		} );
		winston.debug( '[afc/commands/autoreview] title: null' );
		return;
	}

	let page: MwnPage;
	try {
		page = new mwbot.page( title );
	} catch ( e ) {
		reply( {
			tMsg: `標題<b>${ htmllink( title ) }</b>不合法或是頁面不存在。`,
			dMsg: new Discord.EmbedBuilder( {
				color: Discord.Colors.Red,
				description: `標題**${ mdlink( title ) }**不合法或是頁面不存在。`
			} ),
			iMsg: `標題 ${ title }<https://zhwp.org/${ encodeURI( title ) }> 不合法或是頁面不存在。`
		} );
		winston.debug( `[afc/commands/autoreview] title: ${ title }, badTitle: true` );
		return;
	}

	let redirect = false;
	let rdrTgt = '';
	let rdrFrom: string;
	try {
		redirect = await page.isRedirect();
		rdrTgt = await page.getRedirectTarget();
	} catch ( e ) {
		reply( {
			tMsg: `頁面<b>${ htmllink( title ) }</b>不存在。`,
			dMsg: new Discord.EmbedBuilder( {
				color: Discord.Colors.Red,
				description: `頁面**${ mdlink( title ) }**不存在。`
			} ),
			iMsg: `頁面 ${ title }<https://zhwp.org/${ encodeURI( title ) }> 不存在。`
		} );
		winston.debug( `[afc/commands/autoreview] title: ${ title }, exists: false` );
		return;
	}

	if ( redirect ) {
		page = new mwbot.page( rdrTgt );
		rdrFrom = `${ title }`;
		title = `${ rdrTgt }`;
	}

	if ( ![ 0, 2, 118 ].includes( page.namespace ) ) {
		if ( redirect && page.namespace >= 0 ) {
			reply( {
				tMsg: `頁面${ htmllink( title ) }${ redirect ? `（重新導向自${ htmllink( rdrFrom ) }）` : '' }不在條目命名空間、使用者命名空間或草稿命名空間，不予解析。`,
				dMsg: new Discord.EmbedBuilder( {
					color: Discord.Colors.Yellow,
					description: `頁面${ mdlink( title ) }}${ redirect ? `（重新導向自${ mdlink( rdrFrom ) } ）` : '' }不在條目命名空間、使用者命名空間或草稿命名空間，不予解析。`
				} ),
				iMsg: `頁面 ${ title }<https://zhwp.org/${ encodeURI( title ) }> ${ redirect ? `（重新導向自 ${ rdrFrom }<https://zhwp.org/${ encodeURI( rdrFrom ) }> ）` : '' }不在條目命名空間、使用者命名空間或草稿命名空間，不予解析。`
			} );
			winston.debug( `[afc/commands/autoreview] title: ${ title }, rdrFrom: ${ rdrFrom }, namespace: ${ page.namespace }` );
			return;
		}
	}

	const waitMsg = reply( {
		tMsg: '正在解析中，請稍後\nConnect to https://zhwp-afc-bot.toolforge.org/api/autoreview.njs ......',
		dMsg: new Discord.EmbedBuilder( {
			color: Discord.Colors.Blue,
			description: '正在解析中，請稍後\nConnect to https://zhwp-afc-bot.toolforge.org/api/autoreview.njs ......',
			timestamp: Date.now()
		} ),
		iMsg: '正在解析中，請稍後......'
	} ); // editMessage

	const { warning, issues } = await autoReview( await AFCPage.init( page.getPrefixedText() ) );

	winston.debug( `[afc/commands/autoreview] title: ${ title }, rdrFrom: ${ rdrFrom }, issues: ${ issues.join( ', ' ) }` );

	let output = `系統剛剛自動審閱了頁面${ htmllink( title ) }${ redirect ? `（重新導向自${ htmllink( rdrFrom ) }）` : '' }`;

	const dMsg = new Discord.EmbedBuilder( {
		title: '自動審閱系統',
		color: issues && issues.length ? Discord.Colors.Red : Discord.Colors.Green,
		description: turndown( output ),
		timestamp: Date.now()
	} );

	if ( issues && issues.length > 0 ) {
		output += '，初步發現可能存在以下問題：';
		dMsg.addFields( [
			{
				name: '潛在問題',
				value: issues.map( function ( x ) {
					return `• ${ turndown( getIssusData( x, true ) ) }`;
				} ).join( '\n' )
			}
		] );
		output += '\n' + issues.map( function ( x ) {
			return `• ${ getIssusData( x, true ) }`;
		} ).join( '\n' );
	} else {
		dMsg.addFields( [
			{
				name: '潛在問題',
				value: '• 沒有發現顯著的問題。'
			}
		] );
		output += '，沒有發現顯著的問題。';
	}
	if ( warning.length ) {
		if ( warning.length === 1 ) {
			output += '\n<b>警告：</b>' + warning[ 0 ];
			dMsg.setFooter( {
				text: '警告：' + warning[ 0 ]
			} );
		} else {
			output += '\n<b>警告：</b>\n' + warning.map( function ( x ) {
				return `• ${ x }`;
			} ).join( '\n' );
			dMsg.setFooter( {
				text: '警告：' + warning.map( function ( x ) {
					return `• ${ x }`;
				} ).join( '\n' )
			} );
		}
	}

	const tMsg = `<b>自動審閱系統</b>\n${ output }`;

	const iMsg = htmlToIRC( tMsg );

	waitMsg.then( function ( w ) {
		editMessage( w, {
			tMsg,
			dMsg: {
				embeds: [ dMsg ]
			}
		} );
	} );

	reply( {
		iMsg // IRC Message 不能編輯
	} );
} );
