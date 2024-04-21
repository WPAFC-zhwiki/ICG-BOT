import assert from 'node:assert';

import { MessageAssociation } from '@app/config';
import { Manager } from '@app/init';

type CMessageAssociationBase = MessageAssociation.MessageAssociationBase;

export const associateMessageUsefulClients = [ 'Telegram', 'Discord' ];
export type AssociateMessage = { client: string, chatId: string | number, messageId: string | number }[];

export abstract class AbstractBridgeDatabase<C extends CMessageAssociationBase = CMessageAssociationBase> {
	protected _config: C;
	protected constructor( type: C[ 'type' ] ) {
		this._config = Manager.config.transport.messageAssociation as CMessageAssociationBase as C;
		if ( type ) {
			assert.strictEqual( type, this._config.type );
		}
	}

	abstract start(): Promise<unknown>;

	abstract stop(): Promise<unknown>;

	abstract getMessageAssociation(
		targetClient: string,
		chatId: string | number,
		messageId: string | number
	): Promise<AssociateMessage | false>;

	abstract setMessageAssociation( association: AssociateMessage ): Promise<boolean>;
}
