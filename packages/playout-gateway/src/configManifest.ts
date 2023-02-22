import {
	DeviceConfigManifest,
	ConfigManifestEntryType,
	SubDeviceConfigManifest,
	MappingsManifest,
	ConfigManifestEntry,
} from '@sofie-automation/server-core-integration'
import {
	DeviceType as TSRDeviceType,
	AtemMediaPoolType,
	TimelineContentTypeHTTP,
	LawoDeviceMode,
	OSCDeviceType,
	MappingAtemType,
	MappingHyperdeckType,
	MappingLawoType,
	MappingPanasonicPtzType,
	MappingSisyfosType,
	QuantelControlMode,
	MappingVMixType,
	MappingOBSType,
} from 'timeline-state-resolver'

const PLAYOUT_SUBDEVICE_COMMON: ConfigManifestEntry[] = [
	{
		id: 'debug',
		name: 'Activate debug logging for device',
		type: ConfigManifestEntryType.BOOLEAN,
	},
	{
		id: 'disable',
		name: 'Disable',
		type: ConfigManifestEntryType.BOOLEAN,
	},
	{
		id: 'threadUsage',
		name: 'Thread Usage',
		type: ConfigManifestEntryType.FLOAT,
	},
]
const PLAYOUT_SUBDEVICE_HOST: ConfigManifestEntry[] = [
	{
		id: 'options.host',
		name: 'Host',
		type: ConfigManifestEntryType.STRING,
	},
]
const PLAYOUT_SUBDEVICE_HOST_PORT: ConfigManifestEntry[] = [
	...PLAYOUT_SUBDEVICE_HOST,
	{
		id: 'options.port',
		name: 'Port',
		type: ConfigManifestEntryType.INT,
	},
]

type ImplementedSubDeviceConfig = Pick<SubDeviceConfigManifest['config'], TSRDeviceType>

const PLAYOUT_SUBDEVICE_CONFIG: ImplementedSubDeviceConfig = {
	[TSRDeviceType.ABSTRACT]: [...PLAYOUT_SUBDEVICE_COMMON],
	[TSRDeviceType.CASPARCG]: [
		...PLAYOUT_SUBDEVICE_COMMON,
		...PLAYOUT_SUBDEVICE_HOST_PORT,
		{
			id: 'options.launcherHost',
			name: 'Launcher Host',
			type: ConfigManifestEntryType.STRING,
		},
		{
			id: 'options.launcherPort',
			name: 'Launcher Port',
			type: ConfigManifestEntryType.INT,
		},
		{
			id: 'options.fps',
			name: 'Frame rate',
			type: ConfigManifestEntryType.FLOAT,
		},
		{
			id: 'options.retryInterval',
			name: 'Retry interval',
			hint: 'Time between retries for media that could not be loaded on first try. Set to -1 to disable.',
			type: ConfigManifestEntryType.INT,
		},
		{
			id: 'options.retryInterval',
			name: 'Media retry interval (ms), -1 disables, 0 default',
			type: ConfigManifestEntryType.INT,
		},
	],
	[TSRDeviceType.ATEM]: [
		...PLAYOUT_SUBDEVICE_COMMON,
		...PLAYOUT_SUBDEVICE_HOST_PORT,
		{
			id: 'options.mediaPoolAssets',
			name: 'Media Pool Assets',
			type: ConfigManifestEntryType.TABLE,
			defaultType: 'default',
			config: {
				default: [
					{
						id: 'path',
						name: 'Path',
						columnName: 'File Path',
						type: ConfigManifestEntryType.STRING,
						defaultVal: '',
					},
					{
						id: 'type',
						name: 'Type',
						columnName: 'Type',
						defaultVal: AtemMediaPoolType.Still,
						type: ConfigManifestEntryType.ENUM,
						values: AtemMediaPoolType,
					},
					{
						id: 'position',
						name: 'Position',
						type: ConfigManifestEntryType.INT,
						defaultVal: 0,
					},
				],
			},
		},
	],
	[TSRDeviceType.LAWO]: [
		...PLAYOUT_SUBDEVICE_COMMON,
		...PLAYOUT_SUBDEVICE_HOST_PORT,
		{
			id: 'options.deviceMode',
			name: 'Device Mode',
			type: ConfigManifestEntryType.ENUM,
			values: LawoDeviceMode,
			defaultVal: 1,
		},
		{
			id: 'options.faderInterval',
			name: 'Fader setValue Interval',
			type: ConfigManifestEntryType.STRING,
		},
		{
			id: 'options.sourcesPath',
			name: 'Sources Path',
			type: ConfigManifestEntryType.STRING,
		},
		{
			id: 'options.dbPropertiesName',
			name: 'dB Property Path',
			type: ConfigManifestEntryType.STRING,
		},
		{
			id: 'options.rampMotorFunctionPath',
			name: 'Ramp Motor Function Path',
			type: ConfigManifestEntryType.STRING,
		},
		{
			id: 'options.faderThreshold',
			name: 'Fader cutoff value',
			type: ConfigManifestEntryType.INT,
			placeholder: '-60',
		},
	],
	[TSRDeviceType.HTTPSEND]: [
		...PLAYOUT_SUBDEVICE_COMMON,
		{
			id: 'options.makeReadyDoesReset',
			name: 'Whether Make Ready triggers a state reset',
			type: ConfigManifestEntryType.BOOLEAN,
		},
		{
			id: 'options.resendTime',
			name: 'Resend time in ms',
			hint: 'Minimum time in ms before a command is resent, set to a number > 0 to enable',
			type: ConfigManifestEntryType.INT,
		},
		{
			id: 'options.makeReadyCommands',
			name: 'Make Ready Commands',
			type: ConfigManifestEntryType.TABLE,
			defaultType: 'default',
			config: {
				default: [
					{
						id: 'url',
						name: 'URL',
						columnName: 'URL',
						type: ConfigManifestEntryType.STRING,
					},
					{
						id: 'type',
						name: 'Type',
						columnName: 'Type',
						defaultVal: TimelineContentTypeHTTP.GET,
						type: ConfigManifestEntryType.ENUM,
						values: TimelineContentTypeHTTP,
					},
					{
						id: 'params',
						name: 'Parameters',
						type: ConfigManifestEntryType.OBJECT,
					},
					{
						id: 'temporalPriority',
						name: 'Temporal Priority',
						type: ConfigManifestEntryType.INT,
					},
					{
						id: 'queueId',
						name: 'Queue ID',
						type: ConfigManifestEntryType.STRING,
					},
				],
			},
		},
	],
	[TSRDeviceType.PANASONIC_PTZ]: [...PLAYOUT_SUBDEVICE_COMMON, ...PLAYOUT_SUBDEVICE_HOST_PORT],
	[TSRDeviceType.TCPSEND]: [
		...PLAYOUT_SUBDEVICE_COMMON,
		...PLAYOUT_SUBDEVICE_HOST_PORT,
		{
			id: 'options.bufferEncoding',
			name: 'Buffer Encoding',
			type: ConfigManifestEntryType.STRING,
		},
		{
			id: 'options.makeReadyDoesReset',
			name: 'Whether Make Ready triggers a state reset',
			type: ConfigManifestEntryType.BOOLEAN,
		},
		{
			id: 'options.makeReadyCommands',
			name: 'Make Ready Commands',
			type: ConfigManifestEntryType.TABLE,
			defaultType: 'default',
			config: {
				default: [
					{
						id: 'message',
						name: 'Message',
						type: ConfigManifestEntryType.STRING,
					},
					{
						id: 'temporalPriority',
						name: 'Temporal Priority',
						type: ConfigManifestEntryType.INT,
					},
					{
						id: 'queueId',
						name: 'Queue ID',
						type: ConfigManifestEntryType.STRING,
					},
				],
			},
		},
	],
	[TSRDeviceType.HYPERDECK]: [
		...PLAYOUT_SUBDEVICE_COMMON,
		...PLAYOUT_SUBDEVICE_HOST_PORT,
		{
			id: 'options.minRecordingTime',
			name: 'Minimum recording time',
			type: ConfigManifestEntryType.INT,
		},
	],
	[TSRDeviceType.PHAROS]: [
		...PLAYOUT_SUBDEVICE_COMMON,
		PLAYOUT_SUBDEVICE_HOST_PORT[0], // Host only
		{
			id: 'options.spart',
			name: 'Enable SSL',
			type: ConfigManifestEntryType.BOOLEAN,
		},
	],
	[TSRDeviceType.OSC]: [
		...PLAYOUT_SUBDEVICE_COMMON,
		...PLAYOUT_SUBDEVICE_HOST_PORT,
		{
			id: 'options.type',
			name: 'Type (TCP or UDP)',
			type: ConfigManifestEntryType.ENUM,
			values: OSCDeviceType,
			defaultVal: OSCDeviceType.UDP,
		},
	],
	[TSRDeviceType.HTTPWATCHER]: [
		...PLAYOUT_SUBDEVICE_COMMON,
		{
			id: 'options.uri',
			name: 'URI',
			type: ConfigManifestEntryType.STRING,
		},
		{
			id: 'options.httpMethod',
			name: 'HTTPMethod',
			type: ConfigManifestEntryType.STRING,
		},
		{
			id: 'options.expectedHttpResponse',
			name: 'Expected HTTP Response',
			type: ConfigManifestEntryType.INT,
		},
		{
			id: 'options.keyword',
			name: 'Keyword',
			type: ConfigManifestEntryType.STRING,
		},
		{
			id: 'options.interval',
			name: 'Interval',
			type: ConfigManifestEntryType.INT,
		},
	],
	[TSRDeviceType.SISYFOS]: [...PLAYOUT_SUBDEVICE_COMMON, ...PLAYOUT_SUBDEVICE_HOST_PORT],
	[TSRDeviceType.QUANTEL]: [
		...PLAYOUT_SUBDEVICE_COMMON,
		{
			id: 'options.gatewayUrl',
			name: 'Gateway URL',
			type: ConfigManifestEntryType.STRING,
		},
		{
			id: 'options.ISAUrlMaster',
			name: 'ISA URL (Master)',
			type: ConfigManifestEntryType.STRING,
		},
		{
			id: 'options.ISAUrlBackup',
			name: 'ISA URL (Backup)',
			type: ConfigManifestEntryType.STRING,
		},
		{
			id: 'options.zoneId',
			name: 'Zone ID',
			type: ConfigManifestEntryType.STRING,
		},
		{
			id: 'options.serverId',
			name: 'Quantel Server ID',
			type: ConfigManifestEntryType.INT,
		},
		{
			id: 'options.allowCloneClips',
			name: 'Allow cloning of clips if on wrong server/pool',
			type: ConfigManifestEntryType.BOOLEAN,
		},
	],
	[TSRDeviceType.VIZMSE]: [
		...PLAYOUT_SUBDEVICE_COMMON,
		...PLAYOUT_SUBDEVICE_HOST,
		{
			id: 'options.restPort',
			name: '(Optional) REST port',
			type: ConfigManifestEntryType.INT,
		},
		{
			id: 'options.wsPort',
			name: '(Optional) Websocket port',
			type: ConfigManifestEntryType.INT,
		},
		{
			id: 'options.engineRestPort',
			name: '(Optional) Viz Engines REST port',
			type: ConfigManifestEntryType.INT,
		},
		{
			id: 'options.showID',
			name: 'Show ID',
			type: ConfigManifestEntryType.STRING,
		},
		{
			id: 'options.profile',
			name: 'Profile',
			type: ConfigManifestEntryType.STRING,
		},
		{
			id: 'options.playlistID',
			name: '(Optional) Playlist ID',
			type: ConfigManifestEntryType.STRING,
		},
		{
			id: 'options.preloadAllElements',
			name: 'Preload all elements',
			type: ConfigManifestEntryType.BOOLEAN,
		},
		{
			id: 'options.purgeUnknownElements',
			name: 'Purge unknown/unused element from Viz Rundown upon activate',
			type: ConfigManifestEntryType.BOOLEAN,
		},
		{
			id: 'options.autoLoadInternalElements',
			name: 'Automatically load internal elements when added',
			type: ConfigManifestEntryType.BOOLEAN,
		},
		{
			id: 'options.clearAllTemplateName',
			name: 'Clear-All template name',
			type: ConfigManifestEntryType.STRING,
		},
		{
			id: 'options.clearAllOnMakeReady',
			name: 'Clear-All on make-ready (activate rundown)',
			type: ConfigManifestEntryType.BOOLEAN,
		},
		{
			id: 'options.dontDeactivateOnStandDown',
			name: "Don't deactivate on stand-down (deactivate rundown)",
			type: ConfigManifestEntryType.BOOLEAN,
		},
		{
			id: 'options.onlyPreloadActivePlaylist',
			name: 'Only preload elements in active Playlist',
			type: ConfigManifestEntryType.BOOLEAN,
		},
		{
			id: 'options.initializeRundownOnLoadAll',
			name: 'On preload-All elements, also initialize the rundown playlist again',
			type: ConfigManifestEntryType.BOOLEAN,
		},
		{
			id: 'options.clearAllCommands',
			name: 'Clear All Channels Commands',
			type: ConfigManifestEntryType.MULTILINE_STRING,
		},
	],
	[TSRDeviceType.SHOTOKU]: [...PLAYOUT_SUBDEVICE_COMMON, ...PLAYOUT_SUBDEVICE_HOST_PORT],
	[TSRDeviceType.VMIX]: [...PLAYOUT_SUBDEVICE_COMMON, ...PLAYOUT_SUBDEVICE_HOST_PORT],
	[TSRDeviceType.SINGULAR_LIVE]: [
		...PLAYOUT_SUBDEVICE_COMMON,
		{
			id: 'options.accessToken',
			name: 'Access Token',
			type: ConfigManifestEntryType.STRING,
		},
	],
	[TSRDeviceType.OBS]: [
		...PLAYOUT_SUBDEVICE_COMMON,
		...PLAYOUT_SUBDEVICE_HOST_PORT,
		{
			id: 'options.password',
			name: 'Password',
			type: ConfigManifestEntryType.STRING,
		},
	],
	[TSRDeviceType.SOFIE_CHEF]: [...PLAYOUT_SUBDEVICE_COMMON],
	[TSRDeviceType.TELEMETRICS]: [...PLAYOUT_SUBDEVICE_COMMON],
}

// TODO: should come from types
enum EmberParameterType {
	Null = 'NULL',
	Integer = 'INTEGER',
	Real = 'REAL',
	String = 'STRING',
	Boolean = 'BOOLEAN',
	Trigger = 'TRIGGER',
	Enum = 'ENUM',
	Octets = 'OCTETS',
}

// If a device has no specific settings for a mapping, it should be added to this list
type NoMappingSettingsDeviceTypes =
	| TSRDeviceType.ABSTRACT
	| TSRDeviceType.HTTPSEND
	| TSRDeviceType.TCPSEND
	| TSRDeviceType.PHAROS
	| TSRDeviceType.OSC
	| TSRDeviceType.HTTPWATCHER
	| TSRDeviceType.VIZMSE
	| TSRDeviceType.SHOTOKU

type ImplementedMappingsManifest = Pick<MappingsManifest, Exclude<TSRDeviceType, NoMappingSettingsDeviceTypes>>

const MAPPING_MANIFEST: ImplementedMappingsManifest = {
	[TSRDeviceType.ATEM]: [
		{
			id: 'mappingType',
			type: ConfigManifestEntryType.ENUM,
			values: MappingAtemType,
			name: 'Mapping Type',
			includeInSummary: true,
		},
		{ id: 'index', type: ConfigManifestEntryType.INT, name: 'index', includeInSummary: true, zeroBased: true },
	],
	[TSRDeviceType.CASPARCG]: [
		{
			id: 'channel',
			name: 'Channel',
			type: ConfigManifestEntryType.INT,
			hint: 'The CasparCG channel to use (1 is the first)',
			includeInSummary: true,
		},
		{
			id: 'layer',
			name: 'Layer',
			type: ConfigManifestEntryType.INT,
			hint: 'The layer in a channel to use',
			includeInSummary: true,
		},
		{
			id: 'previewWhenNotOnAir',
			name: 'Preview when not On-Air',
			type: ConfigManifestEntryType.BOOLEAN,
			optional: true,
			hint: 'Whether to load to first frame',
		},
		{
			id: 'options.retryInterval',
			name: 'Media retry interval (ms), -1 disables, 0 default',
			type: ConfigManifestEntryType.INT,
		},
	],
	[TSRDeviceType.HYPERDECK]: [
		{
			id: 'mappingType',
			type: ConfigManifestEntryType.ENUM,
			values: MappingHyperdeckType,
			name: 'Mapping Type',
		},
	],
	[TSRDeviceType.LAWO]: [
		{
			id: 'mappingType',
			type: ConfigManifestEntryType.ENUM,
			values: MappingLawoType,
			name: 'Mapping Type',
		},
		{
			id: 'identifier',
			type: ConfigManifestEntryType.STRING,
			name: 'Identifier',
			includeInSummary: true,
		},
		{
			id: 'emberType',
			type: ConfigManifestEntryType.ENUM,
			values: EmberParameterType,
			name: 'Ember Type',
		},
		{
			id: 'priority',
			type: ConfigManifestEntryType.INT,
			name: 'Priority',
		},
	],
	[TSRDeviceType.PANASONIC_PTZ]: [
		{
			id: 'mappingType',
			type: ConfigManifestEntryType.ENUM,
			values: MappingPanasonicPtzType,
			name: 'Mapping Type',
			includeInSummary: true,
		},
	],
	[TSRDeviceType.QUANTEL]: [
		{
			id: 'portId',
			type: ConfigManifestEntryType.STRING,
			name: 'Port ID',
			hint: "The name you'd like the port to have",
			includeInSummary: true,
		},
		{
			id: 'channelId',
			type: ConfigManifestEntryType.INT,
			name: 'Channel ID',
			hint: 'The channel to use for output (0 is the first one)',
			includeInSummary: true,
		},
		{
			id: 'mode',
			type: ConfigManifestEntryType.ENUM,
			values: QuantelControlMode,
			name: 'Mode',
			optional: true,
		},
	],
	[TSRDeviceType.SINGULAR_LIVE]: [
		{
			id: 'compositionName',
			type: ConfigManifestEntryType.STRING,
			name: 'Composition Name',
		},
	],
	[TSRDeviceType.SISYFOS]: [
		{
			id: 'mappingType',
			type: ConfigManifestEntryType.ENUM,
			values: MappingSisyfosType,
			name: 'Mapping Type',
		},
		{
			id: 'channel',
			type: ConfigManifestEntryType.INT,
			name: 'Channel',
			optional: true,
			includeInSummary: true,
			zeroBased: true,
		},
		{
			id: 'label',
			type: ConfigManifestEntryType.STRING,
			name: 'Label',
			optional: true,
			includeInSummary: true,
			hint: 'Identify the channel by label (does not set the label in Sisyfos)',
		},
		{
			id: 'setLabelToLayerName',
			type: ConfigManifestEntryType.BOOLEAN,
			name: 'Set channel label to layer name',
		},
	],
	[TSRDeviceType.VMIX]: [
		{
			id: 'mappingType',
			type: ConfigManifestEntryType.ENUM,
			values: MappingVMixType,
			name: 'Mapping Type',
			includeInSummary: true,
		},
		{
			id: 'index',
			type: ConfigManifestEntryType.STRING,
			name: 'Index',
			includeInSummary: true,
			optional: true,
		},
		{
			id: 'inputLayer',
			type: ConfigManifestEntryType.STRING,
			name: 'Input Layer',
			includeInSummary: true,
			optional: true,
		},
	],
	[TSRDeviceType.OBS]: [
		{
			id: 'mappingType',
			type: ConfigManifestEntryType.ENUM,
			values: MappingOBSType,
			name: 'Mapping Type',
			includeInSummary: true,
		},
		{
			id: 'source',
			type: ConfigManifestEntryType.STRING,
			name: 'Source',
			includeInSummary: true,
			optional: true,
		},
		{
			id: 'sceneName',
			type: ConfigManifestEntryType.STRING,
			name: 'Scene Name',
			includeInSummary: true,
			optional: true,
		},
	],
	[TSRDeviceType.SOFIE_CHEF]: [],
	[TSRDeviceType.TELEMETRICS]: [],
}

export const PLAYOUT_DEVICE_CONFIG: DeviceConfigManifest = {
	deviceConfig: [
		{
			id: 'debugLogging',
			name: 'Activate Debug Logging',
			type: ConfigManifestEntryType.BOOLEAN,
		},
		{
			id: 'multiThreading',
			name: 'Activate Multi-Threading',
			type: ConfigManifestEntryType.BOOLEAN,
		},
		{
			id: 'multiThreadedResolver',
			name: 'Activate Multi-Threaded Timeline Resolving',
			type: ConfigManifestEntryType.BOOLEAN,
		},
		{
			id: 'useCacheWhenResolving',
			name: 'Activate Partial resolving, when resolving the Timeline',
			type: ConfigManifestEntryType.BOOLEAN,
		},
		{
			id: 'reportAllCommands',
			name: 'Report command timings on all commands',
			type: ConfigManifestEntryType.BOOLEAN,
		},
		{
			id: 'estimateResolveTimeMultiplier',
			name: 'Adjust resolve-time estimation',
			type: ConfigManifestEntryType.FLOAT,
			defaultVal: 1,
		},
		{
			id: 'devices',
			name: 'Sub Devices',
			type: ConfigManifestEntryType.TABLE,
			defaultType: TSRDeviceType.ABSTRACT as any,
			isSubDevices: true,
			deviceTypesMapping: TSRDeviceType,
			config: PLAYOUT_SUBDEVICE_CONFIG,
		},
	],
	layerMappings: MAPPING_MANIFEST,
}
