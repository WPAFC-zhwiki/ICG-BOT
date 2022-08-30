import Discord = require( 'discord.js' );
import winston = require( 'winston' );

import { $, encodeURI, htmlToIRC, mwbot, recentChange, RecentChangeEvent, registerEvent, send, turndown } from 'src/modules/afc/util';

function htmllink( title: string, text?: string ) {
	return `<a href="https://zh.wikipedia.org/wiki/${ encodeURI( title ) }">${ text || title }</a>`;
}

function mdlink( title: string, text?: string ) {
	return `[${ text || title }](https://zh.wikipedia.org/wiki/${ encodeURI( title ) })`;
}

recentChange.addProcessFunction( function ( event: RecentChangeEvent ) {
	if (
		event.type === 'edit' &&
		event.title === 'WikiProject:建立條目/詢問桌' &&
		( event.length?.old || 0 ) < ( event.length?.new || 0 ) + 10
	) {
		return true;
	}

	return false;
}, async function ( event: RecentChangeEvent ) {
	const { compare } = await mwbot.request( {
		action: 'compare',
		format: 'json',
		fromrev: event.revision.old,
		torev: event.revision.new
	} );

	const $diff = $( '<table>' ).append( compare.body );
	let diffText = '';

	$diff.find( '.diff-addedline' ).each( ( _i, ele ) => {
		diffText += $( ele ).text() + '\n';
	} );

	const parse = await mwbot.parseWikitext( diffText );
	const $parse = $( $.parseHTML( parse ) );
	$parse.find( 'a' ).each( function ( _i, a ) {
		const $a: JQuery<HTMLAnchorElement> = $( a );
		const url = new URL( $a.attr( 'href' ), 'https://zh.wikipedia.org/WikiProject:建立條目/詢問桌' );
		$a.text( `<a href="${ url.href }">${ $a.text() }</a>` );
	} );
	$parse.find( '.mwe-math-element' ).each( function ( _i, ele ) {
		$( ele ).text( `<math>${ $( ele ).find( 'math' ).attr( 'alttext' ) }</math>` );
	} );
	const parseHtml = $parse.text();
	const parseMarkDown = turndown( parseHtml );

	winston.debug( `[afc/events/helpdesk] comment: ${ event.comment }, diff: ${ event.revision.old } -> ${ event.revision.new }, user: ${ event.user }, title: ${ event.title }, new: ${ parseHtml }` );

	const diff = `Special:Diff/${ event.revision.old }/${ event.revision.new }`;
	const dMsg = new Discord.EmbedBuilder( {
		title: '詢問桌有新留言！',
		color: Discord.Colors.Blue,
		url: `https://zh.wikipedia.org/wiki/${ diff }`,
		description: `留言者：${ mdlink( `User:${ event.user }`, event.user ) }`,
		fields: [ {
			name: '留言內容',
			value: parseMarkDown.length > 1024 ? parseMarkDown.slice( 0, 1021 ) + '...' : parseMarkDown
		} ],
		timestamp: event.timestamp * 1000
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
