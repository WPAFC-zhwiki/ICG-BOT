// Type definitions for irc-upd v0.10.0
// Project: https://github.com/Throne3d/node-irc
// Definitions by: sunny00217wm <https://github.com/sunny00217wm>
// Definitions: https://github.com/WPAFC-zhwiki/ICG-BOT/tree/master/src/lib/irc-upd.d.ts

/// <reference types="node" />

/* eslint-disable @typescript-eslint/no-explicit-any */

declare module 'irc-upd/internal-types/event' {
	import InternalEventEmitter from 'node:events';

	export interface EventEmitterOptions {
		/**
		 * Enables automatic capturing of promise rejection.
		 */
		captureRejections?: boolean;
	}

	type Event = ( ...args: any ) => void;
	export type Events = Record<string | symbol, Event>;

	export default class EventEmitter<events extends Events = Events> extends InternalEventEmitter {
		addListener<V extends keyof events>( event: V, listener: events[ V ] ): this;
		on<V extends keyof events>( event: V, listener: events[ V ] ): this;
		once<V extends keyof events>( event: V, listener: events[ V ] ): this;
		removeListener<V extends keyof events>( event: V, listener: events[ V ] ): this;
		off<V extends keyof events>( event: V, listener: events[ V ] ): this;
		removeAllListeners<V extends keyof events>( event?: V ): this;
		listeners<V extends keyof events>( event: V ): events[ V ][];
		rawListeners<V extends keyof events>( event: V ): events[ V ][];
		emit<V extends keyof events>( event: V, ...args: Parameters<events[ V ]> ): boolean;
		listenerCount<V extends keyof events>( event: V ): number;
	}
}

declare module 'irc-upd' {
	import net = require( 'node:net' );
	import tls = require( 'node:tls' );

	import EventEmitter, { Events } from 'irc-upd/internal-types/event';

	export type IChans = Record<string, {
		key: string;
		serverName: string;
		users: Record<string, '' | '+' | '@'>;
		mode: string;
		modeParams: Record<string, string[]>;
		topic?: string;
		topicBy?: string;
	}>;

	class CyclingPingTimer extends EventEmitter<{
		pingTimeout(): void;
		wantPing(): void;
	}> {
		constructor( client: Client );
		public timerNumber: number;
		public started: boolean;
		public loopingTimeout: NodeJS.Timeout;
		public pingWaitTimeout: NodeJS.Timeout;

		public start(): void;
		public stop(): void;

		public notifyOfActivity(): void;
	}

	export interface IRCEvents extends Events {
		/**
		 * Emitted when the server sends the initial 001 line, indicating you’ve connected to the server.
		 */
		registered( message: IMessage ): void;

		/**
		 * Emitted when the server sends the message of the day to clients.
		 */
		motd( motd: string ): void;

		/**
		 * Emitted when a message is sent.
		 * The `to` parameter can be either a nick (which is most likely
		 * this client’s nick and represents a private message),
		 * or a channel (which represents a message to that channel).
		 */
		message( nick: string, to: string, text: string, message: IMessage ): void;

		/**
		 * Emitted when a message is sent to any channel
		 *
		 * (i.e. exactly the same as the message event but excluding private messages)
		 */
		'message#'( nick: string, to: string, text: string, message: IMessage ): void;

		/**
		 * Same as the `message` event, but only emitted for the specified channel.
		 */
		[ key: `message#${ string }` ]: ( nick: string, to: string, text: string, message: IMessage ) => void;

		/**
		 * Emitted when a message is sent from the client.
		 * The `to` parameter is the target of the message,
		 * which can be either a nick (in a private message) or a channel (as in a message to that channel)
		 */
		selfMessage( to: string, text: string ): void;

		/**
		 * Emitted when a notice is sent.
		 * The `to` parameter can be either a nick (most likely this client’s nick and so represents a private message),
		 * or a channel (which represents a message to that channel). The `nick` parameter
		 * is either the sender’s nick or `null`, representing that the notice comes from the server.
		 */
		notice( nick: string | null, to: string, text: string, message: IMessage ): void;

		/**
		 * Emitted whenever a user performs an action (e.g. `/me waves`).
		 */
		action( from: string | null, to: string, text: string, message: IMessage ): void;

		/**
		 * Same as the ‘message’ event, but only emitted when the message is directed to the client.
		 */
		pm( nick: string, text: string, message: IMessage ): void;

		/**
		 * Emitted when the client receives an `/invite`.
		 */
		invite( channel: string, from: string, message: IMessage ): void;

		/**
		 * Emitted when the server sends a list of nicks for a channel (which happens immediately after joining or on
		 * request). The nicks object passed to the callback is keyed by nickname, and has values ‘’, ‘+’, or ‘@’
		 * depending on the level of that nick in the channel.
		 */
		names( channel: string, nicks: Record<string, '' | '+' | '@'> ): void;

		/**
		 * Same as the `names` event, but only emitted for the specified channel.
		 */
		[ key: `names#${ string }` ]: ( nicks: Record<string, '' | '+' | '@'> ) => void;

		/**
		 * Emitted when the server sends the channel topic after joining a channel,
		 * or when a user changes the topic on a channel.
		 */
		topic( channel: string, topic: string, nick: string, message: IMessage ): void;

		/**
		 * Emitted when a user joins a channel (including when the client itself joins a channel).
		 */
		join( channel: string, nick: string, message: IMessage ): void;

		/**
		 * Same as the `join` event, but only emitted for the specified channel.
		 */
		[ key: `join#${ string }` ]: ( nick: string, message: IMessage ) => void;

		/**
		 * Emitted when a user parts a channel (including when the client itself parts a channel).
		 */
		part( channel: string, nick: string, reason: string, message: IMessage ): void;

		/**
		 * Same as the `part` event, but only emitted for the specified channel.
		 */
		[ key: `part#${ string }` ]: ( nick: string, reason: string, message: IMessage ) => void;

		/**
		 * Emitted when a user disconnects from the IRC server,
		 * leaving the specified array of channels. Channels are emitted case-lowered.
		 */
		quit( nick: string, reason: string, channels: string[], message: IMessage ): void;

		/**
		 * Emitted when a user is kicked from a channel.
		 */
		kick( channel: string, nick: string, by: string, reason: string, message: IMessage ): void;

		/**
		 * Same as the `kick` event, but only emitted for the specified channel.
		 */
		[ key: `kick#${ string }` ]: ( nick: string, by: string, reason: string, message: IMessage ) => void;

		/**
		 * Emitted when a user is killed from the IRC server.
		 * The `channels` parameter is an array of channels the killed user was in,
		 * those known to the client (that is, the ones the bot was present in). Channels are emitted case-lowered.
		 */
		kill( nick: string, reason: string, channels: string[], message: IMessage ): void;

		/**
		 * Emitted when a user changes nick, with the channels the user is known to be in.
		 * Channels are emitted case-lowered.
		 */
		nick( oldnick: string, newnick: string, channels: string[], message: IMessage ): void;

		/**
		 * Emitted when a mode is added to a user or channel.
		 *
		 * If the mode is being set on a user, argument is the nick of the user.
		 * If the mode is being set on a channel, argument is the argument to the mode.
		 * If a channel mode doesn’t have any arguments, argument will be ‘undefined’.
		 *
		 * @param channel the channel which the mode is being set on/in.
		 * @param by the user setting the mode
		 * @param mode the single character mode identifier
		 */
		'+mode'( channel: string, by: string, mode: string, argument: string | undefined, message: IMessage ): void;

		/**
		 * Emitted when a mode is removed from a user or channel.
		 *
		 * If the mode is being set on a user, argument is the nick of the user.
		 * If the mode is being set on a channel, argument is the argument to the mode.
		 * If a channel mode doesn’t have any arguments, argument will be ‘undefined’.
		 *
		 * @param channel the channel which the mode is being set on/in.
		 * @param by the user setting the mode
		 * @param mode the single character mode identifier
		 */
		'-mode'( channel: string, by: string, mode: string, argument: string | undefined, message: IMessage ): void;

		/**
		 * Emitted when the server finishes outputting a WHOIS response.
		 */
		whois( info: IWhoisData ): void;

		/**
		 * Emitted when a server PINGs the client.
		 * The client will automatically send a PONG request just before this is emitted.
		 */
		ping( server: string ): void;

		/**
		 * Emitted when a CTCP notice or privmsg was received
		 */
		ctcp( from: string, to: string, text: string, type: 'notice' | 'privmsg', message: IMessage ): void;

		/**
		 * Emitted when a CTCP notice is received.
		 */
		'ctcp-notice'( from: string, to: string, text: string, message: IMessage ): void;

		/**
		 * Emitted when a CTCP privmsg was received.
		 */
		'ctcp-privmsg'( from: string, to: string, text: string, message: IMessage ): void;

		/**
		 * Emitted when a CTCP VERSION request is received.
		 */
		'ctcp-version'( from: string, to: string, message: IMessage ): void;

		/**
		 * Emitted when the server starts a new channel listing.
		 */
		channellist_start(): void;

		/**
		 * Emitted for each channel the server returns in a channel listing.
		 */
		channellist_item( channel_info: IChannel ): void;

		/**
		 * Emitted when the server has finished returning a channel list.
		 * This data is also available through the `Client.channellist` property after this event has fired.
		 */
		channellist( channel_list: IChannel[] ): void;

		/**
		 * Emitted when the client receives a “message” from the server.
		 * A message is a single line of data from the server.
		 * The message parameter to the callback is the processed version of this message
		 */
		raw( message: IMessage ): void;

		/**
		 * Emitted whenever the server responds with an error-type message.
		 *
		 * Unhandled messages, although they are shown as errors in the log,
		 * are not emitted using this event: see `unhandled`.
		 */
		error( message: IMessage ): void;

		/**
		 * Emitted when the socket connection to the server emits an error event.
		 * See [net.Socket’s](https://nodejs.org/api/net.html#net_event_error_1) error event for more information.
		 */
		netError( exception: Error ): void;

		/**
		 * Emitted whenever the server responds with a message the bot doesn’t recognize and doesn’t handle.
		 *
		 * This must not be relied on to emit particular event codes,
		 * as the codes the bot does and does not handle can change between minor versions.
		 * It should instead be used as a handler to do something
		 * when the bot does not recognize a message, such as warning a user.
		 */
		unhandled( message: IMessage ): void;
	}

	export class Client extends EventEmitter<IRCEvents> {
		/**
		 * Connect to an IRC server
		 *
		 * @param server - server hostname
		 * @param nick - nickname
		 * @param opts
		 */
		constructor(
			server: string,
			nick: string,
			opts?: IClientOpts
		);

		/**
		 * Socket to the server. Rarely, if ever needed. Use Client#send
		 * instead.
		 */
		public conn: net.Socket & {
			renickInterval?: NodeJS.Timer;
			cyclingPingTimer?: CyclingPingTimer;
		};

		/**
		 * Channels joined. Includes channel modes, user list, and topic
		 * information. Only updated after the server recognizes the join.
		 */
		public chans: IChans;

		protected out: {
			showErrors: boolean;

			showDebug: boolean;

			error( ...args: any[] ): void;

			debug( ...args: any[] ): void;
		};

		/** Features supported by the server */
		public supported: {
			channel: {
				idlength: string[];
				length: number;
				limit: string[];
				modes: Record<string, string>
				types: string;
			};

			kicklength: number;
			maxlist: number[];
			maxtargets: string[];
			modes: number;
			nicklength: number
			topiclength: number;
			usermodes: string;
		};

		/**
		 * The current nick of the client. Updated if the nick changes
		 */
		public nick: string;

		/** Channel listing data. */
		public channellist: IChannel[];

		/** IRC server MOTD */
		public motd: string;

		/** Maximum line length */
		public maxLineLength: number;

		/** Bot options */
		public readonly opt: IClientOpts & {
			server: string;
			nick: string;
		};

		/** Host mask */
		public hostMask: string;

		/**
		 * Send a raw message to the server; generally speaking, it’s best
		 * not to use this method unless you know what you’re doing.
		 *
		 * @param command - irc command
		 * @param args - command arguments (splat)
		 */
		public send(
			command: string,
			...args: string[]
		): void;

		/**
		 * Join the specified channel
		 *
		 * @param channel - channel to join
		 * @param callback
		 */
		public join(
			channel: string,
			callback?: handlers.IJoinChannel
		): void;

		/**
		 * Part the specified channel
		 *
		 * @param channel - channel to part
		 * @param message - optional message to send
		 * @param callback
		 */
		public part(
			channel: string,
			message: string,
			callback: handlers.IPartChannel
		): void;

		/**
		 * Send a message to the specified target
		 *
		 * @param target - nick or channel
		 * @param message - message to send
		 */
		public say(
			target: string,
			message: string
		): void;

		/**
		 * Send a CTCP message to the specified target
		 *
		 * @param target - nick or channel
		 * @param type - "privmsg" for PRIVMSG, anything else for NOTICE
		 * @param text - CTCP message
		 */
		public ctcp(
			target: string,
			type: string,
			text: string
		): void;

		/**
		 * Send an action to the specified target
		 *
		 * @param target - target
		 * @param message - message
		 */
		public action(
			target: string,
			message: string
		): void;

		/**
		 * Send a notice to the specified target.
		 *
		 * @param target - nick or channel
		 * @param message - message to send
		 */
		public notice(
			target: string,
			message: string
		): void;

		/**
		 * Request a whois for the specified nick
		 *
		 * @param nick - nickname
		 * @param callback
		 */
		public whois(
			nick: string,
			callback: handlers.IWhois
		): void;

		/**
		 * Request a channel listing from the server. The arguments for this
		 * are farily server specific, this method passes them as specified.
		 *
		 * Responses from the server are available via `channellist_start`,
		 * `channellist_item`, and `channellist` events.
		 *
		 * @param args - arguments
		 */
		public list(
			...args: string[]
		): void;

		/**
		 * Connect to the server. Use when `autoConnect` is false.
		 *
		 * @param retryCount - times to retry
		 * @param callback
		 */
		public connect(
			retryCount?: number | handlers.IRaw,
			callback?: handlers.IRaw
		): void;

		/**
		 * Disconnect from the IRC server
		 *
		 * @param message - message to send
		 * @param callback
		 */
		public disconnect(
			message: string,
			callback: () => void
		): void;

		/**
		 * Activate flood protection “after the fact”. You can also use
		 * floodProtection while instantiating the Client to enable flood
		 * protection, and floodProtectionDelay to set the default message
		 * interval.
		 *
		 * @param interval - ms to wait between messages
		 */
		public activateFloodProtection(
			interval: number
		): void;

		protected prefixForMode: Record<string, string>;
		public modeForPrefix: Record<string, string>;
		public _whoisData: Record<string, IWhoisData>;

		protected connectionTimedOut( conn: net.Socket ): void;
		protected connectionWantsPing( conn: net.Socket ): void;
		protected chanData( name: string, create?: boolean ): {
			key: string;
			serverName: string;
			users: Record<string, string>;
			mode: string;
			modeParams: Record<string, string[]>;
		}
		protected _connectionHandler(): void;
		protected end(): void;
		protected deactivateFloodProtection(): void;
		protected cancelAutoRenick(): NodeJS.Timer;
		protected _findChannelFromStrings( channelName: string ): number;
		protected _splitLongLines( words: string, maxLength: number, destination: string[] ): string[];
		protected emitChannelEvent( eventName: string, channel: string ): void;
		protected _speak( kind: string, target: string, text: string ): void;
		_addWhoisData( nick: string, key: string, value: IWhoisData, onlyIfExists: boolean ): void;
		_clearWhoisData( nick: string ): IWhoisData;
		protected _handleCTCP( from: string, to: string, text: string, type: string, message: IMessage ): void;
		protected convertEncoding( str: string ): string;
		protected canConvertEncoding(): boolean;
		protected _updateMaxLineLength(): void;
	}

	/** Client options object */
	export interface IClientOpts {
		/**
		 * IRC username
		 *
		 * @default 'nodebot'
		 */
		userName?: string | undefined;

		/**
		 * IRC username
		 *
		 * @default ''
		 */
		password?: string | undefined;

		/**
		 * IRC "real name"
		 *
		 * @default 'nodeJS IRC client'
		 */
		realName?: string | undefined;

		/**
		 * IRC connection port. See
		 * https://nodejs.org/api/net.html#net_socket_remoteport
		 *
		 * @default 6667
		 */
		port?: number | undefined;

		/**
		 * Local interface to bind to for network connections. See
		 * https://nodejs.org/api/net.html#net_socket_localaddress
		 */
		localAddress?: string | undefined;

		/**
		 * Should we output debug messages to STDOUT?
		 *
		 * @default false
		 */
		debug?: boolean | undefined;

		/**
		 * Should we output IRC errors?
		 *
		 * @default false
		 */
		showErrors?: boolean | undefined;

		/**
		 * Should we auto-rejoin channels?
		 *
		 * @default false
		 */
		autoRejoin?: boolean | undefined;

		/**
		 * Should we auto-reconnect to networks?
		 *
		 * @default true
		 */
		autoConnect?: boolean | undefined;

		/**
		 * Channels to join
		 *
		 * @default []
		 */
		channels?: string[] | undefined;

		/**
		 * Number of times the client will try to automatically reconnect when disconnected.
		 *
		 * @default 0
		 */
		retryCount?: number | undefined;

		/**
		 * Number of milliseconds to wait before retying to automatically reconnect when disconnected.
		 *
		 * @default 2000
		 */
		retryDelay?: number | undefined;

		/**
		 * Should SSL be used? Can either be true or crypto credentials.
		 *
		 * @default false
		 */
		secure?: boolean | tls.SecureContext | undefined;

		/**
		 * Should we accept self-signed certificates?
		 *
		 * @default false
		 */
		selfSigned?: boolean | undefined;

		/**
		 * Should we accept expired certificates?
		 *
		 * @default false
		 */
		certExpired?: boolean | undefined;

		/**
		 * Should we queue our messages to ensure we don't get kicked?
		 *
		 * @default false
		 */
		floodProtection?: boolean | undefined;

		/**
		 * Delay between messages when flood protection is active
		 *
		 * @default 1000
		 */
		floodProtectionDelay?: number | undefined;

		/**
		 * Should we use SASL authentication?
		 *
		 * @default false
		 */
		sasl?: boolean | undefined;

		/**
		 * Should we strip mIRC colors from the output messages?
		 *
		 * @default false
		 */
		stripColors?: boolean | undefined;

		/**
		 * Channel prefix
		 *
		 * @default '&#'
		 */
		channelPrefixes?: string | undefined;

		/**
		 * Characters to split a message at.
		 *
		 * @default 512
		 */
		messageSplit?: number | undefined;

		/**
		 * Encoding to use. See
		 * https://nodejs.org/api/stream.html#stream_readable_setencoding_encoding
		 *
		 * @default 'utf-8'
		 */
		encoding?: string | undefined;
	}

	/** Command types */
	// eslint-disable-next-line no-shadow
	export enum CommandType {
		normal, reply, error
	}

	/** Parsed IRC message. */
	export interface IMessage {
		/** Prefix */
		prefix?: string | undefined;

		/** Mapped IRC command */
		command: string;

		/** Raw IRC command */
		rawCommand: string;

		/** Command type */
		commandType: CommandType;

		/** Command arguments */
		args: string[];
	}

	/** Whois data */
	export interface IWhoisData {
		/** Nickname */
		nick: string;

		/** Username */
		user: string;

		/** Hostnamej */
		host: string;

		/** Real name" */
		realname: string;

		/** Channels */
		channels: string[];

		/** Server */
		server: string;

		/** Server description string */
		serverinfo: string;

		/** Is this user an operator? */
		operator: string;
	}

	/** A channel returned by a channel listing. */
	export interface IChannel {
		/** Channel name */
		name: string;

		/** User count */
		users: string;

		/** Topic string */
		topic: string;
	}

	/**
	 * Handler functions for Client.
	 */
	namespace handlers {
		/**
		 * 'registered': Emitted when the server sends the initial 001 line,
		 * indicating you’ve connected to the server. See the raw event for
		 * details on the message object.
		 */
		export interface IRegistered {
			/**
			 * @param message - raw message
			 */
			( message: IMessage ): void;
		}

		/**
		 * 'motd': Emitted when the server sends the message of the day to
		 * clients.
		 */
		export interface IMotd {
			/**
			 * @param motd - motd string
			 */
			( motd: string ): void;
		}

		/**
		 * 'names': Emitted when the server sends a list of nicks for a channel
		 * (which happens immediately after joining and on request. The nicks
		 * object passed to the callback is keyed by nick names, and has
		 * values ‘’, ‘+’, or ‘@’ depending on the level of that nick in the
		 * channel.
		 */
		export interface INames {
			/**
			 * @param channel - channel name
			 * @param nicks - nicks list
			 */
			( channel: string, nicks: string[] ): void;
		}

		/**
		 * 'names#*' As per ‘names’ event but only emits for the subscribed
		 * channel.
		 */
		export interface INamesChannel {
			/**
			 * @param channel - channel name
			 * @param nicks - nicks list
			 */
			( nicks: string[] ): void;
		}

		/**
		 * 'topic': Emitted when the server sends the channel topic on joining
		 * a channel, or when a user changes the topic on a channel. See the
		 * raw event for details on the message object.
		 */
		export interface ITopic {
			/**
			 * @param channel - channel name
			 * @param topic - topic
			 * @param nick - nick
			 * @param message - raw message
			 */
			(
				channel: string,
				topic: string,
				nick: string,
				message: IMessage
			): void;
		}

		/**
		 * 'join': Emitted when a user joins a channel (including when the
		 * client itself joins a channel). See the raw event for details on the
		 * message object.
		 */
		export interface IJoin {
			/**
			 * @param channel - channel name
			 * @param nick - who joined
			 * @param message - raw message
			 */
			( channel: string, nick: string, message: IMessage ): void;
		}

		/**
		 * 'join#*': As per ‘join’ event but only emits for the subscribed
		 * channel. See the raw event for details on the message object.
		 */
		export interface IJoinChannel {
			/**
			 * @param nick - who joined
			 * @param message - raw message
			 */
			( nick: string, message: IMessage ): void;
		}

		/**
		 * 'part': Emitted when a user parts a channel (including when the
		 * client itself parts a channel). See the raw event for details on the
		 * message object.
		 */
		export interface IPart {
			/**
			 * @param channel - channel name
			 * @param nick - who parted
			 * @param reason - part reason
			 * @param message - raw message
			 */
			(
				channel: string,
				nick: string,
				reason: string,
				message: IMessage
			): void
		}

		/**
		 * 'part': As per ‘part’ event but only emits for the subscribed
		 * channel. See the raw event for details on the message object.
		 */
		export interface IPartChannel {
			/**
			 * @param nick - who parted
			 * @param reason - part reason
			 * @param message - raw message
			 */
			(
				nick: string,
				reason: string,
				message: IMessage
			): void
		}

		/**
		 * 'kick': Emitted when a user is kicked from a channel. See the raw
		 * event for details on the message object.
		 */
		export interface IKick {
			/**
			 * @param channel - channel name
			 * @param nick - who was kicked
			 * @param by - kicker
			 * @param reason - kick reason
			 * @param message - raw message
			 */
			(
				channel: string,
				nick: string,
				by: string,
				reason: string,
				message: IMessage
			): void;
		}

		/**
		 * 'kick#*': Emitted when a user is kicked from a channel. See the raw
		 * event for details on the message object.
		 */
		export interface IKickChannel {
			/**
			 * @param nick - who was kicked
			 * @param by - kicker
			 * @param reason - kick reason
			 * @param message - raw message
			 */
			(
				nick: string,
				by: string,
				reason: string,
				message: IMessage
			): void;
		}

		/**
		 * 'message': Emitted when a message is sent. to can be either a nick
		 * (which is most likely this clients nick and means a private message),
		 * or a channel (which means a message to that channel). See the raw
		 * event for details on the message object.
		 */
		export interface IRecievedMessage {
			/**
			 * @param nick - who sent the message
			 * @param to - to whom was the message sent
			 * @param text - message text
			 * @param message - raw message
			 */
			(
				nick: string, to: string, text: string, message: IMessage
			): void;
		}

		/**
		 * 'message#': Emitted when a message is sent to any channel (i.e.
		 * exactly the same as the message event but excluding private
		 * messages. See the raw event for details on the message object.
		 */
		export interface IMessageAllChannels {
			/**
			 * @param nick - who sent the message
			 * @param to - to whom was the message sent
			 * @param text - message text
			 * @param message - raw message
			 */
			(
				nick: string, to: string, text: string, message: IMessage
			): void;
		}

		/**
		 * 'message#*': As per ‘message’ event but only emits for the
		 * subscribed channel. See the raw event for details on the message
		 * object.
		 */
		export interface IMessageChannel {
			/**
			 * @param nick - who sent the message
			 * @param text - message text
			 * @param message - raw message
			 */
			( nick: string, text: string, message: IMessage ): void;
		}

		/**
		 * 'selfMessage': Emitted when a message is sent from the client.
		 * `to` is who the message was sent to. It can be either a nick
		 * (which most likely means a private message), or a channel (which
		 * means a message to that channel).
		 */
		export interface ISelfMessage {
			( to: string, text: string ): void;
		}

		/**
		 * 'notice': Emitted when a notice is sent. to can be either a nick
		 * (which is most likely this clients nick and means a private
		 * message), or a channel (which means a message to that channel). nick
		 * is either the senders nick or null which means that the notice comes
		 * from the server. See the raw event for details on the message object.
		 */
		export interface INotice {
			/**
			 * @param nick - from
			 * @param to - to
			 * @param text - text
			 * @param message - raw message
			 */
			( nick: string, to: string, text: string, message: IMessage ): void;
		}

		/**
		 * 'ping': Emitted when a server PINGs the client. The client will
		 * automatically send a PONG request just before this is emitted.
		 */
		export interface IPing {
			/**
			 * @param server - server that adiministered the ping
			 */
			( server: string ): void;
		}

		/**
		 * 'pm': As per ‘message’ event but only emits when the message is
		 * direct to the client. See the raw event for details on the message
		 * object.
		 */
		export interface IPm {
			/**
			 * @param nick - sender
			 * @param text - message text
			 * @param message - raw message
			 */
			( nick: string, text: string, message: IMessage ): void;
		}

		/**
		 * 'ctcp': Emitted when a CTCP notice or privmsg was received (type
		 * is either ‘notice’ or ‘privmsg’). See the raw event for details
		 * on the message object.
		 */
		export interface ICtcp {
			/**
			 * @param from - sender
			 * @param to - recievier
			 * @param text - ctcp text
			 * @param type - ctcp type
			 * @param message - raw message
			 */
			(
				from: string,
				to: string,
				text: string,
				type: string,
				message: IMessage
			): void;
		}

		/**
		 * 'ctcp-*': Emitted when a specific type of CTCP request was
		 * recieved.
		 */
		export interface ICtcpSpecific {
			/**
			 * @param from - sender
			 * @param to - recievier
			 * @param message - raw message
			 */
			(
				from: string,
				to: string,
				text: string,
				message: IMessage
			): void;

			(
				from: string,
				to: string,
				text: string,
				type: string,
				message: IMessage
			): void;
		}

		/**
		 * 'nick': Emitted when a user changes nick along with the channels
		 * the user is in. See the raw event for details on the message
		 * object.
		 */
		export interface INick {
			/**
			 * @param oldnick - old nickname
			 * @param newnick - new nickname
			 * @param channels - channels the nick changed in
			 * @param message - raw message
			 */
			(
				oldnick: string,
				newnick: string,
				channels: string[],
				message: IMessage
			): void;
		}

		/**
		 * 'invite': Emitted when the client receives an /invite. See the
		 * raw event for details on the message object.
		 */
		export interface IInvite {
			/**
			 * @param channel - channel user was invited to
			 * @param from - user who invited
			 * @param message - raw message
			 */
			( channel: string, from: string, message: IMessage ): void;
		}

		/**
		 * '+mode'/'-mode': Emitted when a mode is added or removed from a user or
		 * channel. channel is the channel which the mode is being set on/in
		 * . by is the user setting the mode. mode is the single character
		 * mode identifier. If the mode is being set on a user, argument is
		 * the nick of the user. If the mode is being set on a channel,
		 * argument is the argument to the mode. If a channel mode doesn’t
		 * have any arguments, argument will be ‘undefined’. See the raw
		 * event for details on the message object.
		 */
		export interface IModeChange {
			/**
			 * @param channel - channel
			 * @param by - nick that changed mode
			 * @param mode - single character mode identifier
			 * @param argument - mode argument
			 * @param message - raw message
			 */
			(
				channel: string,
				by: string,
				mode: string,
				argument: string,
				message: IMessage
			): void;
		}

		/**
		 * 'whois': Emitted whenever the server finishes outputting a WHOIS
		 * response.
		 */
		export interface IWhois {
			( info: IWhoisData ): void;
		}

		/**
		 * 'channellist': Emitted when the server has finished returning a
		 * channel list. The channel_list array is simply a list of the
		 * objects that were returned in the intervening channellist_item
		 * events.
		 *
		 * This data is also available via the Client.channellist property
		 * after this event has fired.
		 */
		export interface IChannelList {
			/**
			 * @param list - channels
			 */
			(
				list: IChannel[]
			): void;
		}

		/**
		 * 'raw': Emitted when ever the client receives a “message” from
		 * the server. A message is a parsed line from the server.
		 */
		export interface IRaw {
			/**
			 * @param message - raw message
			 */
			( message: IMessage ): void;
		}

		/**
		 * 'error': Emitted when ever the server responds with an error-type message.
		 * The message parameter is exactly as in the ‘raw’ event.
		 */
		export interface IError {
			/**
			 * @param message - raw message
			 */
			( message: IMessage ): void;
		}

		/**
		 * 'action': Emitted whenever a user performs an action
		 * (e.g. /me waves).
		 */
		export interface IAction {
			/**
			 * @param from - sender
			 * @param to - reciever
			 * @param text - text
			 * @param message - raw message
			 */
			(
				from: string, to: string, text: string, message: IMessage
			): void;
		}
	}

	export function canConvertEncoding(): boolean;

	export namespace colors {
		const codes: {
			white: string;
			black: string;
			dark_blue: string;
			dark_green: string;
			light_red: string;
			dark_red: string;
			magenta: string;
			orange: string;
			yellow: string;
			light_green: string;
			cyan: string;
			light_cyan: string;
			light_blue: string;
			light_magenta: string;
			gray: string;
			light_gray: string;

			bold: string;
			underline: string;

			reset: string;
		};

		function wrap( color: keyof typeof codes, text: string, resetColor: keyof typeof codes ): string;
	}
}
