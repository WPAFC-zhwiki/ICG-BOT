import { ExtendsMap, handlers } from '@app/init.mjs';

import { Context, RawMessage, ContextExtra, ContextOptions } from '@app/lib/handlers/Context.mjs';
import { MessageHandler } from '@app/lib/handlers/MessageHandler.mjs';
import { getUIDFromContext, parseUID } from '@app/lib/message.mjs';

let clientFullNames: Record<string, string> = {};

export interface BridgeMessageOptions<rawData extends RawMessage> extends ContextOptions<rawData> {
	plainText?: boolean;
	isNotice?: boolean;
	from_uid?: string;
	to_uid?: string;
	rawFrom?: string;
	rawTo?: string;
}

export class BridgeMessage<R extends RawMessage = RawMessage> extends Context<R> implements BridgeMessageOptions<R> {
	public readonly rawFrom: string;
	public readonly rawTo: string;

	private __from: string = undefined;
	public get from(): string {
		return this.__from;
	}
	public set from( f: string ) {
		this.__from = String( f );
		this._from_uid = `${ ( this._from_client || '' ).toLowerCase() }/${ f }`;
	}

	private __to: string = undefined;
	public get to(): string {
		return this.__to;
	}
	public set to( f: string ) {
		this.__to = String( f );
		this._to_uid = `${ ( this._to_client || '' ).toLowerCase() }/${ f }`;
	}

	private _from_client: string;
	private _to_client: string;

	private _from_uid: string;
	public get from_uid(): string {
		return this._from_uid;
	}
	public set from_uid( u: string ) {
		const { client, id, uid } = BridgeMessage.parseUID( u );
		this.__from = id;
		this._from_uid = uid;
		this._from_client = client;
	}

	private _to_uid: string;
	public get to_uid(): string {
		return this._to_uid;
	}
	public set to_uid( u: string ) {
		const { client, id, uid } = BridgeMessage.parseUID( u );
		this.__to = id;
		this._to_uid = uid;
		this._to_client = client;
	}

	public declare extra: ContextExtra & {
		plainText?: boolean;
		isNotice?: boolean;
	};

	public constructor(
		context: BridgeMessage<R> | Context<R> | BridgeMessageOptions<R>,
		overrides: BridgeMessageOptions<R> = {}
	) {
		super( context, overrides );

		const that = Object.assign( {}, context instanceof Context ? {} : context, overrides );

		this._from_client = this._to_client = this.handler.type;

		this.__from = String( context.from || this._from );
		this.__to = String( context.to || this._from );

		this.rawFrom = overrides.rawFrom || `${ this._from_client }/${ this.__from }`;
		this.rawTo = overrides.rawTo || `${ this._to_client }/${ this.__to }`;

		this.from_uid = Context.getArgument( overrides.from_uid, this.rawFrom );
		this.to_uid = Context.getArgument( overrides.to_uid, this.rawTo );

		if ( Object.prototype.hasOwnProperty.call( that, 'plainText' ) ) {
			this.extra.plainText = !!that.plainText;
		}

		if ( Object.prototype.hasOwnProperty.call( that, 'isNotice' ) ) {
			this.extra.isNotice = !!that.isNotice;
		}
	}

	public static setHandlers( handlers: ExtendsMap<string, MessageHandler, handlers> ): void {
		// 取得用戶端簡稱所對應的全稱
		clientFullNames = {};
		for ( const [ type, handler ] of handlers ) {
			clientFullNames[ handler.id.toLowerCase() ] = type;
			clientFullNames[ type.toLowerCase() ] = type;
		}
	}

	public static parseUID = parseUID;

	public static getUIDFromContext = getUIDFromContext;

	public static botReply<T extends RawMessage>(
		context: Context<T>,
		config: BridgeMessageOptions<T>
	): BridgeMessage<null>;
	public static botReply( context: Context, config: BridgeMessageOptions<RawMessage> ): BridgeMessage {
		const bridgeMessage: BridgeMessage = new BridgeMessage( context, config );

		bridgeMessage.extra.reply = {
			origClient: context.handler.type,
			origChatId: context.to,
			origMessageId: context.programMessageId,
			id: bridgeMessage.from,
			nick: bridgeMessage.nick,
			message: bridgeMessage.text,
			username: bridgeMessage.extra.username,
			isText: !bridgeMessage.extra.isImage,
			discriminator: bridgeMessage.extra.discriminator,
			_rawData: bridgeMessage._rawData,
		};
		delete bridgeMessage._rawData;

		if ( bridgeMessage.extra.discriminator ) {
			bridgeMessage.extra.reply.discriminator = bridgeMessage.extra.discriminator;
		}

		return bridgeMessage;
	}
}
