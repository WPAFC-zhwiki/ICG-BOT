import Discord from 'discord.js';
import winston from 'winston';

import { mwbot, encodeURI, turndown } from '@app/modules/afc/util.mjs';
import { AFCPage } from '@app/modules/afc/utils/AFCPage.mjs';
import { autoReview, getIssusData } from '@app/modules/afc/utils/autoreview.mjs';
import { type CommandReplyFunc, editMessage, htmlToIRC, setCommand } from '@app/modules/afc/utils/message.mjs';

function htmllink( title: string, text?: string ) {
	return `<a href="https://zh.wikipedia.org/wiki/${ encodeURI( title ) }">${ text || title }</a>`;
}

function mdlink( title: string, text?: string ) {
	return `[${ text || title }](https://zh.wikipedia.org/wiki/${ encodeURI( title ) })`;
}

setCommand( [ 'autoreview', 'autoreviewp' ], async function ( args, reply ) {
	let [ title ] = args.join( ' ' ).split( '#', 1 );

	if ( title.length === 0 ) {
		reply( {
			tMessage: '請輸入頁面名稱！',
			dMessage: new Discord.EmbedBuilder( {
				color: Discord.Colors.Red,
				description: '請輸入頁面名稱！',
			} ),
			iMessage: '請輸入頁面名稱！',
		} );
		winston.debug( '[afc/commands/autoreview] title: null' );
		return;
	}

	try {
		title = new mwbot.Title( title ).getPrefixedText();
	} catch {
		reply( {
			tMessage: '標題不合法。',
			dMessage: new Discord.EmbedBuilder( {
				color: Discord.Colors.Red,
				description: '標題不合法。',
			} ),
			iMessage: '標題不合法。',
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
	} catch {
		reply( {
			tMessage: `頁面<b>${ htmllink( title ) }</b>不存在。`,
			dMessage: new Discord.EmbedBuilder( {
				color: Discord.Colors.Red,
				description: `頁面**${ mdlink( title ) }**不存在。`,
			} ),
			iMessage: `頁面 ${ title }<https://zhwp.org/${ encodeURI( title ) }> 不存在。`,
		} );
		winston.debug( `[afc/commands/autoreview] title: ${ title }, exists: false` );
		return;
	}

	if ( redirect ) {
		page = await AFCPage.init( rdrTgt );
		rdrFrom = `${ title }`;
		title = `${ rdrTgt }`;
	}

	if ( ![ 0, 2, 118 ].includes( page.mwnPage.namespace ) && redirect && page.mwnPage.namespace >= 0 ) {
		reply( {
			tMessage: `頁面${ htmllink( title ) }${ redirect ? `（重新導向自${ htmllink( rdrFrom ) }）` : '' }不在條目命名空間、使用者命名空間或草稿命名空間，不予解析。`,
			dMessage: new Discord.EmbedBuilder( {
				color: Discord.Colors.Yellow,
				description: `頁面${ mdlink( title ) }}${ redirect ? `（重新導向自${ mdlink( rdrFrom ) } ）` : '' }不在條目命名空間、使用者命名空間或草稿命名空間，不予解析。`,
			} ),
			iMessage: `頁面 ${ title }<https://zhwp.org/${ encodeURI( title ) }> ${ redirect ? `（重新導向自 ${ rdrFrom }<https://zhwp.org/${ encodeURI( rdrFrom ) }> ）` : '' }不在條目命名空間、使用者命名空間或草稿命名空間，不予解析。`,
		} );
		winston.debug( `[afc/commands/autoreview] title: ${ title }, rdrFrom: ${ rdrFrom }, namespace: ${ page.mwnPage.namespace }` );
		return;
	}

	await doAutoReview( reply, page, redirect ? rdrFrom : undefined );
} );

setCommand( 'autoreviewr', async function ( args, reply ) {
	const rawRevId = args.join( ' ' ).trim();

	if ( rawRevId.length === 0 ) {
		reply( {
			tMessage: '請輸入修訂版本！',
			dMessage: new Discord.EmbedBuilder( {
				color: Discord.Colors.Red,
				description: '請輸入修訂版本！',
			} ),
			iMessage: '請輸入修訂版本！',
		} );
		winston.debug( '[afc/commands/autoreview/revision] revId: null' );
		return;
	}

	const revId = Number.parseInt( rawRevId, 10 );
	if ( !revId || !Number.isInteger( revId ) ) {
		reply( {
			tMessage: '修訂版本不合法。',
			dMessage: new Discord.EmbedBuilder( {
				color: Discord.Colors.Red,
				description: '修訂版本不合法或是頁面不存在。',
			} ),
			iMessage: '修訂版本不合法。',
		} );
		winston.debug( `[afc/commands/autoreview/revision] revId: ${ rawRevId }, badRevId: true` );
		return;
	}

	let page: AFCPage;
	try {
		page = await AFCPage.revInit( revId );
	} catch {
		reply( {
			tMessage: `修訂版本<b>${ htmllink( 'Special:PermaLink/' + String( revId ), String( revId ) ) }</b>不存在。`,
			dMessage: new Discord.EmbedBuilder( {
				color: Discord.Colors.Red,
				description: `修訂版本**${ mdlink( 'Special:PermaLink/' + String( revId ), String( revId ) ) }**不存在。`,
			} ),
			iMessage: `修訂版本 ${ revId }<https://zhwp.org/Special:PermaLink/${ revId }> 不存在。`,
		} );
		winston.debug( `[afc/commands/autoreview] revId: ${ revId }, exists: false` );
		return;
	}

	await doAutoReview( reply, page );
} );

async function doAutoReview( reply: CommandReplyFunc, page: AFCPage, rdrFrom?: string ) {
	const waitMessage = reply( {
		tMessage: '正在解析中，請稍後......',
		dMessage: new Discord.EmbedBuilder( {
			color: Discord.Colors.Blue,
			description: '正在解析中，請稍後......',
			timestamp: Date.now(),
		} ),
		iMessage: '正在解析中，請稍後......',
	} );

	const { warning, issues } = await autoReview( page );

	const title = page.mwnPage.getPrefixedText();

	winston.debug( `[afc/commands/autoreview] title: ${ title }, rdrFrom: ${ rdrFrom }, issues: ${ issues.join( ', ' ) }` );

	let output = `系統剛剛自動審閱了頁面${ htmllink( title ) } [<code>${ page.baseRevId }</code>] ${ rdrFrom ? `（重新導向自${ htmllink( rdrFrom ) }）` : '' }`;

	const dMessage = new Discord.EmbedBuilder( {
		title: '自動審閱系統',
		color: issues && issues.length > 0 ? Discord.Colors.Red : Discord.Colors.Green,
		description: turndown( output ),
		timestamp: Date.now(),
	} );

	if ( issues && issues.length > 0 ) {
		output += '，初步發現可能存在以下問題：';
		dMessage.addFields( [
			{
				name: '潛在問題',
				value: issues.map( function ( x ) {
					return `• ${ turndown( getIssusData( x, true ) ) }`;
				} ).join( '\n' ),
			},
		] );
		output += '\n' + issues.map( function ( x ) {
			return `• ${ getIssusData( x, true ) }`;
		} ).join( '\n' );
	} else {
		dMessage.addFields( [
			{
				name: '潛在問題',
				value: '• 沒有發現顯著的問題。',
			},
		] );
		output += '，沒有發現顯著的問題。';
	}
	if ( warning.length > 0 ) {
		if ( warning.length === 1 ) {
			output += '\n<b>警告：</b>' + warning[ 0 ];
			dMessage.setFooter( {
				text: '警告：' + warning[ 0 ],
			} );
		} else {
			output += '\n<b>警告：</b>\n' + warning.map( function ( x ) {
				return `• ${ x }`;
			} ).join( '\n' );
			dMessage.setFooter( {
				text: '警告：' + warning.map( function ( x ) {
					return `• ${ x }`;
				} ).join( '\n' ),
			} );
		}
	}

	const tMessage = `<b>自動審閱系統</b>\n${ output }`;

	const indexMessage = htmlToIRC( tMessage );

	waitMessage.then( function ( w ) {
		editMessage( w, {
			tMessage: tMessage,
			dMessage: {
				embeds: [ dMessage ],
			},
		} );
	} );

	reply( {
		iMessage: indexMessage, // IRC Message 不能編輯
	} );
}
