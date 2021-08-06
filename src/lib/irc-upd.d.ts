// Type definitions for irc-upd v0.10.0
// Project: https://github.com/Throne3d/node-irc
// Definitions by: sunny00217wm <https://github.com/sunny00217wm>
// Definitions: https://github.com/WPAFC-zhwiki/ICG-BOT/tree/master/src/lib/irc-upd.d.ts

/// <reference types="node" />

declare module 'irc-upd' {
	import IRC from 'irc';
	export { IMessage, IChannel, IWhoisData, IClientOpts, handlers, CommandType } from 'irc';
	export type IChans = typeof IRC.Client.prototype.chans & Record<string, {
		key: string;
		serverName: string;
		users: Record<string, '' | '+' | '@'>;
		mode: string;
		modeParams: Record<string, string[]>;
		topic?: string;
		topicBy?: string;
		created: string;
	}>;

	import net = require( 'net' );
	import { EventEmitter } from 'events';

	interface CyclingPingTimerEvents {
		pingTimeout(): void;
		wantPing(): void;
	}

	class CyclingPingTimer extends EventEmitter {
		constructor( client: Client );
		public timerNumber: number;
		public started: boolean;
		public loopingTimeout: NodeJS.Timeout;
		public pingWaitTimeout: NodeJS.Timeout;

		public on<k extends keyof CyclingPingTimerEvents>( event: k, listener: CyclingPingTimerEvents[ k ] ): this;
		// eslint-disable-next-line max-len
		public addListener<k extends keyof CyclingPingTimerEvents>( event: k, listener: CyclingPingTimerEvents[ k ] ): this;

		public once<k extends keyof CyclingPingTimerEvents>( event: k, listener: CyclingPingTimerEvents[ k ] ): this;

		public off<k extends keyof CyclingPingTimerEvents>( event: k, listener: CyclingPingTimerEvents[ k ] ): this;
		// eslint-disable-next-line max-len
		public removeListener<k extends keyof CyclingPingTimerEvents>( event: k, listener: CyclingPingTimerEvents[ k ] ): this;

		public start(): void;
		public stop(): void;

		public notifyOfActivity(): void;
	}

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	export interface Events extends Record<string, ( ...args: any[] ) => void> {
		/**
		 * Emitted when the server sends the initial 001 line, indicating you’ve connected to the server.
		 */
		registered( message: IRC.IMessage ): void;

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
		message( nick: string, to: string, text: string, message: IRC.IMessage ): void;

		/**
		 * Emitted when a message is sent to any channel
		 *
		 * (i.e. exactly the same as the message event but excluding private messages)
		 */
		'message#'( nick: string, to: string, text: string, message: IRC.IMessage ): void;

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
		notice( nick: string | null, to: string, text: string, message: IRC.IMessage ): void;

		/**
		 * Emitted whenever a user performs an action (e.g. `/me waves`).
		 */
		action( from: string | null, to: string, text: string, message: IRC.IMessage ): void;

		/**
		 * Same as the ‘message’ event, but only emitted when the message is directed to the client.
		 */
		pm( nick: string, text: string, message: IRC.IMessage ): void;

		/**
		 * Emitted when the client receives an `/invite`.
		 */
		invite( channel: string, from: string, message: IRC.IMessage ): void;

		/**
		 * Emitted when the server sends a list of nicks for a channel (which happens immediately after joining or on
		 * request). The nicks object passed to the callback is keyed by nickname, and has values ‘’, ‘+’, or ‘@’
		 * depending on the level of that nick in the channel.
		 */
		names( channel: string, nicks: string ): void;

		/**
		 * Emitted when the server sends the channel topic after joining a channel,
		 * or when a user changes the topic on a channel.
		 */
		topic( channel: string, topic: string, nick: string, message: IRC.IMessage ): void;

		/**
		 * Emitted when a user joins a channel (including when the client itself joins a channel).
		 */
		join( channel: string, nick: string, message: IRC.IMessage ): void;

		/**
		 * Emitted when a user parts a channel (including when the client itself parts a channel).
		 */
		part( channel: string, nick: string, reason: string, message: IRC.IMessage ): void;

		/**
		 * Emitted when a user disconnects from the IRC server,
		 * leaving the specified array of channels. Channels are emitted case-lowered.
		 */
		quit( nick: string, reason: string, channels: string[], message: IRC.IMessage ): void;

		/**
		 * Emitted when a user is kicked from a channel.
		 */
		kick( channel: string, nick: string, by: string, reason: string, message: IRC.IMessage ): void;

		/**
		 * Emitted when a user is killed from the IRC server.
		 * The `channels` parameter is an array of channels the killed user was in,
		 * those known to the client (that is, the ones the bot was present in). Channels are emitted case-lowered.
		 */
		kill( nick: string, reason: string, channels: string[], message: IRC.IMessage ): void;

		/**
		 * Emitted when a user changes nick, with the channels the user is known to be in.
		 * Channels are emitted case-lowered.
		 */
		nick( oldnick: string, newnick: string, channels: string[], message: IRC.IMessage ): void;

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
		'+mode'( channel: string, by: string, mode: string, argument: string | undefined, message: IRC.IMessage ): void;

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
		'-mode'( channel: string, by: string, mode: string, argument: string | undefined, message: IRC.IMessage ): void;

		/**
		 * Emitted when the server finishes outputting a WHOIS response.
		 */
		whois( info: IRC.IWhoisData ): void;

		/**
		 * Emitted when a server PINGs the client.
		 * The client will automatically send a PONG request just before this is emitted.
		 */
		ping( server: string ): void;

		/**
		 * Emitted when a CTCP notice or privmsg was received
		 */
		ctcp( from: string, to: string, text: string, type: 'notice' | 'privmsg', message: IRC.IMessage ): void;

		/**
		 * Emitted when a CTCP notice is received.
		 */
		'ctcp-notice'( from: string, to: string, text: string, message: IRC.IMessage ): void;

		/**
		 * Emitted when a CTCP privmsg was received.
		 */
		'ctcp-privmsg'( from: string, to: string, text: string, message: IRC.IMessage ): void;

		/**
		 * Emitted when a CTCP VERSION request is received.
		 */
		'ctcp-version'( from: string, to: string, message: IRC.IMessage ): void;

		/**
		 * Emitted when the server starts a new channel listing.
		 */
		channellist_start(): void;

		/**
		 * Emitted for each channel the server returns in a channel listing.
		 */
		channellist_item( channel_info: IRC.IChannel ): void;

		/**
		 * Emitted when the server has finished returning a channel list.
		 * This data is also available through the `Client.channellist` property after this event has fired.
		 */
		channellist( channel_list: IRC.IChannel[] ): void;

		/**
		 * Emitted when the client receives a “message” from the server.
		 * A message is a single line of data from the server.
		 * The message parameter to the callback is the processed version of this message
		 */
		raw( message: IRC.IMessage ): void;

		/**
		 * Emitted whenever the server responds with an error-type message.
		 *
		 * Unhandled messages, although they are shown as errors in the log,
		 * are not emitted using this event: see `unhandled`.
		 */
		error( message: IRC.IMessage ): void;

		/**
		 * Emitted whenever the server responds with a message the bot doesn’t recognize and doesn’t handle.
		 *
		 * This must not be relied on to emit particular event codes,
		 * as the codes the bot does and does not handle can change between minor versions.
		 * It should instead be used as a handler to do something
		 * when the bot does not recognize a message, such as warning a user.
		 */
		unhandled( message: IRC.IMessage ): void;
	}

	export class Client extends IRC.Client {
		public readonly opt: IRC.IClientOpts & {
			server: string;
			nick: string;
		};

		protected out: {
			showErrors: boolean;

			showDebug: boolean;

			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			error( ...args: any[] ): void;

			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			debug( ...args: any[] ): void;
		}

		public on<k extends string>( event: k, listener: Events[ k ] ): this;
		public addListener<k extends string>( event: k, listener: Events[ k ] ): this;

		public once<k extends string>( event: k, listener: Events[ k ] ): this;

		public off<k extends string>( event: k, listener: Events[ k ] ): this;
		public removeListener<k extends string>( event: k, listener: Events[ k ] ): this;

		public conn: net.Socket & {
			renickInterval?: NodeJS.Timer;
			cyclingPingTimer?: CyclingPingTimer;
		};
		public chans: IChans;
		protected prefixForMode: Record<string, string>;
		modeForPrefix: Record<string, string>;
		_whoisData: Record<string, IRC.IWhoisData>;

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
		_addWhoisData( nick: string, key: string, value: IRC.IWhoisData, onlyIfExists: boolean ): void;
		_clearWhoisData( nick: string ): IRC.IWhoisData;
		protected _handleCTCP( from: string, to: string, text: string, type: string, message: IRC.IMessage ): void;
		protected convertEncoding( str: string ): string;
		protected canConvertEncoding(): boolean;
		protected _updateMaxLineLength(): void;
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
