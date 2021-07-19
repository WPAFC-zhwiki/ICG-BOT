import * as Http from 'http';
import * as Https from 'https';
import * as Tls from 'tls';

/**
 * HTTPS Agent for node.js HTTPS requests via a proxy.
 * blog.vanamco.com/connecting-via-proxy-node-js/
 */
declare class HttpsProxyAgent extends Https.Agent {
	proxyHost: string;
	proxyPort: string | number;
	constructor( options: Https.AgentOptions & { proxyHost: string; proxyPort: string | number; } );

	createConnection( opts: {
		host: string;
		port: number;
	}, callback: ( error: false | Error, sockets: Tls.TLSSocket | null ) => void ): void;

	// Almost verbatim copy of http.Agent.addRequest
	// HttpsProxyAgent.prototype.addRequest = function(req, host, port, localAddress) // node v0.10.x
	addRequest( req: Http.OutgoingMessage & Http.IncomingMessage & {
		onSocket: ( socket: Tls.TLSSocket ) => void;
	}, options: {
		host: string;
		port: number;
		path: string;
	} ): void;

	// Almost verbatim copy of http.Agent.createSocket
	createSocket( name: string | number, host: string, port: number,
		localAddress: string, req: Http.OutgoingMessage, callback: ( socket: Tls.TLSSocket ) => void ): void;
}

export = HttpsProxyAgent;
