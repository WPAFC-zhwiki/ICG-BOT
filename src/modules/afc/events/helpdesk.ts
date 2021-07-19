import EventSource from 'eventsource';
import Discord from 'discord.js';
import { $, mwbot, htmlToIRC, turndown, encodeURI, send } from 'modules/afc/util';
import winston from 'winston';

const RTRC = new EventSource( 'https://stream.wikimedia.org/v2/stream/recentchange' );

function htmllink( title: string, text?: string ) {
	return `<a href="https://zh.wikipedia.org/wiki/${ encodeURI( title ) }">${ text || title }</a>`;
}

function mdlink( title: string, text?: string ) {
	return `[${ text || title }](https://zh.wikipedia.org/wiki/${ encodeURI( title ) })`;
}

RTRC.onmessage = async function ( event ) {
	const data = JSON.parse( event.data );
	if (
		data.wiki !== 'zhwiki' ||
		(
			data.title !== 'WikiProject:建立條目/詢問桌'
			// && data.title !== "User:LuciferianThomas/AFC測試2" // only for PJ:AFC/HD testing
		) || data.length.old >= data.length.new + 10
	) {
		return;
	}

	const { compare } = await mwbot.request( {
		action: 'compare',
		format: 'json',
		fromrev: data.revision.old,
		torev: data.revision.new
	} );
	const $diff = $( '<table>' ).append( compare.body );
	let diffText = '';
	$diff.find( '.diff-addedline' ).each( ( _i, ele ) => {
		diffText += $( ele ).text() + '\n';
	} );
	const parse = await mwbot.parseWikitext( diffText );
	const $parse = $( parse );
	$parse.find( 'a' ).each( function ( _i, a ) {
		const $a: JQuery<HTMLAnchorElement> = $( a );
		const url = new URL( $a.get( 0 ).href, 'https://zh.wikipedia.org/' );
		$a.text( `<a href="${ url.href }">${ $a.text() }</a>` );
	} );
	const parseHtml = $parse.text();
	const parseMarkDown = turndown( parseHtml );

	winston.debug( `[afc/events/autoreview] comment: ${ data.comment }, user: ${ data.user }, title: ${ data.title }, new: ${ parseHtml }` );

	const dMsg = new Discord.MessageEmbed()
		.setColor( 'BLUE' )
		.setTitle( '詢問桌有新留言！' )
		.setURL( 'https://zh.wikipedia.org/wiki/WikiProject:建立條目/詢問桌' )
		.setDescription(
			`留言者：${ mdlink( `User:${ data.user }`, data.user ) }`
		)
		.addField(
			'留言內容',
			( parseMarkDown.length > 1024 ? parseMarkDown.substring( 0, 1021 ) + '...' : parseMarkDown )
		);

	const tMsg = `${ htmllink( 'WikiProject:建立條目/詢問桌', '<b>詢問桌有新留言！</b>' ) }
留言者：${ htmllink( `User:${ data.user }`, data.user ) }
留言內容：
${ ( parseHtml.length > 2048 ? parseHtml.substring( 0, 2045 ) + '...' : parseHtml ) }`;

	const iMsg = htmlToIRC( tMsg );

	send( {
		dMsg,
		tMsg,
		iMsg
	} );
};
