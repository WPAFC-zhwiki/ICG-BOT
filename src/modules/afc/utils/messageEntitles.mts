import type * as TT from '@telegraf/types';
import { cloneDeep } from 'lodash-es';
import type * as TGT from 'telegraf/types';

type ApiParameters<T extends keyof TGT.Telegram> = Parameters<TGT.Telegram[T]>[0];

export type PartialEntity<E extends TT.MessageEntity = TT.MessageEntity> = Omit<
	E,
	'offset' | 'length'
>;
export type TPartialEntity =
	| PartialEntity<TT.MessageEntity.CommonMessageEntity>
	| PartialEntity<TT.MessageEntity.CustomEmojiMessageEntity>
	| PartialEntity<TT.MessageEntity.PreMessageEntity>
	| PartialEntity<TT.MessageEntity.TextLinkMessageEntity>
	| PartialEntity<TT.MessageEntity.TextMentionMessageEntity>;
export type EntityItem = { text: string; entity?: TPartialEntity };

export function entitiesJoin(
	entities: ( EntityItem | EntityItem[] )[],
	separator: EntityItem
): EntityItem[] {
	const result: EntityItem[] = [];
	for ( const [ index, entity ] of entities.entries() ) {
		if ( index > 0 ) {
			result.push( cloneDeep( separator ) );
		}
		if ( Array.isArray( entity ) ) {
			result.push( ...entity );
		} else {
			result.push( entity );
		}
	}
	return result;
}

export class EntitiesFactory {
	#output = '';
	#entities: TT.MessageEntity[] = [];
	#parent?: EntitiesFactory;

	public addText( text: string ): this {
		this.#output += text;
		return this;
	}

	public addTextEntity( text: string, entity: TPartialEntity ): this {
		text = String( text );
		if ( text.length > 0 ) {
			this.#entities.push( {
				...entity,
				offset: this.#output.length,
				length: text.length,
			} );
			this.#output += text;
		}
		return this;
	}

	public addTextEntities( text: string, entities: TPartialEntity[] ): this {
		for ( const entity of entities ) {
			this.#entities.push( {
				...entity,
				offset: this.#output.length,
				length: text.length,
			} as TT.MessageEntity );
		}
		this.#output += text;
		return this;
	}

	public addTextEntityList( items: EntityItem[] ): this {
		for ( const { text, entity } of items ) {
			if ( entity ) {
				this.addTextEntity( text, entity );
			} else {
				this.#output += text;
			}
		}
		return this;
	}

	public getTextOutput(): Pick<ApiParameters<'sendMessage'>, 'text' | 'entities'> {
		return {
			text: this.#output,
			entities: this.#entities,
		};
	}

	public getCaptionOutput(): Pick<
		ApiParameters<'sendDocument'>,
        'caption' | 'caption_entities'
	> {
		return {
			caption: this.#output,
			caption_entities: this.#entities as TT.MessageEntity[],
		};
	}

	public sortEntities() {
		this.#entities.sort( ( a, b ) => a.offset - b.offset || a.length - b.length );
		return this;
	}

	public trimEnd(): this {
		const beforeTrimLength = this.#output.length;
		this.#output = this.#output.trimEnd();
		const afterTrimLength = this.#output.length;
		if ( beforeTrimLength > afterTrimLength ) {
			this.sortEntities();
			for ( const [ index, entity ] of this.#entities.entries() ) {
				if ( entity.offset >= afterTrimLength ) {
					// 排序過後 後面的 offset 一定大於等於當前值 故全部丟棄
					this.#entities.splice( index );
					break;
				} else if ( entity.offset + entity.length > afterTrimLength ) {
					entity.length = afterTrimLength - entity.offset;
				}
			}
		}
		return this;
	}

	public clone(): EntitiesFactory {
		const instance = new EntitiesFactory();
		instance.#output = this.#output;
		instance.#entities = cloneDeep( this.#entities );
		return instance;
	}

	public fork(): EntitiesFactory {
		const instance = new EntitiesFactory();
		instance.#parent = this;
		return instance;
	}

	public merge( wrapper: TPartialEntity[] = [] ): void {
		if ( !this.#parent ) {
			throw new Error( 'Not a fork or already merged.' );
		}
		const parentLengthBeforeMerge = this.#parent.#output.length;
		this.#parent.#output += this.#output;
		this.#parent.#entities.push(
			...wrapper.map( ( entity ) => ( {
				...entity,
				offset: parentLengthBeforeMerge,
				length: this.#output.length,
			} ) ),
			...this.#entities.map( ( entity ) => ( {
				...entity,
				offset: entity.offset + parentLengthBeforeMerge,
			} ) )
		);
		this.#parent = undefined;
	}
}

function escapeTag( input: string ) {
	// return input.replace(/[^\p{L}\p{N}_]/gu, "");
	return input
		.replaceAll( /["'′]/g, '' ) // It's => Its
		.split( /[^\p{L}\p{N}_]/gu )
		.join( '' );
}

export class TextMessage {
	#entities: EntitiesFactory;
	#tags: string[] = [];
	public linkPreviewOptions?: TT.LinkPreviewOptions;

	public constructor( entities?: EntitiesFactory ) {
		this.#entities = entities || new EntitiesFactory();
	}

	public addText(
		...args: Parameters<EntitiesFactory['addText']>
	): this {
		this.#entities.addText( ...args );
		return this;
	}

	public addTextEntity( ...args: Parameters<EntitiesFactory['addTextEntity']> ): this {
		this.#entities.addTextEntity( ...args );
		return this;
	}

	public addTextEntities(
		...args: Parameters<EntitiesFactory['addTextEntities']>
	): this {
		this.#entities.addTextEntities( ...args );
		return this;
	}

	public addTextEntityList(
		...args: Parameters<EntitiesFactory['addTextEntityList']>
	): this {
		this.#entities.addTextEntityList( ...args );
		return this;
	}

	public clone(): TextMessage {
		return new TextMessage( this.#entities.clone() );
	}

	public get entities(): EntitiesFactory {
		return this.#entities;
	}

	public get tags(): string[] {
		return [ ...this.#tags ];
	}

	public addTags( ...tags: string[] ) {
		this.#tags.push( ...tags );
		return this;
	}

	public getOutput(): Pick<ApiParameters<'sendMessage'>, 'text' | 'entities' | 'link_preview_options'> {
		const entities = this.entities.clone();

		if ( this.tags.length > 0 ) {
			entities.trimEnd().addText( '\n\n' );

			for ( const tag of this.tags ) {
				entities
					.addTextEntity( `#${ escapeTag( tag ) }`, { type: 'hashtag' } )
					.addText( ' ' );
			}

		}

		entities.trimEnd();

		return {
			...entities.getTextOutput(),
			link_preview_options: this.linkPreviewOptions,
		};
	}
}
