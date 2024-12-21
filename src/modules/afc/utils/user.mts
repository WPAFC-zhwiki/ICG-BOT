export { default as userGroup } from '@app/modules/afc/utils/userGroup.json' with { type: 'json' };

/**
 * Whether a string is a valid IPv4 address or not.
 *
 * Based on \Wikimedia\IPUtils::isIPv4 in PHP.
 *
 * from mw.util.isIPv4Address @ 1.44.0
 *
 * @example
 * // Valid
 * mw.util.isIPv4Address( '80.100.20.101' );
 * mw.util.isIPv4Address( '192.168.1.101' );
 *
 * // Invalid
 * mw.util.isIPv4Address( '192.0.2.0/24' );
 * mw.util.isIPv4Address( 'hello' );
 *
 * @see mw.util.isIPv4Address
 *
 * @param {string} address
 * @param {boolean} [allowBlock=false]
 * @return {boolean}
 */
function isIPv4Address( address: string, allowBlock: boolean = false ): boolean {
	if ( typeof address !== 'string' ) {
		return false;
	}

	const RE_IP_BYTE = '(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|0?[0-9]?[0-9])';
	const RE_IP_ADD = String.raw`(?:${ RE_IP_BYTE }\.){3}${ RE_IP_BYTE }`;
	const block = allowBlock ? String.raw`(?:\/(?:3[0-2]|[12]?\d))?` : '';

	// eslint-disable-next-line security/detect-non-literal-regexp
	return new RegExp( '^' + RE_IP_ADD + block + '$' ).test( address );
}

/**
 * Whether a string is a valid IPv6 address or not.
 *
 * Based on \Wikimedia\IPUtils::isIPv6 in PHP.
 *
 * from mw.util.isIPv6Address @ 1.44.0
 *
 * @example
 * // Valid
 * mw.util.isIPv6Address( '2001:db8:a:0:0:0:0:0' );
 * mw.util.isIPv6Address( '2001:db8:a::' );
 *
 * // Invalid
 * mw.util.isIPv6Address( '2001:db8:a::/32' );
 * mw.util.isIPv6Address( 'hello' );
 *
 * @see mw.util.isIPv6Address
 * @param {string} address
 * @param {boolean} [allowBlock=false]
 * @return {boolean}
 */
function isIPv6Address( address: string, allowBlock: boolean = false ): boolean {
	if ( typeof address !== 'string' ) {
		return false;
	}

	const block = allowBlock ? String.raw`(?:\/(?:12[0-8]|1[01][0-9]|[1-9]?\d))?` : '';
	let RE_IPV6_ADD =
			'(?:' + // starts with "::" (including "::")
				':(?::|(?::' +
					'[0-9A-Fa-f]{1,4}' +
				'){1,7})' +
				'|' + // ends with "::" (except "::")
				'[0-9A-Fa-f]{1,4}' +
				'(?::' +
					'[0-9A-Fa-f]{1,4}' +
				'){0,6}::' +
				'|' + // contains no "::"
				'[0-9A-Fa-f]{1,4}' +
				'(?::' +
					'[0-9A-Fa-f]{1,4}' +
				'){7}' +
			')';

	// eslint-disable-next-line security/detect-non-literal-regexp
	if ( new RegExp( '^' + RE_IPV6_ADD + block + '$' ).test( address ) ) {
		return true;
	}

	// contains one "::" in the middle (single '::' check below)
	RE_IPV6_ADD =
			'[0-9A-Fa-f]{1,4}' +
			'(?:::?' +
				'[0-9A-Fa-f]{1,4}' +
			'){1,6}';

	return (
		// eslint-disable-next-line security/detect-non-literal-regexp
		new RegExp( '^' + RE_IPV6_ADD + block + '$' ).test( address ) &&
			/::/.test( address ) &&
			!/::.*::/.test( address )
	);
}

/**
 * Check whether a string is a valid IP address.
 *
 * from mw.util.isIPAddress @ 1.44.0
 *
 * @see mw.util.isIPAddress
 * @since MediaWiki 1.25
 * @param {string} address String to check
 * @param {boolean} [allowBlock=false] If a block of IPs should be allowed
 * @return {boolean}
 */
export function isIPAddress( address: string, allowBlock: boolean = false ): boolean {
	return isIPv4Address( address, allowBlock ) ||
			isIPv6Address( address, allowBlock );
}

// wmf wiki default config value
export const wgAutoCreateTempUser = {
	genPattern: '~$1',
	matchPattern: '~2$1',
	reservedPattern: '~2$1',
};

/**
 * Checks if the given username matches $wgAutoCreateTempUser.
 *
 * This functionality has been adapted from MediaWiki\User\TempUser\Pattern::isMatch()
 *
 * from mw.util.isTemporaryUser @ 1.44.0
 *
 * @see mw.util.isTemporaryUser
 * @param {string|null} username
 * @return {boolean}
 */
export function isTemporaryUser( username: string | null ): boolean {
	if ( username === null ) {
		return false;
	}

	let matchPatterns: string[];
	if ( typeof wgAutoCreateTempUser.matchPattern === 'string' ) {
		matchPatterns = [ wgAutoCreateTempUser.matchPattern ];
	} else if ( matchPatterns === null ) {
		matchPatterns = [ wgAutoCreateTempUser.genPattern ];
	}
	for ( let autoCreateUserMatchPattern of matchPatterns ) {
		// Check each match pattern, and if any matches then return a match.
		let position = autoCreateUserMatchPattern.indexOf( '$1' );

		// '$1' was not found in autoCreateUserMatchPattern
		if ( position === -1 ) {
			return false;
		}
		let prefix = autoCreateUserMatchPattern.slice( 0, position );
		let suffix = autoCreateUserMatchPattern.slice( position + '$1'.length );

		let match = true;
		if ( prefix !== '' ) {
			match = ( username.indexOf( prefix ) === 0 );
		}
		if ( match && suffix !== '' ) {
			match = ( username.slice( -suffix.length ) === suffix ) &&
				( username.length >= prefix.length + suffix.length );
		}
		if ( match ) {
			return true;
		}
	}
	// No match patterns matched the username, so the given username is not a temporary user.
	return false;
}

/**
 * from mw.user.isNamed @ 1.44.0
 *
 * @see mw.user.isNamed
 * @param {string} username
 * @return {string}
 */
export function isNamedUser( username: string ) {
	return !isIPAddress( username, false ) && !isTemporaryUser( username );
}
