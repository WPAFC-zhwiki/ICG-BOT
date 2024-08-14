import Discord = require( 'discord.js' );
import irc = require( 'irc-upd' );

import { mwbot, $, handleMwnRequestError } from '@app/modules/afc/util/index';

type ApiPageInfo = {
	pageid: number;
	ns: number;
	title: string;
};

export async function getBacklogInfo(): Promise<{
	cnt: number;
	list: {
		pageid: number;
		ns: number;
		title: string;
	}[];
	lvl: number;
	dMsg: Discord.EmbedBuilder;
	tMsg: string;
	iMsg: string;
}> {
	let list: ApiPageInfo[] = await new mwbot.Category( 'Category:正在等待審核的草稿' ).members();
	list = list.filter( function ( x ) {
		return [ 0, 2, 118 ].includes( x.ns );
	} ).sort();
	const cnt = list.length;
	await new mwbot.Page( 'Template:AFC_status/level' ).purge().catch( handleMwnRequestError );
	const html = await mwbot.parseTitle( 'Template:AFC_status/level' ).catch( handleMwnRequestError );
	const $rawLvl = $( $.parseHTML( html ) );
	const lvl = parseInt( $rawLvl.find( 'p' ).text(), 10 );

	const dMsg = new Discord.EmbedBuilder( {
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
					return Discord.Colors.Yellow;
				case 4:
					return Discord.Colors.Orange;
				case 5:
					return Discord.Colors.Red;
				case 6:
					return 0x7F0000;
				case 7:
					return 0x3F0000;
				case 8:
					return 0x1A0000;
				case 9:
					return Discord.Colors.DarkButNotBlack;
				default:
					return 0x708ad7;
			}
		}() ),
		description: `現時建立條目專題共有 **${ cnt }** 個積壓草稿需要審核，積壓約 **${ lvl }** 週。`,
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
現時建立條目專題共有 <b>${ cnt }</b> 個積壓草稿需要審核，積壓約 <b>${ lvl }</b> 週。
———
<b>工具欄</b>
<a href="https://zh.wikipedia.org/wiki/Category:正在等待審核的草稿">待審草稿</a> · <a href="https://zh.wikipedia.org/wiki/Special:RandomInCategory/Category:正在等待審核的草稿">隨機跳轉</a>`;

	const iMsg = `${ irc.colors.wrap( 'bold', '條目審核積壓' ) }
現時建立條目專題共有 ${ irc.colors.wrap( 'bold', String( cnt ) ) } 個積壓草稿需要審核，積壓約 ${ irc.colors.wrap( 'bold', String( lvl ) ) } 週。
———
${ irc.colors.wrap( 'bold', '工具欄' ) }
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
