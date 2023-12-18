import * as chai from 'chai'
import chaiAsPromised from 'chai-as-promised'

import { RemotelySavePluginSettings } from '../src/baseTypes'
import { messyConfigToNormal, normalConfigToMessy } from '../src/configPersist'

chai.use(chaiAsPromised)
const expect = chai.expect

const DEFAULT_SETTINGS: RemotelySavePluginSettings = {
	webdav: {
		address: 'addr',
	} as any,
	password: 'password',
	currLogLevel: 'info',
}

describe('Config Persist tests', () => {
	it('should encrypt go back and forth correctly', async () => {
		const k = DEFAULT_SETTINGS
		const k2 = normalConfigToMessy(k)
		const k3 = messyConfigToNormal(k2)
		expect(k3).to.deep.equal(k)
	})
})
