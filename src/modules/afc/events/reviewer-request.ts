import Discord = require( 'discord.js' );
import winston = require( 'winston' );

import { Manager } from 'src/init';

const tg = Manager.handlers.get( 'Telegram' );

import { mwbot, $, recentChange, RecentChangeEvent, encodeURI, turndown, htmlToIRC, send } from 'src/modules/afc/util';

function htmllink( title: string, text?: string ) {
	return `<a href="https://zh.wikipedia.org/wiki/${ encodeURI( title ) }">${ text || title }</a>`;
}

recentChange.addProcessFunction( function ( event: RecentChangeEvent ) {
	if (
		event.type === 'edit' &&
		event.title === 'WikiProject:建立條目/參與者/申請' &&
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
	const $parse = $( parse );
	const $req = $parse.find( '.reviewer-request' );
	winston.debug( `[afc/events/reviewer-request] comment: ${ event.comment }, fire: true` );
	if ( $req.length ) {
		const reqUser = $req.get( 0 ).dataset.username;
		winston.debug( `[afc/events/reviewer-request] comment: ${ event.comment }, diff: ${ event.revision.old } -> ${ event.revision.new }, user: ${ reqUser }, by: ${ event.user }` );

		const output = `${ reqUser !== event.user ? `${ htmllink( `User:${ event.user }`, event.user ) }替` : '' }${ htmllink( `User:${ reqUser }`, reqUser ) }申請成為審核員，請各位前往關注。`;

		const diff = `Special:Diff/${ event.revision.old }/${ event.revision.new }`;
		const dMsg = new Discord.MessageEmbed( {
			title: '審核員申請',
			color: 'BLUE',
			url: `https://zh.wikipedia.org/wiki/${ diff }`,
			description: turndown( output ),
			timestamp: event.timestamp * 1000
		} );

		const tMsg = `${ output } （${ htmllink( diff, '<b>查看申請</b>' ) }）
#審核員申請 `;
		const iMsg = htmlToIRC( tMsg ).replace( '#審核員申請', '審核員申請' );

		send( {
			dMsg,
			tMsg,
			iMsg
		} ).forEach( async function ( p ) {
			const data = await p;

			if ( data ) {
				if ( 'message_id' in data && 'chat' in data ) {
					tg.rawClient.telegram.pinChatMessage( data.chat.id, data.message_id ).catch( function () {
						// ignore
					} );
				} else if ( 'id' in data && 'channel' in data ) {
					data.pin().catch( function () {
						// ignore
					} );
				}
			}
		} );
	}
} );
