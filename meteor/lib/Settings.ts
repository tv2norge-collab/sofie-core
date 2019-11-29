import { Meteor } from 'meteor/meteor'
import * as _ from 'underscore'

/**
 * This is an object specifying installation-wide, User Interface settings.
 * There are default values for these settings that will be used, unless overriden
 * through Meteor.settings functionality.
 * 
 * You can use METEOR_SETTING to inject the settings JSON or you can use the 
 * --settings [filename] to provide a JSON file containing the settings
 */
export interface ISettings {
	// The framerate (frames per second) used to convert internal timing information (in milliseconds)
	// into timecodes and timecode-like strings and interpret timecode user input
	// Default: 25
	frameRate: number,
	// Should the Rundown view User Interface default all segments to "collapsed" state?
	// Default: false
	defaultToCollapsedSegments: boolean,
	// Should the Current and Next segments be automatically made expanded (uncollapsed)?
	// Default: false
	autoExpandCurrentNextSegment: boolean
}

export let Settings: ISettings

/**
 * Default values for Settings
 */
const DEFAULT_SETTINGS: ISettings = {
	'frameRate': 25,
	'defaultToCollapsedSegments': false,
	'autoExpandCurrentNextSegment': false
}

Settings = _.clone(DEFAULT_SETTINGS)

Meteor.startup(() => {
	Settings = _.extend(Settings, Meteor.settings.public)
})
