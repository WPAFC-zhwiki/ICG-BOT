import Discord = require( 'discord.js' );
import winston = require( 'winston' );

import { mwbot, autoReview, getIssusData, encodeURI, turndown,
	htmlToIRC, setCommand, AFCPage, CommandReplyFunc, editMessage } from '@app/modules/afc/util';

function htmllink( title: string, text?: string ) {
	return `<a href="https://zh.wikipedia.org/wiki/${ encodeURI( title ) }">${ text || title }</a>`;
}

function mdlink( title: string, text?: string ) {
	return `[${ text || title }](https://zh.wikipedia.org/wiki/${ encodeURI( title ) })`;
}

setCommand( [ 'autoreview', 'autoreviewp' ], async function ( args, reply ) {
	let [ title ] = args.join( ' ' ).split( '#', 1 );

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

	try {
		title = new mwbot.title( title ).getPrefixedText();
	} catch ( e ) {
		reply( {
			tMsg: '標題不合法。',
			dMsg: new Discord.EmbedBuilder( {
				color: Discord.Colors.Red,
				description: '標題不合法。'
			} ),
			iMsg: '標題不合法。'
		} );
		winston.debug( `[afc/commands/autoreview] title: ${ title }, badTitle: true` );
		return;
	}

	let page: AFCPage;
	let redirect = false;
	let rdrTgt = '';
	let rdrFrom: string;
	try {
		page = await AFCPage.init( title );
		redirect = await page.mwnPage.isRedirect();
		rdrTgt = await page.mwnPage.getRedirectTarget();
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
		page = await AFCPage.init( rdrTgt );
		rdrFrom = `${ title }`;
		title = `${ rdrTgt }`;
	}

	if ( ![ 0, 2, 118 ].includes( page.mwnPage.namespace ) ) {
		if ( redirect && page.mwnPage.namespace >= 0 ) {
			reply( {
				tMsg: `頁面${ htmllink( title ) }${ redirect ? `（重新導向自${ htmllink( rdrFrom ) }）` : '' }不在條目命名空間、使用者命名空間或草稿命名空間，不予解析。`,
				dMsg: new Discord.EmbedBuilder( {
					color: Discord.Colors.Yellow,
					description: `頁面${ mdlink( title ) }}${ redirect ? `（重新導向自${ mdlink( rdrFrom ) } ）` : '' }不在條目命名空間、使用者命名空間或草稿命名空間，不予解析。`
				} ),
				iMsg: `頁面 ${ title }<https://zhwp.org/${ encodeURI( title ) }> ${ redirect ? `（重新導向自 ${ rdrFrom }<https://zhwp.org/${ encodeURI( rdrFrom ) }> ）` : '' }不在條目命名空間、使用者命名空間或草稿命名空間，不予解析。`
			} );
			winston.debug( `[afc/commands/autoreview] title: ${ title }, rdrFrom: ${ rdrFrom }, namespace: ${ page.mwnPage.namespace }` );
			return;
		}
	}

	await doAutoReview( reply, page, redirect ? rdrFrom : null );
} );

setCommand( 'autoreviewr', async function ( args, reply ) {
	const rawRevId = args.join( ' ' ).trim();

	if ( !rawRevId.length ) {
		reply( {
			tMsg: '請輸入修訂版本！',
			dMsg: new Discord.EmbedBuilder( {
				color: Discord.Colors.Red,
				description: '請輸入修訂版本！'
			} ),
			iMsg: '請輸入修訂版本！'
		} );
		winston.debug( '[afc/commands/autoreview/revision] revId: null' );
		return;
	}

	const revId = Number.parseInt( rawRevId, 10 );
	if ( !revId || !Number.isInteger( revId ) ) {
		reply( {
			tMsg: '修訂版本不合法。',
			dMsg: new Discord.EmbedBuilder( {
				color: Discord.Colors.Red,
				description: '修訂版本不合法或是頁面不存在。'
			} ),
			iMsg: '修訂版本不合法。'
		} );
		winston.debug( `[afc/commands/autoreview/revision] revId: ${ rawRevId }, badRevId: true` );
		return;
	}

	let page: AFCPage;
	try {
		page = await AFCPage.revInit( revId );
	} catch ( e ) {
		reply( {
			tMsg: `修訂版本<b>${ htmllink( 'Special:PermaLink/' + String( revId ), String( revId ) ) }</b>不存在。`,
			dMsg: new Discord.EmbedBuilder( {
				color: Discord.Colors.Red,
				description: `修訂版本**${ mdlink( 'Special:PermaLink/' + String( revId ), String( revId ) ) }**不存在。`
			} ),
			iMsg: `修訂版本 ${ revId }<https://zhwp.org/Special:PermaLink/${ revId }> 不存在。`
		} );
		winston.debug( `[afc/commands/autoreview] revId: ${ revId }, exists: false` );
		return;
	}

	await doAutoReview( reply, page );
} );

async function doAutoReview( reply: CommandReplyFunc, page: AFCPage, rdrFrom: string | null = null ) {
	const waitMsg = reply( {
		tMsg: '正在解析中，請稍後......',
		dMsg: new Discord.EmbedBuilder( {
			color: Discord.Colors.Blue,
			description: '正在解析中，請稍後......',
			timestamp: Date.now()
		} ),
		iMsg: '正在解析中，請稍後......'
	} );

	const { warning, issues } = await autoReview( page );

	const title = page.mwnPage.getPrefixedText();

	winston.debug( `[afc/commands/autoreview] title: ${ title }, rdrFrom: ${ rdrFrom }, issues: ${ issues.join( ', ' ) }` );

	let output = `系統剛剛自動審閱了頁面${ htmllink( title ) } [<code>${ page.baseRevId }</code>] ${ rdrFrom ? `（重新導向自${ htmllink( rdrFrom ) }）` : '' }`;

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
}
