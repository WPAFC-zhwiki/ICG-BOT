import crypto from 'node:crypto';

import * as cheerio from 'cheerio';
import Discord from 'discord.js';
import type { Element } from 'domhandler';
import { MwnPage } from 'mwn';
import winston from 'winston';

import { inspect } from '@app/lib/util.mjs';

import { $, encodeURI, handleMwnRequestError, mwbot, turndown } from '@app/modules/afc/util.mjs';
import { AFCPage } from '@app/modules/afc/utils/AFCPage.mjs';
import { autoReview, getIssusData } from '@app/modules/afc/utils/autoreview.mjs';
import { htmlToIRC, registerEvent, send } from '@app/modules/afc/utils/message.mjs';
import { CategorizeEvent, recentChange } from '@app/modules/afc/utils/recentchange.mjs';

function getReason( $element: cheerio.Cheerio<Element>, title: string ) {
	$element.find( 'a' ).each( function ( _index, a ) {
		const $a = $( a );
		const url = new URL( $a.attr( 'href' ), `https://zh.wikipedia.org/wiki/${ title }` );
		$a.text( `<a href="${ url.href }">${ $a.text() }</a>` );
	} );

	const $children = $element.children();
	if ( $children.length === 1 && $children.hasClass( 'afc-submission-rejectreasonsheet' ) ) {
		return getReasonFromRejectReasonSheet( $children );
	} else if ( $children.length > 1 && $children.length === $children.filter( 'table, hr' ).length ) {
		const reasons = [];
		for ( const ee of $children ) {
			reasons.push( getReasonFromSingleItem( $( ee ) ) );
		}
		return reasons;
	} else {
		return getReasonFromSingleItem( $element );
	}
}
const RejectReasonSheetTypeMapString = {
	SeriousReject: '嚴重阻止條目審核通過',
	Reject: '阻止條目審核通過',
	PossibleReject: '可能影響條目審核通過',
	FixNeeded: '建議修正',
};
function getReasonFromRejectReasonSheet( $element: cheerio.Cheerio<Element> ) {
	const outputs: string[] = [];
	for ( const item of $element.children( '.afc-submission-rejectreasonsheet-item' ) ) {
		const $item = $( item );
		const singleOutputs: string[] = [];
		for ( const [ classSuffix, value ] of Object.entries( RejectReasonSheetTypeMapString ) ) {
			if ( $item.hasClass( `afc-submission-rejectreasonsheet-${ classSuffix.toLowerCase() }` ) ) {
				singleOutputs.push( `以下項目${ value }：` );
				break;
			}
		}
		if ( singleOutputs.length === 0 ) {
			singleOutputs.push( `${ $item.children( 'span' ).text().trim() || '（未知拒絕理由）' }：` ); // fallback
		}
		for ( const li of $item.children( 'ul' ).children( 'li' ) ) {
			singleOutputs.push( ...getReasonFromSingleItem( $( li ) ) );
		}
		outputs.push( singleOutputs.join( '\n  • ' ) );
	}
	return outputs;
}
function getReasonFromSingleItem( $element: cheerio.Cheerio<Element> ) {
	$element.find( '.hide-when-compact, .date-container, .mbox-image a, hr' ).remove();

	const $ambox = $element.find( 'table.ambox' ).remove();

	let text = $element.text().trim();
	if ( $ambox.length > 0 ) {
		text += $ambox.find( '.mbox-text-span' ).text().trim().split( /。/g ).join( '。\r• ' );
	}
	const $li = $element.find( 'li' );

	if ( $li ) {
		$li.each( ( _index, ele ) => {
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
				.replaceAll( '條目', '草稿' )
				.replaceAll( /[本此]草稿/g, '草稿' )
				.replaceAll( '\n', '' )
				.replaceAll( '\r', '\n' )
				.replaceAll( /\n• (?:$|\n)/g, '' );
		} )
		.filter( function ( x ) {
			return x.length > 0 && x !== '。';
		} )
		.map( function ( x ) {
			return /「.*」|【.*】/.test( x ) ? x.replaceAll( /^([^「]*「[^」]*」|[^【]*【[^】]*】)([^。！？]*[。！？]).*$/g, '$1$2' ) : x.split( /[。！？]/g )[ 0 ] + '。';
		} );
}

function htmlLink( title: string, text?: string ) {
	return `<a href="https://zh.wikipedia.org/wiki/${ encodeURI( title ) }">${ text || title }</a>`;
}

function mdLink( title: string, text?: string ) {
	return `[${ text || title }](https://zh.wikipedia.org/wiki/${ encodeURI( title ) })`;
}

recentChange.addProcessFunction<CategorizeEvent>( ( event ): event is CategorizeEvent => {
	if (
		event.type === 'categorize' &&
		event.title === 'Category:正在等待審核的草稿'
	) {
		return true;
	}

	return false;
}, async ( event ) => {
	try {
		let shouldMentionDebug = false;

		const title: string = event.comment.replace( /^\[\[:?([^[\]]+)\]\].*$/, '$1' );

		const { user, revid } = event;

		const afcPage: AFCPage = await AFCPage.init( title, revid );

		const page: MwnPage = afcPage.mwnPage;
		const creator: string = await page.getCreator();
		await page.purge();
		let tMessage: string = htmlLink( `User:${ user }`, user );
		const dMessage: Discord.EmbedBuilder = new Discord.EmbedBuilder( {
			timestamp: new Date( event.timestamp ).getTime(),
		} );

		const wikitext: string = afcPage.text;
		const $parsedHTML = await afcPage.parseToHTML();
		const $submissionBox = $parsedHTML( '.afc-submission-pending' ).length > 0 ?
			$parsedHTML( '.afc-submission-pending' ).first() :
			$parsedHTML( '.afc-submission' ).first();

		let submitter = user;

		if ( $submissionBox.length > 0 ) {
			afcPage.cleanUp();

			const templateUser = afcPage.text.match( /\|u=([^|{}[\]]+)[|}]/ );

			if ( templateUser && templateUser[ 1 ] ) {
				submitter = templateUser[ 1 ];
			}
		}

		const pageLink = htmlLink( title );

		if ( $submissionBox.length === 0 && /已添加至分类/.test( event.comment ) ) {
			send( {
				dMessage: new Discord.EmbedBuilder( {
					timestamp: new Date(),
					description: `未預料的錯誤：${ turndown( pageLink ) }已被加入分類正在等待審核的草稿，但機器人沒法從裡面找出AFC審核模板。`,
				} ),
				tMessage: `未預料的錯誤：${ pageLink }已被加入分類正在等待審核的草稿，但機器人沒法從裡面找出AFC審核模板。 #監視錯誤`,
				iMessage: `未預料的錯誤：${ htmlToIRC( pageLink ) }已被加入分類正在等待審核的草稿，但機器人沒法從裡面找出AFC審核模板。`,
			}, 'debug' );
		} else if ( $parsedHTML( '.afc-submission-pending' ).length === 0 && /已添加至分类/.test( event.comment ) ) {
			send( {
				dMessage: new Discord.EmbedBuilder( {
					timestamp: new Date(),
					description: `未預料的錯誤：${ turndown( pageLink ) }已被加入分類正在等待審核的草稿，但機器人沒法從裡面找出等待審核的AFC審核模板。`,
				} ),
				tMessage: `未預料的錯誤：${ pageLink }已被加入分類正在等待審核的草稿，但機器人沒法從裡面找出等待審核的AFC審核模板。 #監視錯誤`,
				iMessage: `未預料的錯誤：${ htmlToIRC( pageLink ) }已被加入分類正在等待審核的草稿，但機器人沒法從裡面找出等待審核的AFC審核模板。`,
			}, 'debug' );
		} else if ( $parsedHTML( '.afc-submission-pending' ).length > 0 && /已从分类中移除/.test( event.comment ) ) {
			const $pending = $parsedHTML( '.afc-submission-pending' );
			send( {
				dMessage: new Discord.EmbedBuilder( {
					timestamp: new Date(),
					description: `未預料的錯誤：${ turndown( pageLink ) }已被移出分類正在等待審核的草稿，但機器人從裡面找到${ $pending.length }個等待審核的AFC審核模板。`,
				} ),
				tMessage: `未預料的錯誤：${ pageLink }已被移出分類正在等待審核的草稿，但機器人從裡面找到${ $pending.length }個等待審核的AFC審核模板。 #監視錯誤`,
				iMessage: `未預料的錯誤：${ htmlToIRC( pageLink ) }已被移出分類正在等待審核的草稿，但機器人從裡面找到${ $pending.length }個等待審核的AFC審核模板。`,
			}, 'debug' );
		}

		const tgTags: string[] = [
			'#' + crypto.createHash( 'shake256', {
				outputLength: 10,
			} ).update( page.toText() ).digest( 'hex' ),
			'#p' + String( afcPage.pageId ),
			'#r' + String( afcPage.baseRevId ),
		];

		if ( $submissionBox.length === 0 && page.namespace === 0 && user !== creator && AFCPage.isReviewer( user ) ) {
			tMessage += `已接受${ htmlLink( `User:${ creator }`, creator ) }的草稿${ pageLink }`;
			tgTags.push( '#接受草稿' );
			let tpClass: string;
			try {
				const talkPage = await mwbot.read( page.getTalkPage() ).catch( handleMwnRequestError );
				tpClass = talkPage.revisions[ 0 ].content.match( /\|class=([^|]*?)\|/ )[ 1 ];
			} catch {
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
				tMessage += `（${ cClass }級）`;
				tgTags.push( `#評級${ cClass }級` );
			}

			tMessage += '。';

			dMessage
				.setColor( Discord.Colors.Green )
				.setDescription( turndown( tMessage ) );

			winston.debug( `[afc/events/watchList] comment: ${ event.comment }, user: ${ user }, title: ${ title }, creator: ${ creator }, action: accept, tpClass: ${ tpClass.length > 0 && tpClass || undefined }` );
		} else if ( $submissionBox.length === 0 && page.namespace === 0 && user === creator ) {
			const pageHistory = await page.history( 'user', 2, {
				rvslots: 'main',
			} );
			if ( pageHistory.length === 1 ) {
				tgTags.push( '#提交草稿', '#於條目命名空間' );

				const moveUrl = `https://zhwp-afc-bot.toolforge.org/s/move-namespace-error.njs?title=${ encodeURI( title ) }`;
				tMessage += `在條目命名空間建立了草稿${ pageLink }（<a href="${ moveUrl }">移動到草稿命名空間</a>）`;
				dMessage
					.setDescription( `${ mdLink( `User:${ user }`, user ) }在條目命名空間建立了草稿${ turndown( pageLink ) }` )
					.setFooter( {
						text: `[移動到草稿命名空間](${ moveUrl })`,
					} );

				winston.debug( `[afc/events/watchList] comment: ${ event.comment }, user: ${ user }, title: ${ title }, creator: ${ creator }, action: create in ns0` );
			} else {
				tgTags.push( '#移除模板' );

				tMessage += `移除了在條目命名空間的草稿${ pageLink }中的AFC模板。`;
				dMessage.setDescription( turndown( tMessage ) );
				winston.debug( `[afc/events/watchList] comment: ${ event.comment }, user: ${ user }, title: ${ title }, creator: ${ creator }, action: remove afc template & in ns0` );
			}
			dMessage.setColor( Discord.Colors.Orange );
		} else if ( $submissionBox.length === 0 ) {
			tgTags.push( '#移除模板' );

			tMessage += `移除了${ htmlLink( `User:${ creator }`, creator ) }的草稿${ pageLink }的AFC模板。`;
			dMessage
				.setColor( Discord.Colors.Orange )
				.setDescription( turndown( tMessage ) );

			winston.debug( `[afc/events/watchList] comment: ${ event.comment }, user: ${ user }, title: ${ title }, creator: ${ creator }, action: remove afc template & not in ns0` );
		} else if ( $submissionBox.hasClass( 'afc-submission-pending' ) ) {
			tgTags.push( '#提交草稿' );

			if ( submitter !== user ) {
				tgTags.push( '#代為提交' );
				tMessage += `以${ htmlLink( `User:${ submitter }`, submitter ) }的身分`;
			}
			tMessage += '提交了';
			if ( creator !== user ) {
				tgTags.push( '#他人草稿' );
				tMessage += `${ htmlLink( `User:${ creator }`, creator ) }建立的`;
			}
			tMessage += `草稿${ pageLink }。`;

			const { warning, issues } = await autoReview( afcPage, { user, creator } );

			winston.debug( `[afc/events/watchList] comment: ${ event.comment }, user: ${ user }, title: ${ title }, creator: ${ creator }, action: submit, issues: ${ issues.join( ', ' ) }` );

			dMessage.setDescription( turndown( tMessage ) );

			tMessage += '\n\n<b>自動檢測問題</b>';

			if ( issues && issues.length > 0 ) {
				if ( issues.includes( 'autoreview-api-unreach' ) ) {
					tgTags.push( '#自動審核後端錯誤' );
				}
				tMessage += issues.map( function ( x ) {
					return `\n• ${ getIssusData( x, true ) }`;
				} ).join( '' );
				dMessage
					.setColor( Discord.Colors.Red )
					.addFields( [ {
						name: '自動檢測問題',
						value: issues.map( function ( x ) {
							return `• ${ turndown( getIssusData( x, true ) ) }`;
						} ).join( '\n' ),
					} ] );
			} else {
				tMessage += '\n• 沒有發現顯著問題。';
				dMessage
					.setColor( Discord.Colors.Green )
					.addFields( [ {
						name: '自動檢測問題',
						value: '• 沒有發現顯著問題。',
					} ] );
			}
			if ( warning.length > 0 ) {
				shouldMentionDebug = true;
				if ( warning.length === 1 ) {
					tMessage += `\n<b>警告：</b>${ warning[ 0 ] }`;
					dMessage.setFooter( {
						text: '警告：' + warning[ 0 ],
					} );
				} else {
					tMessage += '\n<b>警告：</b>\n' + warning.map( function ( x ) {
						return `• ${ x }`;
					} ).join( '\n' );
					dMessage.setFooter( {
						text: '警告：\n' + warning.map( function ( x ) {
							return `• ${ x }`;
						} ).join( '\n' ),
					} );
				}
			}
		} else if ( $submissionBox.hasClass( 'afc-submission-declined' ) || $submissionBox.hasClass( 'afc-submission-rejected' ) ) {
			tgTags.push( '#拒絕草稿' );

			tMessage += '將';
			let submitUser: string | undefined;
			if ( /\|u=([^|]+)\|/.test( wikitext ) ) {
				submitUser = wikitext.match( /\|u=([^|]+)\|/ )[ 1 ];
				tMessage += `提交者${ htmlLink( `User:${ submitUser }`, submitUser ) }所提交的`;
			} else {
				tMessage += `建立者${ htmlLink( `User:${ creator }`, creator ) }的`;
			}
			tMessage += `草稿${ pageLink }標記為`;
			if ( $submissionBox.hasClass( 'afc-submission-rejected' ) ) {
				tgTags.push( '#拒絕再次提交' );

				tMessage += '拒絕再次提交的草稿';
			} else {
				tgTags.push( '#仍需改善' );

				tMessage += '仍需改善的草稿';
			}

			dMessage.setDescription( turndown( `<b>${ tMessage }</b>` ) );

			const $reasonBox = $submissionBox.find( '.afc-submission-reason-box' );
			const $reasonItems = $reasonBox.children( '.afc-submission-reason-item' );
			const reasons: string[] = [];
			if ( $reasonItems.length > 0 ) {
				dMessage.setDescription( turndown( tMessage ) );

				for ( const item of $reasonItems ) {
					reasons.push( ...getReason( $( item ), title ) );
				}
			}

			winston.debug( `[afc/events/watchList] comment: ${ event.comment }, user: ${ user }, title: ${ title }, creator: ${ creator }, submitUser: ${ submitUser }, action: ${ $submissionBox.hasClass( 'afc-submission-rejected' ) ? 'rejected' : 'declined' }, reasons: ${ JSON.stringify( reasons ) }` );

			if ( reasons.length > 0 ) {
				dMessage.setDescription( turndown( tMessage ) );
				tMessage += '，理由：' + reasons.map( function ( x ) {
					return `\n• ${ x }`;
				} ).join( '' );
				dMessage.addFields( [ {
					name: '拒絕理由',
					value: reasons.map( function ( x ) {
						return `• ${ turndown( x ) }`;
					} ).join( '\n' ),
				} ] );
			} else {
				tMessage += '，未提供理由。';
				dMessage.addFields( [ {
					name: '拒絕理由',
					value: '• 未提供理由',
				} ] );
			}
		} else {
			winston.debug( `[afc/events/watchList] comment: ${ event.comment }, user: ${ user }, title: ${ title }, creator: ${ creator }, action: ignore` );
			return;
		}

		const indexMessage: string = htmlToIRC( tMessage );

		tMessage += '\n\n' + tgTags.join( ' ' );

		send( {
			dMessage: dMessage,
			tMessage: tMessage,
			iMessage: indexMessage,
		}, shouldMentionDebug ? 'watchList+debug' : 'watchList' );
	} catch ( error ) {
		winston.error( '[afc/event/watchList] RecentChange Error: (Throw by Async Function) ', inspect( error ) );
	}
} );

registerEvent( 'watchList' );
