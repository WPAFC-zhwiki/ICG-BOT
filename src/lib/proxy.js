/*
 * http://blog.vanamco.com/proxy-requests-in-node-js/
 * https://gist.github.com/matthias-christen/6beb3b4dda26bd6a221d
 */

const Http = require( 'http' );
const Https = require( 'https' );
const Tls = require( 'tls' );

/**
 * HTTPS Agent for node.js HTTPS requests via a proxy.
 * blog.vanamco.com/connecting-via-proxy-node-js/
 */
module.exports = class HttpsProxyAgent extends Https.Agent {
	constructor( options ) {
		super( options );

		this.proxyHost = options.proxyHost;
		this.proxyPort = options.proxyPort;
	}

	createConnection( opts, callback ) {
		// do a CONNECT request
		const req = Http.request( {
			host: this.proxyHost,
			port: this.proxyPort,
			method: 'CONNECT',
			path: opts.host + ':' + opts.port,
			headers: {
				host: opts.host
			}
		} );

		req.on( 'connect', function ( _res, socket ) {
			const cts = Tls.connect(
				{
					host: opts.host,
					socket: socket
				},
				function () {
					callback( false, cts );
				}
			);
		} );

		req.on( 'error', function ( err ) {
			callback( err, null );
		} );

		req.end();
	}

	// Almost verbatim copy of http.Agent.addRequest
	addRequest( req, options ) {
		let name = options.host + ':' + options.port;
		if ( options.path ) {
			name += ':' + options.path;
		}

		if ( !this.sockets[ name ] ) {
			this.sockets[ name ] = [];
		}

		if ( this.sockets[ name ].length < this.maxSockets ) {
			// if we are under maxSockets create a new one.
			this.createSocket( name, options.host,
				options.port, options.path, req, function ( socket ) {
					req.onSocket( socket );
				}
			);
		} else {
			// we are over limit so we'll add it to the queue.
			if ( !this.requests[ name ] ) {
				this.requests[ name ] = [];
			}
			this.requests[ name ].push( req );
		}
	}

	// Almost verbatim copy of http.Agent.createSocket
	createSocket( name, host, port, localAddress, req, callback ) {
		const self = this;
		const options = Object.assign( {}, self.options, {
			host,
			port,
			localAddress
		} );

		options.servername = host;
		if ( req ) {
			const hostHeader = String( req.getHeader( 'host' ) );
			if ( hostHeader ) {
				options.servername = hostHeader.replace( /:.*$/u, '' );
			}
		}

		self.createConnection( options, function ( err, socket ) {
			if ( err ) {
				err.message += ' while connecting to HTTP(S) proxy server ' + self.proxyHost + ':' + self.proxyPort;

				if ( req ) {
					req.emit( 'error', err );
				} else {
					throw err;
				}

				return;
			}

			if ( !self.sockets[ name ] ) {
				self.sockets[ name ] = [];
			}

			self.sockets[ name ].push( socket );

			const onFree = function () {
				self.emit( 'free', socket, host, port, localAddress );
			};

			const onClose = function () {
			// this is the only place where sockets get removed from the Agent.
			// if you want to remove a socket from the pool, just close it.
			// all socket errors end in a close event anyway.
				self.removeSocket( socket, name, host, port, localAddress );
			};

			const onRemove = function () {
			// we need this function for cases like HTTP 'upgrade'
			// (defined by WebSockets) where we need to remove a socket from the pool
			// because it'll be locked up indefinitely
				self.removeSocket( socket, name, host, port, localAddress );
				socket.removeListener( 'close', onClose );
				socket.removeListener( 'free', onFree );
				socket.removeListener( 'agentRemove', onRemove );
			};

			socket.on( 'free', onFree );
			socket.on( 'close', onClose );
			socket.on( 'agentRemove', onRemove );

			callback( socket );
		} );
	}
};
