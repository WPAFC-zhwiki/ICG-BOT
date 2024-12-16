// @ts-check
import { register } from 'node:module';

register( './loader.mjs', import.meta.url, {
	parentURL: import.meta.url,
	data: {
		enableTypescript: true,
	},
} );
