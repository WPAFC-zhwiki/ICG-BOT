import { MwnOptions } from 'mwn';

type IRCColor = 'white' | 'black' | 'navy' | 'green' | 'red' | 'brown' | 'purple' | 'olive' |
	'yellow' | 'lightgreen' | 'teal' | 'cyan' | 'blue' | 'pink' | 'gray' | 'silver';

export interface ConfigTS {
	IRC?: {
		/**
		 * 如果需要 IRC 機器人，請設定為 false
		 */
		disabled: boolean;

		bot: {
			server: string;
			/**
			 * IRC 暱稱
			 */
			nick: string;

			userName: string;

			realName: string;
			/**
			 * 需要加入的頻道
			 */
			channels: string[];

			autoRejoin: boolean;

			secure: boolean;

			port: number;

			floodProtection: boolean;

			floodProtectionDelay: number;

			sasl: boolean;

			sasl_password: string;

			encoding: string;
		};

		options: {
			maxLines: number;

			/**
			 * 無視某些成員的訊息
			 */
			ignore: string[];
		};
	};

	Telegram?: {
		/**
		 * 如果需要 Telegram 機器人，請設定為 false
		 */
		disabled: boolean;

		bot: {
			/**
			 * BotFather 給你的 Token，類似「123456789:q234fipjfjaewkflASDFASjaslkdf」
			 */
			token: string;

			/**
			 * 報超時的秒數
			 */
			timeout: number;

			/**
			 * 如果使用中國國內網路，無法直連 Telegram 伺服器，可通過設定 proxy（僅支援 HTTPS 代理）來翻牆
			 * 或者自行在國外架設 Bot API（api.telegram.org）反向代理伺服器然後修改 apiRoot 的值
			 */
			proxy?: {
				/**
				 * HTTPS 代理伺服器位址
				 */
				host: string;

				/**
				 * HTTPS 代理伺服器埠
				 */
				port: number;
			};

			/**
			 * 使用 Webhook 模式，參見 https://core.telegram.org/bots/webhooks
			 */
			webhook: {
				/**
				 * Webhook 埠，為 0 時不啟用 Webhook
				 */
				port: number;

				/**
				 * Webhook 網域，啟用 Webhook 時必填
				 */
				domain?: string;

				/**
				 * Webhook 路徑
				 */
				path?: string;

				ssl?: {
					/**
					 * SSL 憑證，為空時使用 HTTP 協定
					 */
					certPath: string;

					/**
					 * SSL 金鑰
					 */
					keyPath: string;

					/**
					 * 如使用自簽章憑證，CA 憑證路徑
					 */
					caPath: string;
				};
			};

			/**
			 * 無特殊需要的話勿動
			 */
			apiRoot: string;
		};

		options: {
			/**
			 * 在其他群組中如何辨識使用者名稱：可取「username」（優先採用使用者名稱）、
			 * 「fullname」（優先採用全名）、「firstname」（優先採用 First Name）
			 */
			nickStyle: 'username' | 'fullname' | 'firstname';
		};
	};

	Discord?: {
		/**
		 * 如果需要 Discord 機器人，請設定為 false
		 */
		disabled: boolean;

		bot: {
			token: string;
		};

		options: {
			/**
			 * 可取「nickname」（使用者暱稱，僅在伺服器有效，否則仍用使用者名稱）、「username」（使用者名稱）、「id」（ID）
			 */
			nickStyle: 'username' | 'fullname' | 'firstname';

			/**
			 * 考慮到中國國內網路情況，若 https://cdn.discordapp.com 被封鎖請改成 true（對應 https://media.discordapp.net）
			 */
			useProxyURL: boolean;

			/**
			 * 轉發時附帶自訂哏圖片，如為否只轉發表情名稱
			 */
			relayEmoji: boolean;

			/**
			 * 無視 bot 的訊息
			 * 若只想無視特定 bot 請用下方的 ignore 代替
			 */
			ignoreBot: boolean;

			/**
			 * 無視某些成員的訊息
			 */
			ignore: string[];
		};
	};

	/**
	 * 系統紀錄檔
	 */
	logging: {
		/**
		 * 紀錄檔等級：從詳細到簡單分別是 debug、info、warning、error，推薦用 info
		 */
		level: 'debug' | 'info' | 'warning' | 'error';

		/**
		 * 紀錄檔檔名，如留空則只向螢幕輸出
		 */
		logfile: string;
	};

	modules: string[];

	redisCache?: {
		enable: boolean;

		upstream: string;

		prefix?: string;
	};

	transport?: {
		/**
		 * 1. 可以填任意個群組
		 * 2. 群組格式：
		 * # irc/#頻道 例如 irc/#test
		 * # telegram/-群組ID 例如 telegram/-12345678
		 * # discord/ID 例如 discord/123123123123
		 *  3. 如果需要，可以加入多個互聯體。例如將兩個 Telegram 分群連接到一起。
		 */
		groups: string[][];

		/**
		 * 如果希望把同一軟體的多個群組連接到一起，可為不同的群組設定不同的別名，
		 * 這樣互聯機器人在轉發訊息時會採用自訂群組名，以免混淆
		 */
		aliases?: Record<string, string | [string, string]>;

		/**
		 * 設定單向轉發/不轉發
		 */
		disables?: Record<string, string[]>;

		options: {
			IRC: {
				notify: {
					/**
					 * 有人進入頻道是否在其他群發出提醒
					 */
					join: boolean;

					/**
					 * 有人更名的話是否在其他群組發出提醒，可取
					 * 「all」（所有人都提醒）、「onlyactive」（只有說過話的人更名才提醒）、
					 * 「none」（不提醒）
					 */
					rename: 'all' | 'onlyactive' | 'none';

					/**
					 * 有人離開頻道的話是否在其他群組提醒，可取
					 * 「all」（所有人都提醒）、「onlyactive」（只有說過話的人更名才提醒）、
					 * 「none」（不提醒）
					 */
					leave: 'all' | 'onlyactive' | 'none';

					/**
					 * 如果 leave 為 onlyactive 的話：最後一次說話後多長時間內離開才會提醒
					 */
					timeBeforeLeave?: number;

					/**
					 * 頻道更換 Topic 時是否提醒
					 */
					topic: boolean;
				};

				/**
				 * 這裡可以設定機器人在 IRC 頻道中使用顏色。在啟用顏色功能之前，IRC 頻道的管理員需要解除頻道的 +c 模式，即
				 *   /msg ChanServ SET #頻道 MLOCK -c
				 *
				 *   轉發機器人的訊息有以下三種格式：
				 *   <T> [nick] message
				 *   <T> [nick] Re replyto 「repliedmessage」: message
				 *   <T> [nick] Fwd fwdfrom: message
				 *
				 *   （兩群互聯不會出現用於標識軟體的「<T>」）
				 *
				 *   可用顏色：white、black、navy、green、red、brown、purple、
				 *   olive、yellow、lightgreen、teal、cyan、blue、pink、gray、silver
				 */
				colorize: {
					/**
					 * 是否允許在 IRC 頻道中使用顏色
					 */
					enabled: boolean;

					/**
					 * < 整行通知的顏色 >
					 */
					broadcast: IRCColor;

					/**
					 * 用於標記使用者端「<T>」的顏色
					 */
					client: IRCColor;

					/**
					 * nick 的顏色。除標準顏色外，亦可設為 colorful
					 */
					nick: IRCColor | 'colorful';

					/**
					 * Re replyto 的顏色
					 */
					replyto: IRCColor;

					/**
					 * nick 的顏色。除標準顏色外，亦可設為 colorful
					 */
					repliedmessage: IRCColor;

					/**
					 * 被 Re 的訊息的顏色
					 */
					fwdfrom: IRCColor;

					/**
					 * 行分隔符的顏色
					 */
					linesplit: IRCColor;

					/**
					 * 如果 nick 為 colorful，則從這些顏色中挑選。為了使顏色分布均勻，建議使顏色數量為質數
					 */
					nickcolors: IRCColor[];
				};

				/**
				 * 是否允許 Telegram 使用 irccommand
				 */
				receiveCommands: boolean;

				/**
				 * 是否允許其他群組查詢 IRC 頻道資訊
				 */
				allowQuery: boolean;
			};

			Telegram: {
				notify: {
					join: boolean;
					leave: boolean;
					pin: boolean;
				};

				/**
				 * 是否轉傳頻道內容
				 */
				forwardChannels: boolean;

				/**
				 * 如果有人使用 Telegram 命令亦轉發到其他群組（但由於 Telegram 設定的原因，Bot 無法看到命令結果）
				 */
				forwardCommands: boolean;

				/**
				 * 下面是其他群裡面互連機器人的名稱。在轉發這些機器人的訊息時，程式會嘗試從訊息中提取出真正的暱稱，
				 * 而不是顯示機器人的名稱。參數「[]」、「<>」指真正發訊息者暱稱兩邊的括號樣式，目前只支援這兩種括號。
				 */
				forwardBots: Record<string, '[]' | '<>'>;
			};

			Discord: {
				/**
				 * 下面是其他群裡面互連機器人的「ID」。在轉發這些機器人的訊息時，程式會嘗試從訊息中提取出真正的暱稱，
				 * 而不是顯示機器人的名稱。格式為 「機器人名稱」「機器人discriminator編號」。
				 * 參數「[]」、「<>」指真正發訊息者暱稱兩邊的括號樣式，目前只支援這兩種括號。
				 */
				forwardBots: Record<string, [string | number, '[]' | '<>']>;
			};

			/**
			 * 留空或省略則禁用本功能
			 */
			paeeye: {
				/**
				 * 在訊息前面使用此值會阻止此條訊息向其他群組轉發。
				 */
				prepend?: string;

				/**
				 * 在訊息中間使用此值會阻止此條訊息向其他群組轉發。
				 */
				inline?: string;

				/**
				 * 訊息中與此正規表達式對應會阻止此條訊息向其他群組轉發。
				 */
				regexp?: RegExp;
			};

			/**
			 * 自訂訊息樣式（使用 https://www.npmjs.com/package/string-format 庫實現）
			 * 欄位一覽：
			 * 訊息資訊：from、to、nick、text、client_short、client_full、command、param
			 * 回覆類：reply_nick、reply_text、reply_user
			 * 轉發類：forward_nick、forward_user
			 * 注意：此處的 nick 並不一定是暱稱，具體內容受前面各聊天軟體機器人的 nickStyle 屬性控制。
			 * 例如 Telegram.options.nickStyle 為 fullname 的話，在轉發 Telegram 群訊息時，nick 也會變成全名。
			 */
			messageStyle: {
				/**
				 * 兩群互聯樣式
				 */
				simple: {
					message: string;
					reply: string;
					forward: string;
					action: string;
					notice: string;
				};

				/**
				 * 多群互聯樣式
				 * 備註：client_short 為空字串時會使用 simple 的樣式
				 */
				complex: {
					message: string;
					reply: string;
					forward: string;
					action: string;
					notice: string;
				};
			};
		};

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
		servemedia: TransportServemediaNone |
		TransportServemediaImgur | TransportServemediaVimCn | TransportServemediaSmMs |
		TransportServemediaSelf | TransportServemediaLinx | TransportServemediaUguu;

		/**
		 * 有權利刪除檔案的管理員
		 */
		manageAdmins?: string[];
	};

	ircquery?: {
		disables?: string[];

		/**
		 * 如果使用，命令會變成 /(prefix)topic、/(prefix)names 等
		 */
		prefix: 'irc';
	};

	irccommand?: {
		/**
		 * 是否在目前的使用者端顯示命令已傳送
		 */
		echo: boolean;

		disables?: string[];

		/**
		 * 如果使用，命令會變成 /(prefix)topic、/(prefix)names 等
		 */
		prefix: string;
	};

	wikilinky?: {
		groups: Record<string, string | false> & {
			/**
			 * 預設狀態
			 */
			default: string | false;
		};

		/**
		 * 不解析在此名單的uid所發出的訊息
		 */
		ignores?: string[];
	};

	afc?: {
		/**
		 * 在這些群啟用事件通報
		 */
		enableEvents?: ( string | AFCEventEnableType )[];

		/**
		 * 在這些群啟用命令
		 */
		enableCommands?: string[];

		/**
		 * 使用 https://www.npmjs.com/package/mwn
		 *
		 * 支援以下幾種登入方式：
		 *
		 * botpassword: 以 https://www.mediawiki.org/wiki/Manual:Bot_passwords 登入
		 * oauth: 以 https://www.mediawiki.org/wiki/Extension:OAuth 登入（需要該維基有開啟擴展）
		 *
		 * 或是你懶得登入也可以留空或填入 none
		 *
		 * 請注意 mwn 僅支援 Oauth 1.0 ，若是申請成 Oauth 2.0 將會無法使用！
		 */
		mwn: MwnLoginNone | MwnLoginBotPassword | MwnLoginOAuth;
	};

	/**
	 * 於此列出的所有檔案在變更時都會自動退出，需搭配module exit使用
	 * 建議使用絕對路徑
	 */
	exits?: {
		paths: ( {
			type?: '' | 'file' | 'folder',
			path: string;
		} )[];
		usePolling?: boolean
	};

	// 啟用heartbeat，參見heartbeatConfig.example.sh
	heartbeat?: boolean;
}

interface AFCEventEnableType {
	groups: string[];

	/**
	 * 只發送這些訊息
	 */
	include?: string[];

	/**
	 * 排除這些訊息
	 */
	exclude?: string[];

	debug?: boolean;
}

interface TransportServemediaBase {
	/**
	 * 檔案處理方式
	 */
	type?: '' | 'none' | 'self' | 'vim-cn' | 'imgur' | 'sm.ms' | 'linx' | 'uguu';

	/**
	 * type為self時有效
	 *
	 * 快取存放位置
	 */
	cachePath?: string;

	/**
	 * type為self時有效
	 *
	 * URL 的字首，通常需要以斜線結尾
	 */
	serveUrl?: string;

	/**
	 * type為linx時有效
	 *
	 * linx API 位址（例如 https://www.xxx.com/upload/），通常以斜線結尾
	 */
	linxApiUrl?: string;

	/**
	 * type為uguu時有效
	 *
	 * 請以 /api.php?d=upload-tool 結尾
	 */
	uguuApiUrl?: string;

	/**
	 * type為imgur時有效
	 */
	imgur?: {
		/**
		 * 以斜線結尾
		 */
		apiUrl: string;

		/**
		 * 從 imgur 申請到的 client_id
		 */
		clientId: string;
	};

	/**
	 * 檔案最大大小，單位 KiB。0 表示不限制。限制僅對 Telegram 有效
	 */
	sizeLimit: number;

	/**
	 * 上傳逾時時間，單位毫秒，type 為 vim-cn、imgur 等外部圖床時有效
	 */
	timeout: number;

	/**
	 * 存取外部圖床時的 User-Agent，如留空則使用預設的 AFC-ICG-BOT/版本號
	 */
	userAgent: string;
}

interface TransportServemediaNone extends TransportServemediaBase {
	/**
	 * 檔案處理方式
	 */
	type?: '' | 'none';
}

interface TransportServemediaVimCn extends TransportServemediaBase {
	/**
	 * 檔案處理方式
	 */
	type: 'vim-cn';
}

interface TransportServemediaSmMs extends TransportServemediaBase {
	/**
	 * 檔案處理方式
	 */
	type: 'sm.ms';
}

interface TransportServemediaSelf extends TransportServemediaBase {
	/**
	 * 檔案處理方式
	 */
	type: 'self';

	/**
	 * 快取存放位置
	 */
	cachePath: string;

	/**
	 * URL 的字首，通常需要以斜線結尾
	 */
	serveUrl: string;
}

interface TransportServemediaLinx extends TransportServemediaBase {
	/**
	 * 檔案處理方式
	 */
	type: 'linx';

	/**
	 * linx API 位址（例如 https://www.xxx.com/upload/），通常以斜線結尾
	 */
	linxApiUrl: string;
}

interface TransportServemediaUguu extends TransportServemediaBase {
	/**
	 * 檔案處理方式
	 */
	type: 'uguu';

	/**
	 * 請以 /api.php?d=upload-tool 結尾
	 */
	uguuApiUrl: string;
}

interface TransportServemediaImgur extends TransportServemediaBase {
	/**
	 * 檔案處理方式
	 */
	type: 'imgur';

	imgur: {
		/**
		 * 以斜線結尾
		 */
		apiUrl: string;

		/**
		 * 從 imgur 申請到的 client_id
		 */
		clientId: string;
	};
}

interface MwnLoginBase extends MwnOptions {
	type?: '' | 'none' | 'botpassword' | 'oauth';
}

interface MwnLoginNone extends MwnLoginBase {
	type?: '' | 'none';
}

interface MwnLoginBotPassword extends MwnLoginBase {
	type: 'botpassword',

	username: string;
	password: string;
}

interface MwnLoginOAuth extends MwnLoginBase {
	type: 'oauth';

	OAuthCredentials: {
		consumerToken: string;
		consumerSecret: string;
		accessToken: string;
		accessSecret: string;
	};
}
