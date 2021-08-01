import Discord = require( 'discord.js' );
import { getBacklogInfo, encodeURI, setCommand } from 'modules/afc/util';

function htmllink( title: string, text?: string ) {
	return `<a href="https://zh.wikipedia.org/wiki/${ encodeURI( title ) }">${ text || title }</a>`;
}

function mdlink( title: string, text?: string ) {
	return `[${ text || title }](https://zh.wikipedia.org/wiki/${ encodeURI( title ) })`;
}

setCommand( 'waitlist', async function ( args, reply ) {
	const { list } = await getBacklogInfo();

	// TODO: 範圍
	const from = 1,
		to = list.length;

	const dMsg = new Discord.MessageEmbed()
		.setColor( 0x708ad7 )
		.setTitle( '候審草稿列表' )
		.setDescription( list.map( function ( page ) {
			return mdlink( page.title );
		} ).slice( from - 1, to ).join( '\n' ) )
		.setTimestamp()
		.setFooter( `顯示第 ${ from } 至 ${ to } 項（共 ${ to - from + 1 } 項）` );

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
