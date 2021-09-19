/*
 * 掀桌子
 *
 * 在群組中使用 !pia、!mua 和 !hug （在Telegram群組中使用 /pia、/mua 和 /hug）
 *
 * pia 的故事：
 * 本模組向[##Orz](https://orz.chat/) 群中的 varia 機器人致敬。pia、mua、hug 三個指令源自 varia 機器人
 * 而[中文維基百科聊天頻道](https://t.me/wikipedia_zh_n)成員經常使用 eat，於是也做成了指令。
 * 後來，中文維基百科也增加了這幾個指令的模板，例如 [{{pia}}](https://zh.wikipedia.org/wiki/Template:Pia)。
 * 於是，中文維基百科其他幾個花式 ping 也成為了機器人的指令。
 */
import { Context as TContext } from 'telegraf';

import { Manager } from 'src/init';
import { Context, rawmsg } from 'src/lib/handlers/Context';
import { addCommand } from 'src/lib/message';
import delay from 'src/lib/delay';
import { transportMessage, BridgeMsg } from 'src/modules/transport';

const tg = Manager.handlers.get( 'Telegram' );

addCommand( 'anyone', async function ( context: Context ) {
	const rawdata: rawmsg = context._rawdata;

	if ( rawdata instanceof TContext ) {
		if ( rawdata.message.reply_to_message ) {
			tg.rawClient.telegram.sendMessage( rawdata.chat.id, '沒有人，你悲劇了。', {
				reply_to_message_id: rawdata.message.reply_to_message.message_id
			} );
			try {
				await tg.rawClient.telegram.deleteMessage( rawdata.chat.id, rawdata.message.message_id );
			} catch ( ex ) {}
		} else {
			context.reply( '沒有人，你悲劇了。' );
		}
	} else {
		context.reply( '沒有人，你悲劇了。' );
	}

	if ( Manager.global.isEnable( 'transport' ) ) {
		await delay( 1000 );

		transportMessage( new BridgeMsg( context, {
			text: '沒有人，你悲劇了。',
			isNotice: true
		} ), true );
	}
} );
