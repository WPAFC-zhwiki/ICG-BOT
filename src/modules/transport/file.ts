/*
 * 集中處理檔案：將檔案上傳到圖床，取得 URL 並儲存至 context 中
 *
 * 已知的問題：
 * Telegram 音訊使用 ogg 格式，QQ 則使用 amr 和 silk，這個可以考慮互相轉換一下
 *
 */
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import request from 'request';
import sharp from 'sharp';

import winston = require( 'winston' );

import { Manager } from 'src/init';
import { ConfigTS, version, repository } from 'src/config';
import { file as fileTS } from 'src/lib/handlers/Context';
import * as bridge from 'src/modules/transport/bridge';
import { BridgeMsg } from 'src/modules/transport/BridgeMsg';

const servemedia: ConfigTS[ 'transport' ][ 'servemedia' ] = Manager.config.transport.servemedia;

type File = {
    type: string;
    url: string;
};

const USERAGENT = `AFC-ICG-BOT/${ version } (${ repository.replace( /^git\+/, '' ) })`;

/**
 * 根据已有文件名生成新文件名
 *
 * @param {string} url
 * @param {string} name 文件名
 * @return {string} 新文件名
 */
function generateFileName( url: string, name: string ): string {
	let extName: string = path.extname( name || '' );
	if ( extName === '' ) {
		extName = path.extname( url || '' );
	}
	if ( extName === '.webp' ) {
		extName = '.png';
	}
	return crypto.createHash( 'md5' ).update( name || ( Math.random() ).toString() ).digest( 'hex' ) + extName;
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
 * 下载/获取文件内容，对文件进行格式转换（如果需要的话），然后管道出去
 *
 * @param {fileTS} file
 *
 * @return {fs.ReadStream}
 */
function getFileStream( file: fileTS ): fs.ReadStream | request.Request | sharp.Sharp {
	const filePath: string = file.url || file.path;
	let fileStream: fs.ReadStream | request.Request | sharp.Sharp;

	if ( file.url ) {
		fileStream = request.get( file.url );
	} else if ( file.path ) {
		fileStream = fs.createReadStream( file.path );
	} else {
		throw new TypeError( 'unknown file type' );
	}

	// Telegram默认使用webp格式，转成png格式以便让其他聊天软件的用户查看
	if ( ( file.type === 'sticker' || file.type === 'photo' ) && path.extname( filePath ) === '.webp' ) {
		// if (file.type === 'sticker' && servemedia.stickerMaxWidth !== 0) {
		//     // 缩小表情包尺寸，因容易刷屏
		//     fileStream = fileStream.pipe(sharp().resize(servemedia.stickerMaxWidth || 256).png());
		// } else {
		fileStream = fileStream.pipe( sharp().png() );
		// }
	}

	// if (file.type === 'record') {
	//   // TODO: 語音使用silk格式，需要wx-voice解碼
	// }

	return fileStream;

}

function pipeFileStream( file: fileTS, pipe: fs.WriteStream | request.Request ): Promise<void> {
	return new Promise<void>( function ( resolve, reject ) {
		const fileStream = getFileStream( file );
		fileStream
			.on( 'error', function ( e: unknown ) {
				reject( e );
			} )
			.on( 'end', resolve )
			.pipe( pipe );
	} );
}

/*
 * 儲存至本機快取
 */
async function uploadToCache( file: fileTS ): Promise<string> {
	const targetName = generateFileName( file.url || file.path, file.id );
	const targetPath = path.join( servemedia.cachePath, targetName );
	const writeStream = fs.createWriteStream( targetPath ).on( 'error', ( e ) => {
		throw e;
	} );
	await pipeFileStream( file, writeStream );
	return servemedia.serveUrl + targetName;
}

/*
 * 上传到各种图床
 */
function uploadToHost( host: string, file: fileTS ): Promise<string> {
	return new Promise( function ( resolve, reject ) {
		const requestOptions: request.Options = {
			timeout: servemedia.timeout || 3000,
			headers: {
				'User-Agent': servemedia.userAgent || USERAGENT
			},
			url: ''
		};

		const name = generateFileName( file.url || file.path, file.id );
		const pendingFileStream = getFileStream( file );

		// p4: reject .exe (complaint from the site admin)
		if ( path.extname( name ) === '.exe' ) {
			reject( 'We wont upload .exe file' );
			return;
		}

		const buf: Buffer[] = [];
		pendingFileStream
			.on( 'data', function ( d: Buffer ) {
				buf.push( d );
			} )
			.on( 'end', function () {
				const pendingFile = Buffer.concat( buf );

				switch ( host ) {
					case 'vim-cn':
					case 'vimcn':
						requestOptions.url = 'https://pb.nichi.co/';
						requestOptions.formData = {
							name: {
								value: pendingFile,
								options: {
									filename: name
								}
							}
						};
						break;

					case 'sm.ms':
						requestOptions.url = 'https://sm.ms/api/upload';
						requestOptions.json = true;
						requestOptions.formData = {
							smfile: {
								value: pendingFile,
								options: {
									filename: name
								}
							}
						};
						break;

					case 'imgur':
						if ( servemedia.imgur.apiUrl.endsWith( '/' ) ) {
							requestOptions.url = servemedia.imgur.apiUrl + 'upload';
						} else {
							requestOptions.url = servemedia.imgur.apiUrl + '/upload';
						}
						requestOptions.headers.Authorization = `Client-ID ${ servemedia.imgur.clientId }`;
						requestOptions.json = true;
						requestOptions.formData = {
							type: 'file',
							image: {
								value: pendingFile,
								options: {
									filename: name
								}
							}
						};
						break;

					case 'uguu':
					case 'Uguu':
						requestOptions.url = servemedia.uguuApiUrl;
						requestOptions.formData = {
							file: {
								value: pendingFile,
								options: {
									filename: name
								}
							},
							randomname: 'true'
						};
						break;

					default:
						reject( new Error( 'Unknown host type' ) );
				}

				request.post( requestOptions, function ( error: string, response: request.Response, body ) {
					if ( !error && response.statusCode === 200 ) {
						switch ( host ) {
							case 'vim-cn':
							case 'vimcn':
								resolve( body.trim() );
								break;
							case 'uguu':
							case 'Uguu':
								resolve( body.trim() );
								break;
							case 'sm.ms':
								if ( body && body.code !== 'success' ) {
									reject( new Error( `sm.ms return: ${ body.msg }` ) );
								} else {
									resolve( body.data.url );
								}
								break;
							case 'imgur':
								if ( body && !body.success ) {
									reject( new Error( `Imgur return: ${ body.data.error }` ) );
								} else {
									resolve( body.data.link );
								}
								break;
						}
					} else {
						reject( new Error( error ) );
					}
				} );
			} );
	} );
}

/*
 * 上傳到自行架設的 linx 圖床上面
 */
function uploadToLinx( file: fileTS ): Promise<string> {
	return new Promise<string>( function ( resolve, reject ) {
		const name: string = generateFileName( file.url || file.path, file.id );

		pipeFileStream( file, request.put( {
			url: servemedia.linxApiUrl + name,
			headers: {
				'User-Agent': servemedia.userAgent || USERAGENT,
				'Linx-Randomize': 'yes',
				Accept: 'application/json'
			}
		}, function ( error: string, response: request.Response, body ) {
			if ( !error && response.statusCode === 200 ) {
				resolve( JSON.parse( body ).direct_url );
			} else {
				reject( new Error( error ) );
			}
		} ) ).catch( function ( err ) {
			reject( err );
		} );
	} );
}

/*
 * 決定檔案去向
 */
async function uploadFile( file: fileTS ): Promise<File | null> {
	let url: string;
	const fileType: string = convertFileType( file.type );

	switch ( servemedia.type ) {
		case 'vim-cn':
		case 'uguu':
			url = await uploadToHost( servemedia.type, file );
			break;

		case 'sm.ms':
		case 'imgur':
			// 公共图床只接受图片，不要上传其他类型文件
			if ( fileType === 'photo' ) {
				url = await uploadToHost( servemedia.type, file );
			}
			break;

		case 'self':
			url = await uploadToCache( file );
			break;

		case 'linx':
			url = await uploadToLinx( file );
			break;

		default:

	}

	if ( url ) {
		return {
			type: fileType,
			url: url
		};
	} else {
		return null;
	}
}

/*
 * 判斷訊息來源，將訊息中的每個檔案交給對應函式處理
 */
const fileUploader = {
	handlers: Manager.handlers,
	process: async function ( context: BridgeMsg ): Promise<File[]> {
		// 上传文件
		// p4: dont bother with files from somewhere without bridges in config
		if ( context.extra.clients > 1 && context.extra.files && servemedia.type && servemedia.type !== 'none' ) {
			const promises: Promise<{ type: string; url: string; } | null>[] = [];
			const fileCount: number = context.extra.files.length;

			// 将聊天消息附带文件上传到服务器
			for ( const [ index, file ] of context.extra.files.entries() ) {
				if ( servemedia.sizeLimit && servemedia.sizeLimit > 0 &&
					file.size && file.size > servemedia.sizeLimit * 1024 ) {
					winston.debug( `[file] <FileUploader> #${ context.msgId } File ${ index + 1 }/${ fileCount }: Size limit exceeded. Ignore.` );
				} else {
					promises.push( uploadFile( file ).catch( function ( err ) {
						winston.error( `[file] Error on processing files:  ${ err }` );
						return null;
					} ) );
				}
			}

			// 整理上传到服务器之后到URL
			const uploads: File[] = ( await Promise.all( promises ) ).filter( function ( x: File ): File {
				return x;
			} );
			for ( const [ index, upload ] of uploads.entries() ) {
				winston.debug( `[file] <FileUploader> #${ context.msgId } File ${ index + 1 }/${ uploads.length } (${ upload.type }): ${ upload.url }` );
			}

			return uploads;
		} else {
			return [];
		}
	}
};
Manager.global.ifEnable( 'transport', function () {
	bridge.addHook( 'bridge.send', async ( msg: BridgeMsg ) => {
		msg.extra.uploads = await fileUploader.process( msg );
	} );
} );
