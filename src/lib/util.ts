import winston from 'winston';
import { ConfigTS } from 'config';
import lodash from 'lodash';

// 检查已弃用设置
export function checkDeprecatedConfig( object: ConfigTS, source: string, otherWarning = '' ): void {
	let current = object;
	const keys = source.split( '.' );
	for ( const key of keys ) {
		if ( current === null || current === undefined || current[ key ] === null || current[ key ] === undefined ) {
			return;
		} else {
			current = current[ key ];
		}
	}
	winston.warn( `* DEPRECATED: Config ${ source } is deprecated. ${ otherWarning }` );
}

export function getFriendlySize( size: number ): string {
	if ( size <= 1126 ) {
		return `${ size.toLocaleString() } B`;
	} else if ( size <= 1153433 ) {
		return `${ ( size / 1024 ).toLocaleString() } KB`;
	} else if ( size <= 1181116006 ) {
		return `${ ( size / 1048576 ).toLocaleString() } MB`;
	} else {
		return `${ ( size / 1073741824 ).toLocaleString() } GB`;
	}
}

export function getFriendlyLocation( latitude: number, longitude: number ): string {
	let y: string | number = latitude;
	let x: string | number = longitude;

	y = y < 0 ? `${ -y }°S` : `${ y }°N`;
	x = x < 0 ? `${ -x }°W` : `${ x }°E`;

	return `${ y }, ${ x }`;
}

export const copyObject = lodash.cloneDeep;
