import { expect } from 'chai'
import type { WebdavConfig } from '../src/baseTypes'
import { applyWebdavPresetRulesInPlace } from '../src/presetRules'

describe('Preset rules tests', () => {
	it('should check undefined correctly', () => {
		const x: Partial<WebdavConfig> | undefined = undefined
		const y = applyWebdavPresetRulesInPlace(x)
		expect(y.webdav === undefined)
		expect(!y.changed)
	})

	it('should check empty object', () => {
		const x: Partial<WebdavConfig> | undefined = {}
		const y = applyWebdavPresetRulesInPlace(x)
		expect(y.webdav).deep.equals({})
		expect(!y.changed)
	})

	it('should modify depths correctly', () => {
		let x: Partial<WebdavConfig> = {
			address: 'https://example.teracloud.jp/dav/',
			depth: 'auto_unknown',
		}
		let y = applyWebdavPresetRulesInPlace(x)
		expect(x.depth === 'auto_1')
		expect(y.changed)

		x = {
			address: 'https://example.teracloud.jp/dav/example',
			depth: 'auto_unknown',
		}
		y = applyWebdavPresetRulesInPlace(x)
		expect(x.depth === 'auto_1')
		expect(y.changed)

		x = {
			address: 'https://dav.jianguoyun.com/dav/',
			depth: 'auto_unknown',
		}
		y = applyWebdavPresetRulesInPlace(x)
		expect(x.depth === 'auto_1')
		expect(y.changed)

		x = {
			address: 'https://dav.jianguoyun.com/dav/',
			depth: 'auto_infinity',
		}
		y = applyWebdavPresetRulesInPlace(x)
		expect(x.depth === 'auto_1')
		expect(y.changed)
	})

	it('should not modify depths if depths is set automatically correctly', () => {
		const x: Partial<WebdavConfig> = {
			address: 'https://dav.jianguoyun.com/dav/',
			depth: 'auto_1',
		}
		const y = applyWebdavPresetRulesInPlace(x)
		expect(x.depth === 'auto_1')
		expect(!y.changed)
	})

	it('should not modify depths if depths have been set manually', () => {
		let x: Partial<WebdavConfig> = {
			address: 'https://example.teracloud.jp/dav/',
			depth: 'manual_infinity',
		}
		let y = applyWebdavPresetRulesInPlace(x)
		expect(x.depth === 'manual_infinity')
		expect(!y.changed)

		x = {
			address: 'https://example.teracloud.jp/dav/example',
			depth: 'manual_1',
		}
		y = applyWebdavPresetRulesInPlace(x)
		expect(x.depth === 'manual_1')
		expect(!y.changed)
	})

	it('should not modify depths when urls are not in preset rules', () => {
		let x: Partial<WebdavConfig> = {
			address: 'https://teracloud.jp/dav/',
			depth: 'auto_unknown',
		}
		applyWebdavPresetRulesInPlace(x)
		expect(x.depth === 'auto_unknown')

		x = {
			address: 'https://dav.jianguoyun.com/dav_example',
			depth: 'auto_unknown',
		}
		applyWebdavPresetRulesInPlace(x)
		expect(x.depth === 'auto_unknown')

		x = {
			address: '',
			depth: 'auto_unknown',
		}
		applyWebdavPresetRulesInPlace(x)
		expect(x.depth === 'auto_unknown')

		x = {
			address: 'https://dav.jianguoyun.com/dav/',
			depth: 'what' as any,
		}
		applyWebdavPresetRulesInPlace(x)
		expect(x.depth === ('what' as any))
	})
})
