import * as cheerio from 'cheerio';
import type { Element } from 'domhandler';
import { ApiPage, ApiParams, ApiRevision, MwnPage, MwnTitle } from 'mwn';
import { MwnError } from 'mwn/build/error.js';
import removeExcessiveNewline from 'remove-excessive-newline';
import { ApiEditPageParams, ApiQueryRevisionsParams } from 'types-mediawiki-api';
import winston from 'winston';

import { inspect } from '@app/lib/util.mjs';

import { mwbot, $, handleMwnRequestError } from '@app/modules/afc/util.mjs';
import { isReviewer } from '@app/modules/afc/utils/reviewer.mjs';

const categoryRegex = /\[\[:?(?:[Cc]at|CAT|[Cc]ategory|CATEGORY|分[类類]):([^[\]]+)\]\]/gi;

async function fetchRevisionsByTitle(
	title: string,
	properties: ApiQueryRevisionsParams[ 'rvprop' ],
	limit: number,
	customOptions?: ApiQueryRevisionsParams
) {
	const data = await mwbot.request( {
		action: 'query',
		prop: 'revisions',
		titles: title,
		rvprop: properties || 'ids|timestamp|flags|comment|user',
		rvlimit: limit || 50,
		rvslots: 'main',
		formatversion: '2',
		...customOptions,
	} as ApiQueryRevisionsParams as ApiParams ).catch( handleMwnRequestError );
	const page: ApiPage = data.query.pages[ 0 ];
	if ( page.missing ) {
		throw new MwnError.MissingPage();
	}
	return {
		page,
		revisions: page.revisions,
	};
}

async function fetchRevisionByRevId(
	revId: number,
	properties: ApiQueryRevisionsParams[ 'rvprop' ],
	customOptions?: ApiQueryRevisionsParams
) {
	const data = await mwbot.request( {
		action: 'query',
		prop: 'revisions',
		revids: revId,
		rvprop: properties || 'ids|timestamp|flags|comment|user',
		rvslots: 'main',
		formatversion: '2',
		...customOptions,
	} as ApiQueryRevisionsParams as ApiParams ).catch( handleMwnRequestError );
	const page: ApiPage = data.query.pages[ 0 ];
	if ( page.missing ) {
		throw new MwnError.MissingPage();
	}
	return {
		page,
		revision: page.revisions[ 0 ],
	};
}

export type ApiEditResponse = {
	result: string;
	pageid: number;
	title: string;
	contentmodel: string;
	nochange?: boolean;
	oldrevid: number;
	newrevid: number;
	newtimestamp: string;
};

export class AFCPage {
	private _page: MwnPage;
	public get mwnPage(): MwnPage {
		return this._page;
	}

	private _isInitialed = false;
	private _checkIsInitialed( method: string ) {
		if ( !this._isInitialed ) {
			throw new Error( `AFCPage#${ method }: method must call after initialed.` );
		}
	}

	private _oldText: string;
	private _text: string;

	private _html: string;

	private _pageId: number;
	public get pageId(): number {
		this._checkIsInitialed( '[getter pageId]' );
		return this._pageId;
	}

	private _startTimestamp: string = new Date().toISOString();
	private _baseTimestamp: string;
	private _lastRevId: number | false;
	private _baseRevId: number;
	public get baseRevId(): number {
		this._checkIsInitialed( '[getter baseRevId]' );
		return this._baseRevId;
	}

	private _templates: {
		target: string;
		params: Record<string, string>;
	}[] = [];
	private _submissions: {
		status: string;
		timestamp: string | false;
		params: Record<string, string>;
	}[] = [];
	// Holds all comments on the page
	private _comments: {
		timestamp: string | false;
		text: string;
	}[] = [];

	private categories: Record<string, string | false>;

	private constructor( title: string | MwnTitle ) {
		this._page = new mwbot.Page( title );
	}

	public toString() {
		return this._page.getPrefixedText();
	}

	private async _init( revId?: number ): Promise<void> {
		if ( this._isInitialed ) {
			return;
		}
		await this._getPageText( revId );
		await this._getTemplates();
		this._isInitialed = true;
	}

	public static async init( title: string | MwnTitle, revId?: number ): Promise<AFCPage> {
		const page = new this( title );
		await page._init( revId );
		return page;
	}

	public static async forceInit( title: string | MwnTitle, revId?: number ): Promise<AFCPage> {
		const page = new this( title );
		try {
			await page._init( revId );
		} catch ( error ) {
			winston.error( '[afc/util/AFCPage] ', error );
			page._pageId = 0;
			page._lastRevId = 0;
			page._oldText = page._text = '';
			page._baseTimestamp = new Date().toISOString();
			page._baseRevId = 0;
			page._templates = [];
			page._submissions = [];
			page._comments = [];
			page._isInitialed = true;
		}
		return page;
	}

	public static async revInit( revId: number ): Promise<AFCPage> {
		const { page } = await fetchRevisionByRevId( revId, [ 'content', 'ids' ] );
		return await this.init( page.title, revId );
	}

	public static async initWithContent( title: string, content: string ): Promise<AFCPage> {
		const page = new this( title );
		page._pageId = 0;
		page._lastRevId = 0;
		page._oldText = page._text = content;
		page._baseTimestamp = new Date().toISOString();
		page._baseRevId = 0;
		page._getTemplates();
		page._isInitialed = true;
		return page;
	}

	private async _getPageText( revId?: number ): Promise<void> {
		const { page, revisions } = await fetchRevisionsByTitle( this._page.getPrefixedText(), [ 'content', 'ids' ], 1 );
		this._pageId = page.pageid;
		const rev: ApiRevision = revisions[ 0 ];
		this._lastRevId = rev.revid;
		if ( revId && this._lastRevId !== revId ) {
			const { revision: exactRev } = await fetchRevisionByRevId( revId, [ 'content', 'ids' ] );
			this._oldText = this._text = exactRev.slots.main.content;
			this._baseTimestamp = exactRev.timestamp;
			this._baseRevId = revId;
		} else {
			this._oldText = this._text = rev.slots.main.content;
			this._baseTimestamp = rev.timestamp;
			this._baseRevId = rev.revid;
		}
	}

	private async _getTemplates(): Promise<void> {
		if ( !this._text ) {
			throw new ReferenceError( 'You must call method `_getPageText` before call method `_getTemplates`!' );
		}

		const templates: {
			target: string;
			params: Record<string, string>;
		}[] = this._templates = [];
		const title = this._page.toString();

		/**
		 * Essentially, this function takes a template value DOM object, $v,
		 * and removes all signs of XML-ishness. It does this by manipulating
		 * the raw text and doing a few choice string replacements to change
		 * the templates to use wikicode syntax instead. Rather than messing
		 * with recursion and all that mess, /g is our friend...which is
		 * perfectly satisfactory for our purposes.
		 *
		 * @param {cheerio.Cheerio<Element>} $v
		 * @return {string}
		 */
		function parseValue( $v: cheerio.Cheerio<Element> ): string {
			let text: string = $( '<div>' ).append( $v.clone() ).html();

			// Convert templates to look more template-y
			// eslint-disable-next-line security/detect-unsafe-regex
			text = text.replaceAll( /<template([^>]+)?>/g, '{{' );
			text = text.replaceAll( '</template>', '}}' );
			text = text.replaceAll( '<part>', '|' );

			// Expand embedded tags (like <nowiki>)
			text = text.replaceAll(
				// 只是切成兩半而已
				// eslint-disable-next-line security/detect-non-literal-regexp
				new RegExp(
					String.raw`<ext><name>(.*?)<\/name>(?:<attr>.*?<\/attr>)*` +
						String.raw`<inner>(.*?)<\/inner><close>(.*?)<\/close><\/ext>`,
					'g' ),
				'&lt;$1&gt;$2$3' );

			// Now convert it back to text, removing all the rest of the XML
			// tags
			try {
				return $( text ).text();
			} catch {
				return $( $.parseHTML( text ) ).text();
			}
		}

		const { expandtemplates } = await mwbot.request( {
			action: 'expandtemplates',
			title: title,
			text: this._text,
			prop: 'parsetree',
		} ).catch( handleMwnRequestError ) as {
			expandtemplates: {
				parsetree: string;
			};
		};

		const $templateDom = cheerio.load( expandtemplates.parsetree, {
			xmlMode: true,
		} )( 'root' );

		$templateDom.children( 'template' ).each( function () {
			const $element = $( this ),
				data: typeof AFCPage.prototype._templates[ 0 ] = { target: $element.children( 'title' ).text(), params: {} };

			$element.children( 'part' ).each( function () {
				const $part = $( this );
				const $name = $part.children( 'name' );
				// Use the name if set, or fall back to index if implicitly
				// numbered
				const name = ( $name.text() || $name.attr( 'index' ) ).trim();
				const value = ( parseValue( $part.children( 'value' ) ) ).trim();

				data.params[ name ] = value;
			} );

			templates.push( data );
		} );

		this._parseSubmissionTemplate();
	}

	private _getAndDelete<O, V extends keyof O>( object: O, key: V ): O[ V ] {
		if ( Object.prototype.hasOwnProperty.call( object, key ) ) {
			const value = object[ key ];
			delete object[ key ];
			return value;
		}
		return undefined;
	}

	private _parseTimestamp( str: string ): string | false {
		if ( !str ) {
			return false;
		}
		let exp: RegExp;
		if ( !Number.isNaN( +new Date( str ) ) ) {
			return new Date( str ).toISOString().replaceAll( /[^\d]/g, '' ).slice( 0, 14 );
		} else if ( /^\d+$/.test( str ) ) {
			return str;
		} else {
			exp = /^(\d{4})年(\d{1,2})月(\d{1,2})日 \([一二三四五六日]\) (\d\d):(\d\d) \(UTC\)$/g;
		}

		const match = exp.exec( str );

		if ( !match ) {
			return false;
		}

		const date = new Date();
		date.setUTCFullYear( +match[ 1 ] );
		date.setUTCMonth( +match[ 2 ] - 1 ); // stupid javascript
		date.setUTCDate( +match[ 3 ] );
		date.setUTCHours( +match[ 4 ] );
		date.setUTCMinutes( +match[ 5 ] );
		if ( +match[ 6 ] ) {
			date.setMilliseconds( +match[ 6 ] );
		}
		date.setUTCSeconds( 0 );

		return date.toISOString().replaceAll( /[^\d]/g, '' ).slice( 0, 14 );
	}

	private _parseSubmissionTemplate(): void {
		this._submissions = [];
		this._comments = [];

		for ( const template of this._templates ) {
			const name = template.target.toLowerCase();
			if ( name === 'afc submission' ) {
				this._submissions.push( {
					status: ( this._getAndDelete( template.params, '1' ) || '' ).toLowerCase(),
					timestamp: this._parseTimestamp( this._getAndDelete( template.params, 'ts' ) ),
					params: template.params,
				} );
			} else if ( name === 'afc comment' ) {
				this._comments.push( {
					timestamp: this._parseTimestamp( template.params[ '1' ] ),
					text: template.params[ '1' ],
				} );
			}
		}

		type timestampSortObject = typeof AFCPage.prototype._submissions[ 0 ] | typeof AFCPage.prototype._comments[ 0 ];

		function timestampSortHelper( a: timestampSortObject, b: timestampSortObject ) {
			// If we're passed something that's not a number --
			// for example, {{REVISIONTIMESTAMP}} -- just sort it
			// first and be done with it.
			if ( Number.isNaN( +a.timestamp ) ) {
				return -1;
			} else if ( Number.isNaN( +b.timestamp ) ) {
				return 1;
			}

			// Otherwise just sort normally
			return +b.timestamp - +a.timestamp;
		}

		// Sort templates by timestamp; most recent are first
		this._submissions.sort( timestampSortHelper );
		this._comments.sort( timestampSortHelper );

		let isPending = false;
		let isUnderReview = false;
		let isDeclined = false;
		let isDraft = false;

		// Useful list of "what to do" in each situation.
		const statusCases = {
			// Declined
			d: function () {
				if ( !isPending && !isDraft && !isUnderReview ) {
					isDeclined = true;
				}
				return true;
			},
			// Draft
			t: function () {
				// If it's been submitted or declined, remove draft tag
				if ( isPending || isDeclined || isUnderReview ) {
					return false;
				}
				isDraft = true;
				return true;
			},
			// Under review
			r: function () {
				if ( !isPending && !isDeclined ) {
					isUnderReview = true;
				}
				return true;
			},
			// Pending
			'': function () {
				// Remove duplicate pending templates or a redundant
				// pending template when the submission has already been
				// declined / is already under review
				if ( isPending || isDeclined || isUnderReview ) {
					return false;
				}
				isPending = true;
				isDraft = false;
				isUnderReview = false;
				return true;
			},
		};

		// Process the submission templates in order, from the most recent to
		// the oldest. In the process, we remove unneeded templates (for example,
		// a draft tag when it's already been submitted) and also set various
		// "isX" properties of the Submission.
		this._submissions = this._submissions.filter( function ( template ) {
			let keepTemplate = true;

			keepTemplate = statusCases[
				Object.prototype.hasOwnProperty.call( statusCases, template.status ) ?
					template.status :
					''
			]();

			if ( keepTemplate ) {
				// Will be re-added in updateAfcTemplates() if necessary
				delete template.params.small; // small=yes for old declines
			}

			return keepTemplate;
		} );
	}

	private _removeExcessNewlines(): void {
		this._text = removeExcessiveNewline( this._text, 2 )
			.replaceAll( /=+([^=\n]+)=+[\t\n\s]*$/gi, function ( _all: string, title: string ) {
				const regexp = /^(?:外部(?:[链鏈]接|[连連]結)|[参參]考(?:[资資]料|[来來]源|文[档檔献獻]))$/;
				return regexp.test( title ) ? `== ${ title } ==` : '';
			} )
			.trim();
	}

	private _removeAfcTemplates(): void {
		// FIXME: Awful regex to remove the old submission templates
		// This is bad. It works for most cases but has a hellish time
		// with some double nested templates or faux nested templates (for
		// example "{{hi|{ foo}}" -- note the extra bracket). Ideally Parsoid
		// would just return the raw template text as well (currently
		// working on a patch for that, actually).
		this._text = this._text.replaceAll(
			// 只是切成兩半而已
			// eslint-disable-next-line security/detect-non-literal-regexp
			new RegExp(
				String.raw`\{\{\s*afc submission\s*(?:\||[^{{}}]*|{{.*?}})*?\}\}` +
				// Also remove the AFCH-generated warning message, since if
				// necessary the script will add it again
				'(<!-- 请不要移除这一行代码 -->)?',
				'gi' ),
			'' );

		this._text = this._text.replaceAll( /\{\{\s*afc comment[\s\S]+?\(UTC\)\}\}/gi, '' );

		// Remove horizontal rules that were added by AFCH after the comments
		this._text = this._text.replaceAll( /^----+$/gm, '' );

		// Remove excess newlines created by AFC templates
		this._removeExcessNewlines();
	}

	private _updateAfcTemplates(): void {
		this._removeAfcTemplates();

		const templates: string[] = [];
		let hasDeclineTemplate = false;

		// Submission templates go first
		for ( const template of this._submissions ) {
			let tout = '{{AFC submission|' + template.status;
			const parameterKeys: string[] = [];

			// FIXME: Think about if we really want this elaborate-ish
			// positional parameter ouput, or if it would be a better
			// idea to just make everything absolute. When we get to a point
			// where nobody is using the actual templates and it's 100%
			// script-based, "pretty" isn't really that important and we
			// can scrap this. Until then, though, we can only dream...

			// Make an array of the parameters
			for ( const key of Object.keys( template.params ) ) {
				// Parameters set to false are ignored
				if ( template.params[ key ] ) {
					parameterKeys.push( key );
				}
			}

			parameterKeys.sort( function ( a, b ) {
				const aIsNumber = !Number.isNaN( +a ), bIsNumber = !Number.isNaN( +b );

				// If we're passed two numerical parameters then
				// sort them in order (1,2,3)
				if ( aIsNumber && bIsNumber ) {
					return ( +a ) > ( +b ) ? 1 : -1;
				}

				// A is a number, it goes first
				if ( aIsNumber && !bIsNumber ) {
					return -1;
				}

				// B is a number, it goes first
				if ( !aIsNumber && bIsNumber ) {
					return 1;
				}

				// Otherwise just leave the positions as they were
				return 0;
			// eslint-disable-next-line unicorn/no-array-for-each
			} ).forEach( function ( key: string, index: number ) {
				const value = template.params[ key ];
				const skipParameterName =
					// If it is a numerical parameter, doesn't include
					// `=` in the value, AND is in sequence with the other
					// numerical parameters, we can omit the key= part
					// (positional parameters, joyous day :/ )
					!Number.isNaN( +key ) && +key % 1 === 0 && !value.includes( '=' ) &&

					// Parameter 2 will be the first positional parameter,
					// since 1 is always going to be the submission status.
					( key === '2' || +parameterKeys[ index - 1 ] === +key - 1 );

				tout += '|' + ( skipParameterName ? '' : key + '=' ) + value;
			} );

			// Collapse old decline template if a newer decline
			// template is already displayed on the page
			if ( hasDeclineTemplate && template.status === 'd' ) {
				tout += '|small=yes';
			}

			// So that subsequent decline templates will be collapsed
			if ( template.status === 'd' ) {
				hasDeclineTemplate = true;
			}

			// Finally, add the timestamp and a warning about removing the template
			tout += '|ts=' + template.timestamp + '}}';

			templates.push( tout );
		}

		// Then comment templates
		for ( const comment of this._comments ) {
			templates.push( '\n{{AFC comment|1=' + comment.text + '}}' );
		}

		// If there were comments, add a horizontal rule beneath them
		if ( this._comments.length > 0 ) {
			templates.push( '\n----' );
		}

		this._text = templates.join( '\n' ) + '\n\n' + this._text;
	}

	private _parseCategories(): void {
		let match = categoryRegex.exec( this._text );
		this.categories = {};

		while ( match ) {
			const split = match[ 1 ].split( '|' );
			if ( !Object.prototype.hasOwnProperty.call( this.categories, split[ 0 ] ) ) {
				this.categories[ split.shift() ] = split.length > 0 ? split.join( '|' ) : false;
			}
			match = categoryRegex.exec( this._text );
		}

		this._text = this._text.replaceAll( categoryRegex, '' );

		this._removeExcessNewlines();
	}

	public updateCategories( categories?: string[] ): void {
		this._checkIsInitialed( 'updateCategories' );

		this._parseCategories();

		if ( categories ) {
			for ( const cat of categories ) {
				const split = cat.split( '|' );
				if ( !Object.prototype.hasOwnProperty.call( this.categories, split[ 0 ] ) ) {
					this.categories[ split.shift() ] = split.length > 0 ? split.join( '|' ) : false;
				}
			}
		}

		const CategoriesNeedRemove = new Set( [ '使用创建条目精灵建立的页面', '用条目向导创建的草稿', '正在等待審核的草稿' ] );
		for ( const cat in this.categories ) {
			if ( !CategoriesNeedRemove.has( cat ) ) {
				this._text += `\n[[:Category:${ cat }${ ( this.categories[ cat ] ? `|${ this.categories[ cat ] }` : '' ) }]]`;
			}
		}
	}

	/**
	 * Convert http://-style links to other wikipages to wikicode syntax
	 *
	 * FIXME: Break this out into its own core function? Will it be used elsewhere?
	 *
	 * @param {string} text
	 * @return {string}
	 */
	private _convertExternalLinksToWikiLinks( text: string ): string {
		const linkRegex =
		// eslint-disable-next-line security/detect-unsafe-regex
		/\[{1,2}(?:https?:)?\/\/(?:(?:zh\.wikipedia\.org|zhwp\.org)\/(?:wiki|zh|zh-hans|zh-hant|zh-cn|zh-my|zh-sg|zh-tw|zh-hk|zh-mo)|zhwp\.org)\/([^\s|\][]+)(?:\s|\|)?((?:\[\[[^[\]]*\]\]|[^\][])*)\]{1,2}/ig;
		let linkMatch = linkRegex.exec( text );
		let title: string;
		let displayTitle: string;
		let newLink: string;

		while ( linkMatch ) {
			title = decodeURI( linkMatch[ 1 ] ).replaceAll( '_', ' ' );
			displayTitle = decodeURI( linkMatch[ 2 ] ).replaceAll( '_', ' ' );

			// Don't include the displayTitle if it is equal to the title
			newLink = displayTitle && title !== displayTitle ? '[[' + title + '|' + displayTitle + ']]' : '[[' + title + ']]';

			text = text.replace( linkMatch[ 0 ], newLink );
			linkMatch = linkRegex.exec( text );
		}

		return text;
	}

	public cleanUp(): void {
		this._checkIsInitialed( 'cleanUp' );

		let text = this._text;
		const commentsToRemove = [
			'请不要移除这一行代码', '請勿刪除此行，並由下一行開始編輯',
		];

		// Assemble a master regexp and remove all now-unneeded comments
		// (commentsToRemove)
		// eslint-disable-next-line security/detect-non-literal-regexp
		const commentRegex = new RegExp(
			String.raw`<!-{2,}\s*(` + commentsToRemove.join( '|' ) + String.raw`)\s*-{2,}>`,
			'gi'
		);

		text = text
			.replaceAll( commentRegex, '' )

			// Remove sandbox templates
			.replaceAll(
				// eslint-disable-next-line security/detect-unsafe-regex
				/\{\{(userspacedraft|userspace draft|user sandbox|用戶沙盒|用户沙盒|draft copyvio|七日草稿|7D draft|Draft|草稿|Please leave this line alone \(sandbox heading\))(?:\{\{[^{}]*\}\}|[^}{])*\}\}/ig,
				''
			)

			// 把分類當成模板來加？
			.replaceAll( /\{\{:?(?:Cat|Category|分[类類]):([^{}]+)\}\}/gi, '[[:Category:$1]]' )

			// 移除掉不知道為甚麼沒移除的預設內容
			.replace( /'''此处改为条目主题'''(?:是一个)?/, '' )

			.replace( /==\s*章节标题\s*==/, '' )

			// eslint-disable-next-line security/detect-unsafe-regex
			.replaceAll( /<([A-Za-z]+)(\s+([^>]+))?>/g, function ( _all: string, tagName: string, args: string ) {
				return `<${ tagName.toLowerCase() }${ args ? ` ${ args.trim() }` : '' }>`;
			} )

			// eslint-disable-next-line security/detect-unsafe-regex
			.replaceAll( /<\/([A-Za-z]+)(?:\s+[^>]+)?>/g, function ( _all: string, tagName: string ) {
				return `</${ tagName.toLowerCase() }>`;
			} )

			.replaceAll( /<\/?br\s*\/?>/g, '<br />' )

			.replaceAll( /<\/?hr\s*\/?>/g, '<hr />' )

			// Remove html comments (<!--) that surround categories
			// categoryRegex
			// eslint-disable-next-line security/detect-non-literal-regexp
			.replaceAll( new RegExp( String.raw`<!--[\s\r\t\n]*((` + categoryRegex.source + String.raw`[\s\r\t\n]*)+)-->`, 'gi' ), '$1' )

			// Remove spaces/commas between <ref> tags
			.replaceAll(
				// eslint-disable-next-line security/detect-unsafe-regex
				/\s*(<\/\s*ref\s*>)\s*[,]*\s*(<\s*ref\s*(name\s*=|group\s*=)*\s*[^/]*>)[ \t]*$/gim,
				'$1$2\n\n'
			)

			// Remove whitespace before <ref> tags
			// eslint-disable-next-line security/detect-unsafe-regex
			.replaceAll( /[\s\t]*(<\s*ref\s*(name\s*=|group\s*=)*\s*.*[^/]+>)[\s\t]*$/gim, '$1\n\n' )

			// Move punctuation before <ref> tags
			.replaceAll(
				// eslint-disable-next-line security/detect-unsafe-regex
				/\s*((<\s*ref\s*(name\s*=|group\s*=)*\s*.*[/]{1}>)|(<\s*ref\s*(name\s*=|group\s*=)*\s*[^/]*>(?:<[^<>\n]*>|[^<>\n])*<\/\s*ref\s*>))[\s\t]*([.。!！?？,，;；:：])+$/gim,
				'$6$1\n\n'
			)

			// Replace {{http://example.com/foo}} with "* http://example.com/foo" (common
			// newbie error)
			.replaceAll(
				/\n\{\{(http[s]?|ftp[s]?|irc):\/\/(.*?)\}\}/gi,
				'\n* $1://$3'
			);

		text = this._convertExternalLinksToWikiLinks( text );

		this._text = text;

		this.updateCategories();

		this._removeExcessNewlines();

		this._updateAfcTemplates();
	}

	public get hasValidAFCTemplates(): boolean {
		this._checkIsInitialed( '[getter hasValidAFCTemplates]' );
		return this._submissions.length > 0;
	}

	public get text(): string {
		this._checkIsInitialed( '[getter text]' );
		return this._text;
	}
	public set text( str: string ) {
		this._checkIsInitialed( '[setter text]' );
		this._text = str;
	}

	public get isChange(): boolean {
		this._checkIsInitialed( '[getter isChange]' );
		return this._text !== this._oldText;
	}

	public get isAFCPage(): boolean {
		return [ 2, 118 ].includes( this._page.namespace );
		/* || this._page.namespace === 102 && !!this._page.getMainText().match( /^建立條目\// ) */
	}

	public async parseToHTML() {
		this._checkIsInitialed( 'parseToHTML' );
		this._html ??= await mwbot.request( {
			formatversion: 2,
			action: 'parse',
			contentmodel: 'wikitext',
			uselang: 'zh-hant',
			oldid: this._baseRevId,
		} ).catch( handleMwnRequestError ).then( function ( data ) {
			return ( data as { parse: { text: string } } ).parse.text;
		} );

		return cheerio.load( this._html );
	}

	public async postEdit( summary: string, extraOptions: ApiEditPageParams = {} ): Promise<ApiEditResponse> {
		this._checkIsInitialed( 'postEdit' );

		if ( this._lastRevId === false ) {
			throw new Error( 'Can\'t post edit to unknown version.' );
		}

		if ( this._baseRevId !== this._lastRevId ) {
			throw new Error( 'Can\'t post edit to history version.' );
		}

		if ( !mwbot.loggedIn && !mwbot.usingOAuth ) {
			throw new Error( 'You must login to edit.' );
		}

		try {
			const data: ApiEditResponse = await this._page.save( this.text, summary, {
				bot: true,
				starttimestamp: this._startTimestamp,
				basetimestamp: this._baseTimestamp,
				baserevid: this._baseRevId,
				minor: true,
				nocreate: !!this._pageId,
				createonly: !this._pageId,
				...extraOptions,
			} ).catch( handleMwnRequestError );

			winston.debug( '[afc/util/AFCPage] Edit success:' + JSON.stringify( data ) );

			return data;
		} catch ( error ) {
			winston.error( '[afc/util/AFCPage] Edit Error:' + inspect( error ) );
			throw error;
		}
	}

	public static isReviewer = isReviewer;
}
