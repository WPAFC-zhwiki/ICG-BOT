import Discord from 'discord.js';

import { encodeURI } from '@app/modules/afc/util.mjs';
import { getBacklogInfo } from '@app/modules/afc/utils/backlogInfo.mjs';
import { setCommand } from '@app/modules/afc/utils/message.mjs';

function htmllink( title: string, text?: string ) {
	return `<a href="https://zh.wikipedia.org/wiki/${ encodeURI( title ) }">${ text || title }</a>`;
}

function mdlink( title: string, text?: string ) {
	return `[${ text || title }](https://zh.wikipedia.org/wiki/${ encodeURI( title ) })`;
}

setCommand( 'waitlist', async function ( _args, reply ) {
	const { list } = await getBacklogInfo();

	// TODO: 範圍
	const from = 1,
		to = list.length;

	const dMessage = new Discord.EmbedBuilder( {
		title: '候審草稿列表',
		color: 0x70_8A_D7,
		description: list.map( function ( page ) {
			return mdlink( page.title );
		} ).slice( from - 1, to ).join( '\n' ),
		timestamp: Date.now(),
		footer: {
			text: `顯示第 ${ from } 至 ${ to } 項（共 ${ to - from + 1 } 項）`,
		},
	} );

	const tMessage = `<b>候審草稿列表</b>${ list.map( function ( page ) {
		return `\n• ${ htmllink( page.title ) }`;
	} ).slice( from - 1, to ).join( '' ) }\n顯示第 ${ from } 至 ${ to } 項（共 ${ to - from + 1 } 項）`;

	const indexMessage = '請到 Telegram 或 Discord 查看，謝謝！'; // IRC不傳送這種東西，太長了

	reply( {
		tMessage: tMessage,
		dMessage: dMessage,
		iMessage: indexMessage,
	} );
} );
