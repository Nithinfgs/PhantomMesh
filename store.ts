import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { writeText as clipboardWriteText, readText as clipboardReadText } from "@tauri-apps/plugin-clipboard-manager";
import type {
  AppSettings,
  AuditLogEntry,
  DashboardSnapshot,
  DiagnosticBundle,
  DiscoveredPeer,
  GitHubAuthStatus,
  GitHubDeviceCodeResponse,
  IndexedDirectory,
  IndexingProgress,
  PageId,
  PairedDeviceRecord,
  PendingPairing,
  ProviderBatchEvent,
  RemoteBrowseResponse,
  SearchQuery,
  SearchResponse,
  SearchResult,
  SearchScope,
  ToastMessage,
  TransferRecord,
} from "./types";

// ==================== FORMATTERS ====================
export function formatGreeting(date = new Date()): string {
  const hour = date.getHours();
  if (hour < 12) return "good morning.";
  if (hour < 18) return "good afternoon.";
  return "good evening.";
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let val = bytes;
  let i = 0;
  while (val >= 1024 && i < units.length - 1) {
    val /= 1024;
    i += 1;
  }
  return `${val < 10 && i > 0 ? val.toFixed(1) : Math.round(val)} ${units[i]}`;
}

export function formatRelativeTime(input?: string | number | null): string {
  if (input === null || input === undefined || input === "") return "never";
  const ms = typeof input === "number" ? input * 1000 : Date.parse(input);
  if (!Number.isFinite(ms)) return "unknown";
  const diffSec = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  if (diffSec < 45) return "just now";
  const mins = Math.floor(diffSec / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(ms).toLocaleDateString();
}

export function formatShortcutLabel(raw?: string | null): string {
  if (!raw) return "⌘⇧K";
  const isMac =
    typeof navigator !== "undefined" && navigator.platform.toLowerCase().includes("mac");
  return raw
    .replace(/CommandOrControl/gi, isMac ? "⌘" : "Ctrl")
    .replace(/Command/gi, "⌘")
    .replace(/Control/gi, "Ctrl")
    .replace(/Shift/gi, isMac ? "⇧" : "Shift")
    .replace(/Alt/gi, isMac ? "⌥" : "Alt")
    .replace(/\+/g, isMac ? "" : "+");
}

export function truncatePath(path: string, maxLen = 58): string {
  if (path.length <= maxLen) return path;
  const parts = path.split(/[/\\]/);
  if (parts.length <= 3) return `…${path.slice(-(maxLen - 1))}`;
  const tail = parts.slice(-2).join("/");
  const head = parts.slice(0, 2).join("/");
  const combined = `${head}/…/${tail}`;
  return combined.length <= maxLen ? combined : `…/${tail}`;
}

// ==================== TAURI IPC ====================
export function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export async function pickFolderDialog(title: string): Promise<string | null> {
  if (!isTauriRuntime()) {
    throw new Error("Native folder dialog is only available inside the PhantomMesh desktop app.");
  }
  const selected = await openDialog({
    directory: true,
    multiple: false,
    title,
  });
  return typeof selected === "string" ? selected : null;
}

export async function copyText(text: string): Promise<void> {
  if (isTauriRuntime()) {
    try {
      await clipboardWriteText(text);
      return;
    } catch {
      // Fallback to navigator clipboard
    }
  }
  await navigator.clipboard.writeText(text);
}

export async function readClipboardText(): Promise<string> {
  if (isTauriRuntime()) {
    try {
      return (await clipboardReadText()) ?? "";
    } catch {
      // Fallback
    }
  }
  return await navigator.clipboard.readText();
}

export const api = {
  getDashboardSnapshot: () => invoke<DashboardSnapshot>("get_dashboard_snapshot"),
  getSettings: () => invoke<AppSettings>("get_settings"),
  saveSettings: (settings: AppSettings) => invoke<AppSettings>("save_settings", { settings }),
  togglePaletteWindow: () => invoke<void>("toggle_palette_window"),
  hidePaletteWindow: () => invoke<void>("hide_palette_window"),
  showMainWindow: (route?: string) => invoke<void>("show_main_window", { route: route ?? null }),

  listIndexedDirectories: () => invoke<IndexedDirectory[]>("list_indexed_directories"),
  addIndexedDirectory: (path: string, shareRemotely = false) =>
    invoke<IndexedDirectory>("add_indexed_directory", { path, shareRemotely }),
  removeIndexedDirectory: (directoryId: string) =>
    invoke<void>("remove_indexed_directory", { directoryId }),
  setDirectoryRemoteShare: (directoryId: string, shareRemotely: boolean) =>
    invoke<void>("set_directory_remote_share", { directoryId, shareRemotely }),
  rebuildIndex: () => invoke<IndexingProgress>("rebuild_index"),

  executeSearch: (query: SearchQuery) => invoke<SearchResponse>("execute_search", { query }),
  cancelSearch: () => invoke<number>("cancel_search"),
  listSearchHistory: () => invoke<[string, string][]>("list_search_history"),
  clearSearchHistory: () => invoke<void>("clear_search_history"),
  readLocalFilePreview: (path: string) => invoke<string>("read_local_file_preview", { path }),
  togglePinLocalFile: (path: string) => invoke<boolean>("toggle_pin_local_file", { path }),
  openLocalFile: (path: string) => invoke<void>("open_local_file", { path }),
  revealInFileManager: (path: string) => invoke<void>("reveal_in_file_manager", { path }),
  openInVscode: (path: string) => invoke<void>("open_in_vscode", { path }),
  openExternalUrl: (url: string) => invoke<void>("open_external_url", { url }),
  cloneRepository: (cloneUrl: string, destinationDir: string) =>
    invoke<string>("clone_repository", { cloneUrl, destinationDir }),

  getGitHubAuthStatus: () => invoke<GitHubAuthStatus>("get_github_auth_status"),
  githubStartDeviceFlow: (clientId: string) =>
    invoke<GitHubDeviceCodeResponse>("github_start_device_flow", { clientId }),
  githubPollDeviceFlow: (clientId: string, deviceCode: string) =>
    invoke<string>("github_poll_device_flow", { clientId, deviceCode }),
  githubDisconnect: () => invoke<void>("github_disconnect"),

  listDiscoveredPeers: () => invoke<DiscoveredPeer[]>("list_discovered_peers"),
  listPairedDevices: () => invoke<PairedDeviceRecord[]>("list_paired_devices"),
  listPendingPairings: () => invoke<PendingPairing[]>("list_pending_pairings"),
  pairWithDevice: (host: string, port: number) =>
    invoke<PairedDeviceRecord>("pair_with_device", { host, port }),
  respondToPairing: (pairingId: string, approve: boolean) =>
    invoke<void>("respond_to_pairing", { pairingId, approve }),
  pingPairedDevice: (deviceId: string) =>
    invoke<PairedDeviceRecord>("ping_paired_device", { deviceId }),
  revokeDeviceTrust: (deviceId: string) =>
    invoke<void>("revoke_device_trust", { deviceId }),
  browseRemoteDevice: (deviceId: string, directoryPath?: string) =>
    invoke<RemoteBrowseResponse>("browse_remote_device", {
      deviceId,
      directoryPath: directoryPath ?? null,
    }),
  transferRemoteFile: (
    deviceId: string,
    remotePath: string,
    destinationDir?: string,
    allowOverwrite = false
  ) =>
    invoke<TransferRecord>("transfer_remote_file", {
      deviceId,
      remotePath,
      destinationDir: destinationDir ?? null,
      allowOverwrite,
    }),
  cancelFileTransfer: (transferId: string) =>
    invoke<boolean>("cancel_file_transfer", { transferId }),
  listTransfers: () => invoke<TransferRecord[]>("list_transfers"),
  sendClipboardToDevice: (deviceId: string, text: string) =>
    invoke<string>("send_clipboard_to_device", { deviceId, text }),

  deleteLocalIndex: () => invoke<void>("delete_local_index"),
  listAuditLogs: () => invoke<AuditLogEntry[]>("list_audit_logs"),
  exportDiagnostics: () => invoke<DiagnosticBundle>("export_diagnostics"),
};

export const events = {
  onIndexerProgress: (cb: (p: IndexingProgress) => void): Promise<UnlistenFn> =>
    listen<IndexingProgress>("indexer:progress", (e) => cb(e.payload)),
  onIndexerFileUpdated: (cb: (path: string) => void): Promise<UnlistenFn> =>
    listen<string>("indexer:file-updated", (e) => cb(e.payload)),
  onSearchBatch: (cb: (b: ProviderBatchEvent) => void): Promise<UnlistenFn> =>
    listen<ProviderBatchEvent>("search:batch", (e) => cb(e.payload)),
  onTransferProgress: (cb: (t: TransferRecord) => void): Promise<UnlistenFn> =>
    listen<TransferRecord>("transfer:progress", (e) => cb(e.payload)),
  onPairingRequest: (cb: (p: PendingPairing) => void): Promise<UnlistenFn> =>
    listen<PendingPairing>("mesh:pairing-request", (e) => cb(e.payload)),
  onPeerDiscovered: (cb: (p: DiscoveredPeer) => void): Promise<UnlistenFn> =>
    listen<DiscoveredPeer>("mesh:peer-discovered", (e) => cb(e.payload)),
  onDevicePaired: (cb: (d: PairedDeviceRecord) => void): Promise<UnlistenFn> =>
    listen<PairedDeviceRecord>("mesh:device-paired", (e) => cb(e.payload)),
  onPaletteOpened: (cb: () => void): Promise<UnlistenFn> =>
    listen<void>("palette:opened", () => cb()),
  onNavigate: (cb: (route: string) => void): Promise<UnlistenFn> =>
    listen<string>("app:navigate", (e) => cb(e.payload)),
};

// ==================== ZUSTAND STORE ====================
interface AppStore {
  page: PageId;
  setPage: (p: PageId) => void;

  inAppPaletteOpen: boolean;
  setInAppPaletteOpen: (open: boolean) => void;

  initialSearchQuery: string;
  initialSearchScope: SearchScope | null;
  initialDeviceFilterId: string | null;
  jumpToSearch: (query?: string, scope?: SearchScope, deviceId?: string | null) => void;

  dashboard: DashboardSnapshot | null;
  settings: AppSettings | null;
  directories: IndexedDirectory[];
  pairedDevices: PairedDeviceRecord[];
  discoveredPeers: DiscoveredPeer[];
  pendingPairings: PendingPairing[];
  transfers: TransferRecord[];
  indexingProgress: IndexingProgress;

  loading: boolean;
  error: string | null;

  toasts: ToastMessage[];
  pushToast: (title: string, detail?: string, kind?: ToastMessage["kind"]) => void;
  dismissToast: (id: string) => void;

  refreshAll: () => Promise<void>;
  refreshDashboard: () => Promise<void>;
  refreshDirectories: () => Promise<void>;
  refreshDevices: () => Promise<void>;
  updateSettings: (next: AppSettings) => Promise<void>;

  setIndexingProgress: (p: IndexingProgress) => void;
  upsertTransferProgress: (t: TransferRecord) => void;
  addPendingPairing: (p: PendingPairing) => void;
  upsertDiscoveredPeer: (p: DiscoveredPeer) => void;
}

const DEFAULT_PROGRESS: IndexingProgress = {
  active: false,
  directoryPath: null,
  scannedFiles: 0,
  indexedFiles: 0,
  skippedFiles: 0,
  removedFiles: 0,
  percent: 100,
  statusText: "idle",
};

export const useAppStore = create<AppStore>((set, get) => ({
  page: "home",
  setPage: (page) => set({ page }),

  inAppPaletteOpen: false,
  setInAppPaletteOpen: (inAppPaletteOpen) => set({ inAppPaletteOpen }),

  initialSearchQuery: "",
  initialSearchScope: null,
  initialDeviceFilterId: null,
  jumpToSearch: (query = "", scope = "all", deviceId = null) =>
    set({
      page: "search",
      initialSearchQuery: query,
      initialSearchScope: scope,
      initialDeviceFilterId: deviceId,
    }),

  dashboard: null,
  settings: null,
  directories: [],
  pairedDevices: [],
  discoveredPeers: [],
  pendingPairings: [],
  transfers: [],
  indexingProgress: DEFAULT_PROGRESS,

  loading: false,
  error: null,

  toasts: [],
  pushToast: (title, detail, kind = "info") => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    set((s) => ({ toasts: [...s.toasts.slice(-3), { id, title, detail, kind }] }));
    window.setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
    }, 4400);
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

  refreshAll: async () => {
    if (!isTauriRuntime()) {
      set({
        loading: false,
        error:
          "Desktop runtime not detected. Launch PhantomMesh via Tauri (`pnpm tauri dev` or the installed desktop app) to connect to the Rust backend.",
      });
      return;
    }
    set({ loading: true, error: null });
    try {
      const [dashboard, settings, directories, discoveredPeers, pendingPairings, transfers] =
        await Promise.all([
          api.getDashboardSnapshot(),
          api.getSettings(),
          api.listIndexedDirectories(),
          api.listDiscoveredPeers(),
          api.listPendingPairings(),
          api.listTransfers(),
        ]);

      applyVisualPreferences(settings);

      set({
        dashboard,
        settings,
        directories,
        pairedDevices: dashboard.pairedDevices,
        discoveredPeers,
        pendingPairings,
        transfers,
        indexingProgress: dashboard.indexingProgress,
        loading: false,
      });
    } catch (err) {
      set({
        loading: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  },

  refreshDashboard: async () => {
    if (!isTauriRuntime()) return;
    try {
      const dashboard = await api.getDashboardSnapshot();
      set({
        dashboard,
        pairedDevices: dashboard.pairedDevices,
        indexingProgress: dashboard.indexingProgress,
      });
    } catch {
      // keep existing state
    }
  },

  refreshDirectories: async () => {
    if (!isTauriRuntime()) return;
    try {
      const [directories, dashboard] = await Promise.all([
        api.listIndexedDirectories(),
        api.getDashboardSnapshot(),
      ]);
      set({ directories, dashboard });
    } catch {
      // ignore
    }
  },

  refreshDevices: async () => {
    if (!isTauriRuntime()) return;
    try {
      const [pairedDevices, discoveredPeers, pendingPairings, transfers] = await Promise.all([
        api.listPairedDevices(),
        api.listDiscoveredPeers(),
        api.listPendingPairings(),
        api.listTransfers(),
      ]);
      set((s) => ({
        pairedDevices,
        discoveredPeers,
        pendingPairings,
        transfers,
        dashboard: s.dashboard ? { ...s.dashboard, pairedDevices } : s.dashboard,
      }));
    } catch {
      // ignore
    }
  },

  updateSettings: async (next) => {
    const saved = await api.saveSettings(next);
    applyVisualPreferences(saved);
    set({ settings: saved });
    await get().refreshDashboard();
  },

  setIndexingProgress: (p) => set({ indexingProgress: p }),

  upsertTransferProgress: (t) =>
    set((s) => {
      const idx = s.transfers.findIndex((x) => x.id === t.id);
      const next = [...s.transfers];
      if (idx >= 0) next[idx] = t;
      else next.unshift(t);
      return { transfers: next.slice(0, 30) };
    }),

  addPendingPairing: (p) =>
    set((s) => {
      if (s.pendingPairings.some((x) => x.pairingId === p.pairingId)) return s;
      return { pendingPairings: [p, ...s.pendingPairings] };
    }),

  upsertDiscoveredPeer: (p) =>
    set((s) => {
      const idx = s.discoveredPeers.findIndex((x) => x.deviceId === p.deviceId);
      const next = [...s.discoveredPeers];
      if (idx >= 0) next[idx] = p;
      else next.push(p);
      return { discoveredPeers: next };
    }),
}));

export function applyVisualPreferences(settings: AppSettings) {
  if (typeof document === "undefined") return;
  document.body.classList.toggle("grid-enabled", settings.showCardGrid);
}