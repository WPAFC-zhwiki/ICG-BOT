import Discord from 'discord.js';
import { $, mwbot, htmlToIRC, turndown, encodeURI, send } from 'modules/afc/util';
import winston from 'winston';
import { RecentChangeStreamEvent } from 'mwn/build/eventstream';

function htmllink( title: string, text?: string ) {
	return `<a href="https://zh.wikipedia.org/wiki/${ encodeURI( title ) }">${ text || title }</a>`;
}

function mdlink( title: string, text?: string ) {
	return `[${ text || title }](https://zh.wikipedia.org/wiki/${ encodeURI( title ) })`;
}

new mwbot.stream( 'recentchange', {
	onopen() {
		return;
	},
	onerror( err ) {
		try {
			const errjson: string = JSON.stringify( err );
			if ( errjson === '{"type":"error"}' ) {
				return; // ignore
			}
			winston.error( '[afc/event/helpdesk] Recentchange Error (Throw by EventSource):' + errjson );
		} catch ( e ) {
			winston.error( '[afc/event/helpdesk] Recentchange Error (Throw by EventSource): <Throw at console>' );
			console.log( err );
		}
	}
} ).addListener( function ( event: RecentChangeStreamEvent ) {
	if (
		event.wiki === 'zhwiki' &&
		(
			event.title === 'WikiProject:建立條目/詢問桌'
			// && data.title !== "User:LuciferianThomas/AFC測試2" // only for PJ:AFC/HD testing
		) && ( event.length?.old || 11 ) < ( event.length?.new || 0 ) + 10
	) {
		return true;
	}

	return false;
}, async function ( event: RecentChangeStreamEvent ) {
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
	const $parse = $( parse );
	$parse.find( 'a' ).each( function ( _i, a ) {
		const $a: JQuery<HTMLAnchorElement> = $( a );
		const url = new URL( $a.attr( 'href' ), 'https://zh.wikipedia.org/WikiProject:建立條目/詢問桌' );
		$a.text( `<a href="${ url.href }">${ $a.text() }</a>` );
	} );
	const parseHtml = $parse.text();
	const parseMarkDown = turndown( parseHtml );

	winston.debug( `[afc/events/helpdesk] comment: ${ event.comment }, diff: ${ event.revision.old } -> ${ event.revision.new }, user: ${ event.user }, title: ${ event.title }, new: ${ parseHtml }` );

	const diff = `Special:${ event.revision.old }/${ event.revision.new }`;
	const dMsg = new Discord.MessageEmbed()
		.setColor( 'BLUE' )
		.setTitle( '詢問桌有新留言！' )
		.setURL( `https://zh.wikipedia.org/wiki/${ diff }` )
		.setDescription(
			`留言者：${ mdlink( `User:${ event.user }`, event.user ) }`
		)
		.addField(
			'留言內容',
			( parseMarkDown.length > 1024 ? parseMarkDown.substring( 0, 1021 ) + '...' : parseMarkDown )
		);

	const tMsg = `${ htmllink( diff, '<b>詢問桌有新留言！</b>' ) }
留言者：${ htmllink( `User:${ event.user }`, event.user ) }
留言內容：
${ ( parseHtml.length > 2048 ? parseHtml.substring( 0, 2045 ) + '...' : parseHtml ) }`;

	const iMsg = htmlToIRC( tMsg );

	send( {
		dMsg,
		tMsg,
		iMsg
	} );
} );
