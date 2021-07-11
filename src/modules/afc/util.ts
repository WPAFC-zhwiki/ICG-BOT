import { mwn } from 'mwn';
import { Manager } from '../../init';
import { version, repository } from '../../../package.json';

import TurndownService from 'turndown';

const service = new TurndownService();

export const turndown: typeof TurndownService.prototype.turndown = service.turndown.bind( service );

export const IRCBold = '\x02';

export function htmlToIRC( text: string ): string {
	return text
		.replace( /<a href="([^"]+)">([^<]+)<\/a>/g, ' $2<$1> ' )
		.replace( /https:\/\/zh\.wikipedia\.org\/(wiki\/)?/g, 'https://zhwp.org/' )
		.replace( /<b>(.*?)<\/b>/g, `${ IRCBold }$1${ IRCBold }` );
}

export { default as jQuery, default as $ } from '../../lib/jquery.js';

export let mwbot: mwn;

( async function () {
	const mwnconfig = Manager.config.afc.mwn;

	if ( mwnconfig.userAgent.length === 0 ) {
		mwnconfig.userAgent = `AFC-ICG-BOT/${ version } (${ repository.replace( /^git\+/, '' ) })`;
	}

	switch ( mwnconfig.type ) {
		case '':
		case 'none':
			mwbot = new mwn( {
				apiUrl: mwnconfig.apiUrl,
				userAgent: mwnconfig.userAgent,
				defaultParams: mwnconfig.defaultParams
			} );
			await mwbot.getSiteInfo();
			return;
		case 'botpassword':
			mwbot = await mwn.init( {
				apiUrl: mwnconfig.apiUrl,
				username: mwnconfig.username,
				password: mwnconfig.password,
				userAgent: mwnconfig.userAgent,
				defaultParams: mwnconfig.defaultParams
			} );
			return;
		case 'oauth':
			mwbot = await mwn.init( {
				apiUrl: mwnconfig.apiUrl,
				OAuthCredentials: mwnconfig.OAuthCredentials,
				userAgent: mwnconfig.userAgent,
				defaultParams: mwnconfig.defaultParams
			} );
			break;
	}
}() );
