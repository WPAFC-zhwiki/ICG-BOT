/*
 * 集中處理檔案：將檔案上傳到圖床，取得 URL 並儲存至 context 中
 *
 * 已知的問題：
 * Telegram 音訊使用 ogg 格式，QQ 則使用 amr 和 silk，這個可以考慮互相轉換一下
 *
 */

// eslint-disable-next-line @typescript-eslint/no-var-requires
( require( 'axios' ) as {default: object;} ).default = require( 'axios' ) as object;

import crypto = require( 'node:crypto' );
import fs = require( 'node:fs' );
import path = require( 'node:path' );
import stream = require( 'node:stream' );

import axios, { AxiosRequestConfig, AxiosResponse } from 'axios';
import FormData = require( 'form-data' );
import sharp = require( 'sharp' );
import winston = require( 'winston' );

import { ConfigTS, version, repository } from '@app/config';
import { Manager } from '@app/init';

import { file as fileTS } from '@app/lib/handlers/Context';
import { inspect } from '@app/lib/util';

import * as bridge from '@app/modules/transport/bridge';
import { BridgeMsg } from '@app/modules/transport/BridgeMsg';
import * as command from '@app/modules/transport/command';

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
class FetchStream extends stream.Transform {
	public constructor( private url: string, private config?: AxiosRequestConfig | undefined ) {
		super();
		this.doFetch();
	}

	private async doFetch() {
		try {
			const res = await axios.get<stream.Readable>( this.url, Object.assign( {}, this.config, {
				responseType: 'stream'
			} ) );
			res.data.pipe( this );
		} catch ( error ) {
			this.emit( 'error', error );
		}
	}

	public override _transform( chunk: unknown, encoding: BufferEncoding, callback: stream.TransformCallback ) {
		this.push( chunk, encoding );
		callback();
	}
}

/**
 * 下载/获取文件内容，对文件进行格式转换（如果需要的话），然后管道出去
 *
 * @param {fileTS} file
 *
 * @return {fs.ReadStream}
 */
function getFileStream( file: fileTS ): stream.Readable {
	const filePath: string = file.url || file.path;
	let fileStream: stream.Readable;

	if ( file.url ) {
		fileStream = new FetchStream( file.url );
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

function pipeFileStream( file: fileTS, pipe: stream.Writable ): Promise<void> {
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

function createTimeoutAbortSignal( timeOut: number ) {
	const controller = new AbortController();
	setTimeout( function () {
		controller.abort( 'Timeout.' );
	}, timeOut );
	return controller.signal;
}

function createFormData( data: [ name: string, value: string | Blob, fileName?: string ][] ) {
	const formData = new FormData();
	for ( const [ name, value, fileName ] of data ) {
		formData.append( name, value, fileName );
	}
	return formData;
}

/*
 * 上传到各种图床
 */
function uploadToHost( host: ConfigTS[ 'transport' ][ 'servemedia' ][ 'type' ], file: fileTS ) {
	return new Promise<string>( function ( resolve, reject ) {
		const requestOptions: Partial<AxiosRequestConfig<FormData>> = {
			method: 'POST',
			signal: createTimeoutAbortSignal( servemedia.timeout ?? 30000 ),
			headers: {
				'Content-Type': 'multipart/form-data'
			},
			responseType: 'text'
		};

		const name = generateFileName( file.url ?? file.path, file.id );

		// p4: reject .exe (complaint from the site admin)
		if ( path.extname( name ) === '.exe' ) {
			reject( 'We wont upload .exe file' );
			return;
		}

		const pendingFileStream = getFileStream( file );

		const buf: unknown[] = [];
		pendingFileStream
			.on( 'data', function ( d: unknown ) {
				return buf.push( d );
			} )
			.on( 'end', function () {
				const pendingFile = new Blob( [ Buffer.concat( buf as Uint8Array[] ) ] );

				switch ( host ) {
					case 'vim-cn':
						requestOptions.url = 'https://img.vim-cn.com/';
						requestOptions.data = createFormData( [
							[ 'name', pendingFile, name ]
						] );
						break;

					case 'imgur':
						if ( servemedia.imgur.apiUrl.endsWith( '/' ) ) {
							requestOptions.url = servemedia.imgur.apiUrl + 'upload';
						} else {
							requestOptions.url = servemedia.imgur.apiUrl + '/upload';
						}
						requestOptions.headers = Object.assign( requestOptions.headers ?? {}, {
							Authorization: `Client-ID ${ servemedia.imgur.clientId }`
						} );
						requestOptions.data = createFormData( [
							[ 'type', 'file' ],
							[ 'image', pendingFile, name ]
						] );
						break;

					case 'uguu':
						requestOptions.url = servemedia.uguuApiUrl; // 原配置文件以大写字母开头
						requestOptions.data = createFormData( [
							[ 'file', pendingFile, name ],
							[ 'randomname', 'true' ]
						] );
						break;

					default:
						reject( new Error( 'Unknown host type' ) );
						return;
				}

				axios.postForm<string, AxiosResponse<string>, AxiosRequestConfig<FormData>>(
					requestOptions.url,
					requestOptions
				)
					.then( function ( response ) {
						if ( response.status === 200 ) {
							switch ( host ) {
								case 'vim-cn':
									resolve( String( response.data ).trim().replace( 'http://', 'https://' ) );
									break;
								case 'uguu':
									resolve( String( response.data ).trim() );
									break;
								case 'imgur':
									// eslint-disable-next-line no-case-declarations
									const json: {
										success: boolean;
										data: {
											error?: string;
											link?: string;
										};
									} = JSON.parse( response.data );

									if ( json && !json.success ) {

										reject( new Error( `Imgur return: ${ json.data.error ?? JSON.stringify( json ) }` ) );
									} else {
										// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
										resolve( json.data.link! );
									}
									break;
							}
						} else {
							reject( new Error( String( response.data ) ) );
						}
					} ).catch( reject );
			} );
	} );
}

/*
 * 上傳到自行架設的 linx 圖床上面
 */
function uploadToLinx( file: fileTS ) {
	return new Promise<string>( function ( resolve, reject ) {
		const name = generateFileName( file.url ?? file.path, file.id );

		const fileStream = getFileStream( file );
		axios.put( String( servemedia.linxApiUrl ) + name, fileStream, {
			headers: {
				'User-Agent': servemedia.userAgent ?? USERAGENT,
				'Linx-Randomize': 'yes',
				Accept: 'application/json'
			},
			responseType: 'text'
		} ).then( function ( response ) {
			if ( response.status === 200 ) {

				resolve( JSON.parse( response.data as string ).direct_url as string );
			} else {
				reject( new Error( String( response.data ) ) );
			}
		} ).catch( function ( err ) {
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
					promises.push( uploadFile( file ).catch( function ( error ) {
						winston.error( '[file] Error on processing files:' + inspect( error ) );
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

	if ( Manager.config.transport.manageAdmins && Manager.config.transport.servemedia.type === 'self' ) {
		const admin = Manager.config.transport.manageAdmins
			.map( BridgeMsg.parseUID )
			.map( ( v ) => v.uid )
			.filter( ( v ) => v );

		command.addCommand( 'delfile', async ( msg ) => {
			winston.debug( '[file/del] %s: %s', msg.from_uid, msg.text );
			if ( !admin.includes( msg.from_uid ) ) {
				return;
			}
			let processedUrl: string;
			try {
				const url = new URL(
					msg.param.trim().replace( /^https?:\/\//, '//' ),
					Manager.config.transport.servemedia.serveUrl
				);
				url.search = '';
				url.hash = '';
				processedUrl = url.href;
			} catch ( error ) {
				msg.reply( `${ msg.param.trim() ? '檔案網址無效。' : '' }\n使用方法：\n/delfile <url>` );
				return;
			}
			if ( !processedUrl.startsWith( Manager.config.transport.servemedia.serveUrl ) ) {
				msg.reply( '這網址我也無法處理呀...' );
				return;
			}
			const fileName = processedUrl.slice( Manager.config.transport.servemedia.serveUrl.length );
			if ( fileName.match( /^\.|\.$/ ) || !fileName.match( /^[\da-z.]+$/ ) ) {
				msg.reply( '這網址看起來就不會存在...' );
				return;
			}
			winston.debug( '[file/del] %s try to delete %s.', msg.from_uid, fileName );
			const realPath = path.join( Manager.config.transport.servemedia.cachePath, fileName );
			try {
				// eslint-disable-next-line no-bitwise
				await fs.promises.access( realPath, fs.constants.R_OK | fs.constants.W_OK );
			} catch ( error ) {
				winston.warn( '[file/del] %s delete %s fail: ', msg.from_uid, realPath, inspect( error ) );
				msg.reply( `刪除 ${ fileName } 失敗：檔案不存在或不可能被機器人刪除` );
				return;
			}
			try {
				await fs.promises.rm( realPath );
			} catch ( error ) {
				msg.reply( `刪除 ${ fileName }失敗：${ error }` );
				winston.error( '[file/del] %s delete %s fail: %s', msg.from_uid, realPath, inspect( error ) );
				return;
			}
			winston.info( '[file/del] %s delete %s success.', msg.from_uid, realPath );
			msg.reply( `已刪除 ${ fileName }` );
		} );
	}
} );
