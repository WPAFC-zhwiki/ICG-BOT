import cheerio = require( 'cheerio' );
import removeExcessiveNewline = require( 'remove-excessive-newline' );

import { $, mwbot } from '@app/modules/afc/util/index';

export function escapeHTML( str: string ) {
	return str
		.replace( /&/g, '&amp;' )
		.replace( /</g, '&lt;' )
		.replace( />/g, '&gt;' );
}

export class HTMLNoNeedEscape {
	public constructor( public text: string ) {

	}

	public toString() {
		return this.text;
	}

	public valueOf() {
		return `<HTMLNoNeedEscape>[${ this.text }]`;
	}
}

export function tEscapeHTML(
	rawTexts: readonly string[],
	...escapes: ( string | HTMLNoNeedEscape | undefined )[]
): string {
	const copyRawTexts = Array.from( rawTexts );
	const copyEscapes = Array.from( escapes );
	let result = '';
	while ( copyEscapes.length > 0 ) {
		result += copyRawTexts.shift();
		const cur = copyEscapes.shift();
		result += cur instanceof HTMLNoNeedEscape ? cur.text : escapeHTML( cur || '' );
	}
	return result + copyRawTexts.join( '' );
}

export function makeHTMLLink( url: string, text: string | HTMLNoNeedEscape = url ) {
	return new HTMLNoNeedEscape( tEscapeHTML`<a href="${ encodeURI( url ) }">${ text }</a>` );
}

export function filterLongerOutputWikitext( wt: string ) {
	return wt
		// escape math & chem
		.replace( /(<(math|chem)\b)/gi, '<nowiki>$1' )
		.replace( /(<\/(math|chem)\b([^>]*)>)/gi, '$1</nowiki>' );
}

export function cleanToTelegramHTML( rawHtml: string, baseUrl = 'https://zh.wikipedia.org/wiki/' ) {
	const replaceMap: {
		selector: string;
		doReplace( element: cheerio.Element ): string;
	}[] = [
		{
			selector: 'b, h1, h2, h3, h4, h5, h6',
			doReplace( element: cheerio.Element ) {
				return `<b>${ $( element ).text() }</b>`;
			}
		},
		{
			selector: 'i',
			doReplace( element: cheerio.Element ) {
				return `<i>${ $( element ).text() }</i>`;
			}
		},
		{
			selector: 'a',
			doReplace( element: cheerio.Element ) {
				const $a = $( element );
				const url = new URL( $a.attr( 'href' ), baseUrl );
				return tEscapeHTML`<a href="${ url.href }">${ new HTMLNoNeedEscape( $a.text() ) }</a>`;
			}
		}
	];

	const $parse = cheerio.load( rawHtml, {}, false );

	$parse( [
		'script',
		'style',
		'.mw-editsection',
		'[class^=ext-discussiontools-init-]:not(.ext-discussiontools-init-section, .ext-discussiontools-init-timestamplink)'
	].join( ', ' ) ).remove();

	for ( const item of replaceMap ) {
		$parse( item.selector ).text( function () {
			return item.doReplace( <cheerio.Element>( this ) );
		} );
	}

	return removeExcessiveNewline(
		$parse.text()
			.split( '\n' )
			.map( ( v ) => !v.trim() ? '' : v.trimEnd() )
			.join( '\n' ),
		1
	);
}

export async function wikitextParseAndClean( wikitext:string, title: string, baseUrl = 'https://zh.wikipedia.org/wiki/' ) {
	return cleanToTelegramHTML(
		await mwbot.parseWikitext( filterLongerOutputWikitext( wikitext ), {
			title,
			disablelimitreport: true,
			disableeditsection: true,
			disabletoc: true
		} ),
		baseUrl
	);
}
