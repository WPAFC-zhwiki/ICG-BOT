import Discord = require( 'discord.js' );

import { mwbot, turndown, $, htmlToIRC, encodeURI, autoReview, getIssusData, setCommand, autoReviewExtends } from '../util';
import { MwnPage } from 'mwn';
import winston from 'winston';

function htmllink( title: string, text?: string ) {
	return `<a href="https://zh.wikipedia.org/wiki/${ encodeURI( title ) }">${ text || title }</a>`;
}

function mdlink( title: string, text?: string ) {
	return `[${ text || title }](https://zh.wikipedia.org/wiki/${ encodeURI( title ) })`;
}

setCommand( 'autoreview', async function ( args, reply ) {
	let title = args.join( ' ' ).split( '#' )[ 0 ];

	if ( !args.length || !title.length ) {
		reply( {
			tMsg: '請輸入頁面名稱！',
			dMsg: new Discord.MessageEmbed()
				.setColor( 'RED' )
				.setDescription( '請輸入頁面名稱！' ),
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
			dMsg: new Discord.MessageEmbed()
				.setColor( 'RED' )
				.setDescription( `標題**${ mdlink( title ) }**不合法或是頁面不存在。` ),
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
			dMsg: new Discord.MessageEmbed()
				.setColor( 'RED' )
				.setDescription( `頁面**${ mdlink( title ) }**不存在。` ),
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

	if ( [ 0, 2, 118 ].indexOf( page.namespace ) === -1 ) {
		if ( redirect && page.namespace >= 0 ) {
			reply( {
				tMsg: `頁面${ htmllink( title ) }${ redirect ? `（重新導向自${ htmllink( rdrFrom ) }）` : '' }不在條目命名空間、使用者命名空間或草稿命名空間，不予解析。`,
				dMsg: new Discord.MessageEmbed()
					.setColor( 'YELLOW' )
					.setDescription( `頁面${ mdlink( title ) }}${ redirect ? `（重新導向自${ mdlink( rdrFrom ) } ）` : '' }不在條目命名空間、使用者命名空間或草稿命名空間，不予解析。` ),
				iMsg: `頁面 ${ title }<https://zhwp.org/${ encodeURI( title ) }> ${ redirect ? `（重新導向自 ${ rdrFrom }<https://zhwp.org/${ encodeURI( rdrFrom ) }> ）` : '' }不在條目命名空間、使用者命名空間或草稿命名空間，不予解析。`
			} );
			winston.debug( `[afc/commands/autoreview] title: ${ title }, rdrFrom: ${ rdrFrom }, namespace: ${ page.namespace }` );
			return;
		}
	}
	const wikitext: string = await page.text();

	const html: string = await mwbot.parseTitle( title, {
		uselang: 'zh-hant'
	} );
	const $parseHTML: JQuery<Node[]> = $( $.parseHTML( html ) );

	const { issues } = await autoReview( wikitext, $parseHTML );

	autoReviewExtends( '', '', page, wikitext, issues );

	winston.debug( `[afc/commands/autoreview] title: ${ title }, rdrFrom: ${ rdrFrom }, issues: ${ issues.join( ', ' ) }` );

	let output = `系統剛剛自動審閱了頁面${ htmllink( title ) }${ redirect ? `（重新導向自${ htmllink( rdrFrom ) }）` : '' }`;

	const dMsg = new Discord.MessageEmbed()
		.setColor( issues && issues.length ? 'RED' : 'GREEN' )
		.setTitle( '自動審閱系統' )
		.setDescription( `${ turndown( output ) }` )
		.setTimestamp();

	if ( issues && issues.length > 0 ) {
		output += '，初步發現可能存在以下問題：';
		dMsg.addField( '潛在問題', issues.map( function ( x ) {
			return `• ${ turndown( getIssusData( x ) ) }`;
		} ) );
		output += issues.map( function ( x ) {
			return `\n• ${ getIssusData( x ) }`;
		} ).join( '' );
	} else {
		dMsg.addField( '潛在問題', [ '• 沒有發現顯著的問題。' ] );
		output += '，沒有發現顯著的問題。';
	}

	let tMsg = `<b>自動審閱系統</b>\n${ output }`;

	if ( $parseHTML.find( '#disambigbox' ).length ) {
		dMsg.setFooter( '提醒：本頁為消歧義頁，審閱結果可能不準確。' );
		tMsg += '\n<b>提醒</b>：本頁為消歧義頁，審閱結果可能不準確。';
	}

	const iMsg = htmlToIRC( tMsg );

	reply( {
		dMsg,
		tMsg,
		iMsg
	} );
} );
