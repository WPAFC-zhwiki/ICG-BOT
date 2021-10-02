import { execSync } from 'child_process';
import * as task from './task';

( async function (): Promise<void> {
	const qstat: string = execSync( `qstat -j ${ task.name }` ).toString( 'utf-8' );
	const output: string[] = [ qstat ];

	if ( qstat.match( 'job_number' ) ) {
		output.push( execSync( `qdel ${ task.name }` ).toString( 'utf-8' ) );
	}

	output.push( execSync( `bash ${ task.path }/script/toolforge/task.sh` ).toString( 'utf-8' ) );

	process.stdout.write( output.join( '\n\n' ) );
}() );
