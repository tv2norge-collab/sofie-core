import { Meteor } from 'meteor/meteor'
import { ClientAPI } from '../client'
import {
	BucketAdLibActionId,
	BucketAdLibId,
	BucketId,
	ShowStyleBaseId,
} from '@sofie-automation/corelib/dist/dataModel/Ids'

export interface BucketsRestAPI {
	/**
	 * Get all available Buckets.
	 *
	 * @param connection Connection data including client and header details
	 * @param event User event string
	 * @param inputs Migration data to apply
	 */
	getAllBuckets(
		connection: Meteor.Connection,
		event: string
	): Promise<ClientAPI.ClientResponse<Array<APIBucketComplete>>>

	/**
	 * Get a Bucket.
	 *
	 * @param connection Connection data including client and header details
	 * @param event User event string
	 * @param inputs Migration data to apply
	 */
	getBucket(
		_connection: Meteor.Connection,
		_event: string,
		bucketId: BucketId
	): Promise<ClientAPI.ClientResponse<Array<APIBucketComplete>>>

	/**
	 * Adds a new Bucket, returns the Id of the newly created Bucket.
	 *
	 * @param connection Connection data including client and header details
	 * @param event User event string
	 * @param bucket Bucket to add
	 */
	addBucket(
		connection: Meteor.Connection,
		event: string,
		bucket: APIBucket
	): Promise<ClientAPI.ClientResponse<BucketId>>

	/**
	 * Deletes a Bucket.
	 *
	 * @param connection Connection data including client and header details
	 * @param event User event string
	 * @param bucketId Id of the bucket to delete
	 */
	deleteBucket(
		connection: Meteor.Connection,
		event: string,
		bucketId: BucketId
	): Promise<ClientAPI.ClientResponse<void>>

	/**
	 * Empties a Bucket.
	 *
	 * @param connection Connection data including client and header details
	 * @param event User event string
	 * @param bucketId Id of the bucket to empty
	 */
	emptyBucket(
		connection: Meteor.Connection,
		event: string,
		bucketId: BucketId
	): Promise<ClientAPI.ClientResponse<void>>

	/**
	 * Deletes a Bucket AdLib.
	 *
	 * @param connection Connection data including client and header details
	 * @param event User event string
	 * @param adLibId Id of the bucket adlib to delete
	 */
	deleteBucketAdLib(
		connection: Meteor.Connection,
		event: string,
		adLibId: BucketAdLibId | BucketAdLibActionId
	): Promise<ClientAPI.ClientResponse<void>>

	// /**
	//  * Adds an AdLib to the Bucket, based on an existing adLib.
	//  *
	//  * @param connection Connection data including client and header details
	//  * @param event User event string
	//  * @param bucketId Id of the bucket to delete
	//  * @param sourceAdLibId Id of the bucket adlib to empty
	//  * @param label Custom label for the adlib
	//  */
	// addModifiedAdLibToBucket(
	// 	connection: Meteor.Connection,
	// 	event: string,
	// 	bucketId: BucketId,
	// 	sourceAdLibId: AdLibActionId | RundownBaselineAdLibActionId | PieceId,
	// 	label: string,
	// 	userData?: any | null
	// ): Promise<ClientAPI.ClientResponse<void>>

	/**
	 * Imports a Bucket AdLib.
	 *
	 * @param connection Connection data including client and header details
	 * @param event User event string
	 * @param adLibId Id of the bucket adlib to delete
	 */
	importAdLibToBucket(
		connection: Meteor.Connection,
		event: string,
		bucketId: BucketId,
		showStyleBaseId: ShowStyleBaseId | undefined,
		ingestItem: APIImportAdlib
	): Promise<ClientAPI.ClientResponse<void>>
}

export interface APIBucket {
	name: string
	studioId: string
}

export interface APIBucketComplete extends APIBucket {
	id: string
}

// Based on the IngestAdlib interface
export interface APIImportAdlib {
	externalId: string
	name: string
	payloadType: string
	payload?: unknown

	showStyleBaseId: string
}