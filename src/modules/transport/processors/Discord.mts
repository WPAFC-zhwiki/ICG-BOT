import format from 'string-format';
import winston from 'winston';

import { ConfigTS } from '@app/config.mjs';
import { Manager } from '@app/init.mjs';

import { preProcess } from '@app/lib/message/processors/Discord.mjs';
import { inspect } from '@app/lib/util.mjs';

import * as bridge from '@app/modules/transport/bridge.mjs';
import { BridgeMessage } from '@app/modules/transport/BridgeMessage.mjs';

const config: ConfigTS[ 'transport' ] = Manager.config.transport;
const discordHandler = Manager.handlers.get( 'Discord' );
const options: ConfigTS[ 'transport' ][ 'options' ][ 'Discord' ] = config.options.Discord;
const forwardBots: Record<string, [ string | number, '[]' | '<>' | 'self' ]> = options.forwardBots;

function parseForwardBot( username: string, text: string ) {
	let realText: string, realNick: string;
	const symbol = forwardBots[ username ] && forwardBots[ username ][ '1' ];
	switch ( symbol ) {
		case 'self':
		// TODO 更換匹配方式
		// [ , , realNick, realText ] = text.match(/^(|<.> )\[(.*?)\] ([^]*)$/mu) || [];
			[ , realNick, realText ] = text.match( /^\[(.*?)\] ([^]*)$/mu ) || [];

			break;

		case '[]':
			[ , realNick, realText ] = text.match( /^\[(.*?)\](?::? |\n)([^]*)$/mu ) || [];

			break;

		case '<>':
			[ , realNick, realText ] = text.match( /^<(.*?)>(?::? |\n)([^]*)$/mu ) || [];

			break;

	// No default
	}

	return { realNick, realText };
}

/*
 * 傳話
 */
discordHandler.on( 'text', async function ( context ) {
	await preProcess( context );

	const extra = context.extra;

	// 檢查是不是在回覆自己

	if (
		extra.reply &&
		String( forwardBots[ extra.reply.username ] && forwardBots[ extra.reply.username ][ 0 ] ) ===
			String( extra.reply.discriminator )
	) {
		const { realNick, realText } = parseForwardBot( extra.reply.username, extra.reply.message );
		if ( realText ) {
			[ extra.reply.nick, extra.reply.message ] = [ realNick, realText ];
		}
	}

	try {
		await bridge.transportMessage( context );
	} catch ( error ) {
		winston.error( '[transport/processors/Discord]' + inspect( error ) );
	}
} );

// 收到了來自其他群組的訊息
export default async function onMessage( message_: BridgeMessage ): Promise<string> {
	// 元信息，用于自定义样式
	const meta: Record<string, string> = {
		nick: message_.nick,
		from: message_.from,
		to: message_.to,
		text: message_.text,
		client_short: message_.extra.clientName.shortname,
		client_full: message_.extra.clientName.fullname,
		command: message_.command,
		param: message_.param,
	};
	let associationReplyMessageId: string | undefined;
	if ( message_.extra.reply ) {
		const reply = message_.extra.reply;
		const associationMessageId = await bridge.fetchMessageAssociation(
			reply.origClient,
			reply.origChatId,
			reply.origMessageId,
			discordHandler.type,
			message_.to
		);
		if ( associationMessageId ) {
			associationReplyMessageId = String( associationMessageId );
		} else {
			/*
			meta.reply_nick = reply.nick;
			meta.reply_user = reply.username;
			if ( reply.isText ) {
				meta.reply_text = bridge.truncate( reply.message );
			} else {
				meta.reply_text = reply.message;
			}
			*/
		}
	}
	if ( message_.extra.forward ) {
		meta.forward_nick = message_.extra.forward.nick;
		meta.forward_user = message_.extra.forward.username;
	}

	const template: string = bridge.getMessageStyle( message_, true );

	const output = format( template, meta );
	const attachFileUrls = ( message_.extra.uploads || [] ).map( ( u: { url: string; } ) => ` ${ u.url }` ).join( '' );

	const message = associationReplyMessageId ?
		await discordHandler.say( BridgeMessage.parseUID( message_.to_uid ).id, {
			content: `${ output }${ attachFileUrls }`,
			files: ( message_.extra.uploads || [] )
				.map( ( upload ) => ( {
					attachment: upload.url,
				} ) ),
			reply: {
				messageReference: associationReplyMessageId,
				failIfNotExists: false,
			},
		} ) :
		await discordHandler.say( BridgeMessage.parseUID( message_.to_uid ).id, `${ output }${ attachFileUrls }` );
	return message.id;
}
