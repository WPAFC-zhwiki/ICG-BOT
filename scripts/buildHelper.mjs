/* eslint-disable unicorn/no-process-exit, n/no-process-exit */
// @ts-check
import fs from 'node:fs';
import path from 'node:path';

import { Glob } from 'glob';

const __dirname = import.meta.dirname;
const projectRoot = path.dirname( __dirname );

function hasTranspiledFile() {
	// eslint-disable-next-line security/detect-non-literal-fs-filename
	return fs.existsSync( path.join( projectRoot, 'src', 'index.mjs' ) ) &&
		// eslint-disable-next-line security/detect-non-literal-fs-filename
		fs.existsSync( path.join( projectRoot, 'config', 'config.mjs' ) );
}

async function execReloadFlags() {
	const reloadFlagPath = path.join( projectRoot, 'reloadFlag.txt' );
	try {
		// eslint-disable-next-line security/detect-non-literal-fs-filename
		await fs.promises.writeFile(
			reloadFlagPath,
			'Reload after build success.\n\nDate: ' + new Date().toISOString()
		);
		console.info( `Refresh "${ reloadFlagPath }" success.\n` );
	} catch ( error ) {
		throw new Error(
			`Fail to refresh "${ reloadFlagPath }".`,
			{
				cause: error,
			}
		);
	}
}

/**
 * @param {Glob<import('glob').GlobOptionsWithFileTypesTrue>} glob
 * @return {Promise<number>}
 */
async function removeFiles( glob ) {
	let count = 0;
	for await ( const file of glob ) {
		try {
			// eslint-disable-next-line security/detect-non-literal-fs-filename
			await fs.promises.unlink( file.fullpath() );
		} catch ( error ) {
			console.warn( error );
		}
		count++;
	}
	return count;
}

async function removeBuildInfoInternal() {
	const glob = new Glob(
		[ '**/*.tsbuildinfo' ],
		{
			withFileTypes: true,
			cwd: projectRoot,
			ignore: [ 'node_modules/**', '.*/**' ],
		}
	);
	return removeFiles( glob );
}

async function removeBuildInfo() {
	console.log( `${ await removeBuildInfoInternal() } file(s) have been deleted.` );
}

async function cleanBuildFile() {
	let count = 0;
	for ( const rootToTest of [ 'src', 'config' ] ) {
		const glob = new Glob(
			[ '**/*.{mjs,mjs.map}' ],
			{
				withFileTypes: true,
				cwd: path.join( projectRoot, rootToTest ),
			}
		);
		count += await removeFiles( glob );
	}
	count += await removeBuildInfoInternal();
	console.log( `${ count } file(s) have been deleted.` );
}

const args = process.argv.slice( 2 );

if ( args.length === 1 ) {
	switch ( args[ 0 ] ) {
		case '--hasTranspiledFile':
			process.exit( hasTranspiledFile() ? 0 : 1 );
			break;
		case '--execReloadFlags':
			await execReloadFlags();
			process.exit( 0 );
			break;
		case '--cleanBuildFile':
			await cleanBuildFile();
			process.exit( 0 );
			break;
		case '--removeBuildInfo':
			await removeBuildInfo();
			process.exit( 0 );
			break;
	}
}

console.log( 'Usage: node scripts/buildHelper.mjs [--hasTranspiledFile|--execReloadFlags|--cleanBuildFile]' );
process.exit( 1 );
