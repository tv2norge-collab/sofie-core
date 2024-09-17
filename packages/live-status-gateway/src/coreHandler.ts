import {
	CoreConnection,
	CoreOptions,
	DDPConnectorOptions,
	Observer,
	PeripheralDeviceForDevice,
	stringifyError,
} from '@sofie-automation/server-core-integration'
import { DeviceConfig } from './connector'
import { Logger } from 'winston'
import { Process } from './process'
import { LIVE_STATUS_DEVICE_CONFIG } from './configManifest'
import {
	PeripheralDeviceCategory,
	PeripheralDeviceType,
} from '@sofie-automation/shared-lib/dist/peripheralDevice/peripheralDeviceAPI'
import { protectString } from '@sofie-automation/shared-lib/dist/lib/protectedString'
import { PeripheralDeviceCommandId, StudioId } from '@sofie-automation/shared-lib/dist/core/model/Ids'
import { StatusCode } from '@sofie-automation/shared-lib/dist/lib/status'
import { PeripheralDeviceCommand } from '@sofie-automation/shared-lib/dist/core/model/PeripheralDeviceCommand'
import { LiveStatusGatewayConfig } from './generated/options'
import { CorelibPubSubCollections } from '@sofie-automation/corelib/dist/pubsub'

export interface CoreConfig {
	host: string
	port: number
	watchdog: boolean
}

/**
 * Represents a connection between the Gateway and Core
 */
export class CoreHandler {
	core!: CoreConnection
	logger: Logger
	public _observers: Array<any> = []
	public deviceSettings: LiveStatusGatewayConfig = {}

	public errorReporting = false
	public multithreading = false
	public reportAllCommands = false

	private _deviceOptions: DeviceConfig
	private _onConnected?: () => any
	private _executedFunctions = new Set<PeripheralDeviceCommandId>()
	private _coreConfig?: CoreConfig
	private _process?: Process

	private _studioId: StudioId | undefined

	private _statusInitialized = false
	private _statusDestroyed = false

	constructor(logger: Logger, deviceOptions: DeviceConfig) {
		this.logger = logger
		this._deviceOptions = deviceOptions
	}

	async init(config: CoreConfig, process: Process): Promise<void> {
		this._statusInitialized = false
		this._coreConfig = config
		this._process = process

		this.core = new CoreConnection(this.getCoreConnectionOptions())

		this.core.onConnected(() => {
			this.logger.info('Core Connected!')
			this.setupObserversAndSubscriptions().catch((e) => {
				this.logger.error('Core Error during setupObserversAndSubscriptions:', e)
			})
			if (this._onConnected) this._onConnected()
		})
		this.core.onDisconnected(() => {
			this.logger.warn('Core Disconnected!')
		})
		this.core.onError((err) => {
			this.logger.error('Core Error: ' + (typeof err === 'string' ? err : err.message || err.toString() || err))
		})

		const ddpConfig: DDPConnectorOptions = {
			host: config.host,
			port: config.port,
		}
		if (this._process && this._process.certificates.length) {
			ddpConfig.tlsOpts = {
				ca: this._process.certificates,
			}
		}

		await this.core.init(ddpConfig)
		await this.updateCoreStatus()

		this.logger.info('Core id: ' + this.core.deviceId)
		await this.setupObserversAndSubscriptions()
		if (this._onConnected) this._onConnected()

		this._statusInitialized = true
		await this.updateCoreStatus()
	}

	async setupSubscription<Key extends string>(collection: Key, ...params: any[]): Promise<SubscriptionId> {
		// tmp R50 hack
		this.logger.debug(`Core: Set up subscription for '${collection}'`)
		const subscriptionId = await this.core.autoSubscribe(collection, ...params)
		this.logger.debug(`Core: Subscription for '${collection}' set up with id ${subscriptionId}`)
		return subscriptionId
	}

	unsubscribe(subscriptionId: SubscriptionId): void {
		this.logger.debug(`Core: Unsubscribing id '${subscriptionId}'`)
		this.core.unsubscribe(subscriptionId)
	}

	setupObserver<K extends keyof CorelibPubSubCollections>(collection: K): Observer<any> {
		return this.core.observe(collection)
	}

	async setupObserversAndSubscriptions(): Promise<void> {
		this.logger.info('Core: Setting up subscriptions..')
		this.logger.info('DeviceId: ' + this.core.deviceId)

		await Promise.all([
			this.core.autoSubscribe(PeripheralDevicePubSub.peripheralDeviceForDevice, this.core.deviceId),
			this.core.autoSubscribe(PeripheralDevicePubSub.peripheralDeviceCommands, this.core.deviceId),
		])
		this.logger.info('Core: Subscriptions are set up!')
		if (this._observers.length) {
			this.logger.info('CoreMos: Clearing observers..')
			this._observers.forEach((obs) => {
				obs.stop()
			})
			this._observers = []
		}
		// setup observers
		const observer = this.core.observe(PeripheralDevicePubSubCollectionsNames.peripheralDeviceForDevice)
		observer.added = () => this.onDeviceChanged()
		observer.changed = () => this.onDeviceChanged()
		this.onDeviceChanged() // set initial settings
		this.setupObserverForPeripheralDeviceCommands(this)
	}
	async destroy(): Promise<void> {
		this._statusDestroyed = true
		await this.updateCoreStatus()
		await this.core.destroy()
	}
	private getCoreConnectionOptions(): CoreOptions {
		if (!this._deviceOptions.deviceId) {
			throw new Error('DeviceId is not set!')
		}

		const options: CoreOptions = {
			deviceId: protectString(this._deviceOptions.deviceId + 'LiveStatusGateway'),
			deviceToken: this._deviceOptions.deviceToken,

			deviceCategory: PeripheralDeviceCategory.LIVE_STATUS,
			deviceType: PeripheralDeviceType.LIVE_STATUS,

			deviceName: 'Live Status Gateway',
			watchDog: this._coreConfig ? this._coreConfig.watchdog : true,

			configManifest: LIVE_STATUS_DEVICE_CONFIG,
			documentationUrl: `https://nrkno.github.io/sofie-core/`,

			versions: this._getVersions(),
		}

		if (!options.deviceToken) {
			this.logger.warn('Token not set, only id! This might be unsecure!')
			options.deviceToken = 'unsecureToken'
		}

		return options
	}
	onConnected(fcn: () => any): void {
		this._onConnected = fcn
	}

	onDeviceChanged(): void {
		const col = this.core.getCollection<PeripheralDeviceForDevice>(
			PeripheralDevicePubSubCollectionsNames.peripheralDeviceForDevice
		)
		if (!col) throw new Error('collection "peripheralDeviceForDevice" not found!')

		const device = col.findOne(this.core.deviceId)
		if (!device) {
			throw new Error(`No "peripheralDeviceForDevice" with id "${this.core.deviceId}" found!`)
		}

		this.deviceSettings = device.deviceSettings || {}
		const logLevel = this.deviceSettings['debugLogging'] ? 'debug' : 'info'
		if (logLevel !== this.logger.level) {
			this.logger.level = logLevel

			for (const transport of this.logger.transports) {
				transport.level = logLevel
			}

			this.logger.info('Loglevel: ' + this.logger.level)
		}

		const studioId = device.studioId
		if (studioId === undefined) {
			throw new Error(`Live status gateway must be attached to a studio`)
		}

		if (studioId !== this._studioId) {
			this._studioId = studioId
		}
	}

	get logDebug(): boolean {
		return !!this.deviceSettings['debugLogging']
	}

	get coreConnection(): CoreConnection {
		return this.core
	}

	get studioId(): StudioId | undefined {
		return this._studioId
	}

	executeFunction(cmd: PeripheralDeviceCommand, fcnObject: CoreHandler): void {
		if (cmd) {
			if (this._executedFunctions.has(cmd._id)) return // prevent it from running multiple times

			// Ignore specific commands, to reduce noise:
			if (cmd.functionName !== 'getDebugStates') {
				this.logger.debug(`Executing function "${cmd.functionName}", args: ${JSON.stringify(cmd.args)}`)
			}

			this._executedFunctions.add(cmd._id)
			const cb = (errStr: string | null, res?: any) => {
				if (errStr) {
					this.logger.error(`executeFunction error: ${errStr}`)
				}
				fcnObject.core.coreMethods.functionReply(cmd._id, errStr, res).catch((e) => {
					this.logger.error(e)
				})
			}
			// eslint-disable-next-line @typescript-eslint/ban-types
			const fcn: Function = fcnObject[cmd.functionName as keyof CoreHandler] as Function
			try {
				if (!fcn) throw Error(`Function "${cmd.functionName}" not found on device "${cmd.deviceId}"!`)

				Promise.resolve(fcn.apply(fcnObject, cmd.args))
					.then((result) => {
						cb(null, result)
					})
					.catch((e) => {
						cb(stringifyError(e), null)
					})
			} catch (e: any) {
				cb(stringifyError(e), null)
			}
		}
	}
	retireExecuteFunction(cmdId: PeripheralDeviceCommandId): void {
		this._executedFunctions.delete(cmdId)
	}
	setupObserverForPeripheralDeviceCommands(functionObject: CoreHandler): void {
		const observer = functionObject.core.observe(PeripheralDevicePubSubCollectionsNames.peripheralDeviceCommands)
		functionObject._observers.push(observer)
		const addedChangedCommand = (id: PeripheralDeviceCommandId) => {
			const cmds = functionObject.core.getCollection<PeripheralDeviceCommand>(
				PeripheralDevicePubSubCollectionsNames.peripheralDeviceCommands
			)
			if (!cmds) throw Error('"peripheralDeviceCommands" collection not found!')
			const cmd = cmds.findOne(id)
			if (!cmd) throw Error('PeripheralCommand "' + id + '" not found!')
			// console.log('addedChangedCommand', id)
			if (cmd.deviceId === functionObject.core.deviceId) {
				this.executeFunction(cmd, functionObject)
			} else {
				// console.log('not mine', cmd.deviceId, this.core.deviceId)
			}
		}
		observer.added = (id) => {
			addedChangedCommand(id)
		}
		observer.changed = (id) => {
			addedChangedCommand(id)
		}
		observer.removed = (id) => {
			this.retireExecuteFunction(id)
		}
		const cmds = functionObject.core.getCollection<PeripheralDeviceCommand>(
			PeripheralDevicePubSubCollectionsNames.peripheralDeviceCommands
		)
		if (!cmds) throw Error('"peripheralDeviceCommands" collection not found!')
		cmds.find({}).forEach((cmd) => {
			if (cmd.deviceId === functionObject.core.deviceId) {
				this.executeFunction(cmd, functionObject)
			}
		})
	}
	killProcess(actually: number): boolean {
		if (actually === 1) {
			this.logger.info('KillProcess command received, shutting down in 1000ms!')
			setTimeout(() => {
				// eslint-disable-next-line no-process-exit
				process.exit(0)
			}, 1000)
			return true
		}
		return false
	}
	pingResponse(message: string): void {
		this.core.setPingResponse(message)
	}
	getSnapshot(): any {
		this.logger.info('getSnapshot')
		return {}
	}
	getDevicesInfo(): any {
		this.logger.info('getDevicesInfo')
		return []
	}
	async updateCoreStatus(): Promise<any> {
		let statusCode = StatusCode.GOOD
		const messages: Array<string> = []

		if (!this._statusInitialized) {
			statusCode = StatusCode.BAD
			messages.push('Starting up...')
		}
		if (this._statusDestroyed) {
			statusCode = StatusCode.BAD
			messages.push('Shut down')
		}

		return this.core.setStatus({
			statusCode: statusCode,
			messages: messages,
		})
	}
	private _getVersions() {
		const versions: { [packageName: string]: string } = {}

		if (process.env.npm_package_version) {
			versions['_process'] = process.env.npm_package_version
		}

		return versions
	}
}

// tmp, remove in R51 ------------------------------------------------------------------
type SubscriptionId = string
enum PeripheralDevicePubSubCollectionsNames {
	// Real Mongodb collections:
	peripheralDeviceCommands = 'peripheralDeviceCommands',
	rundowns = 'rundowns',
	expectedPlayoutItems = 'expectedPlayoutItems',
	timelineDatastore = 'timelineDatastore',

	// Custom collections:
	peripheralDeviceForDevice = 'peripheralDeviceForDevice',
	studioMappings = 'studioMappings',
	studioTimeline = 'studioTimeline',

	mountedTriggersPreviews = 'mountedTriggersPreviews',
	mountedTriggers = 'mountedTriggers',

	packageManagerPlayoutContext = 'packageManagerPlayoutContext',
	packageManagerPackageContainers = 'packageManagerPackageContainers',
	packageManagerExpectedPackages = 'packageManagerExpectedPackages',
}
export enum PeripheralDevicePubSub {
	// Common:

	/** Commands for the PeripheralDevice to execute */
	peripheralDeviceCommands = 'peripheralDeviceCommands',
	/** Properties/settings of the PeripheralDevice */
	peripheralDeviceForDevice = 'peripheralDeviceForDevice',

	// Playout gateway:

	/** Playout gateway: Rundowns in the Studio of the PeripheralDevice */
	rundownsForDevice = 'rundownsForDevice',

	/** Playout gateway: Simplified timeline mappings in the Studio of the PeripheralDevice */
	mappingsForDevice = 'mappingsForDevice',
	/** Playout gateway: Simplified timeline in the Studio of the PeripheralDevice */
	timelineForDevice = 'timelineForDevice',
	/** Playout gateway: Timeline datastore entries in the Studio of the PeripheralDevice */
	timelineDatastoreForDevice = 'timelineDatastoreForDevice',
	/** Playout gateway: ExpectedPlayoutItems in the Studio of the PeripheralDevice */
	expectedPlayoutItemsForDevice = 'expectedPlayoutItemsForDevice',

	// Input gateway:

	/** Input gateway: Calculated triggered actions */
	mountedTriggersForDevice = 'mountedTriggersForDevice',
	/** Input gateway: Calculated trigger previews */
	mountedTriggersForDevicePreview = 'mountedTriggersForDevicePreview',

	// Package manager:

	/** Package manager: Info about the active playlist in the Studio of the PeripheralDevice */
	packageManagerPlayoutContext = 'packageManagerPlayoutContext',
	/** Package manager: The package containers in the Studio of the PeripheralDevice */
	packageManagerPackageContainers = 'packageManagerPackageContainers',
	/** Package manager: The expected packages in the Studio of the PeripheralDevice */
	packageManagerExpectedPackages = 'packageManagerExpectedPackages',
}
// ------------------------------------------------------------------------------------
