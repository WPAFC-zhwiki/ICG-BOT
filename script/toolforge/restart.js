const { execSync } = require( 'child_process' );
const task = require( './task' );

( async function () {
	const qstat = execSync( `qstat -j ${ task.name }` ).toString( 'utf-8' );
	const output = [ qstat ];

	if ( qstat.match( 'job_number' ) ) {
		output.push( execSync( `qdel ${ task.name }` ).toString( 'utf-8' ) );
	}

	output.push( execSync( `bash ${ task.path }/script/toolforge/task.sh` ).toString( 'utf-8' ) );

	process.stdout.write( output.join( '\n\n' ) );
}() );
