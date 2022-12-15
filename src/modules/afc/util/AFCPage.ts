import { ApiPage, ApiRevision, MwnPage } from 'mwn';
import { ApiQueryRevisionsParams } from 'mwn/build/api_params';
import { MwnError } from 'mwn/build/error';
import removeExcessiveNewline = require( 'remove-excessive-newline' );
import winston = require( 'winston' );
import { inspect } from 'src/lib/util';

import { mwbot, $ } from 'src/modules/afc/util/index';
import { isReviewer } from 'src/modules/afc/util/reviewer';

const categoryRegex = /\[\[:?(?:[Cc]at|CAT|[Cc]ategory|CATEGORY|分[类類]):([^[\]]+)\]\]/gi;

async function fetchPageAndRevisions( title: string, props: ApiQueryRevisionsParams[ 'rvprop' ],
	limit: number, customOptions?: ApiQueryRevisionsParams ) {
	const data = await mwbot.request( {
		action: 'query',
		prop: 'revisions',
		titles: title,
		rvprop: props || 'ids|timestamp|flags|comment|user',
		rvlimit: limit || 50,
		rvslots: 'main',
		...customOptions
	} );
	const page: ApiPage = data.query.pages[ 0 ];
	if ( page.missing ) {
		throw new MwnError.MissingPage();
	}
	return {
		page,
		revisions: page.revisions
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

	private _pageId: number;
	public get pageId(): number {
		this._checkIsInitialed( '[getter pageId]' );
		return this._pageId;
	}

	private _startTimestamp: string = new Date().toISOString();
	private _baseTimestamp: string;
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
		timestamp: string | null;
		params: Record<string, string>;
	}[] = [];
	// Holds all comments on the page
	private _comments: {
		timestamp: string | null;
		text: string;
	}[] = [];

	private categories: Record<string, string | false>;

	private constructor( title: string ) {
		this._page = new mwbot.page( title );
	}

	private async _init(): Promise<void> {
		if ( this._isInitialed ) {
			return;
		}
		await this._getPageText();
		await this._getTemplates();
		this._isInitialed = true;
	}

	public static async new( title: string ): Promise<AFCPage> {
		const page = new AFCPage( title );
		await page._init();
		return page;
	}

	private async _getPageText(): Promise<void> {
		const { page, revisions } = await fetchPageAndRevisions( this._page.getPrefixedText(), [ 'content', 'ids' ], 1 );
		this._pageId = page.pageid;
		const rev: ApiRevision = revisions[ 0 ];
		this._oldText = this._text = rev.slots.main.content;
		this._baseTimestamp = rev.timestamp;
		this._baseRevId = rev.revid;
	}

	private async _getTemplates(): Promise<void> {
		if ( !this._text ) {
			throw new ReferenceError( 'You must call method _getPageText before call method _getTemplates !' );
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
		 * @param {JQuery} $v
		 * @return {string}
		 */
		function parseValue( $v: JQuery ): string {
			let text: string = $( '<div>' ).append( $v.clone() ).html();

			// Convert templates to look more template-y
			text = text.replace( /<template([^>]+)?>/g, '{{' );
			text = text.replace( /<\/template>/g, '}}' );
			text = text.replace( /<part>/g, '|' );

			// Expand embedded tags (like <nowiki>)
			text = text.replace(
				new RegExp(
					'<ext><name>(.*?)<\\/name>(?:<attr>.*?<\\/attr>)*' +
						'<inner>(.*?)<\\/inner><close>(.*?)<\\/close><\\/ext>',
					'g' ),
				'&lt;$1&gt;$2$3' );

			// Now convert it back to text, removing all the rest of the XML
			// tags
			try {
				return $( text ).text();
			} catch ( e ) {
				return $( $.parseHTML( text ) ).text();
			}
		}

		const { expandtemplates }: {
			expandtemplates: {
				parsetree: string;
			};
		} = Object.assign( await mwbot.request( {
			action: 'expandtemplates',
			title: title,
			text: this._text,
			prop: 'parsetree'
		} ) );

		const $templateDom = $( $.parseXML( expandtemplates.parsetree ) ).find( 'root' );

		$templateDom.children( 'template' ).each( function () {
			const $el = $( this ),
				data: typeof AFCPage.prototype._templates[ 0 ] = { target: $el.children( 'title' ).text(), params: {} };

			$el.children( 'part' ).each( function () {
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

	private _parseSubmissionTemplate(): void {
		function getAndDelete<O, V extends keyof O>( obj: O, key: V ): O[ V ] {
			if ( Object.prototype.hasOwnProperty.call( obj, key ) ) {
				const value = obj[ key ];
				delete obj[ key ];
				return value;
			}
			return undefined;
		}
		this._submissions = [];
		this._comments = [];

		function parseTimestamp( str: string ) {
			if ( !str ) {
				return false;
			}
			let exp: RegExp;
			if ( !isNaN( +new Date( str ) ) ) {
				return new Date( str ).toISOString().replace( /[^\d]/g, '' ).slice( 0, 14 );
			} else if ( str.match( /^\d+$/ ) ) {
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

			return date.toISOString().replace( /[^\d]/g, '' ).slice( 0, 14 );
		}

		for ( const template of this._templates ) {
			const name = template.target.toLowerCase();
			if ( name === 'afc submission' ) {
				this._submissions.push( {
					status: ( getAndDelete( template.params, '1' ) || '' ).toLowerCase(),
					timestamp: parseTimestamp( getAndDelete( template.params, 'ts' ) ) || null,
					params: template.params
				} );
			} else if ( name === 'afc comment' ) {
				this._comments.push( {
					timestamp: parseTimestamp( template.params[ '1' ] ) || null,
					text: template.params[ '1' ]
				} );
			}
		}

		type timestampSortObj = typeof AFCPage.prototype._submissions[ 0 ] | typeof AFCPage.prototype._comments[ 0 ];

		function timestampSortHelper( a: timestampSortObj, b: timestampSortObj ) {
			// If we're passed something that's not a number --
			// for example, {{REVISIONTIMESTAMP}} -- just sort it
			// first and be done with it.
			if ( isNaN( +a.timestamp ) ) {
				return -1;
			} else if ( isNaN( +b.timestamp ) ) {
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
			}
		};

		// Process the submission templates in order, from the most recent to
		// the oldest. In the process, we remove unneeded templates (for example,
		// a draft tag when it's already been submitted) and also set various
		// "isX" properties of the Submission.
		this._submissions = this._submissions.filter( function ( template ) {
			let keepTemplate = true;

			if ( Object.prototype.hasOwnProperty.call( statusCases, template.status ) ) {
				keepTemplate = statusCases[ template.status ]();
			} else {
				// Default pending status
				keepTemplate = statusCases[ '' ]();
			}

			if ( keepTemplate ) {
				// Will be re-added in updateAfcTemplates() if necessary
				delete template.params.small; // small=yes for old declines
			}

			return keepTemplate;
		} );
	}

	private _removeExcessNewlines(): void {
		this._text = removeExcessiveNewline( this._text, 2 )
			.replace( /=+([^=\n]+)=+[\t\n\s]*$/gi, function ( _all: string, title: string ) {
				const regexp = /^(?:外部(?:[链鏈]接|[连連]結)|[参參]考(?:[资資]料|[来來]源|文[档檔献獻]))$/;
				return regexp.exec( title ) ? `== ${ title } ==` : '';
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
		this._text = this._text.replace(
			new RegExp(
				'\\{\\{\\s*afc submission\\s*(?:\\||[^{{}}]*|{{.*?}})*?\\}\\}' +
				// Also remove the AFCH-generated warning message, since if
				// necessary the script will add it again
				'(<!-- 请不要移除这一行代码 -->)?',
				'gi' ),
			'' );

		this._text = this._text.replace( /\{\{\s*afc comment[\s\S]+?\(UTC\)\}\}/gi, '' );

		// Remove horizontal rules that were added by AFCH after the comments
		this._text = this._text.replace( /^----+$/gm, '' );

		// Remove excess newlines created by AFC templates
		this._removeExcessNewlines();
	}

	private _updateAfcTemplates(): void {
		this._removeAfcTemplates();

		const templates: string[] = [];
		let hasDeclineTemplate = false;

		// Submission templates go first
		this._submissions.forEach( function ( template ) {
			let tout = '{{AFC submission|' + template.status;
			const paramKeys: string[] = [];

			// FIXME: Think about if we really want this elaborate-ish
			// positional parameter ouput, or if it would be a better
			// idea to just make everything absolute. When we get to a point
			// where nobody is using the actual templates and it's 100%
			// script-based, "pretty" isn't really that important and we
			// can scrap this. Until then, though, we can only dream...

			// Make an array of the parameters
			Object.keys( template.params ).forEach( function ( key ) {
				// Parameters set to false are ignored
				if ( template.params[ key ] ) {
					paramKeys.push( key );
				}
			} );

			paramKeys.sort( function ( a, b ) {
				const aIsNumber = !isNaN( +a ), bIsNumber = !isNaN( +b );

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
			} ).forEach( function ( key: string, index: number ) {
				const value = template.params[ key ];
				if (

					// If it is a numerical parameter, doesn't include
					// `=` in the value, AND is in sequence with the other
					// numerical parameters, we can omit the key= part
					// (positional parameters, joyous day :/ )
					!isNaN( +key ) && +key % 1 === 0 && !value.includes( '=' ) &&

					// Parameter 2 will be the first positional parameter,
					// since 1 is always going to be the submission status.
					( key === '2' || +paramKeys[ index - 1 ] === +key - 1 )
				) {
					tout += '|' + value.trim();
				} else {
					tout += '|' + key + '=' + value;
				}
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
		} );

		// Then comment templates
		this._comments.forEach( function ( comment ) {
			templates.push( '\n{{AFC comment|1=' + comment.text + '}}' );
		} );

		// If there were comments, add a horizontal rule beneath them
		if ( this._comments.length ) {
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
				this.categories[ split.shift() ] = split.length ? split.join( '|' ) : false;
			}
			match = categoryRegex.exec( this._text );
		}

		this._text = this._text.replace( categoryRegex, '' );

		this._removeExcessNewlines();
	}

	public updateCategories( categories?: string[] ): void {
		this._checkIsInitialed( 'updateCategories' );

		this._parseCategories();

		if ( categories ) {
			for ( const cat of categories ) {
				const split = cat.split( '|' );
				if ( !Object.prototype.hasOwnProperty.call( this.categories, split[ 0 ] ) ) {
					this.categories[ split.shift() ] = split.length ? split.join( '|' ) : false;
				}
			}
		}

		const CategoriesNeedRemove = [ '使用创建条目精灵建立的页面', '用条目向导创建的草稿', '正在等待審核的草稿' ];
		for ( const cat in this.categories ) {
			if ( !CategoriesNeedRemove.includes( cat ) ) {
				this._text += `\n[[:Category:${ cat }${ ( this.categories[ cat ] ? `|${ this.categories[ cat ] }` : '' ) }]]`;
			}
		}
	}

	public cleanUp(): void {
		this._checkIsInitialed( 'cleanUp' );

		let text = this._text;
		const commentsToRemove = [
			'请不要移除这一行代码', '請勿刪除此行，並由下一行開始編輯'
		];

		// Assemble a master regexp and remove all now-unneeded comments
		// (commentsToRemove)
		const commentRegex = new RegExp(
			'<!-{2,}\\s*(' + commentsToRemove.join( '|' ) + ')\\s*-{2,}>', 'gi' );

		text = text
			.replace( commentRegex, '' )

			// Remove sandbox templates
			.replace(
				/\{\{(userspacedraft|userspace draft|user sandbox|用戶沙盒|用户沙盒|draft copyvio|七日草稿|7D draft|Draft|草稿|Please leave this line alone \(sandbox heading\))(?:\{\{[^{}]*\}\}|[^}{])*\}\}/ig,
				''
			)

			// 把分類當成模板來加？
			.replace( /\{\{:?(?:Cat|Category|分[类類]):([^{}]+)\}\}/gi, '[[:Category:$1]]' )

			// 移除掉不知道為甚麼沒移除的預設內容
			.replace( /'''此处改为条目主题'''(?:是一个)?/, '' )

			.replace( /==\s*章节标题\s*==/, '' )

			.replace( /<([A-Za-z]+)(\s+([^>]+))?>/g, function ( _all: string, tagName: string, args: string ) {
				return `<${ tagName.toLowerCase() }${ args ? ` ${ args.trim() }` : '' }>`;
			} )

			.replace( /<\/([A-Za-z]+)(?:\s+[^>]+)?>/g, function ( _all: string, tagName: string ) {
				return `</${ tagName.toLowerCase() }>`;
			} )

			.replace( /<\/?br\s*\/?>/g, '<br />' )

			.replace( /<\/?hr\s*\/?>/g, '<hr />' )

			// Remove html comments (<!--) that surround categories
			// categoryRegex
			.replace( new RegExp( '<!--[\\s\\r\\t\\n]*((' + categoryRegex.source + '[\\s\\r\\t\\n]*)+)-->', 'gi' ), '$1' )

			// Remove spaces/commas between <ref> tags
			.replace(
				/\s*(<\/\s*ref\s*>)\s*[,]*\s*(<\s*ref\s*(name\s*=|group\s*=)*\s*[^/]*>)[ \t]*$/gim,
				'$1$2\n\n'
			)

			// Remove whitespace before <ref> tags
			.replace( /[\s\t]*(<\s*ref\s*(name\s*=|group\s*=)*\s*.*[^/]+>)[\s\t]*$/gim, '$1\n\n' )

			// Move punctuation before <ref> tags
			.replace(
				/\s*((<\s*ref\s*(name\s*=|group\s*=)*\s*.*[/]{1}>)|(<\s*ref\s*(name\s*=|group\s*=)*\s*[^/]*>(?:<[^<>\n]*>|[^<>\n])*<\/\s*ref\s*>))[\s\t]*([.。!！?？,，;；:：])+$/gim,
				'$6$1\n\n'
			)

			// Replace {{http://example.com/foo}} with "* http://example.com/foo" (common
			// newbie error)
			.replace(
				/\n\{\{(http[s]?|ftp[s]?|irc):\/\/(.*?)\}\}/gi,
				'\n* $1://$3'
			);

		// Convert http://-style links to other wikipages to wikicode syntax
		// FIXME: Break this out into its own core function? Will it be used
		// elsewhere?
		// eslint-disable-next-line no-shadow
		function convertExternalLinksToWikiLinks( text: string ) {
			const linkRegex =
			/\[{1,2}(?:https?:)?\/\/(?:(?:zh\.wikipedia\.org|zhwp\.org)\/(?:wiki|zh|zh-hans|zh-hant|zh-cn|zh-my|zh-sg|zh-tw|zh-hk|zh-mo)|zhwp\.org)\/([^\s|\][]+)(?:\s|\|)?((?:\[\[[^[\]]*\]\]|[^\][])*)\]{1,2}/ig;
			let linkMatch = linkRegex.exec( text );
			let title: string;
			let displayTitle: string;
			let newLink: string;

			while ( linkMatch ) {
				title = decodeURI( linkMatch[ 1 ] ).replace( /_/g, ' ' );
				displayTitle = decodeURI( linkMatch[ 2 ] ).replace( /_/g, ' ' );

				// Don't include the displayTitle if it is equal to the title
				if ( displayTitle && title !== displayTitle ) {
					newLink = '[[' + title + '|' + displayTitle + ']]';
				} else {
					newLink = '[[' + title + ']]';
				}

				text = text.replace( linkMatch[ 0 ], newLink );
				linkMatch = linkRegex.exec( text );
			}

			return text;
		}

		text = convertExternalLinksToWikiLinks( text );

		this._text = text;

		this.updateCategories();

		this._removeExcessNewlines();

		this._updateAfcTemplates();
	}

	public get hasValidAFCTemplates(): boolean {
		this._checkIsInitialed( '[getter hasValidAFCTemplates]' );
		return !!this._submissions.length;
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

	public async postEdit( summary?: string ): Promise<ApiEditResponse> {
		this._checkIsInitialed( 'postEdit' );

		if ( !mwbot.loggedIn && !mwbot.usingOAuth ) {
			throw new Error( 'You must login to edit.' );
		}

		try {
			const data: ApiEditResponse = await this._page.save( this.text, summary || '自動清理AFC草稿', {
				bot: true,
				starttimestamp: this._startTimestamp,
				basetimestamp: this._baseTimestamp,
				baserevid: this._baseRevId,
				minor: true,
				nocreate: true
			} );

			winston.debug( '[afc/util/AFCPage] Edit success:' + JSON.stringify( data ) );

			return data;
		} catch ( error ) {
			winston.error( '[afc/util/AFCPage] Edit Error:' + inspect( error ) );
			throw error;
		}
	}

	public static isReviewer = isReviewer;
}
