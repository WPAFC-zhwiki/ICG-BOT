const { exec } = require( 'child_process' );
let path = require( 'path' );
const fs = require( 'fs-extra' );

function getFullPath( ...paths ) {
	return path.join( __dirname, ...paths );
}

/**
 * @param {import('grunt')} grunt
 */
module.exports = function ( grunt ) {
	grunt.task.registerTask( 'built', function () {
		const done = this.async();

		let built = grunt.file.isDir( __dirname + '/bin' ) && grunt.file.isFile( __dirname + '/config/config.js' );

		if ( !built ) {
			grunt.task.run( [ 'default' ] );
		}

		done( true );
	} );

	grunt.task.registerTask( 'clean', function () {
		const done = this.async();

		try {
			fs.removeSync( getFullPath( 'build' ) );
			fs.removeSync( getFullPath( 'config/config.js' ) );
			fs.removeSync( getFullPath( 'bin' ) );
		} catch ( e ) {
			grunt.log.error( e );
			done( false );
			return;
		}

		done( true );
	} );

	grunt.task.registerTask( 'build', async function () {
		const done = this.async();

		async function systemSync( cmd ) {
			let sResult = '', sExitcode = 0;

			await new Promise( function ( reslove ) {
				exec( cmd, ( err, stdout, stderr ) => {
					if ( stdout && stdout.length ) {
						sResult += stdout;
						grunt.log.write( stdout );
					}

					if ( stderr && stderr.length ) {
						sResult += stderr;
						grunt.log.write( stderr );
					}

					if ( err ) {
						if ( err.killed ) {
							sResult += '\nThe task has been kill.';
						}
						sExitcode = err.code;
					}
				} ).on( 'exit', function ( code ) {
					sExitcode = code;
				} ).on( 'close', function () {
					reslove();
				} );
			} );

			return {
				result: sResult,
				exitcode: sExitcode
			};
		}

		const starttime = Date.now();

		const { result, exitcode } = await systemSync( 'tsc' );

		let hasTS7017Error = false,
			level1ErrorCount = 0,
			level5ErrorCount = 0,
			nonEmitPreventingWarningCount = 0,
			hasPreventEmitErrors = false;

		let isError = exitcode !== 0;

		result.split( '\n' ).forEach( function ( errorMsg ) {
			if ( errorMsg.search( /error TS7017:/g ) >= 0 ) {
				hasTS7017Error = true;
			}
			if ( errorMsg.search( /error TS1\d+:/g ) >= 0 ) {
				level1ErrorCount += 1;
				hasPreventEmitErrors = true;
			} else if ( errorMsg.search( /error TS5\d+:/ ) >= 0 ) {
				level5ErrorCount += 1;
				hasPreventEmitErrors = true;
			} else if ( errorMsg.search( /error TS\d+:/ ) >= 0 ) {
				nonEmitPreventingWarningCount += 1;
			}
		} );

		if ( hasTS7017Error ) {
			grunt.log.writeln( ( 'Note:  You may wish to enable the suppressImplicitAnyIndexErrors' +
				' grunt-ts option to allow dynamic property access by index.  This will' +
				' suppress TypeScript error TS7017.' ).magenta );
		}

		if ( level1ErrorCount + level5ErrorCount + nonEmitPreventingWarningCount > 0 ) {
			if ( ( level1ErrorCount + level5ErrorCount > 0 ) ) {
				grunt.log.write( ( '>> ' ).red );
			} else {
				grunt.log.write( ( '>> ' ).green );
			}
			if ( level5ErrorCount > 0 ) {
				grunt.log.write( level5ErrorCount.toString() + ' compiler flag error' +
					( level5ErrorCount === 1 ? '' : 's' ) + '  ' );
			}
			if ( level1ErrorCount > 0 ) {
				grunt.log.write( level1ErrorCount.toString() + ' syntax error' +
					( level1ErrorCount === 1 ? '' : 's' ) + '  ' );
			}
			if ( nonEmitPreventingWarningCount > 0 ) {
				grunt.log.write( nonEmitPreventingWarningCount.toString() +
					' non-emit-preventing type warning' +
					( nonEmitPreventingWarningCount === 1 ? '' : 's' ) + '  ' );
			}
		}

		const take = ( ( Date.now() - starttime ) / 1000 ).toFixed( 2 );

		if ( !isError && !( level1ErrorCount + level5ErrorCount + nonEmitPreventingWarningCount ) ) {
			grunt.log.writeln( '' );
			grunt.log.writeln( ( 'TypeScript compilation complete: ' + take + 's.' ).green );
		} else if ( hasPreventEmitErrors ) {
			grunt.log.writeln( '' );
			grunt.log.writeln( ( 'TypeScript compilation take ' + take + 's (exit because PreventEmitError).' ).red );
			done( false );
			return;
		} else if ( nonEmitPreventingWarningCount ) {
			grunt.log.writeln( '' );
			grunt.log.writeln( ( 'TypeScript compilation take ' + take + 's.' ).yellow );
			done( false );
			return;
		} else {
			grunt.log.error( ( 'Error: tsc return code: ' + exitcode ).yellow );
			done( false );
			return;
		}

		try {
			fs.copySync( getFullPath( 'build/config/config.js' ), getFullPath( 'config/config.js' ) );
			grunt.log.write( `Copy ${ getFullPath( 'build/config/config.js' ) } to ${ getFullPath( 'config/config.js' ) } done.\n` );
			fs.copySync( getFullPath( 'build/src' ), getFullPath( 'bin' ) );
			grunt.log.write( `Copy ${ getFullPath( __dirname, 'build/src' ) } to ${ getFullPath( 'bin' ) } done.\n` );
		} catch ( e ) {
			grunt.log.error( e );
			done( false );
			return;
		}

		done( true );
	} );

	grunt.task.registerTask( 'reloadFlag', async function () {
		if ( grunt.file.exists( getFullPath( 'reloadFlag.txt' ) ) ) {
			try {
				grunt.file.write( getFullPath( 'reloadFlag.txt' ), 'Reload after build success.\n\nDate: ' + new Date().toISOString() );
				grunt.log.write( `Refresh "${ getFullPath( 'reloadFlag.txt' ) }" success.\n` );
			} catch ( e ) {
				grunt.log.warn( `Fail to refresh "${ getFullPath( 'reloadFlag.txt' ) }": ${ e }\n` );
			}
		}

		this.async()( true );
	} );

	grunt.registerTask( 'default', [ 'clean', 'build', 'reloadFlag' ] );
	grunt.registerTask( 'build:noReloadFlag', [ 'clean', 'build' ] );
};
