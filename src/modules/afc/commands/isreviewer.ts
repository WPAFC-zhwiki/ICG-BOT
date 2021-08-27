import Discord from 'discord.js';
import winston from 'winston';
import { rebuildReviewerCaches, hasReviewerCaches, isReviewer, encodeURI, turndown, htmlToIRC, setCommand } from 'src/modules/afc/util';

function upperFirst( str: string ) {
	return str.substring( 0, 1 ).toUpperCase() + str.substring( 1, str.length );
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

	if ( hasReviewerCaches() ) {
		winston.debug( `[afc/command/isreviewer] user: ${ user }, isreviewer: ${ isReviewer( user ) }` );
		const msg = `使用者<a href="https://zh.wikipedia.org/wiki/User:${ encodeURI( user ) }">${ user }</a>${ isReviewer( user ) ? '是' : '不是' }審核員。`;
		reply( {
			dMsg: new Discord.MessageEmbed( {
				description: turndown( msg ),
				color: isReviewer( user ) ? 'GOLD' : null
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
		rebuildReviewerCaches();
	}
} );
