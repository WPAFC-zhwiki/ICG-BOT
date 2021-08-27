import Discord = require( 'discord.js' );
import { mwbot, $, IRCBold as iB } from 'src/modules/afc/util/index';

type ApiPageInfo = {
    pageid: number;
    ns: number;
    title: string;
};

function getDateSubpage( days: number ) {
	if ( days < 21 ) {
		return `${ days }天前`;
	} else if ( days >= 21 && days < 63 ) {
		return `${ Math.floor( days / 7 ) }周前`;
	} else if ( days >= 63 && days < 182 ) {
		return `${ Math.floor( days / 7 ) }周前`;
	} else {
		return '陈旧草稿';
	}
}

async function getCategoriesCount( maxDays: number ): Promise<number[]> {
	let request: string[] = [];

	for ( let i = 0; i <= maxDays; i++ ) {
		request.push( getDateSubpage( i ) );
	}

	request = [ ...new Set<string>( request ) ];

	let result: string = await mwbot.parseWikitext( `[${ request.map( function ( sub: string ) {
		return `{{PAGESINCATEGORY:按提交时长分类的待审核草稿/${ sub }|PAGES}}`;
	} ).join( ', ' ) }]` );

	result = $( result ).text().trim();

	return result.substring( 1, result.length - 1 ).split( ', ' ).map( function ( val: string ) {
		return parseInt( val, 10 );
	} );
}

export async function getBacklogInfo(): Promise<{
	cnt: number;
	list: {
		pageid: number;
		ns: number;
		title: string;
	}[];
	lvl: number;
	dMsg: Discord.MessageEmbed;
	tMsg: string;
	iMsg: string;
}> {
	let list: ApiPageInfo[] = await new mwbot.category( 'Category:正在等待審核的草稿' ).members();
	list = list.filter( function ( x ) {
		return x.title !== 'Category:正在等待审核的用户页草稿';
	} );
	const cnt = list.length;
	await new mwbot.page( 'Template:AFC_status/level' ).purge();
	const html = await mwbot.parseTitle( 'Template:AFC_status/level' );
	const $rawLvl = $( $.parseHTML( html ) );
	const lvl = parseInt( $rawLvl.find( 'p' ).text(), 10 );

	let week = 0;
	let c: number[] = [];

	switch ( lvl ) {
		case 1:
			week = 0;
			break;
		case 2:
			c = await getCategoriesCount( 9 );
			week = c.filter( function ( v, i ) {
				return v && i >= 7;
			} ).length ? 1 : 0;
			break;
		case 3:
			c = await getCategoriesCount( 21 );
			week = c[ 21 ] ? 3 :
				c.filter( function ( v, i ) {
					return v && i >= 14;
				} ).length ? 2 : 1;
			break;
		default:
			week = lvl;
			break;
	}

	const dMsg = new Discord.MessageEmbed( {
		title: '條目審核積壓',
		color: ( function () {
			switch ( lvl ) {
				case 0:
					return 0x87ceeb;
				case 1:
					return 0x4169e1;
				case 2:
					return 0x32CD32;
				case 3:
					return 'YELLOW';
				case 4:
					return 'ORANGE';
				case 5:
					return 'RED';
				case 6:
					return 0x7F0000;
				case 7:
					return 0x3F0000;
				case 8:
					return 0x1A0000;
				case 9:
					return 'DARK_BUT_NOT_BLACK';
				default:
					return 0x708ad7;
			}
		}() ),
		description: `現時條目審核專題共有 **${ cnt }** 個積壓草稿需要審核，積壓約 **${ week }** 週。`,
		fields: [ {
			name: '工具欄',
			value: [
				'[待審草稿](https://zh.wikipedia.org/wiki/Category:正在等待審核的草稿)',
				'[隨機跳轉](https://zh.wikipedia.org/wiki/Special:RandomInCategory/Category:正在等待審核的草稿)'
			].join( ' **·** ' )
		} ],
		timestamp: Date.now()
	} );

	const tMsg = `<b>條目審核積壓</b>
現時條目審核專題共有 <b>${ cnt }</b> 個積壓草稿需要審核，積壓約 <b>${ week }</b> 週。
———
<b>工具欄</b>
<a href="https://zh.wikipedia.org/wiki/Category:正在等待審核的草稿">待審草稿</a> · <a href="https://zh.wikipedia.org/wiki/Special:RandomInCategory/Category:正在等待審核的草稿">隨機跳轉</a>`;

	const iMsg = `${ iB }條目審核積壓${ iB }
現時條目審核專題共有 ${ iB }${ cnt }${ iB } 個積壓草稿需要審核，積壓約 ${ iB }${ week }${ iB } 週。
———
${ iB }工具欄${ iB }
待審草稿 <https://w.wiki/3cUm>\n隨機跳轉 <https://w.wiki/3cUo>`;

	return {
		cnt,
		list,
		lvl,
		dMsg,
		tMsg,
		iMsg
	};
}
