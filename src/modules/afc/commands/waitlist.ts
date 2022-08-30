import Discord = require( 'discord.js' );

import { getBacklogInfo, encodeURI, setCommand } from 'src/modules/afc/util';

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

	const dMsg = new Discord.EmbedBuilder( {
		title: '候審草稿列表',
		color: 0x708AD7,
		description: list.map( function ( page ) {
			return mdlink( page.title );
		} ).slice( from - 1, to ).join( '\n' ),
		timestamp: Date.now(),
		footer: {
			text: `顯示第 ${ from } 至 ${ to } 項（共 ${ to - from + 1 } 項）`
		}
	} );

	const tMsg = `<b>候審草稿列表</b>${ list.map( function ( page ) {
		return `\n• ${ htmllink( page.title ) }`;
	} ).slice( from - 1, to ).join( '' ) }\n顯示第 ${ from } 至 ${ to } 項（共 ${ to - from + 1 } 項）`;

	const iMsg = '請到 Telegram 或 Discord 查看，謝謝！'; // IRC不傳送這種東西，太長了

	reply( {
		tMsg,
		dMsg,
		iMsg
	} );
} );
