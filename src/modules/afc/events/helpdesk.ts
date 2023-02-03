import cheerio = require( 'cheerio' );
import Discord = require( 'discord.js' );
import { ApiParams } from 'mwn';
import type AP from 'types-mediawiki/api_params';
import winston = require( 'winston' );

import { $, encodeURI, htmlEscape, htmlToIRC, mwbot, recentChange, RecentChangeEvent, registerEvent, send, turndown } from '@app/modules/afc/util';

function htmllink( title: string, text?: string ) {
	return `<a href="https://zh.wikipedia.org/wiki/${ encodeURI( title ) }">${ text || title }</a>`;
}

function mdlink( title: string, text?: string ) {
	return `[${ text || title }](https://zh.wikipedia.org/wiki/${ encodeURI( title ) })`;
}

function filterWikitext( wt: string ) {
	return wt
		// escape math & chem
		.replace( /(<(math|chem)\b)/gi, '<nowiki>$1' )
		.replace( /(<\/(math|chem)\b([^>]*)>)/gi, '$1</nowiki>' );
}

recentChange.addProcessFunction( function ( event: RecentChangeEvent ) {
	if (
		event.type === 'edit' &&
		event.title === 'WikiProject:建立條目/詢問桌' &&
		( event.oldlen || 0 ) < ( event.newlen || 0 ) + 10
	) {
		return true;
	}

	return false;
}, async function ( event: RecentChangeEvent.EditEvent ) {
	const { compare } = await mwbot.request( {
		action: 'compare',
		format: 'json',
		fromrev: event.old_revid,
		torev: event.revid,
		formatversion: '2'
	} as AP.ApiComparePagesParams as ApiParams );

	const $diff = $( '<table>' ).append( compare.body );
	let diffText = '';

	$diff.find( '.diff-addedline' ).each( ( _i, ele ) => {
		diffText += $( ele ).text() + '\n';
	} );

	const parse = await mwbot.parseWikitext( filterWikitext( diffText ) );
	const $parse = cheerio.load( parse, {}, false );
	$parse( 'a' ).each( function ( _i, a ) {
		const $a = $( a );
		const url = new URL( $a.attr( 'href' ), 'https://zh.wikipedia.org/WikiProject:建立條目/詢問桌' );
		$a.text( `<a href="${ url.href }">${ htmlEscape( $a.text() ) }</a>` );
	} );
	$parse( 'style' ).remove();
	const parseHtml = $parse.text();
	const parseMarkDown = turndown( parseHtml );

	winston.debug( `[afc/events/helpdesk] comment: ${ event.comment }, diff: ${ event.old_revid } -> ${ event.revid }, user: ${ event.user }, title: ${ event.title }, new: ${ parseHtml }` );

	const diff = `Special:Diff/${ event.old_revid }/${ event.revid }`;
	const dMsg = new Discord.EmbedBuilder( {
		title: '詢問桌有新留言！',
		color: Discord.Colors.Blue,
		url: `https://zh.wikipedia.org/wiki/${ diff }`,
		description: `留言者：${ mdlink( `User:${ event.user }`, event.user ) }`,
		fields: [ {
			name: '留言內容',
			value: parseMarkDown.length > 1024 ? parseMarkDown.slice( 0, 1021 ) + '...' : parseMarkDown
		} ],
		timestamp: new Date( event.timestamp ).getTime()
	} );

	let tMsg = `${ htmllink( diff, '<b>詢問桌有新留言！</b>' ) }
留言者：${ htmllink( `User:${ event.user }`, event.user ) }
留言內容：
${ ( parseHtml.length > 2048 ? parseHtml.slice( 0, 2045 ) + '...' : parseHtml ) }`;

	const iMsg = htmlToIRC( tMsg );

	tMsg += '\n\n#詢問桌留言';

	send( {
		dMsg,
		tMsg,
		iMsg
	}, 'helpdesk' );
} );

registerEvent( 'helpdesk' );
