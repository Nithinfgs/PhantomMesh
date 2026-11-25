export type PageId = "home" | "search" | "devices" | "sources" | "settings";

export type SearchScope = "all" | "local" | "devices" | "github" | "web" | "commands";

export type ResultSource =
  | "local"
  | "github"
  | "stack_overflow"
  | "docs"
  | "remote_device"
  | "command";

export interface ResultAction {
  id: string;
  label: string;
  shortcut?: string | null;
  destructive: boolean;
}

export interface SearchResult {
  id: string;
  title: string;
  subtitle: string;
  source: ResultSource;
  sourceLabel: string;
  kind: string;
  uri: string;
  score: number;
  preview: string;
  actions: ResultAction[];
  metadata: Record<string, unknown>;
  pinned: boolean;
  modifiedAt?: number | null;
}

export interface ProviderStatus {
  providerId: string;
  label: string;
  state: "ok" | "error" | "rate_limited" | "offline" | "disabled" | "timeout" | string;
  message?: string | null;
  elapsedMs: number;
  resultCount: number;
}

export interface SearchQuery {
  query: string;
  scope: SearchScope;
  limit: number;
  deviceFilterId?: string | null;
}

export interface SearchResponse {
  queryId: number;
  query: string;
  scope: SearchScope;
  results: SearchResult[];
  providerStatuses: ProviderStatus[];
  elapsedMs: number;
  cancelled: boolean;
}

export interface ProviderBatchEvent {
  queryId: number;
  providerStatus: ProviderStatus;
  results: SearchResult[];
}

export interface IndexedDirectory {
  id: string;
  path: string;
  enabled: boolean;
  shareRemotely: boolean;
  lastIndexedAt?: string | null;
  fileCount: number;
}

export interface IndexedFileRecord {
  id: string;
  directoryId: string;
  path: string;
  name: string;
  extension: string;
  parentDir: string;
  mimeType: string;
  sizeBytes: number;
  modifiedAt: number;
  indexedAt: number;
  contentHash: string;
  contentPreview: string;
  openCount: number;
  lastOpenedAt?: number | null;
  isPinned: boolean;
}

export interface IndexStats {
  totalFiles: number;
  totalDirectories: number;
  sharedDirectories: number;
  sharedFiles: number;
  lastIndexedAt?: string | null;
  databaseSizeBytes: number;
}

export interface IndexingProgress {
  active: boolean;
  directoryPath?: string | null;
  scannedFiles: number;
  indexedFiles: number;
  skippedFiles: number;
  removedFiles: number;
  percent: number;
  statusText: string;
}

export interface PairedDeviceRecord {
  id: string;
  name: string;
  os: string;
  host: string;
  port: number;
  publicKeyB64: string;
  sharedSecretB64: string;
  fingerprint: string;
  status: string;
  lastSeenAt?: string | null;
  sharedFileCount: number;
  trusted: boolean;
  createdAt: string;
}

export interface DiscoveredPeer {
  deviceId: string;
  name: string;
  os: string;
  host: string;
  port: number;
  fingerprint: string;
  lastSeenAt: string;
  alreadyPaired: boolean;
}

export interface PendingPairing {
  pairingId: string;
  peerDeviceId: string;
  peerName: string;
  peerOs: string;
  peerHost: string;
  peerPort: number;
  peerPublicKeyB64: string;
  peerFingerprint: string;
  sasCode: string;
  direction: string;
  createdAt: string;
}

export interface RemoteFileItem {
  id: string;
  name: string;
  path: string;
  extension: string;
  sizeBytes: number;
  modifiedAt: number;
  preview: string;
  score: number;
}

export interface RemoteSharedDirectory {
  id: string;
  path: string;
  fileCount: number;
}

export interface RemoteBrowseResponse {
  deviceId: string;
  deviceName: string;
  directories: RemoteSharedDirectory[];
  files: RemoteFileItem[];
}

export interface TransferRecord {
  id: string;
  deviceId: string;
  deviceName: string;
  filename: string;
  remotePath: string;
  localPath: string;
  sizeBytes: number;
  transferredBytes: number;
  sha256?: string | null;
  direction: string;
  status: string;
  error?: string | null;
  createdAt: string;
  completedAt?: string | null;
}

export interface ProviderSettings {
  localEnabled: boolean;
  githubEnabled: boolean;
  stackoverflowEnabled: boolean;
  docsEnabled: boolean;
  remoteDevicesEnabled: boolean;
  githubClientId?: string | null;
  githubUsername?: string | null;
  githubAuthenticated: boolean;
}

export interface AppSettings {
  deviceName: string;
  launchOnStartup: boolean;
  minimizeToTray: boolean;
  globalShortcut: string;
  defaultScope: SearchScope;
  showGrainTexture: boolean;
  showCardGrid: boolean;
  excludedPatterns: string[];
  indexedExtensions: string[];
  maxFileSizeMb: number;
  transferDestination: string;
  allowRemoteSearch: boolean;
  allowClipboardReceive: boolean;
  allowOfflineMetadataCache: boolean;
  onboardingCompleted: boolean;
  meshPort: number;
  providers: ProviderSettings;
}

export interface LocalDeviceInfo {
  deviceId: string;
  deviceName: string;
  os: string;
  fingerprint: string;
  listenPort: number;
}

export interface DashboardSnapshot {
  stats: IndexStats;
  recentFiles: IndexedFileRecord[];
  pairedDevices: PairedDeviceRecord[];
  recentTransfers: TransferRecord[];
  indexingProgress: IndexingProgress;
  activeSourcesCount: number;
  sourcesNeedingAttention: number;
  deviceIdentity: LocalDeviceInfo;
}

export interface GitHubAuthStatus {
  authenticated: boolean;
  username?: string | null;
  privateReposEnabled: boolean;
  rateLimitNote: string;
}

export interface GitHubDeviceCodeResponse {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  expiresIn: number;
  interval: number;
}

export interface AuditLogEntry {
  id: number;
  level: string;
  component: string;
  message: string;
  createdAt: string;
}

export interface DiagnosticBundle {
  appVersion: string;
  os: string;
  deviceName: string;
  listenPort: number;
  stats: IndexStats;
  pairedDeviceCount: number;
  recentLogs: AuditLogEntry[];
  exportedAt: string;
}

export interface ToastMessage {
  id: string;
  title: string;
  detail?: string;
  kind: "info" | "success" | "error";
}
