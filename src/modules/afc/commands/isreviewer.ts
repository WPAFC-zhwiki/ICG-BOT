import Discord = require( 'discord.js' );
import winston = require( 'winston' );

import { hasReviewersCache, isReviewer, encodeURI, turndown, htmlToIRC, setCommand, isExOfficioReviewer, isBlockedExOfficioReviewer, isParticipatingReviewer } from '@app/modules/afc/util';

function upperFirst( str: string ) {
	return str.slice( 0, 1 ).toUpperCase() + str.slice( 1, str.length );
}

setCommand( 'isreviewer', async function ( args, reply, bridgemsg ) {
	const user = upperFirst( args.join( ' ' ) );

	if ( !user.trim().length ) {
		if ( bridgemsg.extra.reply ) {
			reply( {
				dMsg: '我又不知道你回覆的人對應站內哪個人。',
				tMsg: '我又不知道你回覆的人對應站內哪個人。',
				iMsg: '我又不知道你回覆的人對應站內哪個人。'
			} );
		} else {
			reply( {
				dMsg: '使用方式：\n`!isreviewer 要查找的使用者名稱`',
				tMsg: '使用方式：\n/isreviewer 要查找的使用者名稱',
				iMsg: '使用方式：`!isreviewer 要查找的使用者名稱`'
			} );
		}
		return;
	}

	if ( hasReviewersCache() ) {
		const isExOfficio = isExOfficioReviewer( user );
		const isExOfficioBlocked = isExOfficio && isBlockedExOfficioReviewer( user );
		const isParticipating = isParticipatingReviewer( user );
		winston.debug( `[afc/command/isreviewer] user: ${ user }, isExOfficio: ${ isExOfficio }, isExOfficioBlocked: ${ isExOfficioBlocked }, isParticipating: ${ isParticipating }` );
		let status = '<b>不是</b>審核員';
		if ( isExOfficio ) {
			if ( isExOfficioBlocked ) {
				status = '是<b>被列入黑名單</b>的當然審核員';
			} else {
				status = '是<b>當然審核員</b>';
			}
			if ( isParticipating ) {
				status += '，同時也是<b>參與審核員</b>';
			}
		} else if ( isParticipating ) {
			status = '是<b>參與審核員</b>';
		}
		const msg = `使用者<a href="https://zh.wikipedia.org/wiki/User:${ encodeURI( user ) }">${ user }</a>${ status }。`;
		reply( {
			dMsg: new Discord.EmbedBuilder( {
				description: turndown( msg ),
				color: isReviewer( user ) ? Discord.Colors.Gold : null
			} ),
			tMsg: msg,
			iMsg: htmlToIRC( msg )
		} );
	} else {
		winston.debug( `[afc/command/isreviewer] user: ${ user }, isreviewer: no cache` );
		reply( {
			dMsg: '緩存無資料，請稍後再試。',
			tMsg: '緩存無資料，請稍後再試。',
			iMsg: '緩存無資料，請稍後再試。'
		} );
	}
} );
