ICG-BOT
====
中文維基百科創建條目專題互聯機器人 Chinese Wikipedia WikiProject Articles for Creation bot for Interconnected Group

此儲存庫改自[WPAFC-zhwiki/ICG-Bot-old](https://github.com/WPAFC-zhwiki/ICG-Bot-old)及[lziad/LilyWhiteBot](#lilywhitebot)。

## 使用方法
1. 運行 `npm install`
2. 根據 `config/config.example.ts` 上的註釋變更設置並將檔名改成 `config.ts`
3. 運行 `npm start` 啟動 bot

此方法需要使用[ts-node](https://www.npmjs.com/package/ts-node)解析 typescript ，如果無法使用的話可以使用 `npm run build` 先編譯成 javascript 再以 `npm run start-built` 運行。

## 作者
以下按貢獻順序列出機械人的作者。
- [LuciferianThomas](https://zh.wikipedia.org/wiki/User:LuciferianThomas)
- [sunny00217wm](https://zh.wikipedia.org/wiki/User:Sunny00217)

## License
MIT: https://wpafc-zhwiki.mit-license.org/2021/

## LilyWhiteBot
此儲存庫改自[lziad/LilyWhiteBot 之 reborn 分支](https://github.com/lziad/LilyWhiteBot/tree/2138e1391bcbaa455b4fb004c42e24167971fde3)，原始授權條款為[AGPLv3](AGPL-3.0.txt)，作者為vjudge404, mrhso, infnan, joch2520等多名貢獻者。

如果你想在LilyWhiteBot使用AFC類似功能的話可以修改[sunny00217wm/AFC-zhwiki-ICG-Bot-plugin-afc](https://github.com/sunny00217wm/AFC-zhwiki-ICG-Bot-plugin-afc)，該版本大致與舊版相容。