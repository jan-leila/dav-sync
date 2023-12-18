/**
 * Only type defs here.
 * To avoid circular dependency.
 */

import { Platform, requireApiVersion } from 'obsidian'
import type { LangTypeAndAuto } from './i18n'

export const DEFAULT_CONTENT_TYPE = 'application/octet-stream'

export type WebdavAuthType = 'digest' | 'basic';
export type WebdavDepthType =
  | 'auto_unknown'
  | 'auto_1'
  | 'auto_infinity'
  | 'manual_1'
  | 'manual_infinity';

export interface WebdavConfig {
  address: string;
  username: string;
  password: string;
  authType: WebdavAuthType;
  manualRecursive: boolean; // deprecated in 0.3.6, use depth
  depth?: WebdavDepthType;
  remoteBaseDir?: string;
}

export interface OnedriveConfig {
  accessToken: string;
  clientID: string;
  authority: string;
  refreshToken: string;
  accessTokenExpiresInSeconds: number;
  accessTokenExpiresAtTime: number;
  deltaLink: string;
  username: string;
  credentialsShouldBeDeletedAtTime?: number;
  remoteBaseDir?: string;
}

export interface RemotelySavePluginSettings {
  webdav: WebdavConfig;
  password: string;
  currLogLevel?: string;
  autoRunEveryMilliseconds?: number;
  initRunAfterMilliseconds?: number;
  agreeToUploadExtraMetadata?: boolean;
  concurrency?: number;
  syncConfigDir?: boolean;
  syncUnderscoreItems?: boolean;
  lang?: LangTypeAndAuto;
  logToDB?: boolean;
  skipSizeLargerThan?: number;

  /**
   * @deprecated
   */
  vaultRandomID?: string;
}

export interface RemoteItem {
  key: string;
  lastModified: number;
  size: number;
  etag?: string;
}

export const COMMAND_URI = 'remotely-save'
export const COMMAND_CALLBACK = 'remotely-save-cb'

export interface UriParams {
  func?: string;
  vault?: string;
  ver?: string;
  data?: string;
}

// 80 days
export const OAUTH2_FORCE_EXPIRE_MILLISECONDS = 1000 * 60 * 60 * 24 * 80

type DecisionTypeForFile =
  | 'skipUploading' // special, modifiedTimeLocal === modifiedTimeRemote
  | 'uploadLocalDelHistToRemote' // "delLocalIfExists && delRemoteIfExists && cleanLocalDelHist && uploadLocalDelHistToRemote"
  | 'keepRemoteDelHist' // "delLocalIfExists && delRemoteIfExists && cleanLocalDelHist && keepRemoteDelHist"
  | 'uploadLocalToRemote' // "skipLocal && uploadLocalToRemote && cleanLocalDelHist && cleanRemoteDelHist"
  | 'downloadRemoteToLocal'; // "downloadRemoteToLocal && skipRemote && cleanLocalDelHist && cleanRemoteDelHist"

type DecisionTypeForFileSize =
  | 'skipUploadingTooLarge'
  | 'skipDownloadingTooLarge'
  | 'skipUsingLocalDelTooLarge'
  | 'skipUsingRemoteDelTooLarge'
  | 'errorLocalTooLargeConflictRemote'
  | 'errorRemoteTooLargeConflictLocal';

type DecisionTypeForFolder =
  | 'createFolder'
  | 'uploadLocalDelHistToRemoteFolder'
  | 'keepRemoteDelHistFolder'
  | 'skipFolder';

export type DecisionType =
  | DecisionTypeForFile
  | DecisionTypeForFileSize
  | DecisionTypeForFolder;

export interface FileOrFolderMixedState {
  key: string;
  existLocal?: boolean;
  existRemote?: boolean;
  modifiedTimeLocal?: number;
  modifiedTimeRemote?: number;
  deleteTimeLocal?: number;
  deleteTimeRemote?: number;
  sizeLocal?: number;
  sizeLocalEnc?: number;
  sizeRemote?: number;
  sizeRemoteEnc?: number;
  changeRemoteMtimeUsingMapping?: boolean;
  changeLocalMtimeUsingMapping?: boolean;
  decision?: DecisionType;
  decisionBranch?: number;
  syncDone?: 'done';
  remoteEncryptedKey?: string;

  modifiedTimeLocalFmt?: string;
  modifiedTimeRemoteFmt?: string;
  deleteTimeLocalFmt?: string;
  deleteTimeRemoteFmt?: string;
}

export const API_VER_STAT_FOLDER = '0.13.27'
export const API_VER_REQ_URL = '0.13.26' // desktop ver 0.13.26, iOS ver 1.1.1
export const API_VER_REQ_URL_ANDROID = '0.14.6' // Android ver 1.2.1

export const VALID_REQ_URL =
  (!Platform.isAndroidApp && requireApiVersion(API_VER_REQ_URL)) ||
  (Platform.isAndroidApp && requireApiVersion(API_VER_REQ_URL_ANDROID))

export const DEFAULT_DEBUG_FOLDER = '_debug_remotely_save/'
export const DEFAULT_SYNC_PLANS_HISTORY_FILE_PREFIX =
  'sync_plans_hist_exported_on_'
export const DEFAULT_LOG_HISTORY_FILE_PREFIX = 'log_hist_exported_on_'

export type SyncTriggerSourceType = 'manual' | 'auto' | 'dry' | 'autoOnceInit';
