/*
 * linky - 自動將聊天中的[[]]與{{}}換成 Wiki 系統的連結
 */
import { scheduler } from 'node:timers/promises';

import winston = require( 'winston' );

import { Manager } from '@app/init';

import { Context } from '@app/lib/handlers/Context';
import { getUIDFromContext, messageManage, parseUID } from '@app/lib/message';
import { inspect } from '@app/lib/util';

import { transportMessage, BridgeMessage } from '@app/modules/transport';

const options = Manager.config.wikilinky;

const groups = options.groups;

const map: Record<string, string | false> & {
	/**
	 * 預設狀態
	 */
	default: string | false;
} = {
	default: groups.default,
};

for ( const group in groups ) {
	const client = parseUID( group );
	if ( client.uid ) {
		map[ client.uid ] = groups[ group ];
	}
}

const ignores: Set<string> = new Set( ( options.ignores || [] ).map( function ( uid: string ) {
	const u = parseUID( uid );
	return u.uid;
} ).filter( Boolean ) );

function linky( string: string, articlepath: string ) {
	const text: Record<string, true> = {}; // 去重複

	const returnValue: string[] = [];

	let $m: RegExpMatchArray | null,
		$page: string,
		$section: string,
		$title: string;

	string.replaceAll( /\[\[([^[\]])+?\]\]|{{([^{}]+?)}}/g, function ( $txt ) {
		if ( text[ $txt ] ) {
			return '<token>';
		}

		text[ $txt ] = true;

		$txt = $txt.replace( /^{{\s*(?:subst:|safesubst:)?\s*/, '{{' );

		// eslint-disable-next-line security/detect-unsafe-regex
		if ( /^\[\[([^|#[\]]+)(?:#([^|[\]]+))?(?:\|[^[\]]+)?\]\]$/.test( $txt ) ) {
			// eslint-disable-next-line security/detect-unsafe-regex
			$m = $txt.match( /^\[\[([^|#[\]]+)(?:#([^|[\]]+))?(?:\|[^[\]]+)?\]\]$/ );
			$page = $m[ 1 ].trim();
			$section = $m[ 2 ] ? '#' + $m[ 2 ].trimEnd() : '';
			if ( $page.startsWith( '../' ) ) {
				winston.warn( `Refused parse link like "../": "${ $txt }"` );
				return '<token>';
			}
			$title = ( `${ $page }${ $section }` ).replaceAll( /\s/g, '_' ).replaceAll( '?', '%3F' ).replace( /!$/, '%21' ).replace( /:$/, '%3A' );
		} else if ( /^{{\s*#invoke\s*:/.test( $txt ) ) {
			$m = $txt.match( /^{{\s*#invoke\s*:\s*([^\s|}]+)\s*(?:\||}})/ );
			$title = `Module:${ $m[ 1 ] }`;
		} else if ( /^{{\s*#(exer|if|ifeq|ifexist|ifexpr|switch|time|language|babel)\s*:/.test( $txt ) ) {
			$m = $txt.match( /^{{\s*#(exer|if|ifeq|ifexist|ifexpr|switch|time|language|babel)\s*:/ );
			$title = `Help:解析器函数#${ $m[ 1 ] }`;
		// eslint-disable-next-line security/detect-non-literal-regexp
		} else if ( new RegExp( String.raw`^{{\s*(?:CURRENTYEAR|CURRENTMONTH|CURRENTMONTHNAME|CURRENTMONTHNAMEGEN|` +
			'CURRENTMONTHABBREV|CURRENTDAY|CURRENTDAY2|CURRENTDOW|CURRENTDAYNAME|CURRENTTIME|CURRENTHOUR|CURRENTWEEK|' +
			'CURRENTTIMESTAMP|LOCALYEAR|LOCALMONTH|LOCALMONTHNAME|LOCALMONTHNAMEGEN|LOCALMONTHABBREV|LOCALDAY|LOCALDAY2|' +
			'LOCALDOW|LOCALDAYNAME|LOCALTIME|LOCALHOUR|LOCALWEEK|LOCALTIMESTAMP) .*}}$'
		).test( $txt ) ) {
			$title = 'Help:魔术字#日期与时间';
		// eslint-disable-next-line security/detect-non-literal-regexp
		} else if ( new RegExp( String.raw`^{{\s*(?:SITENAME|SERVER|SERVERNAME|DIRMARK|` +
			'DIRECTIONMARK|SCRIPTPATH|CURRENTVERSION|CONTENTLANGUAGE|CONTENTLANG) .*}}$'
		).test( $txt ) ) {
			$title = 'Help:魔术字#技术元数据';
		// eslint-disable-next-line security/detect-non-literal-regexp
		} else if ( new RegExp( String.raw`^{{\s*(?:REVISIONID|REVISIONDAY|REVISIONDAY2|REVISIONMONTH|` +
			'REVISIONYEAR|REVISIONTIMESTAMP|REVISIONUSER|PAGESIZE|PROTECTIONLEVEL|DISPLAYTITLE|DEFAULTSORT|DEFAULTSORTKEY|DEFAULTCATEGORYSORT)(:.+?)?}}$'
		).test( $txt ) ) {
			$title = 'Help:魔术字#技术元数据';
		// eslint-disable-next-line security/detect-non-literal-regexp
		} else if ( new RegExp( String.raw`^{{\s*(?:NUMBEROFPAGES|NUMBEROFARTICLES|NUMBEROFFILES|NUMBEROFEDITS|NUMBEROFVIEWS|` +
			'NUMBEROFUSERS|NUMBEROFADMINS|NUMBEROFACTIVEUSERS|PAGESINCATEGORY|PAGESINCAT|PAGESINCATEGORY|PAGESINCATEGORY|PAGESINCATEGORY|' +
			'PAGESINCATEGORY|NUMBERINGROUP|NUMBERINGROUP|PAGESINNS|PAGESINNAMESPACE)([:|].+?)?}}$'
		).test( $txt ) ) {
			$title = 'Help:魔术字#统计';
		// eslint-disable-next-line security/detect-non-literal-regexp
		} else if ( new RegExp( String.raw`^{{\s*(?:FULLPAGENAME|PAGENAME|BASEPAGENAME|SUBPAGENAME|SUBJECTPAGENAME|` +
			'TALKPAGENAME|FULLPAGENAMEE|PAGENAMEE|BASEPAGENAMEE|SUBPAGENAMEE|SUBJECTPAGENAMEE|TALKPAGENAMEE)(:.+?)?}}$'
		).test( $txt ) ) {
			$title = 'Help:魔术字#页面标题';
		// eslint-disable-next-line security/detect-non-literal-regexp
		} else if ( new RegExp( String.raw`^{{\s*(?:NAMESPACE|SUBJECTSPACE|ARTICLESPACE|TALKSPACE|NAMESPACEE|` +
			'SUBJECTSPACEE|TALKSPACEE)(:.+?)?}}$'
		).test( $txt ) ) {
			$title = 'Help:魔术字#命名空间';
		} else if ( /^{{\s*!\s*}}$/.test( $txt ) ) {
			$title = 'Help:魔术字#其他';
		} else if ( /^{{\s*(localurl|fullurl|filepath|urlencode|anchorencode):.+}}$/.test( $txt ) ) {
			$title = 'Help:魔术字#URL数据';
		} else if ( /^{{\s*ns:\d+\s*}}$/.test( $txt ) ) {
			$title = 'Help:魔术字#命名空间_2';
		// eslint-disable-next-line security/detect-non-literal-regexp
		} else if ( new RegExp( String.raw`^{{\s*(lc|lcfirst|uc|ucfirst` +
			'|formatnum|#dateformat|#formatdate|padleft|padright|plural):.+}}$'
		).test( $txt ) ) {
			$title = 'Help:魔术字#格式';
		// eslint-disable-next-line security/detect-unsafe-regex
		} else if ( /^{{\s*(plural|grammar|gender|int)(:.+)?}}$/.test( $txt ) ) {
			$title = 'Help:魔术字#杂项';
		// eslint-disable-next-line security/detect-unsafe-regex
		} else if ( /^{{\s*(msg|raw|msgnw|subst|safesubst)(:.+)?}}$/.test( $txt ) ) {
			$title = 'Help:魔术字#杂项';
		// eslint-disable-next-line security/detect-unsafe-regex
		} else if ( /^{{\s*(#language|#special|#tag)(:.+)?}}$/.test( $txt ) ) {
			$title = 'Help:魔术字#杂项';
		// eslint-disable-next-line security/detect-unsafe-regex
		} else if ( /^{{\s*([^|]+)(?:|.+)?}}$/.test( $txt ) ) {
			// eslint-disable-next-line security/detect-unsafe-regex
			$m = $txt.match( /^{{\s*([^|]+)(?:|.+)?}}$/ );
			$page = $m[ 1 ].trim();
			$title = `${ $page.startsWith( ':' ) ? $page.replace( /^:/, '' ) : `Template:${ $page }` }`;
		} else {
			return '<token>';
		}

		try {
			returnValue.push( new URL( articlepath.replace( '$1', $title.trim() ) ).href );
		} catch {
			returnValue.push( articlepath.replace( '$1', $title.trim() ) );
		}
		return '<token>';
	} );

	return returnValue;
}

async function processlinky( from: string, to: string, text: string, context: Context ) {
	try {
		const fromUid = getUIDFromContext( context, from );
		const toUid = getUIDFromContext( context, to );

		if ( ignores.has( fromUid as string ) ) {
			return;
		}

		const rule = Object.prototype.hasOwnProperty.call( map, toUid as string ) ?
			map[ toUid as string ] :
			map.default;

		if ( rule ) {
			const links = linky( text, rule );

			if ( links.length > 0 ) {
				winston.debug( `[wikilinkly] Message ${ context.msgId } parselinks: ${ links.join( ', ' ) }` );
				context.reply( links.join( '\n' ), {
					noPrefix: true,
				} );
				// 若互聯且在公開群組調用，則讓其他群也看到連結
				if ( Manager.global.isEnable( 'transport' ) && !context.isPrivate ) {
					await scheduler.wait( 1000 );

					transportMessage( BridgeMessage.botReply( context, {
						text: links.join( '\n' ),
						plainText: true,
					} ), true );
				}
			}
		}
	} catch ( error ) {
		winston.error( '[wikilinkly] error:' + inspect( error ) );
	}
}

messageManage.on( 'text', function ( _client, from, to, text, context ) {
	processlinky( from, to, text, context );
} );
