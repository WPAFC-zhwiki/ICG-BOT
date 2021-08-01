import winston from 'winston';
import { rebuildReviewerCaches, hasCaches, isReviewer, htmlToIRC, turndown, encodeURI, setCommand } from '../util';

setCommand( 'isreviewer', async function ( args, reply, bridgemsg ) {
	const user = args.join( ' ' );

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

	if ( hasCaches() ) {
		winston.debug( `[afc/command/isreviewer] user: ${ user }, isreviewer: ${ isReviewer( user ) }` );
		const msg = `使用者<a href="https://zh.wikipedia.org/wiki/User:${ encodeURI( user ) }">${ user }</a>${ isReviewer( `User:${ user }` ) ? '是' : '不是' }審核員。`;
		reply( {
			dMsg: turndown( msg ),
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
		rebuildReviewerCaches();
	}
} );
