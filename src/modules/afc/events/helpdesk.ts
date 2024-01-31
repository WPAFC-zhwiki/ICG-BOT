import Discord = require( 'discord.js' );
import { ApiParams } from 'mwn';
import type AP from 'types-mediawiki/api_params';
import winston = require( 'winston' );

import {
	$, encodeURI, htmlToIRC, makeHTMLLink,
	mwbot, recentChange, RecentChangeEvent,
	registerEvent, send, turndown, wikitextParseAndClean
} from '@app/modules/afc/util';

function htmllink( title: string, text?: string ) {
	return String( makeHTMLLink( `https://zh.wikipedia.org/wiki/${ title }`, text || title ) );
}

function mdlink( title: string, text?: string ) {
	return `[${ text || title }](https://zh.wikipedia.org/wiki/${ encodeURI( title ) })`;
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

	const parsedHTML = await wikitextParseAndClean(
		diffText,
		'WikiProject:建立條目/詢問桌',
		'https://zh.wikipedia.org/wiki/WikiProject:建立條目/詢問桌'
	);
	const parseMarkDown = turndown( parsedHTML );

	winston.debug( `[afc/events/helpdesk] comment: ${ event.comment }, diff: ${ event.old_revid } -> ${ event.revid }, user: ${ event.user }, title: ${ event.title }, new: ${ parsedHTML }` );

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
${ ( parsedHTML.length > 2048 ? parsedHTML.slice( 0, 2045 ) + '...' : parsedHTML ) }`;

	const iMsg = htmlToIRC( tMsg );

	tMsg += '\n\n#詢問桌留言';

	send( {
		dMsg,
		tMsg,
		iMsg
	}, 'helpdesk' );
} );

registerEvent( 'helpdesk' );
