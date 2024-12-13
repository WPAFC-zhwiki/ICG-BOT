import { plugin, type BunPlugin } from 'bun';
import path from 'node:path';

const typescriptExtension = new Set( [ '.ts', '.cts', '.mts' ] );

const IsTSMode: BunPlugin = {
	name: 'isTSMode',
	setup( build ) {
		build.module(
			'__isTSMode__',
			() => {
				return {
					exports: {
						default: build.config.entrypoints
							.some( ( file ) => typescriptExtension.has( path.extname( file ) ) ),
						__esModule: true,
					},
					loader: 'object',
				};
			}
		);
	},
};

plugin( IsTSMode );
