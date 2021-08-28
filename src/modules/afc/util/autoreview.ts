import { $, encodeURI } from 'src/modules/afc/util/index';
import { MwnPage } from 'mwn';

import issuesData from 'src/modules/afc/util/issuesData.json';

export type elementsTS = {
	intLinks: RegExpMatchArray;
	refs: {
		all: {
			wt: string[][];
			$ele: JQuery<HTMLElement>;
		};
		default: string[][];
		$references: JQuery<HTMLElement>;
		$disallowed: JQuery<HTMLElement>;
		$unreliable: JQuery<HTMLElement>;
	};
	extlinks: string[];
	cats: RegExpMatchArray;
}

// eslint-disable-next-line max-len
export async function autoReview( page: MwnPage, wikitext: string, $parseHTML: JQuery<JQuery.Node[]|HTMLElement>, { user, creator }: {
	user?: string;
	creator?: string;
} = {} ): Promise<{
	issues: string[];
	elements: elementsTS;
}> {
	const delval = {
		tags: [
			// 表格
			'table',
			'tbody',
			'td',
			'tr',
			'th',
			// 樣式
			'style',
			// 標題常常解析出一堆亂象
			'h1',
			'h2',
			'h3',
			'h4',
			'h5',
			'h6'
		],
		ids: [
			// 小作品標籤
			'stub',
			// 目錄
			'toc'
		],
		classes: [
			// NoteTA
			'noteTA',
			// 表格
			'infobox',
			'wikitable',
			'navbox',
			// <syntaxhighlight>
			'mw-highlight',
			// 圖片說明
			'thumb',
			// <reference />
			'reflist',
			'references',
			'reference',
			// 不印出來的
			'noprint',
			// 消歧義
			'hatnote',
			'navigation-not-searchable',
			// 目錄
			'toc',
			// edit
			'mw-editsection',
			// {{AFC comment}}
			'afc-comment'
		]
	};

	const $countHTML = $parseHTML.clone();

	$countHTML.find( function () {
		let selector = '';

		delval.tags.forEach( function ( tag ) {
			selector += selector === '' ? tag : `, ${ tag }`;
		} );

		delval.ids.forEach( function ( id ) {
			selector += `, #${ id }`;
		} );

		delval.classes.forEach( function ( thisclass ) {
			selector += `, .${ thisclass }`;
		} );

		return selector;
	}() ).remove();

	const countText = $countHTML.text().replace( /\n/g, '' );

	const issues: string[] = [];

	const refs = {
		wt: ( wikitext.match( /<ref.*?>.*?<\/ref>/gi ) || [] ).map( function ( x, i ) {
			return [ String( i ), x ];
		} ),
		$ele: $parseHTML.find( 'ol.references' )
	};
	refs.$ele.find( '.mw-cite-backlink' ).remove();

	wikitext.replace( /<ref.*?>.*?<\/ref>/gi, '' );

	const extlink = $parseHTML.find( 'a' ).filter( function ( _i, a ) {
		try {
			return !$( a ).parents( '.ambox, .ombox, .fmbox, .dmbox, .stub, .afc-comment' ).length &&
				new URL( $( a ).attr( 'href' ), `https://zh.wikipedia.org/wiki/${ encodeURI( page.toText() ) }` ).hostname !== 'zh.wikipedia.org';
		} catch {
			return false;
		}
	} ).get().map( function ( a ) {
		return a.href;
	} );

	const elements: elementsTS = {
		intLinks: wikitext.match( /\[\[.*?\]\]/g ),
		refs: {
			all: refs,
			// eslint-disable-next-line @typescript-eslint/no-unused-vars
			default: refs.wt.filter( function ( [ _i, x ] ) {
				return !/group=/i.test( String( x ) );
			} ),
			$references: refs.$ele.filter( function ( _i, ele ) {
				return !!$( ele ).find( 'a, cite.citation' ).length;
			} ),
			$disallowed: refs.$ele.filter( function ( _i, ele ) {
				return !!$( ele ).html().match( /baike\.baidu\.com|百度|quora\.com|toutiao\.com|pincong\.rocks|zhihu\.com|知乎/ );
			} ),
			$unreliable: refs.$ele.filter( function ( _i, ele ) {
				return !!$( ele ).html().match( /百家[号號]|baijiahao\.baidu\.com|bigexam\.hk|boxun\.com|bowenpress\.com|hkgpao.com|peopo\.org|qyer\.com|speakout\.hk|songshuhui\.net|youtube\.com|youtu\.be|acfun\.cn|bilibili\.com/ );
			} )
		},
		extlinks: extlink,
		cats: wikitext.match( /\[\[(?:[Cc]at|[Cc]ategory|分[类類]):/gi ) || []
	};

	if ( !elements.extlinks.length ) {
		issues.push( 'no-extlink' );
	}

	const contentLen = countText.length - ( countText.match( /\p{L}/i ) ? countText.match( /\p{L}/i ).length : 0 ) * 0.5;
	if ( contentLen === 0 ) {
		issues.push( 'size-zero' );
	} else if ( contentLen <= 50 ) {
		issues.push( 'substub' );
	} else if ( contentLen <= 220 ) {
		issues.push( 'stub' );
	} else if ( contentLen >= 15000 ) {
		issues.push( 'lengthy' );
	}

	if ( !/\[\[|\{\{|\{\||==|<ref|''|<code|<pre|<source|\[http|\|-|\|}|^[*#]/.test( wikitext ) ) {
		issues.push( 'wikify' );
	}

	if ( elements.refs.$references.length === 0 && elements.refs.all.$ele.length === 0 ) {
		issues.push( 'unreferenced' );
	} else {
		if ( elements.refs.$references.length < Math.min( Math.ceil( contentLen / 300 ) + 0.1, 20 ) ) {
			issues.push( 'ref-improve' );
		}

		if ( elements.refs.$disallowed.length ) {
			issues.push( 'ref-disallowed' );
		}

		if ( elements.refs.$unreliable.length ) {
			issues.push( 'ref-unreliable' );
		}

		if (
			elements.refs.$unreliable.length + elements.refs.$disallowed.length >=
			elements.refs.$references.length * 0.5
		) {
			issues.push( 'need-rs' );
		}
	}

	if ( elements.cats.length === 0 ) {
		issues.push( 'uncategorized' );
	}

	const em = wikitext
		.replace( /<ref.*?<\/ref>/g, '' )
		.match( /(?:''|<(?:em|i|b)>|【)(?:.*?)(?:''|<\/(?:em|i|b)>|】)/g ) || [];
	const emCnt = em.length;
	if ( emCnt > ( wikitext.match( /==(?:.*?)==/g ) || [] ).length ) {
		issues.push( 'over-emphasize' );
	}

	if (
		wikitext.split( '\n' ).filter( function ( x ) {
			return x.match( /^\s+(?!$)/ );
		} ).length &&
		$parseHTML.find( 'pre' ).filter( function ( _i, ele ) {
			const parent = $( ele ).parent().get( 0 );
			return Array.from( parent.classList ).indexOf( 'mw-highlight' ) > -1;
		} ).length
	) {
		issues.push( 'bad-indents' );
	}

	if ( $parseHTML.find( '.afc-submission' ) ) {
		let title = page.getMainText();

		if ( title === user ) {
			issues.push( 'same-name' );
		} else if ( title === creator ) {
			issues.push( 'same-name-creator' );
		} else {
			if ( page.namespace === 2 ) {
				const split = title.split( '/' );
				split.shift();

				if ( split.length ) {
					title = split.join( '/' );

					if ( title.includes( user ) || user && user.includes( title ) ) {
						issues.push( 'same-name' );
					} else if ( title.includes( creator ) || creator && creator.includes( title ) ) {
						issues.push( 'same-name-creator' );
					}
				}
			}
		}

		const defaults = [
			'\'\'\'此处改为条目主题\'\'\'(?:是一个)?',
			'==\\s*章节标题\\s*=='
		];
		const regexp = new RegExp( `(${ defaults.join( '|' ) })` );
		if ( regexp.exec( wikitext ) ) {
			issues.push( 'default-wikitext' );
		}

		if ( /AFC.*(?:[测測]試|沙盒)/i.exec( title ) || /{{(?:Template:)?Afctest(?:\||}})/i.exec( wikitext ) ) {
			issues.push( 'afc-test' );
		}
	}

	return {
		issues,
		elements
	};
}

export function getIssusData( key: string, notice?: boolean ): string {
	if ( issuesData[ key ] ) {
		if ( notice ) {
			return `${ issuesData[ key ].short } (${ key })`;
		} else {
			return issuesData[ key ].long;
		}
	} else {
		if ( notice ) {
			return `⧼${ key }⧽ (${ key })`;
		} else {
			return '';
		}
	}
}
