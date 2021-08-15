export default async function delay( ms: number ): Promise<void> {
	await new Promise<void>( function ( resolve ) {
		setTimeout( resolve, ms );
	} );
}
