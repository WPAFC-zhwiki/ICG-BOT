import Discord = require( 'discord.js' );
import winston = require( 'winston' );

import { $, encodeURI, handleMwnRequestError, htmlToIRC, mwbot, pinMessage, recentChange,
	RecentChangeEvent, registerEvent, send, turndown } from '@app/modules/afc/util';

function htmllink( title: string, text?: string ) {
	return `<a href="https://zh.wikipedia.org/wiki/${ encodeURI( title ) }">${ text || title }</a>`;
}

recentChange.addProcessFunction( function ( event: RecentChangeEvent ) {
	if (
		event.type === 'edit' &&
		event.title === 'WikiProject:建立條目/參與者/申請' &&
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
		torev: event.revid
	} ).catch( handleMwnRequestError );

	const $diff = $( '<table>' ).append( compare.body );
	let diffText = '';

	$diff.find( '.diff-addedline' ).each( ( _i, ele ) => {
		diffText += $( ele ).text() + '\n';
	} );

	const parse = await mwbot.parseWikitext( diffText ).catch( handleMwnRequestError );
	const $parse = $( parse );
	const $req = $parse.find( '.reviewer-request' );
	winston.debug( `[afc/events/reviewer-request] comment: ${ event.comment }, fire: true` );
	if ( $req.length ) {
		const reqUser = $req.eq( 0 ).attr( 'data-username' );
		winston.debug( `[afc/events/reviewer-request] comment: ${ event.comment }, diff: ${ event.old_revid } -> ${ event.revid }, user: ${ reqUser }, by: ${ event.user }` );

		const output = `${ reqUser !== event.user ? `${ htmllink( `User:${ event.user }`, event.user ) }替` : '' }${ htmllink( `User:${ reqUser }`, reqUser ) }申請成為審核員，請各位前往關注。`;

		const diff = `Special:Diff/${ event.old_revid }/${ event.revid }`;
		const dMsg = new Discord.EmbedBuilder( {
			title: '審核員申請',
			color: Discord.Colors.Blue,
			url: `https://zh.wikipedia.org/wiki/${ diff }`,
			description: turndown( output ),
			timestamp: new Date( event.timestamp ).getTime()
		} );

		const tMsg = `${ output } （${ htmllink( diff, '<b>查看申請</b>' ) }）
#審核員申請 `;
		const iMsg = htmlToIRC( `<b>審核員申請</b>
${ output } （${ htmllink( diff, '<b>查看申請</b>' ) }）` );

		const sendResponses = send( {
			dMsg,
			tMsg,
			iMsg
		}, 'reviewer-request' );

		pinMessage( sendResponses );
	}
} );

registerEvent( 'reviewer-request' );
registerEvent( 'pin', true );
