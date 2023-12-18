import { Vault } from 'obsidian'
import type {
	WebdavConfig,
} from './baseTypes'
import * as webdav from './remoteForWebdav'

export class RemoteClient {
	readonly webdavClient?: webdav.WrappedWebdavClient
	readonly webdavConfig?: WebdavConfig

	constructor(
		webdavConfig?: WebdavConfig,
		vaultName?: string,
		saveUpdatedConfigFunc?: () => Promise<any>
	) {
		// the client may modify the config in place,
		// so we use a ref not copy of config here
		if (vaultName === undefined || saveUpdatedConfigFunc === undefined) {
			throw Error(
				'remember to provide vault name and callback while init webdav client'
			)
		}
		const remoteBaseDir = webdavConfig.remoteBaseDir || vaultName
		this.webdavConfig = webdavConfig
		this.webdavClient = webdav.getWebdavClient(
			this.webdavConfig,
			remoteBaseDir,
			saveUpdatedConfigFunc
		)
	}

	getRemoteMeta = async (fileOrFolderPath: string) => {
		return await webdav.getRemoteMeta(this.webdavClient, fileOrFolderPath)
	}

	uploadToRemote = async (
		fileOrFolderPath: string,
		vault: Vault,
		isRecursively: boolean = false,
		password: string = '',
		remoteEncryptedKey: string = '',
		uploadRaw: boolean = false,
		rawContent: string | ArrayBuffer = ''
	) => {
		return await webdav.uploadToRemote(
			this.webdavClient,
			fileOrFolderPath,
			vault,
			isRecursively,
			password,
			remoteEncryptedKey,
			uploadRaw,
			rawContent
		)
	}

	listFromRemote = async (prefix?: string) => {
		return await webdav.listFromRemote(this.webdavClient, prefix)
	}

	downloadFromRemote = async (
		fileOrFolderPath: string,
		vault: Vault,
		mtime: number,
		password: string = '',
		remoteEncryptedKey: string = '',
		skipSaving: boolean = false
	) => {
		return await webdav.downloadFromRemote(
			this.webdavClient,
			fileOrFolderPath,
			vault,
			mtime,
			password,
			remoteEncryptedKey,
			skipSaving
		)
	}

	deleteFromRemote = async (
		fileOrFolderPath: string,
		password: string = '',
		remoteEncryptedKey: string = ''
	) => {
		return await webdav.deleteFromRemote(
			this.webdavClient,
			fileOrFolderPath,
			password,
			remoteEncryptedKey
		)
	}

	checkConnectivity = async (callbackFunc?: any) => {
		return await webdav.checkConnectivity(this.webdavClient, callbackFunc)
	}
}
