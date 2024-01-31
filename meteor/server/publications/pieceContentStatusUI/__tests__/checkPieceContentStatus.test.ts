import {
	buildFormatString,
	acceptFormat,
	getAcceptedFormats,
	getMediaObjectMediaId,
	PieceContentStreamInfo,
	checkPieceContentStatusAndDependencies,
} from '../checkPieceContentStatus'
import {
	PackageInfo,
	WithTimeline,
	ISourceLayer,
	SourceLayerType,
	IBlueprintPieceGeneric,
	PieceLifespan,
	VTContent,
} from '@sofie-automation/blueprints-integration'
import { Complete, literal } from '@sofie-automation/corelib/dist/lib'
import { MongoMock } from '../../../../__mocks__/mongo'
import {
	PieceGeneric,
	PieceStatusCode,
	EmptyPieceTimelineObjectsBlob,
} from '@sofie-automation/corelib/dist/dataModel/Piece'
import { IStudioSettings } from '@sofie-automation/corelib/dist/dataModel/Studio'
import { protectString } from '@sofie-automation/corelib/dist/protectedString'
import { applyAndValidateOverrides } from '@sofie-automation/corelib/dist/settings/objectWithOverrides'
import {
	MediaObject,
	MediaInfo,
	MediaStream,
	MediaStreamType,
} from '@sofie-automation/shared-lib/dist/core/model/MediaObjects'
import { UIStudio } from '../../../../lib/api/studios'
import { defaultStudio } from '../../../../__mocks__/defaultCollectionObjects'
import { testInFiber } from '../../../../__mocks__/helpers/jest'
import { MediaObjects } from '../../../collections'
import { PieceDependencies } from '../common'
import { Studio } from '../../../../lib/collections/Studios'
import { DEFAULT_MINIMUM_TAKE_SPAN } from '@sofie-automation/shared-lib/dist/core/constants'

const mockMediaObjectsCollection = MongoMock.getInnerMockCollection<MediaObject>(MediaObjects)

describe('lib/mediaObjects', () => {
	test('buildFormatString', () => {
		const format1 = buildFormatString(
			PackageInfo.FieldOrder.TFF,
			literal<PieceContentStreamInfo>({
				width: 1920,
				height: 1080,
				codec_time_base: '1/25',
			})
		)
		expect(format1).toEqual('1920x1080i2500tff')

		const format2 = buildFormatString(
			PackageInfo.FieldOrder.Progressive,

			literal<PieceContentStreamInfo>({
				width: 1280,
				height: 720,
				codec_time_base: '1001/60000',
			})
		)
		expect(format2).toEqual('1280x720p5994')

		const format3 = buildFormatString(
			PackageInfo.FieldOrder.BFF,
			literal<PieceContentStreamInfo>({
				width: 720,
				height: 576,
				codec_time_base: '1/25',
			})
		)
		expect(format3).toEqual('720x576i2500bff')
	})

	test('acceptFormat', () => {
		const accepted1 = acceptFormat('1920x1080i2500tff', [['1920', '1080', 'i', '2500', 'tff']])
		expect(accepted1).toEqual(true)

		const accepted2 = acceptFormat('1920x1080i2500tff', [['1280', '720', 'p', '2500']])
		expect(accepted2).toEqual(false)
	})

	test('getAcceptedFormats', () => {
		const acceptedFormats = getAcceptedFormats({
			supportedMediaFormats: '1920x1080i5000, 1280x720, i5000, i5000tff',
			mediaPreviewsUrl: '',
			frameRate: 25,
			minimumTakeSpan: DEFAULT_MINIMUM_TAKE_SPAN,
		})
		expect(acceptedFormats).toEqual([
			['1920', '1080', 'i', '5000', undefined],
			['1280', '720', undefined, undefined, undefined],
			[undefined, undefined, 'i', '5000', undefined],
			[undefined, undefined, 'i', '5000', 'tff'],
		])
	})

	test('getMediaObjectMediaId', () => {
		const mediaId1 = getMediaObjectMediaId(
			literal<IBlueprintPieceGeneric>({
				externalId: '',
				name: '',
				sourceLayerId: '',
				outputLayerId: '',
				content: literal<WithTimeline<VTContent>>({
					fileName: 'test',
					path: '',
					timelineObjects: [],
				}),
				lifespan: PieceLifespan.WithinPart,
			}),
			literal<ISourceLayer>({
				_id: '',
				_rank: 0,
				name: '',
				type: SourceLayerType.VT,
			})
		)
		expect(mediaId1).toEqual('TEST')

		const mediaId2 = getMediaObjectMediaId(
			literal<IBlueprintPieceGeneric>({
				externalId: '',
				name: '',
				sourceLayerId: '',
				outputLayerId: '',
				content: literal<WithTimeline<VTContent>>({
					fileName: 'TEST',
					path: '',
					timelineObjects: [],
				}),
				lifespan: PieceLifespan.WithinPart,
			}),
			literal<ISourceLayer>({
				_id: '',
				_rank: 0,
				name: '',
				type: SourceLayerType.SCRIPT,
			})
		)
		expect(mediaId2).toEqual(undefined)

		const mediaId3 = getMediaObjectMediaId(
			literal<IBlueprintPieceGeneric>({
				externalId: '',
				name: '',
				sourceLayerId: '',
				outputLayerId: '',
				content: {
					timelineObjects: [],
				},
				lifespan: PieceLifespan.WithinPart,
			}),
			literal<ISourceLayer>({
				_id: '',
				_rank: 0,
				name: '',
				type: SourceLayerType.LIVE_SPEAK,
			})
		)
		expect(mediaId3).toEqual(undefined)
	})

	testInFiber('checkPieceContentStatus', async () => {
		const mockStudioSettings: IStudioSettings = {
			supportedMediaFormats: '1920x1080i5000, 1280x720, i5000, i5000tff',
			mediaPreviewsUrl: '',
			supportedAudioStreams: '4',
			frameRate: 25,
			minimumTakeSpan: DEFAULT_MINIMUM_TAKE_SPAN,
		}

		const mockDefaultStudio = defaultStudio(protectString('studio0'))
		const mockStudio: Complete<
			Pick<
				Studio,
				'_id' | 'settings' | 'packageContainers' | 'previewContainerIds' | 'thumbnailContainerIds' | 'routeSets'
			> &
				Pick<UIStudio, 'mappings'>
		> = {
			_id: mockDefaultStudio._id,
			settings: mockStudioSettings,
			packageContainers: mockDefaultStudio.packageContainers,
			previewContainerIds: ['previews0'],
			thumbnailContainerIds: ['thumbnails0'],
			routeSets: mockDefaultStudio.routeSets,
			mappings: applyAndValidateOverrides(mockDefaultStudio.mappingsWithOverrides).obj,
		}

		mockMediaObjectsCollection.insert(
			literal<MediaObject>({
				_id: protectString(''),
				_attachments: {},
				_rev: '',
				cinf: '',
				collectionId: 'studio0',
				mediaId: 'TEST_FILE',
				mediaPath: '',
				mediaSize: 0,
				mediaTime: 0,
				mediainfo: literal<MediaInfo>({
					name: 'test_file',
					field_order: PackageInfo.FieldOrder.TFF,
					streams: [
						literal<MediaStream>({
							width: 1920,
							height: 1080,
							codec: {
								type: MediaStreamType.Video,
								time_base: '1/50',
							},
						}),
						literal<MediaStream>({
							channels: 1,
							codec: {
								type: MediaStreamType.Audio,
								time_base: '1/25',
							},
						}),
						literal<MediaStream>({
							channels: 1,
							codec: {
								type: MediaStreamType.Audio,
								time_base: '1/25',
							},
						}),
						literal<MediaStream>({
							channels: 1,
							codec: {
								type: MediaStreamType.Audio,
								time_base: '1/25',
							},
						}),
						literal<MediaStream>({
							channels: 1,
							codec: {
								type: MediaStreamType.Audio,
								time_base: '1/25',
							},
						}),
					],
				}),
				objId: '',
				previewPath: '',
				previewSize: 0,
				previewTime: 0,
				studioId: protectString('studio0'),
				thumbSize: 0,
				thumbTime: 0,
				tinf: '',
			})
		)

		const piece1 = literal<PieceGeneric>({
			_id: protectString('piece1'),
			name: 'Test_file',
			prerollDuration: 0,
			externalId: '',
			lifespan: PieceLifespan.WithinPart,
			privateData: {},
			outputLayerId: '',
			sourceLayerId: '',
			content: literal<VTContent>({
				fileName: 'test_file',
				path: '',
			}),
			timelineObjectsString: EmptyPieceTimelineObjectsBlob,
		})

		const sourcelayer1 = literal<ISourceLayer>({
			_id: '',
			_rank: 0,
			name: '',
			type: SourceLayerType.LIVE_SPEAK,
		})

		mockMediaObjectsCollection.insert(
			literal<MediaObject>({
				_id: protectString(''),
				_attachments: {},
				_rev: '',
				cinf: '',
				collectionId: 'studio0',
				mediaId: 'TEST_FILE_2',
				mediaPath: '',
				mediaSize: 0,
				mediaTime: 0,
				mediainfo: literal<MediaInfo>({
					name: 'test_file_2',
					field_order: PackageInfo.FieldOrder.Progressive,
					streams: [
						literal<MediaStream>({
							width: 1920,
							height: 1080,
							codec: {
								type: MediaStreamType.Video,
								time_base: '1/50',
							},
						}),
						literal<MediaStream>({
							channels: 1,
							codec: {
								type: MediaStreamType.Audio,
								time_base: '1/25',
							},
						}),
						literal<MediaStream>({
							channels: 1,
							codec: {
								type: MediaStreamType.Audio,
								time_base: '1/25',
							},
						}),
						literal<MediaStream>({
							channels: 1,
							codec: {
								type: MediaStreamType.Audio,
								time_base: '1/25',
							},
						}),
						literal<MediaStream>({
							channels: 1,
							codec: {
								type: MediaStreamType.Audio,
								time_base: '1/25',
							},
						}),
					],
				}),
				objId: '',
				previewPath: '',
				previewSize: 0,
				previewTime: 0,
				studioId: protectString('studio0'),
				thumbSize: 0,
				thumbTime: 0,
				tinf: '',
			})
		)

		const piece2 = literal<PieceGeneric>({
			_id: protectString('piece2'),
			name: 'Test_file_2',
			prerollDuration: 0,
			externalId: '',
			lifespan: PieceLifespan.WithinPart,
			privateData: {},
			outputLayerId: '',
			sourceLayerId: '',
			content: literal<VTContent>({
				fileName: 'test_file_2',
				path: '',
			}),
			timelineObjectsString: EmptyPieceTimelineObjectsBlob,
		})

		const piece3 = literal<PieceGeneric>({
			_id: protectString('piece3'),
			name: 'Test_file_3',
			prerollDuration: 0,
			externalId: '',
			lifespan: PieceLifespan.WithinPart,
			privateData: {},
			outputLayerId: '',
			sourceLayerId: '',
			content: literal<VTContent>({
				fileName: 'test_file_3',
				path: '',
			}),
			timelineObjectsString: EmptyPieceTimelineObjectsBlob,
		})

		const status1 = await checkPieceContentStatusAndDependencies(mockStudio, piece1, sourcelayer1)
		expect(status1[0].status).toEqual(PieceStatusCode.OK)
		expect(status1[0].messages).toHaveLength(0)
		expect(status1[1]).toMatchObject(
			literal<PieceDependencies>({
				mediaObjects: ['TEST_FILE'],
				packageInfos: [],
				packageContainerPackageStatuses: [],
			})
		)

		const status2 = await checkPieceContentStatusAndDependencies(mockStudio, piece2, sourcelayer1)
		expect(status2[0].status).toEqual(PieceStatusCode.SOURCE_BROKEN)
		expect(status2[0].messages).toHaveLength(1)
		expect(status2[0].messages[0]).toMatchObject({
			key: '{{sourceLayer}} has the wrong format: {{format}}',
		})
		expect(status2[1]).toMatchObject(
			literal<PieceDependencies>({
				mediaObjects: ['TEST_FILE_2'],
				packageInfos: [],
				packageContainerPackageStatuses: [],
			})
		)

		const status3 = await checkPieceContentStatusAndDependencies(mockStudio, piece3, sourcelayer1)
		expect(status3[0].status).toEqual(PieceStatusCode.SOURCE_MISSING)
		expect(status3[0].messages).toHaveLength(1)
		expect(status3[0].messages[0]).toMatchObject({
			key: '{{sourceLayer}} is not yet ready on the playout system',
		})
		expect(status3[1]).toMatchObject(
			literal<PieceDependencies>({
				mediaObjects: ['TEST_FILE_3'],
				packageInfos: [],
				packageContainerPackageStatuses: [],
			})
		)
	})
})
