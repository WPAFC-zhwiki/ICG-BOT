/* from https://git.io/JcFyi | License: MIT https://git.io/JcFyK */
const colors = {
	white: '00',
	black: '01',
	navy: '02',
	green: '03',
	red: '04',
	brown: '05',
	maroon: '05',
	purple: '06',
	violet: '06',
	olive: '07',
	yellow: '08',
	lightgreen: '09',
	lime: '09',
	teal: '10',
	bluecyan: '10',
	cyan: '11',
	aqua: '11',
	blue: '12',
	royal: '12',
	pink: '13',
	lightpurple: '13',
	fuchsia: '13',
	gray: '14',
	grey: '14',
	lightgray: '15',
	lightgrey: '15',
	silver: '15'
};

const styles = {
	normal: '\x0F',
	underline: '\x1F',
	bold: '\x02',
	italic: '\x1D',
	inverse: '\x16',
	strikethrough: '\x1E',
	monospace: '\x11'
};

const styleChars = {};
Object.keys( styles ).forEach( ( key ) => {
	styleChars[ styles[ key ] ] = true;
} );

// Coloring character.
const c = '\x03';
const zero = styles.bold + styles.bold;
const badStr = /^,\d/;

type OneOrMore<T> = T | T[];

export function stripColors( str: string ): string {
	// eslint-disable-next-line no-control-regex
	return str.replace( /\x03\d{0,2}(,\d{0,2}|\x02\x02)?/g, '' );
}

export function stripStyle( str: string ): string {
	const path = [];
	for ( let i = 0, len = str.length; i < len; i++ ) {
		const char = str[ i ];
		if ( styleChars[ char ] || char === c ) {
			const lastChar = path[ path.length - 1 ];
			if ( lastChar && lastChar[ 0 ] === char ) {
				const p0 = lastChar[ 1 ];
				// Don't strip out styles with no characters inbetween.
				// And don't strip out color codes.
				if ( i - p0 > 1 && char !== c ) {
					str = str.slice( 0, p0 ) + str.slice( p0 + 1, i ) + str.slice( i + 1 );
					i -= 2;
				}
				path.pop();
			} else {
				path.push( [ str[ i ], i ] );
			}
		}
	}

	// Remove any unmatching style characterss.
	// Traverse list backwards to make removing less complicated.
	for ( const char of path.reverse() ) {
		if ( char[ 0 ] !== c ) {
			const pos = char[ 1 ];
			str = str.slice( 0, pos ) + str.slice( pos + 1 );
		}
	}
	return str;
}

export function stripColorsAndStyle( str: string ): string {
	return stripColors( stripStyle( str ) );
}

class IRCColorsLink {
	private binds: ( keyof ( typeof colors ) | keyof ( typeof styles ) )[] = [];

	private str: string = null;

	// eslint-disable-next-line @typescript-eslint/no-empty-function
	constructor() {}

	get white() {
		this.binds.push( 'white' );
		return this;
	}

	get black() {
		this.binds.push( 'black' );
		return this;
	}

	get navy() {
		this.binds.push( 'navy' );
		return this;
	}

	get green() {
		this.binds.push( 'green' );
		return this;
	}

	get red() {
		this.binds.push( 'red' );
		return this;
	}

	get brown() {
		this.binds.push( 'brown' );
		return this;
	}

	get maroon() {
		this.binds.push( 'maroon' );
		return this;
	}

	get purple() {
		this.binds.push( 'purple' );
		return this;
	}

	get violet() {
		this.binds.push( 'violet' );
		return this;
	}

	get olive() {
		this.binds.push( 'olive' );
		return this;
	}

	get yellow() {
		this.binds.push( 'yellow' );
		return this;
	}

	get lightgreen() {
		this.binds.push( 'lightgreen' );
		return this;
	}

	get lime() {
		this.binds.push( 'lime' );
		return this;
	}

	get teal() {
		this.binds.push( 'teal' );
		return this;
	}

	get bluecyan() {
		this.binds.push( 'bluecyan' );
		return this;
	}

	get cyan() {
		this.binds.push( 'cyan' );
		return this;
	}

	get aqua() {
		this.binds.push( 'aqua' );
		return this;
	}

	get blue() {
		this.binds.push( 'blue' );
		return this;
	}

	get royal() {
		this.binds.push( 'royal' );
		return this;
	}

	get pink() {
		this.binds.push( 'pink' );
		return this;
	}

	get lightpurple() {
		this.binds.push( 'lightpurple' );
		return this;
	}

	get fuchsia() {
		this.binds.push( 'fuchsia' );
		return this;
	}

	get gray() {
		this.binds.push( 'gray' );
		return this;
	}

	get grey() {
		this.binds.push( 'grey' );
		return this;
	}

	get lightgray() {
		this.binds.push( 'lightgray' );
		return this;
	}

	get lightgrey() {
		this.binds.push( 'lightgrey' );
		return this;
	}

	get silver() {
		this.binds.push( 'silver' );
		return this;
	}

	get normal() {
		this.binds.push( 'normal' );
		return this;
	}

	get underline() {
		this.binds.push( 'underline' );
		return this;
	}

	get bold() {
		this.binds.push( 'bold' );
		return this;
	}

	get italic() {
		this.binds.push( 'italic' );
		return this;
	}

	get inverse() {
		this.binds.push( 'inverse' );
		return this;
	}

	get strikethrough() {
		this.binds.push( 'strikethrough' );
		return this;
	}

	get monospace() {
		this.binds.push( 'monospace' );
		return this;
	}

	bind( str: string ): string {
		if ( this.binds.length ) {
			let code: string;
			this.binds.forEach( function ( s ) {
				if ( colors[ s ] ) {
					code = colors[ s ];
					this.str = c + code + ( badStr.test( this.str ) ? zero : '' ) + this.str + c;
				} else if ( styles[ s ] ) {
					code = styles[ s ];
					this.str = code + this.str + code;
				}
			} );
		}
		return str;
	}
}

export function init(): IRCColorsLink {
	return new IRCColorsLink();
}

export function rainbow( str: string, colorArr: OneOrMore<keyof ( typeof colors )> ): string {
	// eslint-disable-next-line no-shadow
	const rainbow: OneOrMore<keyof ( typeof colors )> = [
		'red', 'olive', 'yellow', 'green', 'blue', 'navy', 'violet'
	];
	colorArr = colorArr || rainbow;
	const l = colorArr.length;
	let i = 0;

	return str
		.split( '' )
		.map( ( x ) => x !== ' ' ? colors[ colorArr[ i++ % l ] ]( x ) : x )
		.join( '' );
}
