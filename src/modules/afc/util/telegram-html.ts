import util = require( 'node:util' );

import cheerio = require( 'cheerio' );
import type { Element } from 'domhandler';
import removeExcessiveNewline from 'remove-excessive-newline';

import { $, handleMwnRequestError, mwbot } from '@app/modules/afc/util/index';

export function escapeHTML( str: string ) {
	return str
		.replaceAll( '&', '&amp;' )
		.replaceAll( '<', '&lt;' )
		.replaceAll( '>', '&gt;' );
}

export class HTMLNoNeedEscape {
	public constructor( public text: string ) {}

	public toString() {
		return this.text;
	}

	public valueOf() {
		return `HTMLNoNeedEscape <${ this.text }>`;
	}

	public [ util.inspect.custom ]( _depth: number, options: util.InspectOptionsStylized ) {
		return `${ options.stylize( 'HTMLNoNeedEscape', 'special' ) } <${ options.stylize( this.text, 'string' ) }>`;
	}
}

export function tEscapeHTML(
	rawTexts: readonly string[],
	...escapes: ( string | HTMLNoNeedEscape | undefined )[]
): string {
	const copyRawTexts = [ ...rawTexts ];
	const copyEscapes = [ ...escapes ];
	let result = '';
	while ( copyEscapes.length > 0 ) {
		result += copyRawTexts.shift();
		const current = copyEscapes.shift();
		result += current instanceof HTMLNoNeedEscape ? current.text : escapeHTML( current || '' );
	}
	return result + copyRawTexts.join( '' );
}

export function makeHTMLLink( url: string, text: string | HTMLNoNeedEscape = url ) {
	return new HTMLNoNeedEscape( tEscapeHTML`<a href="${ encodeURI( url ) }">${ text }</a>` );
}

export function filterLongerOutputWikitext( wt: string ) {
	return wt
		// escape math & chem
		.replaceAll( /(<(math|chem)\b)/gi, '<nowiki>$1' )
		.replaceAll( /(<\/(math|chem)\b([^>]*)>)/gi, '$1</nowiki>' );
}

export function cleanToTelegramHTML( rawHtml: string, baseUrl = 'https://zh.wikipedia.org/wiki/' ) {
	const replaceMap: {
		selector: string;
		doReplace( element: Element ): string;
	}[] = [
		{
			selector: 'b, h1, h2, h3, h4, h5, h6',
			doReplace( element: Element ) {
				return `<b>${ $( element ).text() }</b>`;
			},
		},
		{
			selector: 'i',
			doReplace( element: Element ) {
				return `<i>${ $( element ).text() }</i>`;
			},
		},
		{
			selector: 'a',
			doReplace( element: Element ) {
				const $a = $( element );
				const text = $a.text();
				if ( !text.trim() ) {
					// 不要生成空白連結
					return text;
				}
				const url = new URL( $a.attr( 'href' ), baseUrl );
				return tEscapeHTML`<a href="${ url.href }">${ new HTMLNoNeedEscape( $a.text() ) }</a>`;
			},
		},
	];

	const $parse = cheerio.load( rawHtml, {}, false );

	$parse( [
		'script',
		'style',
		'.mw-editsection',
		'.hide-when-compact',
		'[class^=ext-discussiontools-init-]:not(.ext-discussiontools-init-section, .ext-discussiontools-init-timestamplink)',
	].join( ', ' ) ).remove();

	for ( const item of replaceMap ) {
		$parse( item.selector ).text( function () {
			return item.doReplace( <Element>( this ) );
		} );
	}

	return removeExcessiveNewline(
		$parse.text()
			.split( '\n' )
			.map( ( v ) => v.trim() ? v.trimEnd() : '' )
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
			disabletoc: true,
		} ).catch( handleMwnRequestError ),
		baseUrl
	);
}
