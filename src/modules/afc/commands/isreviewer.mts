import * as Discord from 'discord.js';
import winston from 'winston';

import { encodeURI, turndown } from '@app/modules/afc/util.mjs';
import { htmlToIRC, setCommand } from '@app/modules/afc/utils/message.mjs';
import {
	hasReviewersCache,
	isReviewer, isExOfficioReviewer, isBlockedExOfficioReviewer, isParticipatingReviewer
} from '@app/modules/afc/utils/reviewer.mjs';

function upperFirst( str: string ) {
	return str.slice( 0, 1 ).toUpperCase() + str.slice( 1 );
}

setCommand( 'isreviewer', async function ( args, reply, BridgeMessage ) {
	const user = upperFirst( args.join( ' ' ) );

	if ( user.trim().length === 0 ) {
		if ( BridgeMessage.extra.reply ) {
			reply( {
				dMessage: '我又不知道你回覆的人對應站內哪個人。',
				tMessage: '我又不知道你回覆的人對應站內哪個人。',
				iMessage: '我又不知道你回覆的人對應站內哪個人。',
			} );
		} else {
			reply( {
				dMessage: '使用方式：\n`!isreviewer 要查找的使用者名稱`',
				tMessage: '使用方式：\n/isreviewer 要查找的使用者名稱',
				iMessage: '使用方式：`!isreviewer 要查找的使用者名稱`',
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
			status = isExOfficioBlocked ? '是<b>被列入黑名單</b>的當然審核員' : '是<b>當然審核員</b>';
			if ( isParticipating ) {
				status += '，同時也是<b>參與審核員</b>';
			}
		} else if ( isParticipating ) {
			status = '是<b>參與審核員</b>';
		}
		const message = `使用者<a href="https://zh.wikipedia.org/wiki/User:${ encodeURI( user ) }">${ user }</a>${ status }。`;
		reply( {
			dMessage: new Discord.EmbedBuilder( {
				description: turndown( message ),
				color: isReviewer( user ) ? Discord.Colors.Gold : undefined,
			} ),
			tMessage: message,
			iMessage: htmlToIRC( message ),
		} );
	} else {
		winston.debug( `[afc/command/isreviewer] user: ${ user }, isreviewer: no cache` );
		reply( {
			dMessage: '緩存無資料，請稍後再試。',
			tMessage: '緩存無資料，請稍後再試。',
			iMessage: '緩存無資料，請稍後再試。',
		} );
	}
} );
