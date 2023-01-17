import { ExtendsMap, handlers } from '@app/init';

import { Context, rawmsg, ContextExtra, ContextOptin } from '@app/lib/handlers/Context';
import { MessageHandler } from '@app/lib/handlers/MessageHandler';
import { getUIDFromContext, parseUID } from '@app/lib/message';

let clientFullNames: Record<string, string> = {};

export interface BridgeMsgOptin<rawdata extends rawmsg> extends ContextOptin<rawdata> {
	plainText?: boolean;
	isNotice?: boolean;
	from_uid?: string;
	to_uid?: string;
	rawFrom?: string;
	rawTo?: string;
}

export class BridgeMsg<R extends rawmsg = rawmsg> extends Context<R> implements BridgeMsgOptin<R> {
	readonly rawFrom: string;
	readonly rawTo: string;

	private __from: string = null;
	get from(): string {
		return this.__from;
	}
	set from( f: string ) {
		this.__from = String( f );
		this._from_uid = `${ ( this._from_client || '' ).toLowerCase() }/${ f }`;
	}

	private __to: string = null;
	get to(): string {
		return this.__to;
	}
	set to( f: string ) {
		this.__to = String( f );
		this._to_uid = `${ ( this._to_client || '' ).toLowerCase() }/${ f }`;
	}

	private _from_client: string;
	private _to_client: string;

	private _from_uid: string;
	get from_uid(): string {
		return this._from_uid;
	}
	set from_uid( u: string ) {
		const { client, id, uid } = BridgeMsg.parseUID( u );
		this.__from = id;
		this._from_uid = uid;
		this._from_client = client;
	}

	private _to_uid: string;
	get to_uid(): string {
		return this._to_uid;
	}
	set to_uid( u: string ) {
		const { client, id, uid } = BridgeMsg.parseUID( u );
		this.__to = id;
		this._to_uid = uid;
		this._to_client = client;
	}

	extra: ContextExtra & {
		plainText?: boolean;
		isNotice?: boolean;
	};

	constructor( context: BridgeMsg<R> | Context<R> | BridgeMsgOptin<R>, overrides: BridgeMsgOptin<R> = {} ) {
		super( context, overrides );

		const that = Object.assign( {}, context instanceof Context ? {} : context, overrides );

		this._from_client = this._to_client = this.handler.type;

		this.__from = String( context.from || this._from || super._from );
		this.__to = String( context.to || this._from || super._to );

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

	// eslint-disable-next-line no-shadow
	static setHandlers( handlers: ExtendsMap<string, MessageHandler, handlers> ): void {
		// 取得用戶端簡稱所對應的全稱
		clientFullNames = {};
		for ( const [ type, handler ] of handlers ) {
			clientFullNames[ handler.id.toLowerCase() ] = type;
			clientFullNames[ type.toLowerCase() ] = type;
		}
	}

	static parseUID = parseUID;

	static getUIDFromContext = getUIDFromContext;

	static botReply<T extends rawmsg>( context: Context<T>, config: BridgeMsgOptin<T> ): BridgeMsg<null>;
	static botReply( context: Context, config: BridgeMsgOptin<rawmsg> ): BridgeMsg {
		const brigdmsg: BridgeMsg = new BridgeMsg( context, config );

		brigdmsg.extra.reply = {
			id: brigdmsg.from,
			nick: brigdmsg.nick,
			message: brigdmsg.text,
			username: brigdmsg.extra.username,
			isText: !brigdmsg.extra.isImage,
			discriminator: brigdmsg.extra.discriminator,
			_rawdata: brigdmsg._rawdata
		};
		delete brigdmsg._rawdata;

		if ( brigdmsg.extra.discriminator ) {
			brigdmsg.extra.reply.discriminator = brigdmsg.extra.discriminator;
		}

		return brigdmsg;
	}
}
