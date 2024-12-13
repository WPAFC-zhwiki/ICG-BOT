declare module 'axios' {
	import { AxiosError } from 'axios';
	export function isAxiosError( error: unknown ): error is AxiosError;
}

export {};
