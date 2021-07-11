import Discord = require( 'discord.js' );
import getBacklogInfo from '../backlogInfo.js';
import { setCommand } from '../msg';

function htmllink( title: string, text?: string ) {
	return `<a href="https://zh.wikipedia.org/wiki/${ encodeURIComponent( title ) }">${ text || title }</a>`;
}

function mdlink( title: string, text?: string ) {
	return `[${ text || title }](https://zh.wikipedia.org/wiki/${ encodeURIComponent( title ) })`;
}

setCommand( 'waitlist', async function ( args, reply ) {
	const { list } = await getBacklogInfo();

	let from = 1,
		to = list.length;

	let sizeError = false;

	if ( args[ 1 ] ) {
		if ( !isNaN( parseInt( args[ 0 ], 10 ) ) && !isNaN( parseInt( args[ 1 ], 10 ) ) ) {
			if ( parseInt( args[ 0 ], 10 ) >= parseInt( args[ 1 ], 10 ) ) {
				sizeError = true;
				console.log( 3 );
			} else {
				from = parseInt( args[ 0 ], 10 );
				to = parseInt( args[ 1 ], 10 ) > to ? to : parseInt( args[ 1 ], 10 );
			}
		} else {
			console.log( 2 );
			sizeError = true;
		}
	} else if ( args[ 0 ] && parseInt( args[ 0 ], 10 ) ) {
		to = parseInt( args[ 0 ], 10 ) > to ? to : parseInt( args[ 0 ], 10 );
	} else if ( args[ 0 ] ) {
		console.log( 2 );
		sizeError = true;
	}

	const dMsg = new Discord.MessageEmbed()
		.setColor( 0x708ad7 )
		.setTitle( '候審草稿列表' )
		.setDescription( list.map( function ( page ) {
			return mdlink( page.title );
		} ).slice( from - 1, to - 1 ).join( '\n' ) )
		.setTimestamp()
		.setFooter( `顯示第 ${ from } 至 ${ to } 項（共 ${ to - from + 1 } 項）${ sizeError ? '（警告：已忽略無效範圍參數）' : '' }` );

	const tMsg = `<b>候審草稿列表</b>${ list.map( function ( page ) {
		return `\n• ${ htmllink( page.title ) }`;
	} ).slice( from - 1, to - 1 ).join( '' ) }\n顯示第 ${ from } 至 ${ to } 項（共 ${ to - from + 1 } 項）${ sizeError ? '\n<b>警告</b>：已忽略無效範圍參數。' : '' }`;

	const iMsg = '請到 Telegram 或 Discord 查看，謝謝！'; // IRC不傳送這種東西，太長了

	reply( {
		tMsg,
		dMsg,
		iMsg
	} );
} );
