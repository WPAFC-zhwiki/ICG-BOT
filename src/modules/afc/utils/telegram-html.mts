import { inspect, InspectOptionsStylized } from 'node:util';

import * as cheerio from 'cheerio';
import type { AnyNode, Document, Element, Node, Text } from 'domhandler';
import removeExcessiveNewline from 'remove-excessive-newline';

import { $, handleMwnRequestError, mwbot } from '@app/modules/afc/util.mjs';

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

	public [ inspect.custom ]( _depth: number, options: InspectOptionsStylized ) {
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
	try {
		url = new URL( url ).href;
	} catch {
		// ignore
	}
	return new HTMLNoNeedEscape( tEscapeHTML`<a href="${ new URL( url ).href }">${ text }</a>` );
}

export function filterLongerOutputWikitext( wt: string ) {
	return wt
		// escape math & chem
		.replaceAll( /(<(math|chem)\b)/gi, '<nowiki>$1' )
		.replaceAll( /(<\/(math|chem)\b([^>]*)>)/gi, '$1</nowiki>' );
}

function escapeAllText( element: Node ) {
	if ( element.nodeType === 1 || element.nodeType === 9 ) {
		for ( const child of ( element as Element | Document ).childNodes ) {
			escapeAllText( child );
		}
	} else if ( element.nodeType === 3 ) {
		( element as Text ).data = escapeHTML( ( element as Text ).data );
	}
}

export function cleanToTelegramHTML( rawHtml: string, baseUrl = 'https://zh.wikipedia.org/wiki/' ) {
	const replaceMap: {
		selector: string;
		doReplace( element: AnyNode ): string;
	}[] = [
		{
			selector: 'b, h1, h2, h3, h4, h5, h6',
			doReplace( element: AnyNode ) {
				return `<b>${ $( element ).text() }</b>`;
			},
		},
		{
			selector: 'i',
			doReplace( element: AnyNode ) {
				return `<i>${ $( element ).text() }</i>`;
			},
		},
		{
			selector: 'a',
			doReplace( element: AnyNode ) {
				const $a = $( element );
				const text = $a.text();
				if ( !text.trim() ) {
					// 不要生成空白連結
					return text;
				}
				const url = new URL( $a.attr( 'href' ), baseUrl );
				return `<a href="${ escapeHTML( url.href ) }">${ $a.text() }</a>`;
			},
		},
	];

	const $parse = cheerio.load( rawHtml, {}, false );
	escapeAllText( $parse.root().get( 0 ) ); // 強制跳脫所有子字串以防奇怪的輸入，雖然很蠢但有效（大概啦？）

	$parse( [
		'script',
		'style',
		'.mw-editsection',
		'.hide-when-compact',
		'[class^=ext-discussiontools-init-]:not(.ext-discussiontools-init-section, .ext-discussiontools-init-timestamplink)',
	].join( ', ' ) ).remove();

	for ( const item of replaceMap ) {
		$parse( item.selector ).text( function () {
			return item.doReplace( this );
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
