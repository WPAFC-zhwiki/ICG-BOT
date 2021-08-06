import { $ } from 'modules/afc/util/index';
import { MwnPage } from 'mwn';

import issuesData from './issuesData.json';
import issuesDataExtends from './issuesDataExtends.json';

export type elementsTS = {
	intLinks: RegExpMatchArray;
	refs: {
		all: {
			wt: string[][];
			$ele: JQuery<HTMLElement>
		};
		default: string[][];
		$references: JQuery<HTMLElement>;
		$disallowed: JQuery<HTMLElement>;
		$unreliable: JQuery<HTMLElement>;
	},
	cats: RegExpMatchArray
}

export async function autoReview( wikitext: string, $parseHTML: JQuery<HTMLElement|Node[]> ): Promise<{
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

	const elements: elementsTS = {
		intLinks: wikitext.match( /\[\[.*?\]\]/g ),
		refs: {
			all: refs,
			// eslint-disable-next-line @typescript-eslint/no-unused-vars
			default: refs.wt.filter( function ( [ _i, x ] ) {
				return !/group=/i.test( String( x ) );
			} ),
			$references: refs.$ele.filter( function ( _i, ele ) {
				return !!$( ele ).find( 'a' ).length;
			} ),
			$disallowed: refs.$ele.filter( function ( _i, ele ) {
				return !!$( ele ).html().match( /baike.baidu.com|百度|quora.com|toutiao.com|pincong.rocks|zhihu.com|知乎/ );
			} ),
			$unreliable: refs.$ele.filter( function ( _i, ele ) {
				return !!$( ele ).html().match( /百家[号號]|baijiahao.baidu.com|bigexam.hk|boxun.com|bowenpress.com|hkgpao.com|peopo.org|qyer.com|speakout.hk|songshuhui.net|youtube.com|youtu.be|acfun.cn|bilibili.com/ );
			} )
		},
		cats: wikitext.match( /\[\[(?:[Cc]at|[Cc]ategory|分[类類]):/gi ) || []
	};

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

	return {
		issues,
		elements
	};
}

// eslint-disable-next-line max-len
export function autoReviewExtends( page: MwnPage, wikitext: string, issues: string[], { user, creator }: { user?: string, creator?: string } = {} ): void {
	let title = page.getMainText();

	if ( title === user ) {
		issues.push( 'same-name' );
	} else if ( title === creator ) {
		issues.push( 'same-name-creator' );
	} else if ( user && creator ) {
		if ( page.namespace === 2 ) {
			const split = title.split( '/' );
			split.shift();

			if ( !split.length ) {
				return;
			}

			title = split.join( '/' );
		}

		if ( title.includes( user ) || user.includes( title ) ) {
			issues.push( 'same-name' );
		} else if ( title.includes( creator ) || creator.includes( title ) ) {
			issues.push( 'same-name-creator' );
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

export function getIssusData( key: string, notice?: boolean ): string {
	if ( issuesData[ key ] ) {
		if ( notice ) {
			return `${ issuesData[ key ].short } (${ key })`;
		} else {
			return issuesData[ key ].long;
		}
	} else if ( issuesDataExtends[ key ] && notice ) {
		return `${ issuesDataExtends[ key ] } (${ key })`;
	} else {
		if ( notice ) {
			return `⧼${ key }⧽ (${ key })`;
		} else {
			return '';
		}
	}
}
