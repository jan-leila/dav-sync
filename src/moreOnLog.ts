// It's very dangerous for this file to depend on other files in the same project.
// We should avoid this situation as much as possible.

import * as origLog from 'loglevel'
import type {
	LogLevelNumbers,
	LogLevelNames,
} from 'loglevel'
const log2 = origLog.getLogger('rs-default')

const originalFactory = log2.methodFactory

export const applyLogWriterInPlace = function (writer: (...msg: any[]) => any) {
	log2.methodFactory = function (
		methodName: LogLevelNames,
		logLevel: LogLevelNumbers,
		loggerName: string | symbol
	) {
		const rawMethod = originalFactory(methodName, logLevel, loggerName)

		return function (...msg: any[]) {
			rawMethod.bind(undefined)(...msg)
			writer(...msg)
		}
	}

	log2.setLevel(log2.getLevel())
}

export const restoreLogWriterInPlace = () => {
	log2.methodFactory = originalFactory
	log2.setLevel(log2.getLevel())
}

export const log = log2
