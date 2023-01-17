/*
 * 測試看看模組有沒有啟用
 * 請從 Manager.global 呼叫
 */
import config from '@app/config';

export function ifEnable( module: string, func: () => void ): void {
	if ( config.modules.includes( module ) ) {
		func();
	}
}

export function isEnable( module: string ): boolean {
	return config.modules.includes( module );
}
