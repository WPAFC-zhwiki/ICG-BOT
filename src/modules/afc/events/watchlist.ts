import crypto = require( 'crypto' );

import cheerio = require( 'cheerio' );
import Discord = require( 'discord.js' );
import { MwnPage } from 'mwn';
import winston = require( 'winston' );

import { inspect } from '@app/lib/util';

import {
	$, AFCPage, autoReview, encodeURI, getIssusData, htmlToIRC, mwbot,
	recentChange, RecentChangeEvent, registerEvent, turndown, send,
	handleMwnRequestError
} from '@app/modules/afc/util';

function getReason( $e: cheerio.Cheerio<cheerio.Element>, title: string ) {
	$e.find( 'a' ).each( function ( _i, a ) {
		const $a = $( a );
		const url = new URL( $a.attr( 'href' ), `https://zh.wikipedia.org/wiki/${ title }` );
		$a.text( `<a href="${ url.href }">${ $a.text() }</a>` );
	} );

	const $children = $e.children();
	if ( $children.length === 1 && $children.hasClass( 'afc-submission-rejectreasonsheet' ) ) {
		return getReasonFromRejectReasonSheet( $children );
	} else if ( $children.length > 1 && $children.length === $children.filter( 'table, hr' ).length ) {
		const reasons = [];
		for ( const ee of $children ) {
			reasons.push( getReasonFromSingleItem( $( ee ) ) );
		}
		return reasons;
	} else {
		return getReasonFromSingleItem( $e );
	}
}
const RejectReasonSheetTypeMapString = {
	SeriousReject: '嚴重阻止條目審核通過',
	Reject: '阻止條目審核通過',
	PossibleReject: '可能影響條目審核通過',
	FixNeeded: '建議修正'
};
function getReasonFromRejectReasonSheet( $e: cheerio.Cheerio<cheerio.Element> ) {
	const outputs: string[] = [];
	for ( const item of $e.children( '.afc-submission-rejectreasonsheet-item' ) ) {
		const $item = $( item );
		const singleOutputs: string[] = [];
		for ( const [ classSuffix, value ] of Object.entries( RejectReasonSheetTypeMapString ) ) {
			if ( $item.hasClass( `afc-submission-rejectreasonsheet-${ classSuffix.toLowerCase() }` ) ) {
				singleOutputs.push( `以下項目${ value }：` );
				break;
			}
		}
		if ( !singleOutputs.length ) {
			singleOutputs.push( `${ $item.children( 'span' ).text().trim() || '（未知拒絕理由）' }：` ); // fallback
		}
		for ( const li of $item.children( 'ul' ).children( 'li' ) ) {
			singleOutputs.push( ...getReasonFromSingleItem( $( li ) ) );
		}
		outputs.push( singleOutputs.join( '\n  • ' ) );
	}
	return outputs;
}
function getReasonFromSingleItem( $e: cheerio.Cheerio<cheerio.Element> ) {
	$e.find( '.hide-when-compact, .date-container, .mbox-image a, hr' ).remove();

	const $ambox = $e.find( 'table.ambox' ).remove();

	let text = $e.text().trim();
	if ( $ambox.length ) {
		text += $ambox.find( '.mbox-text-span' ).text().trim().split( /。/g ).join( '。\r• ' );
	}
	const $li = $e.find( 'li' );

	if ( $li ) {
		$li.each( ( _i, ele ) => {
			const eleText = $( ele ).text();
			text = text.replace(
				eleText,
				`${ eleText }\r• `
			);
		} );
	}

	return text
		.split( /\r•/g )
		.map( function ( x ) {
			return x.trim()
				.replace( /條目/g, '草稿' )
				.replace( /[本此]草稿/g, '草稿' )
				.replace( /\n/g, '' )
				.replace( /\r/g, '\n' )
				.replace( /\n• (?:$|\n)/g, '' );
		} )
		.filter( function ( x ) {
			return x.length && x !== '。';
		} )
		.map( function ( x ) {
			if ( x.match( /「.*」|【.*】/ ) ) {
				return x.replace( /^([^「]*「[^」]*」|[^【]*【[^】]*】)([^。！？]*[。！？]).*$/g, '$1$2' );
			} else {
				return x.split( /[。！？]/g )[ 0 ] + '。';
			}
		} );
}

function htmlLink( title: string, text?: string ) {
	return `<a href="https://zh.wikipedia.org/wiki/${ encodeURI( title ) }">${ text || title }</a>`;
}

function mdLink( title: string, text?: string ) {
	return `[${ text || title }](https://zh.wikipedia.org/wiki/${ encodeURI( title ) })`;
}

recentChange.addProcessFunction( function ( event: RecentChangeEvent ) {
	if (
		event.type === 'categorize' &&
		event.title === 'Category:正在等待審核的草稿'
	) {
		return true;
	}

	return false;
}, async function ( event: RecentChangeEvent.CategorizeEvent ) {
	try {
		const title: string = event.comment.replace( /^\[\[:?([^[\]]+)\]\].*$/, '$1' );

		const { user, revid } = event;

		const afcPage: AFCPage = await AFCPage.init( title, revid );

		const page: MwnPage = afcPage.mwnPage;
		const creator: string = await page.getCreator();
		await page.purge();
		let tMsg: string = htmlLink( `User:${ user }`, user );
		const dMsg: Discord.EmbedBuilder = new Discord.EmbedBuilder( {
			timestamp: new Date( event.timestamp ).getTime()
		} );

		const wikitext: string = afcPage.text;
		const $parsedHTML = await afcPage.parseToHTML();
		const $submissionBox = $parsedHTML( '.afc-submission-pending' ).length ?
			$parsedHTML( '.afc-submission-pending' ).first() :
			$parsedHTML( '.afc-submission' ).first();

		let submitter = user;

		if ( $submissionBox.length ) {
			afcPage.cleanUp();

			const templateUser = afcPage.text.match( /\|u=([^|{}[\]]+)[|}]/ );

			if ( templateUser && templateUser[ 1 ] ) {
				submitter = templateUser[ 1 ];
			}
		}

		const pageLink = htmlLink( title );

		if ( !$submissionBox.length && /已添加至分类/.exec( event.comment ) ) {
			send( {
				dMsg: new Discord.EmbedBuilder( {
					timestamp: new Date(),
					description: `未預料的錯誤：${ turndown( pageLink ) }已被加入分類正在等待審核的草稿，但機器人沒法從裡面找出AFC審核模板。`
				} ),
				tMsg: `未預料的錯誤：${ pageLink }已被加入分類正在等待審核的草稿，但機器人沒法從裡面找出AFC審核模板。 @sunafterrainwm #監視錯誤`,
				iMsg: `未預料的錯誤：${ htmlToIRC( pageLink ) }已被加入分類正在等待審核的草稿，但機器人沒法從裡面找出AFC審核模板。`
			}, 'debug' );
		} else if ( !$parsedHTML( '.afc-submission-pending' ).length && /已添加至分类/.exec( event.comment ) ) {
			send( {
				dMsg: new Discord.EmbedBuilder( {
					timestamp: new Date(),
					description: `未預料的錯誤：${ turndown( pageLink ) }已被加入分類正在等待審核的草稿，但機器人沒法從裡面找出等待審核的AFC審核模板。`
				} ),
				tMsg: `未預料的錯誤：${ pageLink }已被加入分類正在等待審核的草稿，但機器人沒法從裡面找出等待審核的AFC審核模板。 @sunafterrainwm #監視錯誤`,
				iMsg: `未預料的錯誤：${ htmlToIRC( pageLink ) }已被加入分類正在等待審核的草稿，但機器人沒法從裡面找出等待審核的AFC審核模板。`
			}, 'debug' );
		} else if ( $parsedHTML( '.afc-submission-pending' ).length && /已从分类中移除/.exec( event.comment ) ) {
			const $pending = $parsedHTML( '.afc-submission-pending' );
			send( {
				dMsg: new Discord.EmbedBuilder( {
					timestamp: new Date(),
					description: `未預料的錯誤：${ turndown( pageLink ) }已被移出分類正在等待審核的草稿，但機器人從裡面找到${ $pending.length }個等待審核的AFC審核模板。`
				} ),
				tMsg: `未預料的錯誤：${ pageLink }已被移出分類正在等待審核的草稿，但機器人從裡面找到${ $pending.length }個等待審核的AFC審核模板。 @sunafterrainwm #監視錯誤`,
				iMsg: `未預料的錯誤：${ htmlToIRC( pageLink ) }已被移出分類正在等待審核的草稿，但機器人從裡面找到${ $pending.length }個等待審核的AFC審核模板。`
			}, 'debug' );
		}

		const tgTags: string[] = [
			'#' + crypto.createHash( 'shake256', {
				outputLength: 10
			} ).update( page.toText() ).digest( 'hex' ),
			'#p' + String( afcPage.pageId ),
			'#r' + String( afcPage.baseRevId )
		];

		if ( !$submissionBox.length && page.namespace === 0 && user !== creator && AFCPage.isReviewer( user ) ) {
			tMsg += `已接受${ htmlLink( `User:${ creator }`, creator ) }的草稿${ pageLink }`;
			tgTags.push( '#接受草稿' );
			let tpClass: string;
			try {
				const talkPage = await mwbot.read( page.getTalkPage() ).catch( handleMwnRequestError );
				tpClass = talkPage.revisions[ 0 ].content.match( /\|class=([^|]*?)\|/ )[ 1 ];
			} catch ( e ) {
				tpClass = '';
			}
			let cClass = '';
			switch ( tpClass ) {
				case 'B':
					cClass = '乙';
					break;
				case 'C':
					cClass = '丙';
					break;
				case 'start':
					cClass = '初';
					break;
				case 'stub':
					cClass = '小作品';
					break;
				case 'list':
					cClass = '列表';
					break;
			}
			if ( cClass.length > 0 ) {
				tMsg += `（${ cClass }級）`;
				tgTags.push( `#評級${ cClass }級` );
			}

			tMsg += '。';

			dMsg
				.setColor( Discord.Colors.Green )
				.setDescription( turndown( tMsg ) );

			winston.debug( `[afc/events/watchlist] comment: ${ event.comment }, user: ${ user }, title: ${ title }, creator: ${ creator }, action: accept, tpClass: ${ tpClass.length && tpClass || undefined }` );
		} else if ( !$submissionBox.length && page.namespace === 0 && user === creator ) {
			const pageHistory = await page.history( 'user', 2, {
				rvslots: 'main'
			} );
			if ( pageHistory.length === 1 ) {
				tgTags.push( '#提交草稿', '#於條目命名空間' );

				const moveUrl = `https://zhwp-afc-bot.toolforge.org/s/move-namespace-error.njs?title=${ encodeURI( title ) }`;
				tMsg += `在條目命名空間建立了草稿${ pageLink }（<a href="${ moveUrl }">移動到草稿命名空間</a>）`;
				dMsg
					.setDescription( `${ mdLink( `User:${ user }`, user ) }在條目命名空間建立了草稿${ turndown( pageLink ) }` )
					.setFooter( {
						text: `[移動到草稿命名空間](${ moveUrl })`
					} );

				winston.debug( `[afc/events/watchlist] comment: ${ event.comment }, user: ${ user }, title: ${ title }, creator: ${ creator }, action: create in ns0` );
			} else {
				tgTags.push( '#移除模板' );

				tMsg += `移除了在條目命名空間的草稿${ pageLink }中的AFC模板。`;
				dMsg.setDescription( turndown( tMsg ) );
				winston.debug( `[afc/events/watchlist] comment: ${ event.comment }, user: ${ user }, title: ${ title }, creator: ${ creator }, action: remove afc template & in ns0` );
			}
			dMsg.setColor( Discord.Colors.Orange );
		} else if ( !$submissionBox.length ) {
			tgTags.push( '#移除模板' );

			tMsg += `移除了${ htmlLink( `User:${ creator }`, creator ) }的草稿${ pageLink }的AFC模板。`;
			dMsg
				.setColor( Discord.Colors.Orange )
				.setDescription( turndown( tMsg ) );

			winston.debug( `[afc/events/watchlist] comment: ${ event.comment }, user: ${ user }, title: ${ title }, creator: ${ creator }, action: remove afc template & not in ns0` );
		} else if ( $submissionBox.hasClass( 'afc-submission-pending' ) ) {
			tgTags.push( '#提交草稿' );

			if ( submitter !== user ) {
				tgTags.push( '#代為提交' );
				tMsg += `以${ htmlLink( `User:${ submitter }`, submitter ) }的身分`;
			}
			tMsg += '提交了';
			if ( creator !== user ) {
				tgTags.push( '#他人草稿' );
				tMsg += `${ htmlLink( `User:${ creator }`, creator ) }建立的`;
			}
			tMsg += `草稿${ pageLink }。`;

			const { warning, issues } = await autoReview( afcPage, { user, creator } );

			winston.debug( `[afc/events/watchlist] comment: ${ event.comment }, user: ${ user }, title: ${ title }, creator: ${ creator }, action: submit, issues: ${ issues.join( ', ' ) }` );

			dMsg.setDescription( turndown( tMsg ) );

			tMsg += '\n\n<b>自動檢測問題</b>';

			if ( issues && issues.length > 0 ) {
				if ( issues.includes( 'autoreview-api-unreach' ) ) {
					tgTags.push( '#自動審核後端錯誤' );
				}
				tMsg += issues.map( function ( x ) {
					return `\n• ${ getIssusData( x, true ) }`;
				} ).join( '' );
				dMsg
					.setColor( Discord.Colors.Red )
					.addFields( [ {
						name: '自動檢測問題',
						value: issues.map( function ( x ) {
							return `• ${ turndown( getIssusData( x, true ) ) }`;
						} ).join( '\n' )
					} ] );
			} else {
				tMsg += '\n• 沒有發現顯著問題。';
				dMsg
					.setColor( Discord.Colors.Green )
					.addFields( [ {
						name: '自動檢測問題',
						value: '• 沒有發現顯著問題。'
					} ] );
			}
			if ( warning.length ) {
				if ( warning.length === 1 ) {
					tMsg += '\n<b>警告：</b>' + warning[ 0 ] + ' @sunafterrainwm';
					dMsg.setFooter( {
						text: '警告：' + warning[ 0 ]
					} );
				} else {
					tMsg += '\n<b>警告：</b> @sunafterrainwm\n' + warning.map( function ( x ) {
						return `• ${ x }`;
					} ).join( '\n' );
					dMsg.setFooter( {
						text: '警告：\n' + warning.map( function ( x ) {
							return `• ${ x }`;
						} ).join( '\n' )
					} );
				}
			}
		} else if ( $submissionBox.hasClass( 'afc-submission-declined' ) || $submissionBox.hasClass( 'afc-submission-rejected' ) ) {
			tgTags.push( '#拒絕草稿' );

			tMsg += '將';
			let submitUser: string = null;
			if ( wikitext.match( /\|u=([^|]+)\|/ ) ) {
				submitUser = wikitext.match( /\|u=([^|]+)\|/ )[ 1 ];
				tMsg += `提交者${ htmlLink( `User:${ submitUser }`, submitUser ) }所提交的`;
			} else {
				tMsg += `建立者${ htmlLink( `User:${ creator }`, creator ) }的`;
			}
			tMsg += `草稿${ pageLink }標記為`;
			if ( $submissionBox.hasClass( 'afc-submission-rejected' ) ) {
				tgTags.push( '#拒絕再次提交' );

				tMsg += '拒絕再次提交的草稿';
			} else {
				tgTags.push( '#仍需改善' );

				tMsg += '仍需改善的草稿';
			}

			dMsg.setDescription( turndown( `<b>${ tMsg }</b>` ) );

			const $reasonBox = $submissionBox.find( '.afc-submission-reason-box' );
			const $reasonItems = $reasonBox.children( '.afc-submission-reason-item' );
			const reasons: string[] = [];
			if ( $reasonItems.length ) {
				dMsg.setDescription( turndown( tMsg ) );

				for ( const item of $reasonItems ) {
					reasons.push( ...getReason( $( item ), title ) );
				}
			}

			winston.debug( `[afc/events/watchlist] comment: ${ event.comment }, user: ${ user }, title: ${ title }, creator: ${ creator }, submituser: ${ submitUser }, action: ${ $submissionBox.hasClass( 'afc-submission-rejected' ) ? 'rejected' : 'declined' }, reasons: ${ JSON.stringify( reasons ) }` );

			if ( reasons.length ) {
				dMsg.setDescription( turndown( tMsg ) );
				tMsg += '，理由：' + reasons.map( function ( x ) {
					return `\n• ${ x }`;
				} ).join( '' );
				dMsg.addFields( [ {
					name: '拒絕理由',
					value: reasons.map( function ( x ) {
						return `• ${ turndown( x ) }`;
					} ).join( '\n' )
				} ] );
			} else {
				tMsg += '，未提供理由。';
				dMsg.addFields( [ {
					name: '拒絕理由',
					value: '• 未提供理由'
				} ] );
			}
		} else {
			winston.debug( `[afc/events/watchlist] comment: ${ event.comment }, user: ${ user }, title: ${ title }, creator: ${ creator }, action: ignore` );
			return;
		}

		const iMsg: string = htmlToIRC( tMsg );

		tMsg += '\n\n' + tgTags.join( ' ' );

		send( {
			dMsg,
			tMsg,
			iMsg
		}, 'watchlist' );
	} catch ( error ) {
		winston.error( '[afc/event/watchlist] RecentChange Error: (Throw by Async Function) ', inspect( error ) );
	}
} );

registerEvent( 'watchlist' );
