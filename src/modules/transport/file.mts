/*
 * 集中處理檔案：將檔案上傳到圖床，取得 URL 並儲存至 context 中
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import sharp from 'sharp';
import winston from 'winston';

import { ConfigTS } from '@app/config.mjs';
import { Manager } from '@app/init.mjs';

import {
	fetch,
	Response,
	FormData,
	defaultFetchUserAgent,
	safeCancelBody
} from '@app/lib/fetch.mjs';
import { File, UploadedFile } from '@app/lib/handlers/Context.mjs';
import { getFileNameFromUrl, inspect } from '@app/lib/util.mjs';

import * as bridge from '@app/modules/transport/bridge.mjs';
import { BridgeMessage } from '@app/modules/transport/BridgeMessage.mjs';
import * as command from '@app/modules/transport/command.mjs';

const servemedia: ConfigTS['transport']['servemedia'] = Manager.config.transport.servemedia;

/**
 * 根据已有文件名生成新文件名
 *
 * @param {string} url
 * @param {string} name 文件名
 * @return {string} 新文件名
 */
function generateFileName( url: string, name: string ): string {
	let extensionName: string = path.extname( name || '' );
	if ( extensionName === '' ) {
		extensionName = path.extname( getFileNameFromUrl( url ) || '' );
	}
	if ( extensionName === '.webp' ) {
		extensionName = '.png';
	}

	// p4: reject .exe (complaint from the site admin)
	if ( path.extname( name ) === '.exe' ) {
		throw new Error( 'We wont upload .exe file' );
	}
	return (
		crypto
			.createHash( 'md5' )
			.update( name || Math.random().toString() )
			.digest( 'hex' ) + extensionName
	);
}

/**
 * 将各聊天软件的媒体类型转成标准类型
 *
 * @param {string} type 各Handler提供的文件类型
 * @return {string} 统一文件类型
 */
function convertFileType( type: string ): string {
	switch ( type ) {
		case 'sticker':
			return 'photo';

		case 'voice':
			return 'audio';

		case 'video':
		case 'document':
			return 'file';

		default:
			return type;

	}
}

/**
 * 下载/获取文件内容，对文件进行格式转换（如果需要的话）
 *
 * @param {File} file
 *
 * @return {fs.ReadStream}
 */
async function getFileStream( file: File ): Promise<Buffer> {
	const filePath: string = file.url || file.path;
	let fileBuffer: Buffer;

	if ( file.url ) {
		let response: Response;
		try {
			response = await fetch( file.url, {
				headers: {
					'User-Agent': servemedia.userAgent || defaultFetchUserAgent,
				},
			} );
		} finally {
			safeCancelBody( response );
		}
		fileBuffer = Buffer.from( await response.arrayBuffer() );
	} else if ( file.path ) {
		// eslint-disable-next-line security/detect-non-literal-fs-filename
		fileBuffer = await fs.promises.readFile( file.path );
	} else {
		throw new TypeError( 'unknown file type' );
	}

	// Telegram默认使用webp格式，转成png格式以便让其他聊天软件的用户查看
	if (
		( file.type === 'sticker' || file.type === 'photo' ) && path.extname( filePath ) === '.webp'
	) {
		// if (file.type === 'sticker' && servemedia.stickerMaxWidth !== 0) {
		//     // 缩小表情包尺寸，因容易刷屏
		//     fileBuffer = await sharp( fileBuffer ).resize( servemedia.stickerMaxWidth || 256 ).png().toBuffer();
		// } else {
		fileBuffer = await sharp( fileBuffer ).png().toBuffer();
		// }
	}

	return fileBuffer;
}

/*
 * 儲存至本機快取
 */
async function uploadToCache( file: File ): Promise<string> {
	const targetName = generateFileName( file.url || file.path, file.id );
	const targetPath = path.join( servemedia.cachePath, targetName );
	// eslint-disable-next-line security/detect-non-literal-fs-filename
	await fs.promises.writeFile( targetPath, await getFileStream( file ) );
	return servemedia.serveUrl + targetName;
}

/*
 * 上传到各种图床
 */
async function uploadToHost(
	host: ConfigTS['transport']['servemedia']['type'],
	file: File
) {
	let url: string;
	const form = new FormData();
	const headers = new Headers();
	headers.set( 'User-Agent', servemedia.userAgent ?? defaultFetchUserAgent );

	const name = generateFileName( file.url ?? file.path, file.id );

	const fileBlob = new Blob( [ await getFileStream( file ) ] );

	switch ( host ) {
		case 'imgur':
			url = servemedia.imgur.apiUrl.endsWith( '/' ) ?
				`${ servemedia.imgur.apiUrl }upload` :
				`${ servemedia.imgur.apiUrl }/upload`;
			headers.append(
				'Authorization',
				`Client-ID ${ servemedia.imgur.clientId }`
			);
			form.set( 'type', 'file' );
			form.set( 'image', fileBlob, name );
			break;

		default:
			throw new Error( 'Unknown host type' );

	}

	let response: Response;
	try {
		response = await fetch( url, {
			method: 'POST',
			signal: AbortSignal.timeout( servemedia.timeout ?? 30_000 ),
			headers,
			body: form,
		} );
		const responseText = await response.text();

		if ( response.status === 200 ) {
			switch ( host ) {
				case 'imgur': {
					const json: {
						success: boolean;
						data: {
							error?: string;
							link?: string;
						};
					} = JSON.parse( responseText );

					if ( json && !json.success ) {
						throw new Error(
							`Imgur return: ${
								json.data.error ?? JSON.stringify( json )
							}`
						);
					} else {
						return json.data.link!;
					}
				}
			}
		} else {
			throw new Error( responseText );
		}
	} finally {
		safeCancelBody( response );
	}
}

/*
 * 決定檔案去向
 */
async function uploadFile( file: File ): Promise<UploadedFile | undefined> {
	let url: string;
	const fileType: string = convertFileType( file.type );

	switch ( servemedia.type ) {
		case 'sm.ms':
		case 'imgur':
			// 图床只接受图片，不要上传其他类型文件
			if ( fileType === 'photo' ) {
				url = await uploadToHost( servemedia.type, file );
			}
			break;

		case 'self':
			url = await uploadToCache( file );
			break;

		default:
	}

	return url ?
		{
			type: fileType,
			displayFilename: file.origFilename || path.basename( url ),
			url: url,
		} :
		undefined;
}

/*
 * 判斷訊息來源，將訊息中的每個檔案交給對應函式處理
 */
const fileUploader = {
	handlers: Manager.handlers,
	process: async function ( context: BridgeMessage ): Promise<UploadedFile[]> {
		// 上传文件
		// p4: don't bother with files from somewhere without bridges in config
		if (
			context.extra.clients > 1 &&
			context.extra.files &&
			// 過濾掉只有 Telegram 的傳輸，用 file_id
			context.extra.mapTo.filter(
				( target ) => BridgeMessage.parseUID( target ).client === 'telegram'
			).length !== context.extra.clients &&
			servemedia.type &&
			servemedia.type !== 'none'
		) {
			const promises: Promise<UploadedFile | void>[] = [];
			const fileCount: number = context.extra.files.length;

			// 将聊天消息附带文件上传到服务器
			for ( const [ index, file ] of context.extra.files.entries() ) {
				if (
					servemedia.sizeLimit &&
					servemedia.sizeLimit > 0 &&
					file.size > 0 &&
					file.size > servemedia.sizeLimit * 1024
				) {
					winston.debug(
						`[file] <FileUploader> #${ context.msgId } File ${
							index + 1
						}/${ fileCount }: Size limit exceeded. Ignore.`
					);
				} else {
					promises.push(
						uploadFile( file ).catch( function ( error ) {
							winston.error(
								'[file] Error on processing files:' + inspect( error )
							);
						} )
					);
				}
			}

			// 整理上传到服务器之后到URL
			// eslint-disable-next-line unicorn/no-await-expression-member
			const uploads: UploadedFile[] = ( await Promise.all( promises ) ).filter(
				( v ): v is UploadedFile => !!v
			);
			for ( const [ index, upload ] of uploads.entries() ) {
				winston.debug(
					`[file] <FileUploader> #${ context.msgId } File ${ index + 1 }/${
						uploads.length
					} (${ upload.type }): ${ upload.url }`
				);
			}

			return uploads;
		} else {
			const telegramApiRoot = Manager.config.Telegram.bot.apiRoot || 'https://api.telegram.org';
			winston.debug(
				`[file] Upload Skip: context=${ JSON.stringify( {
					clients: context.extra.clients,
					files: context.extra.files?.concat( [] ).map( ( v ) => {
						if ( v.url.startsWith( telegramApiRoot ) ) {
							return {
								...v,
								url: `${ telegramApiRoot }/files/<redacted>/${ v.url.split( '/' ).pop() }`,
							};
						}
						return v;
					} ),
					mapTo: context.extra.mapTo,
				} ) }`
			);
			return [];
		}
	},
};

Manager.global.ifEnable( 'transport', function () {
	bridge.addHook( 'bridge.send', async ( message: BridgeMessage ) => {
		message.extra.uploads = await fileUploader.process( message );
	} );

	if (
		Manager.config.transport.manageAdmins &&
    Manager.config.transport.servemedia.type === 'self'
	) {
		const admin = new Set(
			Manager.config.transport.manageAdmins
				.map( ( uid ) => BridgeMessage.parseUID( uid ) )
				.map( ( v ) => v.uid )
				.filter( Boolean )
		);

		command.addCommand( 'delfile', async ( message ) => {
			winston.debug( '[file/del] %s: %s', message.from_uid, message.text );
			if ( !admin.has( message.from_uid ) ) {
				return;
			}
			let processedUrl: string;
			try {
				const url = new URL(
					message.param.trim().replace( /^https?:\/\//, '//' ),
					Manager.config.transport.servemedia.serveUrl
				);
				url.search = '';
				url.hash = '';
				processedUrl = url.href;
			} catch {
				message.reply(
					`${
						message.param.trim() ? '檔案網址無效。' : ''
					}\n使用方法：\n/delfile <url>`
				);
				return;
			}
			if (
				!processedUrl.startsWith( Manager.config.transport.servemedia.serveUrl )
			) {
				message.reply( '這網址我也無法處理呀...' );
				return;
			}
			const fileName = processedUrl.slice(
				Manager.config.transport.servemedia.serveUrl.length
			);
			if ( /^\.|\.$/.test( fileName ) || !/^[\da-z.]+$/.test( fileName ) ) {
				message.reply( '這網址看起來就不會存在...' );
				return;
			}
			winston.debug(
				'[file/del] %s try to delete %s.',
				message.from_uid,
				fileName
			);
			const realPath = path.join(
				Manager.config.transport.servemedia.cachePath,
				fileName
			);
			try {
				await fs.promises.access(
					realPath,
					// eslint-disable-next-line no-bitwise
					fs.constants.R_OK | fs.constants.W_OK
				);
			} catch ( error ) {
				winston.warn(
					'[file/del] %s delete %s fail: ',
					message.from_uid,
					realPath,
					inspect( error )
				);
				message.reply( `刪除 ${ fileName } 失敗：檔案不存在或不可能被機器人刪除` );
				return;
			}
			try {
				await fs.promises.rm( realPath );
			} catch ( error ) {
				message.reply( `刪除 ${ fileName }失敗：${ error }` );
				winston.error(
					'[file/del] %s delete %s fail: %s',
					message.from_uid,
					realPath,
					inspect( error )
				);
				return;
			}
			winston.info(
				'[file/del] %s delete %s success.',
				message.from_uid,
				realPath
			);
			message.reply( `已刪除 ${ fileName }` );
		} );
	}
} );
