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
import { Manager } from 'init';
import delay from 'lib/delay';
import { Context } from 'lib/handlers/Context';
import { addCommand } from 'lib/message';
import * as moduleTransport from 'modules/transport';

const piaMap = new Map<string, string>( [
	[ 'pia', '(╯°Д°)╯︵ ~~~~~┻━┻' ],
	[ 'mua', 'o(*￣3￣)o' ],
	[ 'hug', '(つ°ω°)つ' ],
	[ 'eat', '🍴（≧□≦）🍴' ],
	[ 'drink', '(๑>؂<๑)۶' ],
	[ 'hugmua', '(つ*￣3￣)つ' ],
	[ 'idk', '╮(￣▽￣)╭' ],
	[ 'kick', '(ｏﾟﾛﾟ)┌┛Σ(ﾉ´*ω*`)ﾉ' ],
	[ 'panic', '(ﾟДﾟ≡ﾟдﾟ)' ],
	[ 'ping', 'pong' ]
] );

addCommand( 'ping', async function pia( context: Context ) {
	const command = context.command;
	const action = piaMap.get( command );

	context.reply( `${ action }${ context.param ? ` ${ context.param }` : '' }`, {
		withNick: true
	} );

	if ( Manager.global.isEnable( 'transport' ) ) {
		await delay( 1000 );

		moduleTransport.send( new moduleTransport.BridgeMsg( context, {
			text: `${ action }${ context.param ? ` ${ context.param }` : '' }`,
			isNotice: true
		} ), Manager.global.bot );
	}
} );
