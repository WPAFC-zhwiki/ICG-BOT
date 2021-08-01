import { ConfigTS } from './type';

/*
 * 機器人的設定檔
 *
 * 請參照註釋進行設定。設定好之後，請將檔案更名為 config.ts
 */

const config: ConfigTS = {
	IRC: {
		disabled: false, // 設為 true 之後會禁止 IRC 機器人
		bot: {
			server: 'irc.libera.chat',
			nick: '', // IRC 暱稱
			userName: '',
			realName: '',
			channels: [ '#channel1', '#channel2' ], // 需要加入的頻道
			autoRejoin: true,
			secure: true,
			port: 6697,
			floodProtection: true,
			floodProtectionDelay: 300,
			sasl: false, // 如果開啟 SASL，那麼需要正確設定前面的 userName 和下面的 sasl_password
			sasl_password: '',
			encoding: 'UTF-8'
		},
		options: {
			maxLines: 4, // 一次性容許最多四行訊息（包括因為太長而被迫分割的）

			ignore: [
				'LilyWhiteBot' // 無視 NickName 為 LilyWhiteBot 的成員
				// 同時 LilyWhiteBot0 LilyWhiteBot1 LilyWhiteBot2... 等的消息也會被無視
			]
		}
	},

	Telegram: {
		disabled: false, // 設為 true 之後會禁止 Telegram 機器人
		bot: {
			token: '', // BotFather 給你的 Token，類似「123456789:q234fipjfjaewkflASDFASjaslkdf」
			timeout: 30, // 報超時的秒數
			limit: 100, // 限定檢索的訊息數

			// 代理伺服器。僅支援 HTTPS 代理
			proxy: {
				host: '',
				port: 0
			},

			// 使用 Webhook 模式，參見 https://core.telegram.org/bots/webhooks
			webhook: {
				port: 0, // Webhook 埠，為 0 時不啟用 Webhook
				path: '', // Webhook 路徑
				url: '', // Webhook 最終的完整 URL，可被外部存取，用於呼叫 Telegram 介面自動設定網址
				ssl: {
					certPath: '', // SSL 憑證，為空時使用 HTTP 協定
					keyPath: '', // SSL 金鑰
					caPath: '' // 如使用自簽章憑證，CA 憑證路徑
				}
			},
			apiRoot: 'https://api.telegram.org' // Bot API 的根位址，必要的時候可以改成 IP。
		},
		options: {
			nickStyle: 'username' // 在其他群組中如何辨識使用者名稱：可取「username」（優先採用使用者名稱）、
			// 「fullname」（優先採用全名）、「firstname」（優先採用 First Name）
		}
	},

	Discord: {
		disabled: false, // 設為 true 之後會禁止 Discord 機器人
		bot: {
			token: '' // Bot 的 Token
		},
		options: {
			nickStyle: 'username', // 可取「username」（使用者名稱）、「id」（ID）
			useProxyURL: false, // 考慮到內地的特殊情形，若 https://cdn.discordapp.com 被 RST 請改為 true，以改用 https://media.discordapp.net
			relayEmoji: false, // 轉發時附帶自訂哏圖片，如為否只轉發表情名稱

			/**
			 * 無視 bot 的訊息
			 * 若只想無視特定 bot 請用下方的 ignore 代替
			 */
			ignorebot: false,

			/**
			 * 無視某些成員的訊息
			 */
			ignore: [
				'123456780' // 無視 ID 為 123456780 的成員

				// 請注意以下這種寫法會編譯失敗：
				// 123456780, // TS2322: Type 'number' is not assignable to type 'string'.
			]
		}
	},

	logging: {
		/**
		 * 紀錄檔等級：從詳細到簡單分別是 debug、info、warning、error，推薦用 info
		 */
		level: 'info',

		/**
		 * 紀錄檔檔名，如留空則只向螢幕輸出
		 */
		logfile: ''
	},

	modules: [
		'transport', // 啟用互聯功能，不想禁止互聯的話請勿移除
		'groupid-tg', // 取得目前 Telegram 群組的 ID，可在正式連接之前啟用該套件，然後在 Telegram 群中使用 /thisgroupid 取得ID
		'ircquery', // 允許查詢 IRC 的一些訊息
		'irccommand', // 允許向 IRC 發送一些命令（注意，不是 IRC 命令而是給頻道內機器人使用的命令）
		'pia',
		'wikilinky' // 提供連結
		// 'afc' // afc主模組
	],

	transport: {
		groups: [
			// 說明：
			// 1. 可以填任意個群組
			// 2. 群組格式：「irc/#頻道」、「telegram/群組ID」或「discord/頻道ID」
			// 3. 聊天軟體名不區分大小寫，可簡寫為 i、t、d
			// 4. 如果需要，可以加入多個互聯體
			[
				'irc/#test',
				'telegram/-12345678', // Telegram 群組號碼：可以先把 bot 拉到群組中，然後透過 /thisgroupid 來取得 id
				'discord/12345678'
				// 'discord/87654321'            // 如果有這種需求，亦可以連接
			]
			/*
             如果需要，可以繼續加
             [
                'i/#test2',
                't/@test2',
                ...
             ],
             ...
             */
		],

		/*
        // 如果希望把同一軟體的多個群組連接到一起，可為不同的群組設定不同的別名，
        // 這樣互聯機器人在轉發訊息時會採用自訂群組名，以防混淆
        "aliases": {
            'discord/87665432': '分部',
            'discord/87665432': ['簡稱', '群組全稱']
        },
         */

		/*
        // 如果不希望特定方向的轉發，例如 Telegram 群不向 QQ 轉發，請在下面設定
        "disables": {
            'telegram/-12345678': ['irc/#aaa']         // Telegram 群 -12345678 的訊息不會向 IRC 的 #aaa 頻道轉發
        },
         */

		options: {
			IRC: {
				notify: {
					join: false, // 有人進入頻道是否在其他群發出提醒
					rename: 'onlyactive', // 有人更名的話是否在其他群組發出提醒，可取
					// 「all」（所有人都提醒）、「onlyactive」（只有說過話的人更名才提醒）、
					// 「none」（不提醒）
					leave: 'onlyactive', // 有人離開頻道的話是否在其他群組提醒，也可取 all/onlyactive/none
					timeBeforeLeave: 600, // 如果 leave 為 onlyactive 的話：最後一次說話後多長時間內離開才會提醒
					topic: true // 頻道更換 Topic 時是否提醒
				},
				colorize: {
					/*
                       這裡可以設定機器人在 IRC 頻道中使用顏色。在啟用顏色功能之前，IRC 頻道的管理員需要解除頻道的 +c 模式，即
                       /msg ChanServ SET #頻道 MLOCK -c
                       轉發機器人的訊息有以下三種格式：
                       <T> [nick] message
                       <T> [nick] Re replyto 「repliedmessage」: message
                       <T> [nick] Fwd fwdfrom: message
                       （兩群互聯不會出現用於標識軟體的「<T>」）
                       可用顏色：white、black、navy、green、red、brown、purple、
                               olive、yellow、lightgreen、teal、cyan、blue、pink、gray、silver
                    */
					enabled: true, // 是否允許在 IRC 頻道中使用顏色
					broadcast: 'green', // < 整行通知的顏色 >
					client: 'navy', // 用於標記使用者端「<T>」的顏色
					nick: 'colorful', // nick 的顏色。除標準顏色外，亦可設為 colorful
					replyto: 'brown', // Re replyto 的顏色
					repliedmessage: 'olive', // 被 Re 的訊息的顏色
					fwdfrom: 'cyan', // Fwd fwdfrom 的顏色
					linesplit: 'silver', // 行分隔符的顏色

					// 如果 nick 為 colorful，則從這些顏色中挑選。為了使顏色分布均勻，建議使顏色數量為素數
					nickcolors: [ 'green', 'blue', 'purple', 'olive', 'pink', 'teal', 'red' ]
				},
				receiveCommands: true, // 是否允許 Telegram 使用 irccommand
				allowQuery: true // 是否允許其他群組查詢 IRC 頻道資訊
			},

			Telegram: {
				notify: {
					join: true, // 有人加入群組的話是否提醒其他群組
					leave: true, // 有人離開群組的話是否提醒其他群組
					pin: true // 管理員在頻道內 pin message（公告）的時候是否提醒其他群組
				},

				forwardCommands: true, // 如果有人使用 Telegram 命令亦轉發到其他群組（但由於 Telegram 設定的原因，Bot 無法看到命令結果）

				forwardBots: { // 指出在 Telegram 運行的傳話機器人，以便取得訊息中的真實暱稱
					LilyWhiteBot: '[]' // 目前僅支援 [] 和 <>（包圍暱稱的括弧）
				}
			},

			Discord: {
				forwardBots: { // 指出在 Discord 運行的傳話機器人，以便取得訊息中的真實暱稱
					LilyWhiteBot: [ '1234', '[]' ] // 格式為 "機器人名稱": 機器人discriminator編號。
				}
			},

			paeeye: {
				prepend: '//', // 在訊息前面使用「//」會阻止此條訊息向其他群組轉發。留空或省略則禁用本功能
				inline: '--no-fwd' // 在訊息中間使用「--no-fwd」會阻止此條訊息向其他群組轉發。留空或省略則禁用本功能
			},

			// 自訂訊息樣式（使用 https://www.npmjs.com/package/string-format 庫實現）
			// 欄位一覽：
			// 訊息資訊：from、to、nick、text、client_short、client_full、command、param
			// 回覆類：reply_nick、reply_text、reply_user
			// 轉發類：forward_nick、forward_user
			// 注意：此處的 nick 並不一定是暱稱，具體內容受前面各聊天軟體機器人的 nickStyle 屬性控制。
			// 例如 Telegram.options.nickStyle 為 fullname 的話，在轉發 Telegram 群訊息時，nick 也會變成該使用者的全名。
			//
			// message、reply、forward 建議格式為 `[暱稱] 轉發回覆之類的 文字`
			// 若不使用此類格式需自行改寫程式碼
			// 否則將有嚴重兼容性問題
			messageStyle: {
				// 兩群互聯樣式
				simple: {
					message: '[{nick}] {text}',
					reply: '[{nick}] Re {reply_nick} 「{reply_text}」: {text}',
					forward: '[{nick}] Fwd {forward_nick}: {text}',
					action: '* {nick} {text}',
					notice: '< {text} >'
				},

				// 多群互聯樣式
				// 備註：client_short 為空字串時會使用 simple 的樣式
				complex: {
					message: '[{client_short} - {nick}] {text}',
					reply: '[{client_short} - {nick}] Re {reply_nick} 「{reply_text}」: {text}',
					forward: '[{client_short} - {nick}] Fwd {forward_nick}: {text}',
					action: '* {client_short} - {nick} {text}',
					notice: '< {client_full}: {text} >'
				}
			}
		},

		/**
		 * 本節用於處理圖片檔案
		 *
		 * 支援以下幾種處理方式：
		 *
		 * 以下三個是公共圖床，僅支援圖片，其他類型檔案會被忽略：
		 * vim-cn：將圖片上傳到 img.vim-cn.com。
		 * imgur：將圖片上傳到 imgur.com。
		 * sm.ms：將圖片上傳到 sm.ms 圖床中。
		 *
		 * 以下三個需自建伺服器：
		 * self：將檔案儲存在自己的伺服器中。請確保您的伺服器設定正確，URL 能夠正常存取，否則將無法傳送圖片。
		 * linx：將檔案上傳到一個 linx（https://github.com/andreimarcu/linx-server）伺服器中，支援所有檔案格式。
		 * uguu: 將檔案上傳到一個 uguu（https://github.com/nokonoko/Uguu）伺服器中。
		 *
		 * 特別提醒：
		 * 1. vim-cn、sm.ms 為個人圖床，資源有限。如果您的聊天群水量很大，請選擇其他圖床或自建伺服器。
		 * 2. 如使用外部圖床，建議您設定自己專用的 User-Agent。
		 * 3. 自建伺服器請使用 80 或 443 埠（中國國內伺服器需備案），否則圖片可能無法正常轉發。
		 */
		servemedia: {
			type: '', // 檔案的處置方式：省略/留空/none、self、vim-cn、imgur、sm.ms、linx
			cachePath: '', // type 為 self 時有效：快取存放位置
			serveUrl: '', // type 為 self 時有效：檔案 URL 的字首，一般需要以斜線結尾
			linxApiUrl: '', // type 為 linx 時有效：linx API 位址，一般以斜線結尾
			uguuApiUrl: '', // type 為 uguu 時有效：以 /api.php?d=upload-tool 結尾
			imgur: { // type 為 imgur 時有效
				apiUrl: 'https://api.imgur.com/3/', // 以斜線結尾
				clientId: '' // 從 imgur 申請到的 client_id
			},
			sizeLimit: 4096, // 檔案最大大小，單位 KiB。0 表示不限制。限制僅對 Telegram 有效
			timeout: 3000, // 上傳逾時時間，單位毫秒，type 為 vim-cn、imgur 等外部圖床時有效
			userAgent: '' // 存取外部圖床時的 User-Agent，如留空則使用預設的 AFC-ICG-BOT/版本號
		}
	},

	ircquery: {
		disables: [ // 不要在這些群組使用
			'telegram/-12345678' // 軟體名（irc/telegram）要寫全而且小寫……
		],

		prefix: 'irc' // 如果使用，命令會變成 /irctopic、/ircnames 等
	},

	irccommand: {
		echo: true, // 是否在目前的使用者端顯示命令已傳送

		disables: [ // 不要在這些群組使用
			'telegram/-12345678' // 軟體名（irc/telegram）要寫全而且小寫……
		],

		prefix: 'irc' // 如果使用，命令會變成 /irctopic、/ircnames 等
	},

	wikilinky: {
		groups: {
			default: 'https://zh.wikipedia.org/wiki/$1', // 預設使用 https://zh.wikipedia.org/wiki/$1 解析連結（$1為頁面名稱）
			// 預設不啟用：
			// default: false

			// 在 Telegram 群組 -12345678 https://zh.wikipedia.org/wiki/$1 解析連結（$1為頁面名稱）
			'telegram/-12345678': 'https://en.wikipedia.org/wiki/$1',
			'discord/87654321': false // 不在 Discord 頻道 8765432 啟用
		}
	}

	/*

	afc: {
		// 在這些群啟用
		enables: [
			'telegram/-12345678', // 軟體名（irc/telegram/discord）要寫全而且小寫……
			'irc/##afc',
			'discord/87654321'
		],

		// 使用 https://www.npmjs.com/package/mwn
		//
		// 支援以下幾種登入方式：
		//
		// botpassword: 以 https://www.mediawiki.org/wiki/Manual:Bot_passwords 登入
		// oauth: 以 https://www.mediawiki.org/wiki/Extension:OAuth 登入（需要該維基有開啟擴展）
		//
		// 或是你懶得登入也可以留空或填入 none
		//
		// 請注意 mwn 僅支援 Oauth 1.0 ，若是申請成 Oauth 2.0 將會無法使用！
		mwn: {
			apiUrl: 'https://zh.wikipedia.org/w/api.php', // 以 /api.php 結尾

			type: '', // 登入方式：留空/none、botpassword、oauth

			// 設定 BotPassword
			username: 'YourUsername@YourBotName',
			password: 'YourBotPassword',

			// 設定 Oauth1.0
			OAuthCredentials: {
				consumerToken: '16_DIGIT_ALPHANUMERIC_KEY',
				consumerSecret: '20_DIGIT_ALPHANUMERIC_KEY',
				accessToken: '16_DIGIT_ALPHANUMERIC_KEY',
				accessSecret: '20_DIGIT_ALPHANUMERIC_KEY'
			},

			// 使用者代理，留空使用 mwn 的預設代理
			userAgent: '',

			// 參見 https://www.mediawiki.org/wiki/API:Main_page
			defaultParams: {
				// 如果你有登入可以反註釋下面這行，以免無意中發出沒登入的請求
				// assert: 'user'
			}
		}
	}
	*/

};

export default config;
