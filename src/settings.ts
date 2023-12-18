import {
	App,
	Modal,
	Notice,
	PluginSettingTab,
	Setting,
} from 'obsidian'
import type { TextComponent } from 'obsidian'
import { createElement, Eye, EyeOff } from 'lucide'
import {
	DEFAULT_DEBUG_FOLDER,
	SUPPORTED_SERVICES_TYPE_WITH_REMOTE_BASE_DIR,
	VALID_REQ_URL,
	WebdavAuthType,
	WebdavDepthType,
} from './baseTypes'
import {
	exportVaultSyncPlansToFiles,
	exportVaultLoggerOutputToFiles,
} from './debugMode'
import { exportQrCodeUri } from './importExport'
import {
	clearAllSyncMetaMapping,
	clearAllSyncPlanRecords,
	destroyDBs,
	clearAllLoggerOutputRecords,
	insertLoggerOutputByVault,
	clearExpiredLoggerOutputRecords,
} from './localDB'
import type RemotelySavePlugin from './main' // unavoidable
import { RemoteClient } from './remote'
import { messyConfigToNormal } from './configPersist'
import type { TransItemType } from './i18n'
import { checkHasSpecialCharForDir } from './misc'
import { applyWebdavPresetRulesInPlace } from './presetRules'

import {
	applyLogWriterInPlace,
	log,
	restoreLogWriterInPlace,
} from './moreOnLog'

class PasswordModal extends Modal {
	plugin: RemotelySavePlugin
	newPassword: string
	constructor(app: App, plugin: RemotelySavePlugin, newPassword: string) {
		super(app)
		this.plugin = plugin
		this.newPassword = newPassword
	}

	onOpen() {
		const { contentEl } = this

		const t = (x: TransItemType, vars?: any) => {
			return this.plugin.i18n.t(x, vars)
		}

		// contentEl.setText("Add Or change password.");
		contentEl.createEl('h2', { text: t('modal_password_title') })
		t('modal_password_short_desc')
			.split('\n')
			.forEach((val) => {
				contentEl.createEl('p', {
					text: val,
				})
			});

		[
			t('modal_password_attn1'),
			t('modal_password_attn2'),
			t('modal_password_attn3'),
			t('modal_password_attn4'),
			t('modal_password_attn5'),
		].forEach((val, idx) => {
			if (idx < 3) {
				contentEl.createEl('p', {
					text: val,
					cls: 'password-disclaimer',
				})
			} else {
				contentEl.createEl('p', {
					text: val,
				})
			}
		})

		new Setting(contentEl)
			.addButton((button) => {
				button.setButtonText(t('modal_password_second_confirm'))
				button.onClick(async () => {
					this.plugin.settings.password = this.newPassword
					await this.plugin.saveSettings()
					new Notice(t('modal_password_notice'))
					this.close()
				})
				button.setClass('password-second-confirm')
			})
			.addButton((button) => {
				button.setButtonText(t('go_back'))
				button.onClick(() => {
					this.close()
				})
			})
	}

	onClose() {
		const { contentEl } = this
		contentEl.empty()
	}
}

class ChangeRemoteBaseDirModal extends Modal {
	readonly plugin: RemotelySavePlugin
	readonly newRemoteBaseDir: string
	readonly service: SUPPORTED_SERVICES_TYPE_WITH_REMOTE_BASE_DIR
	constructor(
		app: App,
		plugin: RemotelySavePlugin,
		newRemoteBaseDir: string,
		service: SUPPORTED_SERVICES_TYPE_WITH_REMOTE_BASE_DIR
	) {
		super(app)
		this.plugin = plugin
		this.newRemoteBaseDir = newRemoteBaseDir
		this.service = service
	}

	onOpen() {
		const { contentEl } = this

		const t = (x: TransItemType, vars?: any) => {
			return this.plugin.i18n.t(x, vars)
		}

		contentEl.createEl('h2', { text: t('modal_remote_base_dir_title') })
		t('modal_remote_base_dir_short_desc')
			.split('\n')
			.forEach((val) => {
				contentEl.createEl('p', {
					text: val,
				})
			})

		if (
			this.newRemoteBaseDir === '' ||
      this.newRemoteBaseDir === this.app.vault.getName()
		) {
			new Setting(contentEl)
				.addButton((button) => {
					button.setButtonText(
						t('modal_remote_base_dir_second_confirm_vault_name')
					)
					button.onClick(async () => {
						// in the settings, the value is reset to the special case ""
						this.plugin.settings[this.service].remoteBaseDir = ''
						await this.plugin.saveSettings()
						new Notice(t('modal_remote_base_dir_notice'))
						this.close()
					})
					button.setClass('remote-base-dir-second-confirm')
				})
				.addButton((button) => {
					button.setButtonText(t('go_back'))
					button.onClick(() => {
						this.close()
					})
				})
		} else if (checkHasSpecialCharForDir(this.newRemoteBaseDir)) {
			contentEl.createEl('p', {
				text: t('modal_remote_base_dir_invalid_dir_hint'),
			})
			new Setting(contentEl).addButton((button) => {
				button.setButtonText(t('go_back'))
				button.onClick(() => {
					this.close()
				})
			})
		} else {
			new Setting(contentEl)
				.addButton((button) => {
					button.setButtonText(t('modal_remote_base_dir_second_confirm_change'))
					button.onClick(async () => {
						this.plugin.settings[this.service].remoteBaseDir =
              this.newRemoteBaseDir
						await this.plugin.saveSettings()
						new Notice(t('modal_remote_base_dir_notice'))
						this.close()
					})
					button.setClass('remote-base-dir-second-confirm')
				})
				.addButton((button) => {
					button.setButtonText(t('go_back'))
					button.onClick(() => {
						this.close()
					})
				})
		}
	}

	onClose() {
		const { contentEl } = this
		contentEl.empty()
	}
}

class SyncConfigDirModal extends Modal {
	plugin: RemotelySavePlugin
	saveDropdownFunc: () => void
	constructor(
		app: App,
		plugin: RemotelySavePlugin,
		saveDropdownFunc: () => void
	) {
		super(app)
		this.plugin = plugin
		this.saveDropdownFunc = saveDropdownFunc
	}

	async onOpen() {
		const { contentEl } = this

		const t = (x: TransItemType, vars?: any) => {
			return this.plugin.i18n.t(x, vars)
		}

		t('modal_sync_config_attn')
			.split('\n')
			.forEach((val) => {
				contentEl.createEl('p', {
					text: val,
				})
			})

		new Setting(contentEl)
			.addButton((button) => {
				button.setButtonText(t('modal_sync_config_second_confirm'))
				button.onClick(async () => {
					this.plugin.settings.syncConfigDir = true
					await this.plugin.saveSettings()
					this.saveDropdownFunc()
					new Notice(t('modal_sync_config_notice'))
					this.close()
				})
			})
			.addButton((button) => {
				button.setButtonText(t('go_back'))
				button.onClick(() => {
					this.close()
				})
			})
	}

	onClose() {
		const { contentEl } = this
		contentEl.empty()
	}
}

class ExportSettingsQrCodeModal extends Modal {
	plugin: RemotelySavePlugin
	constructor(app: App, plugin: RemotelySavePlugin) {
		super(app)
		this.plugin = plugin
	}

	async onOpen() {
		const { contentEl } = this

		const t = (x: TransItemType, vars?: any) => {
			return this.plugin.i18n.t(x, vars)
		}

		const { rawUri, imgUri } = await exportQrCodeUri(
			this.plugin.settings,
			this.app.vault.getName(),
			this.plugin.manifest.version
		)

		const div1 = contentEl.createDiv()
		t('modal_qr_short_desc')
			.split('\n')
			.forEach((val) => {
				div1.createEl('p', {
					text: val,
				})
			})

		const div2 = contentEl.createDiv()
		div2.createEl(
			'button',
			{
				text: t('modal_qr_button'),
			},
			(el) => {
				el.onclick = async () => {
					await navigator.clipboard.writeText(rawUri)
					new Notice(t('modal_qr_button_notice'))
				}
			}
		)

		const div3 = contentEl.createDiv()
		div3.createEl(
			'img',
			{
				cls: 'qrcode-img',
			},
			async (el) => {
				el.src = imgUri
			}
		)
	}

	onClose() {
		const { contentEl } = this
		contentEl.empty()
	}
}

const getEyesElements = () => {
	const eyeEl = createElement(Eye)
	const eyeOffEl = createElement(EyeOff)
	return {
		eye: eyeEl.outerHTML,
		eyeOff: eyeOffEl.outerHTML,
	}
}

const wrapTextWithPasswordHide = (text: TextComponent) => {
	const { eye, eyeOff } = getEyesElements()
	const hider = text.inputEl.insertAdjacentElement('afterend', createSpan())
	// the init type of hider is "hidden" === eyeOff === password
	hider.innerHTML = eyeOff
	hider.addEventListener('click', () => {
		const isText = text.inputEl.getAttribute('type') === 'text'
		hider.innerHTML = isText ? eyeOff : eye
		text.inputEl.setAttribute('type', isText ? 'password' : 'text')
		text.inputEl.focus()
	})

	// the init type of text el is password
	text.inputEl.setAttribute('type', 'password')
	return text
}

export class RemotelySaveSettingTab extends PluginSettingTab {
	readonly plugin: RemotelySavePlugin

	constructor(app: App, plugin: RemotelySavePlugin) {
		super(app, plugin)
		this.plugin = plugin
	}

	display(): void {
		const { containerEl } = this

		containerEl.empty()

		const t = (x: TransItemType, vars?: any) => {
			return this.plugin.i18n.t(x, vars)
		}

		containerEl.createEl('h1', { text: 'Remotely Save' })

		//////////////////////////////////////////////////
		// below for service chooser (part 1/2)
		//////////////////////////////////////////////////

		//////////////////////////////////////////////////
		// below for webdav
		//////////////////////////////////////////////////

		const webdavDiv = containerEl.createEl('div', { cls: 'webdav-hide' })

		webdavDiv.createEl('h2', { text: t('settings_webdav') })

		const webdavLongDescDiv = webdavDiv.createEl('div', {
			cls: 'settings-long-desc',
		})

		webdavLongDescDiv.createEl('p', {
			text: t('settings_webdav_disclaimer1'),
			cls: 'webdav-disclaimer',
		})

		if (!VALID_REQ_URL) {
			webdavLongDescDiv.createEl('p', {
				text: t('settings_webdav_cors_os'),
			})

			webdavLongDescDiv.createEl('p', {
				text: t('settings_webdav_cors'),
			})
		}

		webdavLongDescDiv.createEl('p', {
			text: t('settings_webdav_folder', {
				remoteBaseDir:
          this.plugin.settings.webdav.remoteBaseDir || this.app.vault.getName(),
			}),
		})

		new Setting(webdavDiv)
			.setName(t('settings_webdav_addr'))
			.setDesc(t('settings_webdav_addr_desc'))
			.addText((text) =>
				text
					.setPlaceholder('')
					.setValue(this.plugin.settings.webdav.address)
					.onChange(async (value) => {
						this.plugin.settings.webdav.address = value.trim()
						if (
							this.plugin.settings.webdav.depth === 'auto_1' ||
              this.plugin.settings.webdav.depth === 'auto_infinity'
						) {
							this.plugin.settings.webdav.depth = 'auto_unknown'
						}

						// TODO: any more elegant way?
						applyWebdavPresetRulesInPlace(this.plugin.settings.webdav)

						// normally saved
						await this.plugin.saveSettings()
					})
			)

		new Setting(webdavDiv)
			.setName(t('settings_webdav_user'))
			.setDesc(t('settings_webdav_user_desc'))
			.addText((text) => {
				wrapTextWithPasswordHide(text)
				text
					.setPlaceholder('')
					.setValue(this.plugin.settings.webdav.username)
					.onChange(async (value) => {
						this.plugin.settings.webdav.username = value.trim()
						if (
							this.plugin.settings.webdav.depth === 'auto_1' ||
              this.plugin.settings.webdav.depth === 'auto_infinity'
						) {
							this.plugin.settings.webdav.depth = 'auto_unknown'
						}
						await this.plugin.saveSettings()
					})
			})

		new Setting(webdavDiv)
			.setName(t('settings_webdav_password'))
			.setDesc(t('settings_webdav_password_desc'))
			.addText((text) => {
				wrapTextWithPasswordHide(text)
				text
					.setPlaceholder('')
					.setValue(this.plugin.settings.webdav.password)
					.onChange(async (value) => {
						this.plugin.settings.webdav.password = value.trim()
						if (
							this.plugin.settings.webdav.depth === 'auto_1' ||
              this.plugin.settings.webdav.depth === 'auto_infinity'
						) {
							this.plugin.settings.webdav.depth = 'auto_unknown'
						}
						await this.plugin.saveSettings()
					})
			})

		new Setting(webdavDiv)
			.setName(t('settings_webdav_auth'))
			.setDesc(t('settings_webdav_auth_desc'))
			.addDropdown(async (dropdown) => {
				dropdown.addOption('basic', 'basic')
				if (VALID_REQ_URL) {
					dropdown.addOption('digest', 'digest')
				}

				// new version config, copied to old version, we need to reset it
				if (!VALID_REQ_URL && this.plugin.settings.webdav.authType !== 'basic') {
					this.plugin.settings.webdav.authType = 'basic'
					await this.plugin.saveSettings()
				}

				dropdown
					.setValue(this.plugin.settings.webdav.authType)
					.onChange(async (val: WebdavAuthType) => {
						this.plugin.settings.webdav.authType = val
						await this.plugin.saveSettings()
					})
			})

		new Setting(webdavDiv)
			.setName(t('settings_webdav_depth'))
			.setDesc(t('settings_webdav_depth_desc'))
			.addDropdown((dropdown) => {
				dropdown.addOption('auto', t('settings_webdav_depth_auto'))
				dropdown.addOption('manual_1', t('settings_webdav_depth_1'))
				dropdown.addOption('manual_infinity', t('settings_webdav_depth_inf'))

				let initVal = 'auto'
				const autoOptions: Set<WebdavDepthType> = new Set([
					'auto_unknown',
					'auto_1',
					'auto_infinity',
				])
				if (autoOptions.has(this.plugin.settings.webdav.depth)) {
					initVal = 'auto'
				} else {
					initVal = this.plugin.settings.webdav.depth || 'auto'
				}

				type DepthOption = 'auto' | 'manual_1' | 'manual_infinity';
				dropdown.setValue(initVal).onChange(async (val: DepthOption) => {
					if (val === 'auto') {
						this.plugin.settings.webdav.depth = 'auto_unknown'
						this.plugin.settings.webdav.manualRecursive = false
					} else if (val === 'manual_1') {
						this.plugin.settings.webdav.depth = 'manual_1'
						this.plugin.settings.webdav.manualRecursive = true
					} else if (val === 'manual_infinity') {
						this.plugin.settings.webdav.depth = 'manual_infinity'
						this.plugin.settings.webdav.manualRecursive = false
					}

					// TODO: any more elegant way?
					applyWebdavPresetRulesInPlace(this.plugin.settings.webdav)

					// normally save
					await this.plugin.saveSettings()
				})
			})

		let newWebdavRemoteBaseDir =
      this.plugin.settings.webdav.remoteBaseDir || ''
		new Setting(webdavDiv)
			.setName(t('settings_remote_base_dir'))
			.setDesc(t('settings_remote_base_dir_desc'))
			.addText((text) =>
				text
					.setPlaceholder(this.app.vault.getName())
					.setValue(newWebdavRemoteBaseDir)
					.onChange((value) => {
						newWebdavRemoteBaseDir = value.trim()
					})
			)
			.addButton((button) => {
				button.setButtonText(t('confirm'))
				button.onClick(() => {
					new ChangeRemoteBaseDirModal(
						this.app,
						this.plugin,
						newWebdavRemoteBaseDir,
						'webdav'
					).open()
				})
			})

		new Setting(webdavDiv)
			.setName(t('settings_check_connectivity'))
			.setDesc(t('settings_check_connectivity_desc'))
			.addButton(async (button) => {
				button.setButtonText(t('settings_check_connectivity_button'))
				button.onClick(async () => {
					new Notice(t('settings_check_connectivity_checking'))
					const client = new RemoteClient(
						this.plugin.settings.webdav,
						this.app.vault.getName(),
						() => this.plugin.saveSettings()
					)
					const errors = { msg: '' }
					const res = await client.checkConnectivity((err: any) => {
						errors.msg = `${err}`
					})
					if (res) {
						new Notice(t('settings_webdav_connect_success'))
					} else {
						if (VALID_REQ_URL) {
							new Notice(t('settings_webdav_connect_fail'))
						} else {
							new Notice(t('settings_webdav_connect_fail_with_cors'))
						}
						new Notice(errors.msg)
					}
				})
			})

		//////////////////////////////////////////////////
		// below for general chooser (part 2/2)
		//////////////////////////////////////////////////

		//////////////////////////////////////////////////
		// below for basic settings
		//////////////////////////////////////////////////

		const basicDiv = containerEl.createEl('div')
		basicDiv.createEl('h2', { text: t('settings_basic') })

		let newPassword = `${this.plugin.settings.password}`
		new Setting(basicDiv)
			.setName(t('settings_password'))
			.setDesc(t('settings_password_desc'))
			.addText((text) => {
				wrapTextWithPasswordHide(text)
				text
					.setPlaceholder('')
					.setValue(`${this.plugin.settings.password}`)
					.onChange(async (value) => {
						newPassword = value.trim()
					})
			})
			.addButton(async (button) => {
				button.setButtonText(t('confirm'))
				button.onClick(async () => {
					new PasswordModal(this.app, this.plugin, newPassword).open()
				})
			})

		new Setting(basicDiv)
			.setName(t('settings_auto_run'))
			.setDesc(t('settings_auto_run_desc'))
			.addDropdown((dropdown) => {
				dropdown.addOption('-1', t('settings_auto_run_not_set'))
				dropdown.addOption(`${1000 * 60 * 1}`, t('settings_auto_run_1min'))
				dropdown.addOption(`${1000 * 60 * 5}`, t('settings_auto_run_5min'))
				dropdown.addOption(`${1000 * 60 * 10}`, t('settings_auto_run_10min'))
				dropdown.addOption(`${1000 * 60 * 30}`, t('settings_auto_run_30min'))

				dropdown
					.setValue(`${this.plugin.settings.autoRunEveryMilliseconds}`)
					.onChange(async (val: string) => {
						const realVal = parseInt(val)
						this.plugin.settings.autoRunEveryMilliseconds = realVal
						await this.plugin.saveSettings()
						if (
							(realVal === undefined || realVal === null || realVal <= 0) &&
              this.plugin.autoRunIntervalID !== undefined
						) {
							// clear
							window.clearInterval(this.plugin.autoRunIntervalID)
							this.plugin.autoRunIntervalID = undefined
						} else if (
							realVal !== undefined &&
              realVal !== null &&
              realVal > 0
						) {
							const intervalID = window.setInterval(() => {
								this.plugin.syncRun('auto')
							}, realVal)
							this.plugin.autoRunIntervalID = intervalID
							this.plugin.registerInterval(intervalID)
						}
					})
			})

		new Setting(basicDiv)
			.setName(t('settings_run_once_startup'))
			.setDesc(t('settings_run_once_startup_desc'))
			.addDropdown((dropdown) => {
				dropdown.addOption('-1', t('settings_run_once_startup_not_set'))
				dropdown.addOption(
					`${1000 * 1 * 1}`,
					t('settings_run_once_startup_1sec')
				)
				dropdown.addOption(
					`${1000 * 10 * 1}`,
					t('settings_run_once_startup_10sec')
				)
				dropdown.addOption(
					`${1000 * 30 * 1}`,
					t('settings_run_once_startup_30sec')
				)
				dropdown
					.setValue(`${this.plugin.settings.initRunAfterMilliseconds}`)
					.onChange(async (val: string) => {
						const realVal = parseInt(val)
						this.plugin.settings.initRunAfterMilliseconds = realVal
						await this.plugin.saveSettings()
					})
			})
		new Setting(basicDiv)
			.setName(t('settings_skip_large_files'))
			.setDesc(t('settings_skip_large_files_desc'))
			.addDropdown((dropdown) => {
				dropdown.addOption('-1', t('settings_skip_large_files_not_set'))

				const mbs = [1, 5, 10, 50, 100, 500, 1000]
				for (const mb of mbs) {
					dropdown.addOption(`${mb * 1000 * 1000}`, `${mb} MB`)
				}
				dropdown
					.setValue(`${this.plugin.settings.skipSizeLargerThan}`)
					.onChange(async (val) => {
						this.plugin.settings.skipSizeLargerThan = parseInt(val)
						await this.plugin.saveSettings()
					})
			})

		//////////////////////////////////////////////////
		// below for advanced settings
		//////////////////////////////////////////////////
		const advDiv = containerEl.createEl('div')
		advDiv.createEl('h2', {
			text: t('settings_adv'),
		})

		new Setting(advDiv)
			.setName(t('settings_concurrency'))
			.setDesc(t('settings_concurrency_desc'))
			.addDropdown((dropdown) => {
				dropdown.addOption('1', '1')
				dropdown.addOption('2', '2')
				dropdown.addOption('3', '3')
				dropdown.addOption('5', '5 (default)')
				dropdown.addOption('10', '10')
				dropdown.addOption('15', '15')
				dropdown.addOption('20', '20')

				dropdown
					.setValue(`${this.plugin.settings.concurrency}`)
					.onChange(async (val) => {
						const realVal = parseInt(val)
						this.plugin.settings.concurrency = realVal
						await this.plugin.saveSettings()
					})
			})

		new Setting(advDiv)
			.setName(t('settings_sync_underscore'))
			.setDesc(t('settings_sync_underscore_desc'))
			.addDropdown((dropdown) => {
				dropdown.addOption('disable', t('disable'))
				dropdown.addOption('enable', t('enable'))
				dropdown
					.setValue(
						`${this.plugin.settings.syncUnderscoreItems ? 'enable' : 'disable'}`
					)
					.onChange(async (val) => {
						this.plugin.settings.syncUnderscoreItems = val === 'enable'
						await this.plugin.saveSettings()
					})
			})

		new Setting(advDiv)
			.setName(t('settings_config_dir'))
			.setDesc(
				t('settings_config_dir_desc', {
					configDir: this.app.vault.configDir,
				})
			)
			.addDropdown((dropdown) => {
				dropdown.addOption('disable', t('disable'))
				dropdown.addOption('enable', t('enable'))

				const bridge = {
					secondConfirm: false,
				}
				dropdown
					.setValue(
						`${this.plugin.settings.syncConfigDir ? 'enable' : 'disable'}`
					)
					.onChange(async (val) => {
						if (val === 'enable' && !bridge.secondConfirm) {
							dropdown.setValue('disable')
							new SyncConfigDirModal(this.app, this.plugin, () => {
								bridge.secondConfirm = true
								dropdown.setValue('enable')
							}).open()
						} else {
							bridge.secondConfirm = false
							this.plugin.settings.syncConfigDir = false
							await this.plugin.saveSettings()
						}
					})
			})

		//////////////////////////////////////////////////
		// below for import and export functions
		//////////////////////////////////////////////////

		// import and export
		const importExportDiv = containerEl.createEl('div')
		importExportDiv.createEl('h2', {
			text: t('settings_importexport'),
		})

		new Setting(importExportDiv)
			.setName(t('settings_export'))
			.setDesc(t('settings_export_desc'))
			.addButton(async (button) => {
				button.setButtonText(t('settings_export_desc_button'))
				button.onClick(async () => {
					new ExportSettingsQrCodeModal(this.app, this.plugin).open()
				})
			})

		new Setting(importExportDiv)
			.setName(t('settings_import'))
			.setDesc(t('settings_import_desc'))

		//////////////////////////////////////////////////
		// below for debug
		//////////////////////////////////////////////////

		const debugDiv = containerEl.createEl('div')
		debugDiv.createEl('h2', { text: t('settings_debug') })

		new Setting(debugDiv)
			.setName(t('settings_debug_level'))
			.setDesc(t('settings_debug_level_desc'))
			.addDropdown(async (dropdown) => {
				dropdown.addOption('info', 'info')
				dropdown.addOption('debug', 'debug')
				dropdown
					.setValue(this.plugin.settings.currLogLevel)
					.onChange(async (val: string) => {
						this.plugin.settings.currLogLevel = val
						log.setLevel(val as any)
						await this.plugin.saveSettings()
						log.info(`the log level is changed to ${val}`)
					})
			})

		new Setting(debugDiv)
			.setName(t('settings_output_settings_console'))
			.setDesc(t('settings_output_settings_console_desc'))
			.addButton(async (button) => {
				button.setButtonText(t('settings_output_settings_console_button'))
				button.onClick(async () => {
					const c = messyConfigToNormal(await this.plugin.loadData())
					log.info(c)
					new Notice(t('settings_output_settings_console_notice'))
				})
			})

		new Setting(debugDiv)
			.setName(t('settings_sync_plans'))
			.setDesc(t('settings_sync_plans_desc'))
			.addButton(async (button) => {
				button.setButtonText(t('settings_sync_plans_button_json'))
				button.onClick(async () => {
					await exportVaultSyncPlansToFiles(
						this.plugin.db,
						this.app.vault,
						this.plugin.vaultRandomID,
						'json'
					)
					new Notice(t('settings_sync_plans_notice'))
				})
			})
			.addButton(async (button) => {
				button.setButtonText(t('settings_sync_plans_button_table'))
				button.onClick(async () => {
					await exportVaultSyncPlansToFiles(
						this.plugin.db,
						this.app.vault,
						this.plugin.vaultRandomID,
						'table'
					)
					new Notice(t('settings_sync_plans_notice'))
				})
			})
		new Setting(debugDiv)
			.setName(t('settings_delete_sync_plans'))
			.setDesc(t('settings_delete_sync_plans_desc'))
			.addButton(async (button) => {
				button.setButtonText(t('settings_delete_sync_plans_button'))
				button.onClick(async () => {
					await clearAllSyncPlanRecords(this.plugin.db)
					new Notice(t('settings_delete_sync_plans_notice'))
				})
			})

		new Setting(debugDiv)
			.setName(t('settings_log_to_db'))
			.setDesc(t('settings_log_to_db_desc'))
			.addDropdown(async (dropdown) => {
				dropdown.addOption('enable', t('enable'))
				dropdown.addOption('disable', t('disable'))
				dropdown
					.setValue(this.plugin.settings.logToDB ? 'enable' : 'disable')
					.onChange(async (val: string) => {
						const logToDB = val === 'enable'
						if (logToDB) {
							applyLogWriterInPlace((...msg: any[]) => {
								insertLoggerOutputByVault(
									this.plugin.db,
									this.plugin.vaultRandomID,
									...msg
								)
							})
						} else {
							restoreLogWriterInPlace()
						}
						clearExpiredLoggerOutputRecords(this.plugin.db)
						this.plugin.settings.logToDB = logToDB
						await this.plugin.saveSettings()
					})
			})

		new Setting(debugDiv)
			.setName(t('settings_log_to_db_export'))
			.setDesc(
				t('settings_log_to_db_export_desc', {
					debugFolder: DEFAULT_DEBUG_FOLDER,
				})
			)
			.addButton(async (button) => {
				button.setButtonText(t('settings_log_to_db_export_button'))
				button.onClick(async () => {
					await exportVaultLoggerOutputToFiles(
						this.plugin.db,
						this.app.vault,
						this.plugin.vaultRandomID
					)
					new Notice(t('settings_log_to_db_export_notice'))
				})
			})

		new Setting(debugDiv)
			.setName(t('settings_log_to_db_clear'))
			.setDesc(t('settings_log_to_db_clear_desc'))
			.addButton(async (button) => {
				button.setButtonText(t('settings_log_to_db_clear_button'))
				button.onClick(async () => {
					await clearAllLoggerOutputRecords(this.plugin.db)
					new Notice(t('settings_log_to_db_clear_notice'))
				})
			})

		new Setting(debugDiv)
			.setName(t('settings_delete_sync_map'))
			.setDesc(t('settings_delete_sync_map_desc'))
			.addButton(async (button) => {
				button.setButtonText(t('settings_delete_sync_map_button'))
				button.onClick(async () => {
					await clearAllSyncMetaMapping(this.plugin.db)
					new Notice(t('settings_delete_sync_map_notice'))
				})
			})

		new Setting(debugDiv)
			.setName(t('settings_output_base_path_vault_id'))
			.setDesc(t('settings_output_base_path_vault_id_desc'))
			.addButton(async (button) => {
				button.setButtonText(t('settings_output_base_path_vault_id_button'))
				button.onClick(async () => {
					new Notice(this.plugin.getVaultBasePath())
					new Notice(this.plugin.vaultRandomID)
				})
			})

		new Setting(debugDiv)
			.setName(t('settings_reset_cache'))
			.setDesc(t('settings_reset_cache_desc'))
			.addButton(async (button) => {
				button.setButtonText(t('settings_reset_cache_button'))
				button.onClick(async () => {
					await destroyDBs()
					new Notice(t('settings_reset_cache_notice'))
				})
			})
	}

	hide() {
		const { containerEl } = this
		containerEl.empty()
		super.hide()
	}
}
