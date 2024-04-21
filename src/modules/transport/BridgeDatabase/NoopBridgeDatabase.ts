import type { MessageAssociation } from '@app/config';

import { AbstractBridgeDatabase } from '@app/modules/transport/BridgeDatabase/AbstractBridgeDatabase';

let instance: NoopBridgeDatabase;

export class NoopBridgeDatabase extends AbstractBridgeDatabase<MessageAssociation.MessageAssociationNoop> {
	private constructor() {
		super( '' );
	}

	static getInstance() {
		if ( !instance ) {
			instance = new this();
		}
		return instance;
	}

	start() {
		return Promise.resolve();
	}

	stop() {
		return Promise.resolve();
	}

	getMessageAssociation(): Promise<false> {
		return Promise.resolve( false );
	}

	setMessageAssociation(): Promise<false> {
		return Promise.resolve( false );
	}
}
