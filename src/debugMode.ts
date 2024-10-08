import { Vault } from 'obsidian'

import type { SyncPlanType } from './sync'
import {
	readAllSyncPlanRecordTextsByVault,
	readAllLogRecordTextsByVault,
} from './localDB'
import type { InternalDBs } from './localDB'
import { mkdirpInVault } from './misc'
import {
	DEFAULT_DEBUG_FOLDER,
	DEFAULT_LOG_HISTORY_FILE_PREFIX,
	DEFAULT_SYNC_PLANS_HISTORY_FILE_PREFIX,
	FileOrFolderMixedState,
} from './baseTypes'

import { log } from './moreOnLog'

const turnSyncPlanToTable = (record: string) => {
	const syncPlan: SyncPlanType = JSON.parse(record)
	const { ts, tsFmt } = syncPlan

	type allowedHeadersType = keyof FileOrFolderMixedState;
	const headers: allowedHeadersType[] = [
		'key',
		'remoteEncryptedKey',
		'existLocal',
		'sizeLocal',
		'sizeLocalEnc',
		'modifiedTimeLocal',
		'deleteTimeLocal',
		'changeLocalMtimeUsingMapping',
		'existRemote',
		'sizeRemote',
		'sizeRemoteEnc',
		'modifiedTimeRemote',
		'deleteTimeRemote',
		'changeRemoteMtimeUsingMapping',
		'decision',
		'decisionBranch',
	]

	const lines = [
		`ts: ${ts}${tsFmt !== undefined ? ' / ' + tsFmt : ''}`,
		`| ${headers.join(' | ')} |`,
		`| ${headers.map(() => '---').join(' | ')} |`,
	]
	for (const entry of Object.entries(syncPlan.mixedStates)) {
		const v1 = entry[1]
		const v = v1 as FileOrFolderMixedState
		const singleLine = []
		for (const h of headers) {
			const field = v[h]
			if (field === undefined) {
				singleLine.push('')
				continue
			}
			if (
				h === 'modifiedTimeLocal' ||
				h === 'deleteTimeLocal' ||
				h === 'modifiedTimeRemote' ||
				h === 'deleteTimeRemote'
			) {
				const fmt = v[(h + 'Fmt') as allowedHeadersType] as string
				const s = `${field}${fmt !== undefined ? ' / ' + fmt : ''}`
				singleLine.push(s)
			} else {
				singleLine.push(field)
			}
		}
		lines.push(`| ${singleLine.join(' | ')} |`)
	}

	return lines.join('\n')
}

export const exportVaultSyncPlansToFiles = async (
	db: InternalDBs,
	vault: Vault,
	vaultRandomID: string,
	toFormat: 'table' | 'json' = 'json'
) => {
	log.info('exporting')
	await mkdirpInVault(DEFAULT_DEBUG_FOLDER, vault)
	const records = await readAllSyncPlanRecordTextsByVault(db, vaultRandomID)
	let md = ''
	if (records.length === 0) {
		md = 'No sync plans history found'
	} else {
		if (toFormat === 'json') {
			md =
        'Sync plans found:\n\n' +
        records.map((x) => '```json\n' + x + '\n```\n').join('\n')
		} else if (toFormat === 'table') {
			md =
        'Sync plans found:\n\n' + records.map(turnSyncPlanToTable).join('\n\n')
		}
	}
	const ts = Date.now()
	const filePath = `${DEFAULT_DEBUG_FOLDER}${DEFAULT_SYNC_PLANS_HISTORY_FILE_PREFIX}${ts}.md`
	await vault.create(filePath, md, {
		mtime: ts,
	})
	log.info('finish exporting')
}

export const exportVaultLoggerOutputToFiles = async (
	db: InternalDBs,
	vault: Vault,
	vaultRandomID: string
) => {
	await mkdirpInVault(DEFAULT_DEBUG_FOLDER, vault)
	const records = await readAllLogRecordTextsByVault(db, vaultRandomID)
	let md = ''
	if (records.length === 0) {
		md = 'No logger history found.'
	} else {
		md =
      'Logger history found:\n\n' +
      '```text\n' +
      records.join('\n') +
      '\n```\n'
	}
	const ts = Date.now()
	const filePath = `${DEFAULT_DEBUG_FOLDER}${DEFAULT_LOG_HISTORY_FILE_PREFIX}${ts}.md`
	await vault.create(filePath, md, {
		mtime: ts,
	})
}
