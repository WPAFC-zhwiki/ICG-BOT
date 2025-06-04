import { inspect } from 'node:util';

import Discord from 'discord.js';
import winston from 'winston';

import { $, encodeURI, handleMwnRequestError, mwbot, turndown } from '@app/modules/afc/util.mjs';
import { pinMessage, registerEvent, send, htmlToIRC } from '@app/modules/afc/utils/message.mjs';
import { EditEvent, recentChange } from '@app/modules/afc/utils/recentchange.mjs';
import { isNamedUser, userGroup } from '@app/modules/afc/utils/user.mjs';

function htmllink( title: string, text?: string ) {
	return `<a href="https://zh.wikipedia.org/wiki/${ encodeURI( title ) }">${ text || title }</a>`;
}

recentChange.addProcessFunction<EditEvent>( ( event ): event is EditEvent => {
	if (
		event.type === 'edit' &&
		event.title === 'WikiProject:建立條目/參與者/申請' &&
		( event.oldlen || 0 ) < ( event.newlen || 0 ) + 10
	) {
		return true;
	}

	return false;
}, async ( event ) => {
	const { compare } = await mwbot.request( {
		action: 'compare',
		format: 'json',
		fromrev: event.old_revid,
		torev: event.revid,
	} ).catch( handleMwnRequestError );

	const $diff = $( '<table>' ).append( compare.body );
	let diffText = '';

	$diff.find( '.diff-addedline' ).each( ( _index, ele ) => {
		diffText += $( ele ).text() + '\n';
	} );

	const parse = await mwbot.parseWikitext( diffText ).catch( handleMwnRequestError );
	const $parse = $( parse );
	const $request = $parse.find( '.reviewer-request' );
	winston.debug( `[afc/events/reviewer-request] comment: ${ event.comment }, fire: true` );
	if ( $request.length > 0 ) {
		const requestUser = $request.eq( 0 ).attr( 'data-username' );
		winston.debug( `[afc/events/reviewer-request] comment: ${ event.comment }, diff: ${ event.old_revid } -> ${ event.revid }, user: ${ requestUser }, by: ${ event.user }` );

		let output = `${ htmllink( `User:${ requestUser }`, requestUser ) }申請成為審核員，請各位前往關注。`;
		if ( requestUser !== event.user ) {
			output = `${ htmllink( `User:${ event.user }`, event.user ) }替${ output }`;
		}

		if ( isNamedUser( requestUser ) ) {
			const user = new mwbot.User( requestUser );

			let localGroups: string[] | false = false;

			try {
				localGroups = ( await user.info( 'groups' ) as {
					userid: number;
					name: string;
					groups: string[];
				} ).groups.filter( ( g ) => !userGroup.ignoreLocalGroups.includes( g ) ) ?? false;
			} catch ( error ) {
				winston.warn( `Fail to get local user groups for ${ requestUser }: ${ inspect( error ) }.` );
			}

			output += '\n本地群組：' + ( localGroups ?
				( localGroups.length > 0 ? localGroups.map( g => userGroup.localGroups[ g ] ?? g ).join( '、' ) : '無' ) :
				'獲取失敗' );

			let globalGroups: string[] | false = false;

			try {
				globalGroups = ( await user.globalinfo( 'groups' ) as {
					home: string;
					id: number;
					registration: string;
					name: string;
					groups: string[];
				} ).groups.filter( ( g ) => !userGroup.ignoreGlobalGroups.includes( g ) ) ?? false;
			} catch ( error ) {
				winston.warn( `Fail to get global user groups for ${ requestUser }: ${ inspect( error ) }.` );
			}

			output += '\n全域群組：' + ( globalGroups ?
				( globalGroups.length > 0 ? globalGroups.map( g => userGroup.globalGroups[ g ] ?? g ).join( '、' ) : '無' ) :
				'獲取失敗' );
		}

		const diff = `Special:Diff/${ event.old_revid }/${ event.revid }`;
		const dMessage = new Discord.EmbedBuilder( {
			title: '審核員申請',
			color: Discord.Colors.Blue,
			url: `https://zh.wikipedia.org/wiki/${ diff }`,
			description: turndown( output ),
			timestamp: new Date( event.timestamp ).getTime(),
		} );

		const tMessage = `${ output } （${ htmllink( diff, '<b>查看申請</b>' ) }）
#審核員申請 `;
		const indexMessage = htmlToIRC( `<b>審核員申請</b>
${ output } （${ htmllink( diff, '<b>查看申請</b>' ) }）` );

		const sendResponses = send( {
			dMessage: dMessage,
			tMessage: tMessage,
			iMessage: indexMessage,
		}, 'reviewer-request' );

		pinMessage( sendResponses );
	}
} );

registerEvent( 'reviewer-request' );
registerEvent( 'pin', true );
