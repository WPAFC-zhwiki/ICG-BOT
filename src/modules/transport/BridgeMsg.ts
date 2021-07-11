import { ExtendsMap, handlers } from '../../init';
import { Context, extra, optin } from '../../lib/handlers/Context';
import { MessageHandler } from '../../lib/handlers/MessageHandler';

let clientFullNames = {};

type BridgeMsgOptin = optin & extra & {
	noPrefix?: boolean;
	isNotice?: boolean;
	from_uid?: string;
	to_uid?: string;
	rawFrom?: string;
	rawTo?: string;
}

export class BridgeMsg extends Context {
	private _isNotice: boolean;
	get isNotice(): boolean {
		return this._isNotice;
	}

	private _noPrefix = false;
	get noPrefix(): boolean {
		return this._noPrefix;
	}
	set noPrefix( f: boolean ) {
		this._noPrefix = !!f;
	}

	readonly rawFrom: string;
	readonly rawTo: string;

	set from( f: string ) {
		this._from = String( f );
		this._from_uid = `${ ( this._from_client || '' ).toLowerCase() }/${ f }`;
	}

	set to( f: string ) {
		this._to = String( f );
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
		this._from = id;
		this._from_uid = uid;
		this._from_client = client;
	}

	private _to_uid: string;
	get to_uid(): string {
		return this._to_uid;
	}
	set to_uid( u: string ) {
		const { client, id, uid } = BridgeMsg.parseUID( u );
		this._to = id;
		this._to_uid = uid;
		this._to_client = client;
	}

	extra: extra & {
		noPrefix?: boolean;
		isNotice?: boolean;
	};

	constructor( context: Context | BridgeMsgOptin, overrides: BridgeMsgOptin = {} ) {
		super( context, overrides );

		this._isNotice = false;

		this.from = this._from;
		this.to = this._to;

		this._from_client = this._to_client = this.handler.type;

		this.rawFrom = overrides.rawFrom || `${ this._from_client }/${ this._from }`;
		this.rawTo = overrides.rawTo || `${ this._to_client }/${ this._to }`;

		if ( overrides.from_uid !== undefined ) {
			this.from_uid = overrides.from_uid;
		} else {
			this.from_uid = this.rawFrom;
		}

		if ( overrides.to_uid !== undefined ) {
			this.to_uid = overrides.to_uid;
		} else {
			this.to_uid = this.rawTo;
		}

		if ( overrides.noPrefix ) {
			this._noPrefix = true;
			this.extra.noPrefix = true;
		} else {
			this._noPrefix = false;
			this.extra.noPrefix = false;
		}

		if ( overrides.isNotice ) {
			this._isNotice = true;
			this.extra.isNotice = true;
		} else {
			this._isNotice = false;
			this.extra.isNotice = false;
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

	static parseUID( u: string ): {
		client: string,
		id: string,
		uid: string
	} {
		let client: string = null, id: string = null, uid: string = null;
		if ( u ) {
			const s = u.toString();
			const i = s.indexOf( '/' );

			if ( i !== -1 ) {
				client = s.substr( 0, i ).toLowerCase();
				if ( clientFullNames[ client ] ) {
					client = clientFullNames[ client ];
				}

				id = s.substr( i + 1 );
				uid = `${ client.toLowerCase() }/${ id }`;
			}
		}
		return { client, id, uid };
	}

	static getUIDFromContext( context: Context | BridgeMsg, id: string | number ): string | null {
		if ( !context.handler ) {
			return null;
		}

		return `${ context.handler.type.toLowerCase() }/${ id }`;
	}
}
