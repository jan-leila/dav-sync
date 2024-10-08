import {
	Modal,
	Notice,
	Plugin,
	Setting,
	addIcon,
	setIcon,
	FileSystemAdapter,
} from 'obsidian'
import cloneDeep from 'lodash/cloneDeep'
import { createElement, RotateCcw, RefreshCcw, FileText } from 'lucide'
import type {
	FileOrFolderMixedState,
	RemotelySavePluginSettings,
	SyncTriggerSourceType,
} from './baseTypes'
import {
	COMMAND_CALLBACK,
	COMMAND_URI,
} from './baseTypes'
import { importQrCodeUri } from './importExport'
import {
	insertDeleteRecordByVault,
	insertRenameRecordByVault,
	insertSyncPlanRecordByVault,
	loadFileHistoryTableByVault,
	prepareDBs,
	InternalDBs,
	insertLoggerOutputByVault,
	clearExpiredLoggerOutputRecords,
	clearExpiredSyncPlanRecords,
} from './localDB'
import { RemoteClient } from './remote'
import { DEFAULT_WEBDAV_CONFIG } from './remoteForWebdav'
import { RemotelySaveSettingTab } from './settings'
import { fetchMetadataFile, parseRemoteItems, SyncStatusType } from './sync'
import { doActualSync, getSyncPlan, isPasswordOk } from './sync'
import { messyConfigToNormal, normalConfigToMessy } from './configPersist'
import { ObsConfigDirFileType, listFilesInObsFolder } from './obsFolderLister'
import { I18n } from './i18n'
import type { LangTypeAndAuto, TransItemType } from './i18n'

import { SyncAlgoV2Modal } from './syncAlgoV2Notice'
import { applyPresetRulesInPlace } from './presetRules'

import { applyLogWriterInPlace, log } from './moreOnLog'
import AggregateError from 'aggregate-error'
import {
	exportVaultLoggerOutputToFiles,
	exportVaultSyncPlansToFiles,
} from './debugMode'
import { SizesConflictModal } from './syncSizesConflictNotice'

const DEFAULT_SETTINGS: RemotelySavePluginSettings = {
	webdav: DEFAULT_WEBDAV_CONFIG,
	password: '',
	currLogLevel: 'info',
	autoRunEveryMilliseconds: -1,
	initRunAfterMilliseconds: -1,
	agreeToUploadExtraMetadata: false,
	concurrency: 5,
	syncConfigDir: false,
	syncUnderscoreItems: false,
	lang: 'auto',
	logToDB: false,
	skipSizeLargerThan: -1,
}

interface OAuth2Info {
  verifier?: string;
  helperModal?: Modal;
  authDiv?: HTMLElement;
  revokeDiv?: HTMLElement;
  revokeAuthSetting?: Setting;
}

const iconNameSyncWait = 'remotely-save-sync-wait'
const iconNameSyncRunning = 'remotely-save-sync-running'
const iconNameLogs = 'remotely-save-logs'

const getIconSvg = () => {
	const iconSvgSyncWait = createElement(RotateCcw)
	iconSvgSyncWait.setAttribute('width', '100')
	iconSvgSyncWait.setAttribute('height', '100')
	const iconSvgSyncRunning = createElement(RefreshCcw)
	iconSvgSyncRunning.setAttribute('width', '100')
	iconSvgSyncRunning.setAttribute('height', '100')
	const iconSvgLogs = createElement(FileText)
	iconSvgLogs.setAttribute('width', '100')
	iconSvgLogs.setAttribute('height', '100')
	const res = {
		iconSvgSyncWait: iconSvgSyncWait.outerHTML,
		iconSvgSyncRunning: iconSvgSyncRunning.outerHTML,
		iconSvgLogs: iconSvgLogs.outerHTML,
	}

	iconSvgSyncWait.empty()
	iconSvgSyncRunning.empty()
	iconSvgLogs.empty()
	return res
}

export default class RemotelySavePlugin extends Plugin {
	settings: RemotelySavePluginSettings
	db: InternalDBs
	syncStatus: SyncStatusType
	oauth2Info: OAuth2Info
	currLogLevel: string
	currSyncMsg?: string
	syncRibbon?: HTMLElement
	autoRunIntervalID?: number
	i18n: I18n
	vaultRandomID: string

	async syncRun(triggerSource: SyncTriggerSourceType = 'manual') {
		const t = (x: TransItemType, vars?: any) => {
			return this.i18n.t(x, vars)
		}

		const getNotice = (x: string, timeout?: number) => {
			// only show notices in manual mode
			// no notice in auto mode
			if (triggerSource === 'manual' || triggerSource === 'dry') {
				new Notice(x, timeout)
			}
		}
		if (this.syncStatus !== 'idle') {
			// here the notice is shown regardless of triggerSource
			new Notice(
				t('sync_already_running', {
					pluginName: this.manifest.name,
					syncStatus: this.syncStatus,
				})
			)
			if (this.currSyncMsg !== undefined && this.currSyncMsg !== '') {
				new Notice(this.currSyncMsg)
			}
			return
		}

		let originLabel = `${this.manifest.name}`
		if (this.syncRibbon !== undefined) {
			originLabel = this.syncRibbon.getAttribute('aria-label')
		}

		try {
			log.info(
				`${
					this.manifest.id
				}-${Date.now()}: start sync, triggerSource=${triggerSource}`
			)

			if (this.syncRibbon !== undefined) {
				setIcon(this.syncRibbon, iconNameSyncRunning)
				this.syncRibbon.setAttribute(
					'aria-label',
					t('sync_syncing_ribbon', {
						pluginName: this.manifest.name,
						triggerSource: triggerSource,
					})
				)
			}

			const MAX_STEPS = 8

			if (triggerSource === 'dry') {
				getNotice(
					t('sync_step_0', {
						maxSteps: `${MAX_STEPS}`,
					})
				)
			}

			getNotice(
				t('sync_step_1', {
					maxSteps: `${MAX_STEPS}`,
				})
			)
			this.syncStatus = 'preparing'

			getNotice(
				t('sync_step_2', {
					maxSteps: `${MAX_STEPS}`,
				})
			)
			this.syncStatus = 'getting_remote_files_list'
			const client = new RemoteClient(
				this.settings.webdav,
				this.app.vault.getName(),
				() => this.saveSettings()
			)
			const remoteRsp = await client.listFromRemote()

			getNotice(
				t('sync_step_3', {
					maxSteps: `${MAX_STEPS}`,
				})
			)
			this.syncStatus = 'checking_password'
			const passwordCheckResult = await isPasswordOk(
				remoteRsp.Contents,
				this.settings.password
			)
			if (!passwordCheckResult.ok) {
				getNotice(t('sync_password_err'))
				throw Error(passwordCheckResult.reason)
			}

			getNotice(
				t('sync_step_4', {
					maxSteps: `${MAX_STEPS}`,
				})
			)
			this.syncStatus = 'getting_remote_extra_meta'
			const { remoteStates, metadataFile } = await parseRemoteItems(
				remoteRsp.Contents,
				this.db,
				this.vaultRandomID,
				this.settings.password
			)
			const origMetadataOnRemote = await fetchMetadataFile(
				metadataFile,
				client,
				this.app.vault,
				this.settings.password
			)

			getNotice(
				t('sync_step_5', {
					maxSteps: `${MAX_STEPS}`,
				})
			)
			this.syncStatus = 'getting_local_meta'
			const local = this.app.vault.getAllLoadedFiles()
			const localHistory = await loadFileHistoryTableByVault(
				this.db,
				this.vaultRandomID
			)
			let localConfigDirContents: ObsConfigDirFileType[] = undefined
			if (this.settings.syncConfigDir) {
				localConfigDirContents = await listFilesInObsFolder(
					this.app.vault.configDir,
					this.app.vault,
					this.manifest.id
				)
			}

			getNotice(
				t('sync_step_6', {
					maxSteps: `${MAX_STEPS}`,
				})
			)
			this.syncStatus = 'generating_plan'
			const { plan, sortedKeys, deletions, sizesGoWrong } = await getSyncPlan(
				remoteStates,
				local,
				localConfigDirContents,
				origMetadataOnRemote.deletions,
				localHistory,
				triggerSource,
				this.app.vault,
				this.settings.syncConfigDir,
				this.app.vault.configDir,
				this.settings.syncUnderscoreItems,
				this.settings.skipSizeLargerThan,
				this.settings.password
			)
			log.info(plan.mixedStates) // for debugging
			await insertSyncPlanRecordByVault(this.db, plan, this.vaultRandomID)

			// The operations above are almost read only and kind of safe.
			// The operations below begins to write or delete (!!!) something.

			if (triggerSource !== 'dry') {
				getNotice(
					t('sync_step_7', {
						maxSteps: `${MAX_STEPS}`,
					})
				)

				this.syncStatus = 'syncing'
				await doActualSync(
					client,
					this.db,
					this.vaultRandomID,
					this.app.vault,
					plan,
					sortedKeys,
					metadataFile,
					origMetadataOnRemote,
					sizesGoWrong,
					deletions,
					(key: string) => this.trash(key),
					this.settings.password,
					this.settings.concurrency,
					(ss: FileOrFolderMixedState[]) => {
						new SizesConflictModal(
							this.app,
							this,
							this.settings.skipSizeLargerThan,
							ss,
							this.settings.password !== ''
						).open()
					},
					(i: number, totalCount: number, pathName: string, decision: string) =>
						this.setCurrSyncMsg(i, totalCount, pathName, decision)
				)
			} else {
				this.syncStatus = 'syncing'
				getNotice(
					t('sync_step_7skip', {
						maxSteps: `${MAX_STEPS}`,
					})
				)
			}

			getNotice(
				t('sync_step_8', {
					maxSteps: `${MAX_STEPS}`,
				})
			)
			this.syncStatus = 'finish'
			this.syncStatus = 'idle'

			if (this.syncRibbon !== undefined) {
				setIcon(this.syncRibbon, iconNameSyncWait)
				this.syncRibbon.setAttribute('aria-label', originLabel)
			}

			log.info(
				`${
					this.manifest.id
				}-${Date.now()}: finish sync, triggerSource=${triggerSource}`
			)
		} catch (error) {
			const msg = t('sync_abort', {
				manifestID: this.manifest.id,
				theDate: `${Date.now()}`,
				triggerSource: triggerSource,
				syncStatus: this.syncStatus,
			})
			log.error(msg)
			log.error(error)
			getNotice(msg, 10 * 1000)
			if (error instanceof AggregateError) {
				for (const e of error.errors) {
					getNotice(e.message, 10 * 1000)
				}
			} else {
				getNotice(error.message, 10 * 1000)
			}
			this.syncStatus = 'idle'
			if (this.syncRibbon !== undefined) {
				setIcon(this.syncRibbon, iconNameSyncWait)
				this.syncRibbon.setAttribute('aria-label', originLabel)
			}
		}
	}

	async onload() {
		log.info(`loading plugin ${this.manifest.id}`)

		const { iconSvgSyncWait, iconSvgSyncRunning, iconSvgLogs } = getIconSvg()

		addIcon(iconNameSyncWait, iconSvgSyncWait)
		addIcon(iconNameSyncRunning, iconSvgSyncRunning)
		addIcon(iconNameLogs, iconSvgLogs)

		this.oauth2Info = {
			verifier: '',
			helperModal: undefined,
			authDiv: undefined,
			revokeDiv: undefined,
			revokeAuthSetting: undefined,
		} // init

		this.currSyncMsg = ''

		await this.loadSettings()
		await this.checkIfPresetRulesFollowed()

		// lang should be load early, but after settings
		this.i18n = new I18n(this.settings.lang, async (lang: LangTypeAndAuto) => {
			this.settings.lang = lang
			await this.saveSettings()
		})
		const t = (x: TransItemType, vars?: any) => {
			return this.i18n.t(x, vars)
		}

		if (this.settings.currLogLevel !== undefined) {
			log.setLevel(this.settings.currLogLevel as any)
		}

		// MUST before prepareDB()
		// And, it's also possible to be an empty string,
		// which means the vaultRandomID is read from db later!
		const vaultRandomIDFromOldConfigFile =
      await this.getVaultRandomIDFromOldConfigFile()

		// no need to await this
		this.tryToAddIgnoreFile()

		const vaultBasePath = this.getVaultBasePath()

		try {
			await this.prepareDBAndVaultRandomID(
				vaultBasePath,
				vaultRandomIDFromOldConfigFile
			)
		} catch (err) {
			new Notice(err.message, 10 * 1000)
			throw err
		}

		// must AFTER preparing DB
		this.addOutputToDBIfSet()
		this.enableAutoClearOutputToDBHistIfSet()

		// must AFTER preparing DB
		this.enableAutoClearSyncPlanHist()

		this.syncStatus = 'idle'

		this.registerEvent(
			this.app.vault.on('delete', async (fileOrFolder) => {
				await insertDeleteRecordByVault(
					this.db,
					fileOrFolder,
					this.vaultRandomID
				)
			})
		)

		this.registerEvent(
			this.app.vault.on('rename', async (fileOrFolder, oldPath) => {
				await insertRenameRecordByVault(
					this.db,
					fileOrFolder,
					oldPath,
					this.vaultRandomID
				)
			})
		)

		this.registerObsidianProtocolHandler(COMMAND_URI, async (inputParams) => {
			const parsed = importQrCodeUri(inputParams, this.app.vault.getName())
			if (parsed.status === 'error') {
				new Notice(parsed.message)
			} else {
				const copied = cloneDeep(parsed.result)
				// new Notice(JSON.stringify(copied))
				this.settings = Object.assign({}, this.settings, copied)
				this.saveSettings()
				new Notice(
					t('protocol_save_qr_code', {
						manifestName: this.manifest.name,
					})
				)
			}
		})

		this.registerObsidianProtocolHandler(
			COMMAND_CALLBACK,
			async (inputParams) => {
				new Notice(
					t('protocol_callback_not_supported', {
						params: JSON.stringify(inputParams),
					})
				)
			}
		)

		this.syncRibbon = this.addRibbonIcon(
			iconNameSyncWait,
			`${this.manifest.name}`,
			async () => this.syncRun('manual')
		)

		this.addCommand({
			id: 'start-sync',
			name: t('command_start_sync'),
			icon: iconNameSyncWait,
			callback: async () => {
				this.syncRun('manual')
			},
		})

		this.addCommand({
			id: 'start-sync-dry-run',
			name: t('command_dry_run'),
			icon: iconNameSyncWait,
			callback: async () => {
				this.syncRun('dry')
			},
		})

		this.addCommand({
			id: 'export-sync-plans-json',
			name: t('command_export_sync_plans_json'),
			icon: iconNameLogs,
			callback: async () => {
				await exportVaultSyncPlansToFiles(
					this.db,
					this.app.vault,
					this.vaultRandomID,
					'json'
				)
				new Notice(t('settings_sync_plans_notice'))
			},
		})

		this.addCommand({
			id: 'export-sync-plans-table',
			name: t('command_export_sync_plans_table'),
			icon: iconNameLogs,
			callback: async () => {
				await exportVaultSyncPlansToFiles(
					this.db,
					this.app.vault,
					this.vaultRandomID,
					'table'
				)
				new Notice(t('settings_sync_plans_notice'))
			},
		})

		this.addCommand({
			id: 'export-logs-in-db',
			name: t('command_export_logs_in_db'),
			icon: iconNameLogs,
			callback: async () => {
				await exportVaultLoggerOutputToFiles(
					this.db,
					this.app.vault,
					this.vaultRandomID
				)
				new Notice(t('settings_log_to_db_export_notice'))
			},
		})

		this.addSettingTab(new RemotelySaveSettingTab(this.app, this))

		// this.registerDomEvent(document, "click", (evt: MouseEvent) => {
		//   log.info("click", evt);
		// });

		if (!this.settings.agreeToUploadExtraMetadata) {
			const syncAlgoV2Modal = new SyncAlgoV2Modal(this.app, this)
			syncAlgoV2Modal.open()
		} else {
			this.enableAutoSyncIfSet()
			this.enableInitSyncIfSet()
		}
	}

	async onunload() {
		log.info(`unloading plugin ${this.manifest.id}`)
		this.syncRibbon = undefined
		if (this.oauth2Info !== undefined) {
			this.oauth2Info.helperModal = undefined
			this.oauth2Info = undefined
		}
	}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			cloneDeep(DEFAULT_SETTINGS),
			messyConfigToNormal(await this.loadData())
		)
		if (this.settings.webdav.manualRecursive === undefined) {
			this.settings.webdav.manualRecursive = false
		}
		if (this.settings.webdav.depth === undefined) {
			this.settings.webdav.depth = 'auto_unknown'
		}
		if (this.settings.webdav.remoteBaseDir === undefined) {
			this.settings.webdav.remoteBaseDir = ''
		}
	}

	async checkIfPresetRulesFollowed() {
		const res = applyPresetRulesInPlace(this.settings)
		if (res.changed) {
			await this.saveSettings()
		}
	}

	async saveSettings() {
		await this.saveData(normalConfigToMessy(this.settings))
	}

	async getVaultRandomIDFromOldConfigFile() {
		let vaultRandomID = ''
		if (this.settings.vaultRandomID !== undefined) {
			// In old version, the vault id is saved in data.json
			// But we want to store it in localForage later
			if (this.settings.vaultRandomID !== '') {
				// a real string was assigned before
				vaultRandomID = this.settings.vaultRandomID
			}
			log.debug('vaultRandomID is no longer saved in data.json')
			delete this.settings.vaultRandomID
			await this.saveSettings()
		}
		return vaultRandomID
	}

	async trash(x: string) {
		if (!(await this.app.vault.adapter.trashSystem(x))) {
			await this.app.vault.adapter.trashLocal(x)
		}
	}

	getVaultBasePath() {
		if (this.app.vault.adapter instanceof FileSystemAdapter) {
			// in desktop
			return this.app.vault.adapter.getBasePath().split('?')[0]
		} else {
			// in mobile
			return this.app.vault.adapter.getResourcePath('').split('?')[0]
		}
	}

	async prepareDBAndVaultRandomID(
		vaultBasePath: string,
		vaultRandomIDFromOldConfigFile: string
	) {
		const { db, vaultRandomID } = await prepareDBs(
			vaultBasePath,
			vaultRandomIDFromOldConfigFile
		)
		this.db = db
		this.vaultRandomID = vaultRandomID
	}

	enableAutoSyncIfSet() {
		if (
			this.settings.autoRunEveryMilliseconds !== undefined &&
      this.settings.autoRunEveryMilliseconds !== null &&
      this.settings.autoRunEveryMilliseconds > 0
		) {
			this.app.workspace.onLayoutReady(() => {
				const intervalID = window.setInterval(() => {
					this.syncRun('auto')
				}, this.settings.autoRunEveryMilliseconds)
				this.autoRunIntervalID = intervalID
				this.registerInterval(intervalID)
			})
		}
	}

	enableInitSyncIfSet() {
		if (
			this.settings.initRunAfterMilliseconds !== undefined &&
      this.settings.initRunAfterMilliseconds !== null &&
      this.settings.initRunAfterMilliseconds > 0
		) {
			this.app.workspace.onLayoutReady(() => {
				window.setTimeout(() => {
					this.syncRun('autoOnceInit')
				}, this.settings.initRunAfterMilliseconds)
			})
		}
	}

	async saveAgreeToUseNewSyncAlgorithm() {
		this.settings.agreeToUploadExtraMetadata = true
		await this.saveSettings()
	}

	async setCurrSyncMsg(
		i: number,
		totalCount: number,
		pathName: string,
		decision: string
	) {
		const msg = `syncing progress=${i}/${totalCount},decision=${decision},path=${pathName}`
		this.currSyncMsg = msg
	}

	/**
   * Because data.json contains sensitive information,
   * We usually want to ignore it in the version control.
   * However, if there's already a an ignore file (even empty),
   * we respect the existing configure and not add any modifications.
   * @returns
   */
	async tryToAddIgnoreFile() {
		const pluginConfigDir =
      this.manifest.dir ||
      `${this.app.vault.configDir}/plugins/${this.manifest.dir}`
		const pluginConfigDirExists =
      await this.app.vault.adapter.exists(pluginConfigDir)
		if (!pluginConfigDirExists) {
			// what happened?
			return
		}
		const ignoreFile = `${pluginConfigDir}/.gitignore`
		const ignoreFileExists = await this.app.vault.adapter.exists(ignoreFile)

		const contentText = 'data.json\n'

		try {
			if (!ignoreFileExists) {
				// not exists, directly create
				// no need to await
				this.app.vault.adapter.write(ignoreFile, contentText)
			}
		} catch (error) {
			// just skip
		}
	}

	addOutputToDBIfSet() {
		if (this.settings.logToDB) {
			applyLogWriterInPlace((...msg: any[]) => {
				insertLoggerOutputByVault(this.db, this.vaultRandomID, ...msg)
			})
		}
	}

	enableAutoClearOutputToDBHistIfSet() {
		const initClearOutputToDBHistAfterMilliseconds = 1000 * 45
		const autoClearOutputToDBHistAfterMilliseconds = 1000 * 60 * 5

		this.app.workspace.onLayoutReady(() => {
			// init run
			window.setTimeout(() => {
				if (this.settings.logToDB) {
					clearExpiredLoggerOutputRecords(this.db)
				}
			}, initClearOutputToDBHistAfterMilliseconds)

			// scheduled run
			const intervalID = window.setInterval(() => {
				if (this.settings.logToDB) {
					clearExpiredLoggerOutputRecords(this.db)
				}
			}, autoClearOutputToDBHistAfterMilliseconds)
			this.registerInterval(intervalID)
		})
	}

	enableAutoClearSyncPlanHist() {
		const initClearSyncPlanHistAfterMilliseconds = 1000 * 45
		const autoClearSyncPlanHistAfterMilliseconds = 1000 * 60 * 5

		this.app.workspace.onLayoutReady(() => {
			// init run
			window.setTimeout(() => {
				clearExpiredSyncPlanRecords(this.db)
			}, initClearSyncPlanHistAfterMilliseconds)

			// scheduled run
			const intervalID = window.setInterval(() => {
				clearExpiredSyncPlanRecords(this.db)
			}, autoClearSyncPlanHistAfterMilliseconds)
			this.registerInterval(intervalID)
		})
	}
}
