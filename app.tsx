import React, { useEffect, useRef, useState, useCallback, useMemo, useTransition } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  ChevronDown,
  ChevronUp,
  Clipboard,
  Copy,
  Download,
  ExternalLink,
  Folder,
  FolderOpen,
  FolderPlus,
  GitBranch,
  HardDrive,
  Laptop,
  MessageSquareCode,
  Monitor,
  Pin,
  Plus,
  RefreshCw,
  Search,
  Search as SearchIcon,
  Share2,
  ShieldAlert,
  Trash2,
  X,
} from "lucide-react";
import type {
  AppSettings,
  AuditLogEntry,
  DiscoveredPeer,
  GitHubAuthStatus,
  GitHubDeviceCodeResponse,
  IndexStats,
  PageId,
  PairedDeviceRecord,
  PendingPairing,
  ProviderStatus,
  RemoteBrowseResponse,
  ResultSource,
  SearchResult,
  SearchScope,
  ToastMessage,
  TransferRecord,
} from "./types";
import {
  ConfirmDialog,
  EditorialHeading,
  EmptyState,
  KbdBadge,
  PhantomCard,
  PhantomLogoLockup,
  PhantomLogoMark,
  SegmentedProgress,
  SourceIcon,
  StatusIndicator,
  ToastStack,
  ToggleSwitch,
} from "./ui";
import {
  api,
  events,
  isTauriRuntime,
  pickFolderDialog,
  copyText,
  readClipboardText,
  formatBytes,
  formatGreeting,
  formatRelativeTime,
  truncatePath,
  formatShortcutLabel,
  useAppStore,
} from "./store";


// ==================== src/components/search/useSearchController.ts ====================
export function useSearchController(options?: {
  initialQuery?: string;
  initialScope?: SearchScope;
  initialDeviceId?: string | null;
  isFloatingPalette?: boolean;
  onClosePalette?: () => void;
}) {
  const [query, setQuery] = useState(options?.initialQuery ?? "");
  const [scope, setScope] = useState<SearchScope>(options?.initialScope ?? "all");
  const [deviceFilterId, setDeviceFilterId] = useState<string | null>(
    options?.initialDeviceId ?? null
  );
  const [results, setResults] = useState<SearchResult[]>([]);
  const [statuses, setStatuses] = useState<ProviderStatus[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [searching, setSearching] = useState(false);
  const [elapsedMs, setElapsedMs] = useState<number | null>(null);
  const [history, setHistory] = useState<[string, string][]>([]);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const activeQueryIdRef = useRef<number>(0);
  const debounceRef = useRef<number | null>(null);

  const pushToast = useAppStore((s) => s.pushToast);
  const setPage = useAppStore((s) => s.setPage);
  const refreshDirectories = useAppStore((s) => s.refreshDirectories);
  const refreshDashboard = useAppStore((s) => s.refreshDashboard);

  const loadHistory = useCallback(async () => {
    if (!isTauriRuntime()) return;
    try {
      const list = await api.listSearchHistory();
      setHistory(list);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  // Stream partial provider results as they finish
  useEffect(() => {
    if (!isTauriRuntime()) return;
    let unlisten: (() => void) | undefined;
    events
      .onSearchBatch((batch) => {
        if (batch.queryId < activeQueryIdRef.current) return;
        activeQueryIdRef.current = batch.queryId;

        setStatuses((prev) => {
          const filtered = prev.filter((p) => p.providerId !== batch.providerStatus.providerId);
          return [...filtered, batch.providerStatus];
        });

        if (batch.results.length > 0) {
          setResults((prev) => {
            const existingIds = new Set(batch.results.map((r) => r.id));
            const merged = [...prev.filter((r) => !existingIds.has(r.id)), ...batch.results];
            merged.sort((a, b) => {
              if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
              return b.score - a.score;
            });
            return merged;
          });
        }
      })
      .then((fn) => {
        unlisten = fn;
      });
    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  const runSearchNow = useCallback(
    async (q: string, sc: SearchScope, devId: string | null) => {
      const trimmed = q.trim();
      if (!trimmed && sc !== "commands") {
        if (isTauriRuntime()) {
          await api.cancelSearch().catch(() => {});
        }
        setResults([]);
        setStatuses([]);
        setSearching(false);
        setElapsedMs(null);
        setSelectedIndex(0);
        return;
      }

      if (!isTauriRuntime()) return;

      setSearching(true);
      setResults([]);
      setStatuses([]);
      setSelectedIndex(0);

      try {
        const resp = await api.executeSearch({
          query: q,
          scope: sc,
          limit: 24,
          deviceFilterId: devId,
        });
        if (!resp.cancelled) {
          activeQueryIdRef.current = resp.queryId;
          setResults(resp.results);
          setStatuses(resp.providerStatuses);
          setElapsedMs(resp.elapsedMs);
          setSearching(false);
          loadHistory();
        }
      } catch (err) {
        setSearching(false);
        pushToast("Search failed", err instanceof Error ? err.message : String(err), "error");
      }
    },
    [loadHistory, pushToast]
  );

  // Debounced search execution (fast 70ms for local/commands, 180ms for remote/all)
  useEffect(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    const delay =
      scope === "local" || scope === "commands" || query.trimStart().startsWith(">") ? 65 : 175;
    debounceRef.current = window.setTimeout(() => {
      runSearchNow(query, scope, deviceFilterId);
    }, delay);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [query, scope, deviceFilterId, runSearchNow]);

  const selectedResult = results[selectedIndex] ?? null;

  // Load real file preview when selecting a local file
  useEffect(() => {
    if (!selectedResult || selectedResult.source !== "local" || !isTauriRuntime()) {
      setFilePreview(null);
      setPreviewLoading(false);
      return;
    }
    let cancelled = false;
    setPreviewLoading(true);
    api
      .readLocalFilePreview(selectedResult.uri)
      .then((text) => {
        if (!cancelled) {
          setFilePreview(text);
          setPreviewLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setFilePreview(selectedResult.preview || null);
          setPreviewLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [selectedResult?.id, selectedResult?.uri, selectedResult?.source, selectedResult?.preview]);

  const executeCommand = useCallback(
    async (cmdId: string) => {
      const goRoute = async (route: "home" | "search" | "devices" | "sources" | "settings") => {
        if (options?.isFloatingPalette) {
          await api.showMainWindow(route);
        } else {
          setPage(route);
          options?.onClosePalette?.();
        }
      };

      switch (cmdId) {
        case "cmd:rebuild-index":
          pushToast("Rebuilding index", "Scanning all configured folders…", "info");
          options?.onClosePalette?.();
          await api.rebuildIndex();
          await refreshDirectories();
          pushToast("Index rebuilt", "Local SQLite FTS5 index is up to date", "success");
          break;
        case "cmd:add-folder": {
          const picked = await pickFolderDialog("Choose folder to index in PhantomMesh");
          if (picked) {
            pushToast("Indexing folder", picked, "info");
            await api.addIndexedDirectory(picked, false);
            await refreshDirectories();
            pushToast("Folder indexed", picked, "success");
          }
          break;
        }
        case "cmd:open-home":
          await goRoute("home");
          break;
        case "cmd:open-search":
          await goRoute("search");
          break;
        case "cmd:open-devices":
        case "cmd:discover-devices":
          await goRoute("devices");
          break;
        case "cmd:open-sources":
        case "cmd:connect-github":
          await goRoute("sources");
          break;
        case "cmd:open-settings":
          await goRoute("settings");
          break;
        case "cmd:clear-history":
          await api.clearSearchHistory();
          setHistory([]);
          pushToast("Search history cleared", undefined, "success");
          break;
        default:
          pushToast("Unknown command", cmdId, "error");
      }
    },
    [options, pushToast, refreshDirectories, setPage]
  );

  const performAction = useCallback(
    async (result: SearchResult, actionId: string) => {
      try {
        switch (actionId) {
          case "run_command":
            await executeCommand(result.uri);
            break;
          case "open":
            await api.openLocalFile(result.uri);
            await refreshDashboard();
            options?.onClosePalette?.();
            break;
          case "reveal":
            await api.revealInFileManager(result.uri);
            options?.onClosePalette?.();
            break;
          case "vscode":
            await api.openInVscode(result.uri);
            await refreshDashboard();
            options?.onClosePalette?.();
            break;
          case "copy_path":
          case "copy_url":
            await copyText(result.uri);
            pushToast("Copied to clipboard", result.uri, "success");
            break;
          case "pin": {
            const pinned = await api.togglePinLocalFile(result.uri);
            setResults((prev) =>
              prev.map((r) => (r.id === result.id ? { ...r, pinned } : r))
            );
            pushToast(pinned ? "Pinned result" : "Unpinned result", result.title, "info");
            break;
          }
          case "open_url":
            await api.openExternalUrl(result.uri);
            options?.onClosePalette?.();
            break;
          case "clone_repo": {
            const cloneUrl = String(result.metadata.cloneUrl ?? "");
            if (!cloneUrl) {
              pushToast("Clone URL unavailable", undefined, "error");
              return;
            }
            const dest = await pickFolderDialog(`Choose folder to clone ${result.title}`);
            if (!dest) return;
            pushToast("Cloning repository", result.title, "info");
            const msg = await api.cloneRepository(cloneUrl, dest);
            pushToast("Clone complete", msg, "success");
            break;
          }
          case "transfer_file": {
            const deviceId = String(result.metadata.deviceId ?? "");
            if (!deviceId) {
              pushToast("Missing device identity", undefined, "error");
              return;
            }
            pushToast("Starting encrypted transfer", result.title, "info");
            const transfer = await api.transferRemoteFile(deviceId, result.uri, undefined, false);
            pushToast(
              "Transfer verified (SHA-256)",
              `Saved to ${transfer.localPath}`,
              "success"
            );
            await refreshDashboard();
            break;
          }
          default:
            break;
        }
      } catch (err) {
        pushToast("Action failed", err instanceof Error ? err.message : String(err), "error");
      }
    },
    [executeCommand, options, pushToast, refreshDashboard]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) => (results.length === 0 ? 0 : (i + 1) % results.length));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) =>
          results.length === 0 ? 0 : (i - 1 + results.length) % results.length
        );
      } else if (e.key === "Enter" && selectedResult) {
        e.preventDefault();
        const primary = selectedResult.actions[0];
        if (primary) performAction(selectedResult, primary.id);
      } else if (e.key === "Tab") {
        e.preventDefault();
        const scopes: SearchScope[] = ["all", "local", "devices", "github", "web", "commands"];
        const idx = scopes.indexOf(scope);
        setScope(scopes[(idx + 1) % scopes.length]);
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "c" && selectedResult) {
        const hasSelection = window.getSelection()?.toString();
        if (!hasSelection) {
          e.preventDefault();
          performAction(selectedResult, "copy_path");
        }
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "r" && selectedResult?.source === "local") {
        e.preventDefault();
        performAction(selectedResult, "reveal");
      } else if (e.key === "Escape") {
        if (options?.onClosePalette) {
          e.preventDefault();
          options.onClosePalette();
        } else if (query) {
          setQuery("");
        }
      }
    },
    [options, performAction, query, results.length, scope, selectedResult]
  );

  return {
    query,
    setQuery,
    scope,
    setScope,
    deviceFilterId,
    setDeviceFilterId,
    results,
    statuses,
    selectedIndex,
    setSelectedIndex,
    selectedResult,
    searching,
    elapsedMs,
    history,
    filePreview,
    previewLoading,
    performAction,
    handleKeyDown,
  };
}

// ==================== src/components/layout/TopNav.tsx ====================
const NAV_ITEMS: { id: PageId; label: string }[] = [
  { id: "home", label: "home" },
  { id: "search", label: "search" },
  { id: "devices", label: "devices" },
  { id: "sources", label: "sources" },
  { id: "settings", label: "settings" },
];

export const TopNav: React.FC = () => {
  const page = useAppStore((s) => s.page);
  const setPage = useAppStore((s) => s.setPage);
  const settings = useAppStore((s) => s.settings);
  const setInAppPaletteOpen = useAppStore((s) => s.setInAppPaletteOpen);
  const pendingCount = useAppStore((s) => s.pendingPairings.length);

  return (
    <header className="topbar-wrap">
      <div className="topbar">
        <button className="brand-mark" onClick={() => setPage("home")} aria-label="PhantomMesh Home">
          <PhantomLogoMark size={22} />
          <span className="brand-wordmark">PHANTOMMESH</span>
        </button>

        <nav className="nav-links" aria-label="Main navigation">
          {NAV_ITEMS.map((item) => {
            const active = page === item.id;
            return (
              <button
                key={item.id}
                type="button"
                className={`nav-pill ${active ? "active" : ""}`}
                onClick={() => setPage(item.id)}
                aria-current={active ? "page" : undefined}
              >
                {item.label}
                {item.id === "devices" && pendingCount > 0 && (
                  <span
                    className="mono"
                    style={{
                      marginLeft: 6,
                      fontSize: 10,
                      padding: "1px 5px",
                      borderRadius: 99,
                      background: active ? "#181818" : "#ECECEC",
                      color: active ? "#ECECEC" : "#181818",
                    }}
                  >
                    {pendingCount}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <button
          type="button"
          className="btn btn-sm"
          onClick={() => setInAppPaletteOpen(true)}
          title="Open Quick Search & Command Palette"
        >
          <Search size={13} />
          <span className="muted" style={{ fontSize: 12 }}>
            palette
          </span>
          <KbdBadge>{formatShortcutLabel(settings?.globalShortcut)}</KbdBadge>
        </button>
      </div>
    </header>
  );
};

// ==================== src/components/layout/OnboardingView.tsx ====================
export const OnboardingView: React.FC = () => {
  const settings = useAppStore((s) => s.settings);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const refreshDirectories = useAppStore((s) => s.refreshDirectories);
  const setPage = useAppStore((s) => s.setPage);
  const pushToast = useAppStore((s) => s.pushToast);

  const completeOnboarding = async (targetPage?: "home" | "sources" | "devices") => {
    if (settings) {
      await updateSettings({ ...settings, onboardingCompleted: true });
    }
    if (targetPage) setPage(targetPage);
  };

  const handleChooseFolders = async () => {
    try {
      const picked = await pickFolderDialog("Choose your first folder to index in PhantomMesh");
      if (!picked) return;
      pushToast("Indexing folder", picked, "info");
      await api.addIndexedDirectory(picked, false);
      await refreshDirectories();
      await completeOnboarding("home");
      pushToast("Workspace ready", `Indexed ${picked}`, "success");
    } catch (err) {
      pushToast("Folder selection failed", err instanceof Error ? err.message : String(err), "error");
    }
  };

  return (
    <div
      style={{
        minHeight: "76vh",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        maxWidth: 820,
        margin: "0 auto",
        gap: 28,
      }}
    >
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
          <PhantomLogoMark size={26} />
          <span className="brand-wordmark">PHANTOMMESH</span>
        </div>

        <EditorialHeading size="xl">welcome to phantommesh.</EditorialHeading>
        <p className="secondary" style={{ fontSize: 15.5, marginTop: 10, maxWidth: 560 }}>
          everything you&apos;ve made. everything you&apos;ve saved. one place to find it.
        </p>
      </div>

      <div className="three-col-grid">
        <PhantomCard
          variant="card"
          interactive
          onClick={handleChooseFolders}
          style={{ padding: 20, display: "flex", flexDirection: "column", justifyContent: "space-between", minHeight: 196 }}
        >
          <div>
            <FolderPlus size={20} />
            <div style={{ fontSize: 15, fontWeight: 550, marginTop: 14 }}>
              1. Choose folders to index
            </div>
            <p className="muted" style={{ fontSize: 12.5, margin: "6px 0 0" }}>
              Pick a projects or notes folder. Secret files, .env, and node_modules are excluded by default.
            </p>
          </div>
          <div className="mono" style={{ fontSize: 11.5, marginTop: 14, display: "flex", alignItems: "center", gap: 6 }}>
            <span>Select directory</span>
            <ArrowRight size={12} />
          </div>
        </PhantomCard>

        <PhantomCard
          variant="card"
          interactive
          onClick={() => completeOnboarding("sources")}
          style={{ padding: 20, display: "flex", flexDirection: "column", justifyContent: "space-between", minHeight: 196 }}
        >
          <div>
            <GitBranch size={20} />
            <div style={{ fontSize: 15, fontWeight: 550, marginTop: 14 }}>
              2. Connect developer sources
            </div>
            <p className="muted" style={{ fontSize: 12.5, margin: "6px 0 0" }}>
              Configure GitHub, Stack Overflow, MDN Web Docs, and Rust docs.rs search providers.
            </p>
          </div>
          <div className="mono" style={{ fontSize: 11.5, marginTop: 14, display: "flex", alignItems: "center", gap: 6 }}>
            <span>Open sources</span>
            <ArrowRight size={12} />
          </div>
        </PhantomCard>

        <PhantomCard
          variant="card"
          interactive
          onClick={() => completeOnboarding("devices")}
          style={{ padding: 20, display: "flex", flexDirection: "column", justifyContent: "space-between", minHeight: 196 }}
        >
          <div>
            <Laptop size={20} />
            <div style={{ fontSize: 15, fontWeight: 550, marginTop: 14 }}>
              3. Pair another device
            </div>
            <p className="muted" style={{ fontSize: 12.5, margin: "6px 0 0" }}>
              Connect trusted computers on your local network via encrypted PhantomLink pairing.
            </p>
          </div>
          <div className="mono" style={{ fontSize: 11.5, marginTop: 14, display: "flex", alignItems: "center", gap: 6 }}>
            <span>Open PhantomLink</span>
            <ArrowRight size={12} />
          </div>
        </PhantomCard>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span className="mono muted" style={{ fontSize: 11.5 }}>
          100% local-first · zero telemetry · no cloud account required
        </span>
        <button className="btn btn-ghost btn-sm" onClick={() => completeOnboarding("home")}>
          Skip to dashboard →
        </button>
      </div>
    </div>
  );
};

// ==================== src/components/search/SearchPalette.tsx ====================
const SCOPES: { id: SearchScope; label: string }[] = [
  { id: "all", label: "all" },
  { id: "local", label: "local" },
  { id: "devices", label: "devices" },
  { id: "github", label: "github" },
  { id: "web", label: "web" },
  { id: "commands", label: "commands" },
];

export const SearchPalette: React.FC<{
  standaloneWindow?: boolean;
  onClose?: () => void;
}> = ({ standaloneWindow = false, onClose }) => {
  const inputRef = useRef<HTMLInputElement>(null);

  const closePalette = () => {
    if (standaloneWindow && isTauriRuntime()) {
      api.hidePaletteWindow();
    } else if (onClose) {
      onClose();
    }
  };

  const ctrl = useSearchController({
    isFloatingPalette: standaloneWindow,
    onClosePalette: closePalette,
  });

  useEffect(() => {
    inputRef.current?.focus();
    if (!standaloneWindow || !isTauriRuntime()) return;
    let unlisten: (() => void) | undefined;
    events.onPaletteOpened(() => {
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 20);
    }).then((fn) => {
      unlisten = fn;
    });
    return () => {
      if (unlisten) unlisten();
    };
  }, [standaloneWindow]);

  const panel = (
    <div
      className="phantom-card-main"
      style={{
        width: "100%",
        maxWidth: standaloneWindow ? "100%" : "var(--palette-max-width)",
        height: standaloneWindow ? "100vh" : "auto",
        maxHeight: standaloneWindow ? "100vh" : "80vh",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        borderRadius: standaloneWindow ? 0 : "var(--radius-md)",
        boxShadow: standaloneWindow ? "none" : "var(--shadow-modal)",
      }}
      onKeyDown={ctrl.handleKeyDown}
    >
      {/* Search Bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "14px 16px",
          borderBottom: "1px solid var(--border-subtle)",
          background: "var(--surface-inset)",
        }}
      >
        <Search size={16} className="muted" />
        <input
          ref={inputRef}
          value={ctrl.query}
          onChange={(e) => ctrl.setQuery(e.target.value)}
          placeholder="search everywhere… or type > for commands"
          aria-label="Universal search input"
          style={{
            flex: 1,
            background: "transparent",
            border: "none",
            outline: "none",
            fontSize: 15,
            color: "var(--text-primary)",
          }}
        />
        {ctrl.query && (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            style={{ padding: 3 }}
            onClick={() => ctrl.setQuery("")}
            aria-label="Clear query"
          >
            <X size={14} />
          </button>
        )}
        <KbdBadge>ESC</KbdBadge>
      </div>

      {/* Scope chips */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          padding: "8px 14px",
          borderBottom: "1px solid var(--border-subtle)",
        }}
      >
        <div className="scope-chips">
          {SCOPES.map((s) => (
            <button
              key={s.id}
              type="button"
              className={`scope-chip ${ctrl.scope === s.id ? "active" : ""}`}
              onClick={() => ctrl.setScope(s.id)}
            >
              {s.label}
            </button>
          ))}
        </div>
        <span className="mono muted tabular" style={{ fontSize: 11 }}>
          {ctrl.searching
            ? "searching…"
            : ctrl.elapsedMs !== null
            ? `${ctrl.results.length} hits · ${ctrl.elapsedMs}ms`
            : "tab to switch scope"}
        </span>
      </div>

      {/* Provider error/rate-limit banners if any */}
      {ctrl.statuses.some((s) => s.state !== "ok" && s.state !== "disabled") && (
        <div
          style={{
            padding: "6px 14px",
            borderBottom: "1px solid var(--border-subtle)",
            background: "rgba(199, 171, 114, 0.07)",
            display: "flex",
            flexWrap: "wrap",
            gap: 10,
            fontSize: 11.5,
          }}
          className="mono"
        >
          {ctrl.statuses
            .filter((s) => s.state !== "ok" && s.state !== "disabled")
            .map((s) => (
              <span key={s.providerId} style={{ color: "#d5be8e" }}>
                {s.label}: {s.message ?? s.state}
              </span>
            ))}
        </div>
      )}

      {/* Results list */}
      <div style={{ flex: 1, overflowY: "auto", padding: "8px 10px" }}>
        {ctrl.query.trim() === "" && ctrl.scope !== "commands" ? (
          <div style={{ padding: "8px 6px" }}>
            <div className="eyebrow" style={{ marginBottom: 8 }}>
              {ctrl.history.length > 0 ? "recent searches" : "quick tips"}
            </div>
            {ctrl.history.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                {ctrl.history.slice(0, 6).map(([q, sc], idx) => (
                  <button
                    key={`${q}-${idx}`}
                    type="button"
                    className="result-row"
                    style={{ width: "100%", textAlign: "left", background: "transparent" }}
                    onClick={() => {
                      ctrl.setQuery(q);
                      ctrl.setScope((sc as SearchScope) || "all");
                    }}
                  >
                    <span className="mono" style={{ fontSize: 12.5 }}>
                      {q}
                    </span>
                    <span className="eyebrow">{sc}</span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="muted" style={{ fontSize: 12.5, lineHeight: 1.7 }}>
                Type any filename, symbol, GitHub repository, or error message. Prefix with{" "}
                <KbdBadge>&gt;</KbdBadge> to run safe workspace commands.
              </div>
            )}
          </div>
        ) : ctrl.results.length === 0 && !ctrl.searching ? (
          <div style={{ padding: "28px 12px", textAlign: "center" }}>
            <div className="editorial-heading editorial-sm">nothing matched.</div>
            <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>
              Try switching scopes with <KbdBadge>Tab</KbdBadge> or adding more indexed folders.
            </p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            {ctrl.results.map((item, idx) => {
              const selected = idx === ctrl.selectedIndex;
              return (
                <div
                  key={item.id}
                  className={`result-row ${selected ? "selected" : ""}`}
                  onMouseEnter={() => ctrl.setSelectedIndex(idx)}
                  onClick={() => {
                    const primary = item.actions[0];
                    if (primary) ctrl.performAction(item, primary.id);
                  }}
                >
                  <div style={{ display: "flex", gap: 10, minWidth: 0, flex: 1 }}>
                    <div style={{ marginTop: 2, color: "var(--text-secondary)", flexShrink: 0 }}>
                      <SourceIcon source={item.source} kind={item.kind} size={15} />
                    </div>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span
                          style={{
                            fontWeight: 500,
                            color: "var(--text-primary)",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {item.title}
                        </span>
                        {item.pinned && <Pin size={11} className="muted" />}
                      </div>
                      <div
                        className="mono muted"
                        style={{
                          fontSize: 11,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          marginTop: 2,
                        }}
                      >
                        {truncatePath(item.subtitle, 68)}
                      </div>
                    </div>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      flexShrink: 0,
                    }}
                  >
                    <span
                      className="mono"
                      style={{
                        fontSize: 10,
                        padding: "2px 6px",
                        borderRadius: 3,
                        background: "var(--surface-inset)",
                        border: "1px solid var(--border-subtle)",
                        color: "var(--text-muted)",
                      }}
                    >
                      {item.sourceLabel}
                    </span>
                    {selected && <ArrowUpRight size={13} className="secondary" />}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Contextual action footer */}
      <div
        style={{
          padding: "8px 14px",
          borderTop: "1px solid var(--border-subtle)",
          background: "var(--surface-inset)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
          fontSize: 11.5,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          {ctrl.selectedResult ? (
            ctrl.selectedResult.actions.slice(0, 4).map((act) => (
              <button
                key={act.id}
                type="button"
                className="btn btn-sm"
                onClick={() => ctrl.performAction(ctrl.selectedResult!, act.id)}
              >
                <span>{act.label}</span>
                {act.shortcut && <KbdBadge>{act.shortcut}</KbdBadge>}
              </button>
            ))
          ) : (
            <span className="mono muted">↑↓ navigate · ↵ open · tab scope</span>
          )}
        </div>
        {standaloneWindow && (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => api.showMainWindow("search")}
          >
            open dashboard
          </button>
        )}
      </div>
    </div>
  );

  if (standaloneWindow) {
    return <div className="phantom-grain-bg grain-enabled">{panel}</div>;
  }

  return (
    <div className="modal-backdrop" style={{ alignItems: "flex-start", paddingTop: "10vh" }} onClick={closePalette}>
      <div style={{ width: "100%", maxWidth: "var(--palette-max-width)" }} onClick={(e) => e.stopPropagation()}>
        {panel}
      </div>
    </div>
  );
};

// ==================== src/pages/Home.tsx ====================
export const HomePage: React.FC = () => {
  const dashboard = useAppStore((s) => s.dashboard);
  const settings = useAppStore((s) => s.settings);
  const indexingProgress = useAppStore((s) => s.indexingProgress);
  const transfers = useAppStore((s) => s.transfers);
  const jumpToSearch = useAppStore((s) => s.jumpToSearch);
  const setPage = useAppStore((s) => s.setPage);
  const pushToast = useAppStore((s) => s.pushToast);
  const refreshDirectories = useAppStore((s) => s.refreshDirectories);
  const refreshDashboard = useAppStore((s) => s.refreshDashboard);

  const [quickQuery, setQuickQuery] = useState("");

  const stats = dashboard?.stats;
  const pairedDevices = dashboard?.pairedDevices ?? [];
  const onlineDevices = pairedDevices.filter((d) => d.status === "online").length;
  const recentFiles = dashboard?.recentFiles ?? [];

  const handleQuickAddFolder = async () => {
    try {
      const picked = await pickFolderDialog("Choose a folder to index in PhantomMesh");
      if (!picked) return;
      pushToast("Indexing folder", picked, "info");
      await api.addIndexedDirectory(picked, false);
      await refreshDirectories();
      pushToast("Folder indexed", picked, "success");
    } catch (err) {
      pushToast("Could not add folder", err instanceof Error ? err.message : String(err), "error");
    }
  };

  const handleOpenRecent = async (path: string) => {
    try {
      await api.openLocalFile(path);
      await refreshDashboard();
    } catch (err) {
      pushToast("Could not open file", err instanceof Error ? err.message : String(err), "error");
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    jumpToSearch(quickQuery, settings?.defaultScope ?? "all");
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* Editorial Greeting */}
      <section style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16 }}>
        <div>
          <EditorialHeading size="xl">{formatGreeting()}</EditorialHeading>
          <p className="muted" style={{ margin: "6px 0 0", fontSize: 13.5 }}>
            everything, in one place.
          </p>
        </div>
        {dashboard?.deviceIdentity && (
          <div className="mono muted" style={{ fontSize: 11.5, textAlign: "right" }}>
            <div>{dashboard.deviceIdentity.deviceName}</div>
            <div>
              {dashboard.deviceIdentity.os} · port {dashboard.deviceIdentity.listenPort || "starting"}
            </div>
          </div>
        )}
      </section>

      {/* Three Compact Statistics Cards */}
      <section className="stats-grid" aria-label="Workspace statistics">
        <PhantomCard variant="card" interactive onClick={() => setPage("settings")} style={{ padding: 18 }}>
          <div className="eyebrow">indexed files</div>
          <div
            className="mono tabular"
            style={{ fontSize: 28, fontWeight: 500, marginTop: 8, color: "var(--text-primary)" }}
          >
            {(stats?.totalFiles ?? 0).toLocaleString()}
          </div>
          <div className="mono muted" style={{ fontSize: 11.5, marginTop: 6 }}>
            {stats?.totalDirectories ?? 0} folders · last indexed {formatRelativeTime(stats?.lastIndexedAt)}
          </div>
        </PhantomCard>

        <PhantomCard variant="card" interactive onClick={() => setPage("devices")} style={{ padding: 18 }}>
          <div className="eyebrow">connected devices</div>
          <div
            className="mono tabular"
            style={{ fontSize: 28, fontWeight: 500, marginTop: 8, color: "var(--text-primary)" }}
          >
            {pairedDevices.length}
          </div>
          <div style={{ marginTop: 8 }}>
            <StatusIndicator
              state={onlineDevices > 0 ? "online" : "offline"}
              label={`${onlineDevices} currently online`}
            />
          </div>
        </PhantomCard>

        <PhantomCard variant="card" interactive onClick={() => setPage("sources")} style={{ padding: 18 }}>
          <div className="eyebrow">connected sources</div>
          <div
            className="mono tabular"
            style={{ fontSize: 28, fontWeight: 500, marginTop: 8, color: "var(--text-primary)" }}
          >
            {dashboard?.activeSourcesCount ?? 0}
          </div>
          <div style={{ marginTop: 8 }}>
            <StatusIndicator
              state={(dashboard?.sourcesNeedingAttention ?? 0) > 0 ? "warn" : "online"}
              label={
                (dashboard?.sourcesNeedingAttention ?? 0) > 0
                  ? `${dashboard?.sourcesNeedingAttention} source needs folder setup`
                  : "all enabled sources ready"
              }
            />
          </div>
        </PhantomCard>
      </section>

      {/* Wide Search Card */}
      <PhantomCard variant="card" style={{ padding: "22px 24px" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            marginBottom: 14,
          }}
        >
          <EditorialHeading as="h2" size="md">
            find anything.
          </EditorialHeading>
          <span className="mono muted" style={{ fontSize: 11.5 }}>
            global palette <KbdBadge>{formatShortcutLabel(settings?.globalShortcut)}</KbdBadge>
          </span>
        </div>

        <form onSubmit={handleSearchSubmit} style={{ display: "flex", gap: 10 }}>
          <div style={{ position: "relative", flex: 1 }}>
            <Search
              size={16}
              className="muted"
              style={{ position: "absolute", left: 13, top: "50%", transform: "translateY(-50%)" }}
            />
            <input
              className="input"
              style={{ paddingLeft: 38, paddingTop: 11, paddingBottom: 11, fontSize: 14 }}
              value={quickQuery}
              onChange={(e) => setQuickQuery(e.target.value)}
              placeholder="Search local files, code, GitHub repositories, paired computers, or > commands…"
            />
          </div>
          <button type="submit" className="btn btn-primary" style={{ padding: "0 18px" }}>
            <span>Search</span>
            <ArrowRight size={14} />
          </button>
        </form>
      </PhantomCard>

      {/* Two Major Panels: Recently Discovered & Your Network */}
      <section className="two-col-grid">
        {/* Recently Discovered */}
        <PhantomCard variant="main" style={{ padding: 20 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 14,
            }}
          >
            <div>
              <EditorialHeading as="h2" size="sm">
                recently discovered
              </EditorialHeading>
              <div className="mono muted" style={{ fontSize: 11, marginTop: 2 }}>
                recently indexed and opened local files
              </div>
            </div>
            <button className="btn btn-sm" onClick={handleQuickAddFolder}>
              <FolderPlus size={13} />
              <span>Add folder</span>
            </button>
          </div>

          <hr className="divider" style={{ marginBottom: 12 }} />

          {recentFiles.length === 0 ? (
            <EmptyState
              title="no files indexed yet."
              description="Choose a projects or notes folder to start building your local SQLite FTS5 search index."
              action={
                <button className="btn btn-primary btn-sm" onClick={handleQuickAddFolder}>
                  <FolderPlus size={13} />
                  <span>Choose folder to index</span>
                </button>
              }
            />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {recentFiles.slice(0, 8).map((file) => (
                <div
                  key={file.id}
                  className="result-row"
                  onClick={() => handleOpenRecent(file.path)}
                  title={file.path}
                >
                  <div style={{ display: "flex", gap: 10, minWidth: 0, flex: 1 }}>
                    <div style={{ marginTop: 2, color: "var(--text-secondary)" }}>
                      <SourceIcon source="local" kind={file.extension} size={15} />
                    </div>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div
                        style={{
                          fontWeight: 500,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {file.name}
                      </div>
                      <div
                        className="mono muted"
                        style={{
                          fontSize: 11,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {truncatePath(file.path, 52)}
                      </div>
                    </div>
                  </div>
                  <div
                    className="mono muted tabular"
                    style={{ fontSize: 11, textAlign: "right", flexShrink: 0 }}
                  >
                    <div>{file.extension || "file"}</div>
                    <div>{formatRelativeTime(file.lastOpenedAt ?? file.modifiedAt)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </PhantomCard>

        {/* Your Network */}
        <PhantomCard variant="main" style={{ padding: 20 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 14,
            }}
          >
            <div>
              <EditorialHeading as="h2" size="sm">
                your network
              </EditorialHeading>
              <div className="mono muted" style={{ fontSize: 11, marginTop: 2 }}>
                trusted phantomlink peers on your LAN
              </div>
            </div>
            <button className="btn btn-sm" onClick={() => setPage("devices")}>
              <Plus size={13} />
              <span>Pair device</span>
            </button>
          </div>

          <hr className="divider" style={{ marginBottom: 12 }} />

          {pairedDevices.length === 0 ? (
            <EmptyState
              title="your devices, connected."
              description="Pair a second computer running PhantomMesh over your local network to search shared folders and transfer files with end-to-end encryption."
              action={
                <button className="btn btn-sm" onClick={() => setPage("devices")}>
                  Open PhantomLink
                </button>
              }
            />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {pairedDevices.map((dev) => (
                <PhantomCard key={dev.id} variant="card" style={{ padding: 14 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                      {dev.os.toLowerCase().includes("mac") ? (
                        <Laptop size={16} className="secondary" />
                      ) : (
                        <Monitor size={16} className="secondary" />
                      )}
                      <div>
                        <div style={{ fontWeight: 500 }}>{dev.name}</div>
                        <div className="mono muted" style={{ fontSize: 11 }}>
                          {dev.os} · {dev.sharedFileCount} shared files
                        </div>
                      </div>
                    </div>
                    <StatusIndicator
                      state={dev.status === "online" ? "online" : "offline"}
                      label={dev.status}
                    />
                  </div>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginTop: 12,
                    }}
                  >
                    <span className="mono muted" style={{ fontSize: 11 }}>
                      seen {formatRelativeTime(dev.lastSeenAt)}
                    </span>
                    <button
                      className="btn btn-sm"
                      onClick={() => jumpToSearch("", "devices", dev.id)}
                    >
                      Search device
                    </button>
                  </div>
                </PhantomCard>
              ))}
            </div>
          )}
        </PhantomCard>
      </section>

      {/* Genuine Activity Area: Indexing Progress & Recent Transfers */}
      {(indexingProgress.active || transfers.length > 0) && (
        <PhantomCard variant="main" style={{ padding: 16 }}>
          <div className="eyebrow" style={{ marginBottom: 10 }}>
            activity
          </div>

          {indexingProgress.active && (
            <div style={{ marginBottom: transfers.length > 0 ? 14 : 0 }}>
              <SegmentedProgress
                percent={indexingProgress.percent}
                label={indexingProgress.statusText}
              />
            </div>
          )}

          {transfers.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {transfers.slice(0, 3).map((t) => (
                <div
                  key={t.id}
                  className="mono"
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    fontSize: 11.5,
                    padding: "6px 8px",
                    background: "var(--surface-inset)",
                    borderRadius: 4,
                    border: "1px solid var(--border-subtle)",
                  }}
                >
                  <span>
                    {t.filename} ← {t.deviceName}
                  </span>
                  <span className="muted tabular">
                    {formatBytes(t.transferredBytes)} / {formatBytes(t.sizeBytes)} · {t.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </PhantomCard>
      )}
    </div>
  );
};

// ==================== src/pages/Search.tsx ====================
// SCOPES defined above

export const SearchPage: React.FC = () => {
  const initialQuery = useAppStore((s) => s.initialSearchQuery);
  const initialScope = useAppStore((s) => s.initialSearchScope);
  const initialDeviceId = useAppStore((s) => s.initialDeviceFilterId);
  const pairedDevices = useAppStore((s) => s.pairedDevices);
  const setPage = useAppStore((s) => s.setPage);
  const inputRef = useRef<HTMLInputElement>(null);

  const ctrl = useSearchController({
    initialQuery,
    initialScope: initialScope ?? "all",
    initialDeviceId,
  });

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const filteredDeviceName = ctrl.deviceFilterId
    ? pairedDevices.find((d) => d.id === ctrl.deviceFilterId)?.name
    : null;

  // Group results visually by sourceLabel while keeping flat index for keyboard nav
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }} onKeyDown={ctrl.handleKeyDown}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16 }}>
        <div>
          <EditorialHeading size="lg">search everywhere.</EditorialHeading>
          <p className="muted" style={{ margin: "6px 0 0", fontSize: 13 }}>
            Local FTS5 index, paired computers, GitHub, Stack Overflow, and developer docs in one place.
          </p>
        </div>
        {ctrl.elapsedMs !== null && (
          <div className="mono muted tabular" style={{ fontSize: 11.5 }}>
            {ctrl.results.length} results · {ctrl.elapsedMs}ms
          </div>
        )}
      </div>

      {/* Unified Search Input Card */}
      <PhantomCard variant="card" style={{ padding: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <SearchIcon size={17} className="muted" />
          <input
            ref={inputRef}
            className="input"
            style={{
              background: "var(--surface-inset)",
              fontSize: 14.5,
              padding: "10px 13px",
            }}
            value={ctrl.query}
            onChange={(e) => ctrl.setQuery(e.target.value)}
            placeholder="Search files, code, repositories, paired devices, or type > for commands…"
          />
          {ctrl.query && (
            <button
              type="button"
              className="btn"
              onClick={() => ctrl.setQuery("")}
              aria-label="Clear search"
            >
              <X size={14} />
            </button>
          )}
        </div>

        <div
          style={{
            marginTop: 12,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 10,
          }}
        >
          <div className="scope-chips">
            {SCOPES.map((s) => (
              <button
                key={s.id}
                type="button"
                className={`scope-chip ${ctrl.scope === s.id ? "active" : ""}`}
                onClick={() => {
                  ctrl.setScope(s.id);
                  if (s.id !== "devices") ctrl.setDeviceFilterId(null);
                }}
              >
                {s.label}
              </button>
            ))}
            {filteredDeviceName && (
              <span className="scope-chip active" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                device: {filteredDeviceName}
                <button
                  type="button"
                  onClick={() => ctrl.setDeviceFilterId(null)}
                  style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: "inherit" }}
                  aria-label="Clear device filter"
                >
                  ×
                </button>
              </span>
            )}
          </div>

          {/* Live provider statuses */}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {ctrl.statuses.map((st) => (
              <StatusIndicator
                key={st.providerId}
                state={
                  st.state === "ok"
                    ? "online"
                    : st.state === "disabled"
                    ? "offline"
                    : st.state === "rate_limited" || st.state === "timeout"
                    ? "warn"
                    : "error"
                }
                label={`${st.label} (${st.state === "ok" ? `${st.resultCount} · ${st.elapsedMs}ms` : st.state})`}
              />
            ))}
          </div>
        </div>
      </PhantomCard>

      {/* Provider error callouts */}
      {ctrl.statuses
        .filter((s) => s.state !== "ok" && s.state !== "disabled" && s.message)
        .map((st) => (
          <div
            key={st.providerId}
            className="phantom-card-main mono"
            style={{
              padding: "10px 14px",
              fontSize: 12,
              borderColor: "rgba(199, 171, 114, 0.45)",
              color: "#dfd0ac",
            }}
          >
            [{st.label}] {st.message}
          </div>
        ))}

      {/* Two-pane results + live preview */}
      <div className="two-col-grid" style={{ alignItems: "start" }}>
        <PhantomCard variant="main" style={{ padding: 12, minHeight: 420 }}>
          {ctrl.searching && ctrl.results.length === 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: 8 }}>
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="skeleton" style={{ height: 48 }} />
              ))}
            </div>
          ) : ctrl.query.trim() === "" && ctrl.scope !== "commands" ? (
            <div style={{ padding: 10 }}>
              <div className="eyebrow" style={{ marginBottom: 10 }}>
                {ctrl.history.length > 0 ? "recent queries" : "nothing is really lost."}
              </div>
              {ctrl.history.length > 0 ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {ctrl.history.map(([q, sc], idx) => (
                    <button
                      key={`${q}-${idx}`}
                      type="button"
                      className="result-row"
                      style={{ width: "100%", textAlign: "left", background: "transparent" }}
                      onClick={() => {
                        ctrl.setQuery(q);
                        ctrl.setScope((sc as SearchScope) || "all");
                      }}
                    >
                      <span className="mono">{q}</span>
                      <span className="eyebrow">{sc}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <EmptyState
                  title="start typing to search."
                  description="Queries run against your local SQLite FTS5 index first, then stream results from enabled developer sources and online paired devices."
                  action={
                    <button className="btn btn-sm" onClick={() => setPage("settings")}>
                      manage indexed folders
                    </button>
                  }
                />
              )}
            </div>
          ) : ctrl.results.length === 0 ? (
            <EmptyState
              title="no matches found."
              description="Check your active search scope, or add additional folders in Settings to expand your local index."
            />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {ctrl.results.map((item, idx) => {
                const selected = idx === ctrl.selectedIndex;
                return (
                  <div
                    key={item.id}
                    className={`result-row ${selected ? "selected" : ""}`}
                    onClick={() => ctrl.setSelectedIndex(idx)}
                    onDoubleClick={() => {
                      const primary = item.actions[0];
                      if (primary) ctrl.performAction(item, primary.id);
                    }}
                  >
                    <div style={{ display: "flex", gap: 10, minWidth: 0, flex: 1 }}>
                      <div style={{ marginTop: 2, color: "var(--text-secondary)", flexShrink: 0 }}>
                        <SourceIcon source={item.source} kind={item.kind} size={15} />
                      </div>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <span
                            style={{
                              fontWeight: 500,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {item.title}
                          </span>
                          {item.pinned && <Pin size={11} className="muted" />}
                        </div>
                        <div
                          className="mono muted"
                          style={{
                            fontSize: 11,
                            marginTop: 2,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {truncatePath(item.subtitle, 62)}
                        </div>
                      </div>
                    </div>
                    <span
                      className="mono"
                      style={{
                        fontSize: 10,
                        padding: "2px 6px",
                        borderRadius: 3,
                        background: "var(--surface-inset)",
                        border: "1px solid var(--border-subtle)",
                        color: "var(--text-muted)",
                        flexShrink: 0,
                      }}
                    >
                      {item.sourceLabel}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </PhantomCard>

        {/* Right pane: Preview + Actions */}
        <PhantomCard variant="card" style={{ padding: 18, minHeight: 420 }}>
          {!ctrl.selectedResult ? (
            <EmptyState
              title="select a result."
              description="Inspect file previews, metadata, and contextual actions here. Use ↑↓ arrows and Enter to act without leaving the keyboard."
            />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <div className="eyebrow" style={{ marginBottom: 6 }}>
                  {ctrl.selectedResult.sourceLabel} · {ctrl.selectedResult.kind}
                </div>
                <div style={{ fontSize: 16, fontWeight: 550, wordBreak: "break-word" }}>
                  {ctrl.selectedResult.title}
                </div>
                <div className="mono muted" style={{ fontSize: 11.5, marginTop: 4, wordBreak: "break-all" }}>
                  {ctrl.selectedResult.uri}
                </div>
              </div>

              <hr className="divider" />

              {/* Metadata strip */}
              <div
                className="mono tabular muted"
                style={{ display: "flex", flexWrap: "wrap", gap: 12, fontSize: 11 }}
              >
                {typeof ctrl.selectedResult.metadata.sizeBytes === "number" && (
                  <span>size: {formatBytes(ctrl.selectedResult.metadata.sizeBytes)}</span>
                )}
                {ctrl.selectedResult.modifiedAt && (
                  <span>modified: {formatRelativeTime(ctrl.selectedResult.modifiedAt)}</span>
                )}
                <span>score: {Math.round(ctrl.selectedResult.score)}</span>
              </div>

              {/* Actions */}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
                {ctrl.selectedResult.actions.map((act, idx) => (
                  <button
                    key={act.id}
                    type="button"
                    className={`btn btn-sm ${idx === 0 ? "btn-primary" : ""}`}
                    onClick={() => ctrl.performAction(ctrl.selectedResult!, act.id)}
                  >
                    <span>{act.label}</span>
                    {act.shortcut && <KbdBadge>{act.shortcut}</KbdBadge>}
                  </button>
                ))}
              </div>

              {/* Preview Box */}
              <div>
                <div className="eyebrow" style={{ marginBottom: 6 }}>
                  preview
                </div>
                {ctrl.previewLoading ? (
                  <div className="skeleton" style={{ height: 140 }} />
                ) : (
                  <pre className="code-preview">
                    {ctrl.filePreview ?? ctrl.selectedResult.preview ?? "No preview available."}
                  </pre>
                )}
              </div>
            </div>
          )}
        </PhantomCard>
      </div>
    </div>
  );
};

// ==================== src/pages/Devices.tsx ====================
export const DevicesPage: React.FC = () => {
  const dashboard = useAppStore((s) => s.dashboard);
  const pairedDevices = useAppStore((s) => s.pairedDevices);
  const discoveredPeers = useAppStore((s) => s.discoveredPeers);
  const pendingPairings = useAppStore((s) => s.pendingPairings);
  const transfers = useAppStore((s) => s.transfers);
  const refreshDevices = useAppStore((s) => s.refreshDevices);
  const jumpToSearch = useAppStore((s) => s.jumpToSearch);
  const pushToast = useAppStore((s) => s.pushToast);

  const [pairModalOpen, setPairModalOpen] = useState(false);
  const [manualHost, setManualHost] = useState("");
  const [manualPort, setManualPort] = useState("47892");
  const [pairingBusy, setPairingBusy] = useState(false);
  const [showDiagnostics, setShowDiagnostics] = useState(false);

  const [browsing, setBrowsing] = useState<RemoteBrowseResponse | null>(null);
  const [browseLoading, setBrowseLoading] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<PairedDeviceRecord | null>(null);

  const handleInitiatePairing = async (host: string, port: number) => {
    setPairingBusy(true);
    setPairModalOpen(false);
    try {
      pushToast(
        "Pairing handshake started",
        "Verify the 6-digit SAS code matches on both screens and approve",
        "info"
      );
      const paired = await api.pairWithDevice(host, port);
      await refreshDevices();
      pushToast("Device paired", `${paired.name} is now trusted on PhantomLink`, "success");
    } catch (err) {
      await refreshDevices();
      pushToast("Pairing failed", err instanceof Error ? err.message : String(err), "error");
    } finally {
      setPairingBusy(false);
    }
  };

  const handleRespondPairing = async (pairingId: string, approve: boolean) => {
    try {
      await api.respondToPairing(pairingId, approve);
      await refreshDevices();
      pushToast(
        approve ? "Pairing approved" : "Pairing declined",
        approve ? "Encrypted PhantomLink channel established" : "Unknown device was rejected",
        approve ? "success" : "info"
      );
    } catch (err) {
      pushToast("Pairing action failed", err instanceof Error ? err.message : String(err), "error");
    }
  };

  const handlePing = async (device: PairedDeviceRecord) => {
    try {
      const updated = await api.pingPairedDevice(device.id);
      await refreshDevices();
      pushToast(
        `${updated.name} is online`,
        `${updated.sharedFileCount} shared files searchable`,
        "success"
      );
    } catch (err) {
      await refreshDevices();
      pushToast(`${device.name} unreachable`, err instanceof Error ? err.message : String(err), "error");
    }
  };

  const handleBrowse = async (device: PairedDeviceRecord, dirPath?: string) => {
    setBrowseLoading(true);
    try {
      const data = await api.browseRemoteDevice(device.id, dirPath);
      setBrowsing(data);
    } catch (err) {
      pushToast("Could not browse device", err instanceof Error ? err.message : String(err), "error");
    } finally {
      setBrowseLoading(false);
    }
  };

  const handleTransfer = async (deviceId: string, remotePath: string, filename: string) => {
    try {
      pushToast("Encrypted transfer started", filename, "info");
      const rec = await api.transferRemoteFile(deviceId, remotePath, undefined, false);
      await refreshDevices();
      pushToast("Transfer complete (SHA-256 verified)", `Saved to ${rec.localPath}`, "success");
    } catch (err) {
      pushToast("Transfer failed", err instanceof Error ? err.message : String(err), "error");
    }
  };

  const handleSendClipboard = async (device: PairedDeviceRecord) => {
    try {
      const text = await readClipboardText();
      if (!text.trim()) {
        pushToast("Clipboard is empty", undefined, "info");
        return;
      }
      const msg = await api.sendClipboardToDevice(device.id, text);
      pushToast(`Sent clipboard to ${device.name}`, msg, "success");
    } catch (err) {
      pushToast("Clipboard send failed", err instanceof Error ? err.message : String(err), "error");
    }
  };

  const handleConfirmRevoke = async () => {
    if (!revokeTarget) return;
    try {
      await api.revokeDeviceTrust(revokeTarget.id);
      await refreshDevices();
      pushToast("Device trust revoked", `${revokeTarget.name} can no longer connect`, "info");
    } catch (err) {
      pushToast("Failed to unpair", err instanceof Error ? err.message : String(err), "error");
    } finally {
      setRevokeTarget(null);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16 }}>
        <div>
          <EditorialHeading size="xl">your devices.</EditorialHeading>
          <p className="muted" style={{ margin: "6px 0 0", fontSize: 13.5 }}>
            your devices, connected. Local-first encrypted mesh without cloud relays.
          </p>
        </div>
        <button className="btn btn-sm" onClick={() => refreshDevices()}>
          <RefreshCw size={13} />
          <span>Refresh mesh</span>
        </button>
      </div>

      {/* Incoming Pairing Approvals (SAS verification) */}
      {pendingPairings.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {pendingPairings.map((p) => (
            <PhantomCard
              key={p.pairingId}
              variant="card"
              style={{ padding: 18, borderColor: "var(--status-warn)" }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: 14,
                }}
              >
                <div>
                  <div className="eyebrow" style={{ color: "#e1cb9c" }}>
                    {p.direction === "outgoing"
                      ? "outgoing pairing — confirm this code matches the other computer"
                      : "incoming pairing request — verify code matches before approving"}
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 550, marginTop: 4 }}>
                    {p.peerName}{" "}
                    <span className="mono muted" style={{ fontSize: 12 }}>
                      ({p.peerOs} · {p.peerHost})
                    </span>
                  </div>
                  <div className="mono muted" style={{ fontSize: 11, marginTop: 3 }}>
                    fingerprint: {p.peerFingerprint}
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  <div
                    className="mono"
                    style={{
                      fontSize: 22,
                      letterSpacing: "0.18em",
                      padding: "6px 14px",
                      background: "var(--surface-inset)",
                      border: "1px solid var(--border-strong)",
                      borderRadius: 5,
                    }}
                  >
                    {p.sasCode}
                  </div>
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() => handleRespondPairing(p.pairingId, true)}
                  >
                    Approve
                  </button>
                  <button
                    className="btn btn-danger btn-sm"
                    onClick={() => handleRespondPairing(p.pairingId, false)}
                  >
                    Decline
                  </button>
                </div>
              </div>
            </PhantomCard>
          ))}
        </div>
      )}

      {/* Devices Grid (Phantom Projects page style) */}
      <section className="three-col-grid">
        {pairedDevices.map((dev) => (
          <PhantomCard
            key={dev.id}
            variant="card"
            style={{
              padding: 20,
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              gap: 16,
              minHeight: 230,
            }}
          >
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 6,
                    background: "var(--surface-inset)",
                    border: "1px solid var(--border-subtle)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "var(--text-primary)",
                  }}
                >
                  {dev.os.toLowerCase().includes("mac") ? <Laptop size={19} /> : <Monitor size={19} />}
                </div>
                <StatusIndicator
                  state={dev.status === "online" ? "online" : "offline"}
                  label={dev.status}
                />
              </div>

              <div style={{ marginTop: 14 }}>
                <div style={{ fontSize: 15.5, fontWeight: 550 }}>{dev.name}</div>
                <div className="mono muted" style={{ fontSize: 11.5, marginTop: 3 }}>
                  {dev.os} · {dev.host}:{dev.port}
                </div>
              </div>

              <div
                className="mono muted tabular"
                style={{
                  marginTop: 12,
                  paddingTop: 10,
                  borderTop: "1px solid var(--border-subtle)",
                  fontSize: 11,
                  display: "flex",
                  justifyContent: "space-between",
                }}
              >
                <span>{dev.sharedFileCount} shared files</span>
                <span>seen {formatRelativeTime(dev.lastSeenAt)}</span>
              </div>
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              <button
                className="btn btn-primary btn-sm"
                onClick={() => jumpToSearch("", "devices", dev.id)}
              >
                <Search size={12} />
                <span>Search</span>
              </button>
              <button className="btn btn-sm" onClick={() => handleBrowse(dev)}>
                <FolderOpen size={12} />
                <span>Browse</span>
              </button>
              <button className="btn btn-sm" onClick={() => handlePing(dev)} title="Ping device">
                <RefreshCw size={12} />
              </button>
              <button
                className="btn btn-sm"
                onClick={() => handleSendClipboard(dev)}
                title="Send current clipboard text to this device"
              >
                <Clipboard size={12} />
              </button>
              <button
                className="btn btn-danger btn-sm"
                onClick={() => setRevokeTarget(dev)}
                title="Revoke trust and unpair"
              >
                <Trash2 size={12} />
              </button>
            </div>
          </PhantomCard>
        ))}

        {/* Add a Device Dashed Card (+) */}
        <PhantomCard
          variant="dashed"
          interactive
          onClick={() => setPairModalOpen(true)}
          style={{
            padding: 20,
            minHeight: 230,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 10,
            textAlign: "center",
          }}
        >
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: "50%",
              border: "1px solid var(--border-card)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--text-primary)",
            }}
          >
            <Plus size={24} strokeWidth={1.5} />
          </div>
          <div className="editorial-heading editorial-sm">add a device.</div>
          <div className="muted" style={{ fontSize: 12, maxWidth: 200 }}>
            Discover nearby computers over mDNS or pair by LAN address.
          </div>
        </PhantomCard>
      </section>

      {/* Active & Recent File Transfers */}
      {transfers.length > 0 && (
        <PhantomCard variant="main" style={{ padding: 20 }}>
          <div className="eyebrow" style={{ marginBottom: 12 }}>
            encrypted file transfers
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {transfers.slice(0, 8).map((t) => {
              const pct =
                t.sizeBytes > 0 ? Math.round((t.transferredBytes / t.sizeBytes) * 100) : 0;
              return (
                <div
                  key={t.id}
                  style={{
                    padding: 12,
                    borderRadius: 5,
                    background: "var(--surface-inset)",
                    border: "1px solid var(--border-subtle)",
                    display: "flex",
                    flexDirection: "column",
                    gap: 8,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <span style={{ fontWeight: 500 }}>{t.filename}</span>
                      <span className="mono muted" style={{ fontSize: 11, marginLeft: 8 }}>
                        from {t.deviceName}
                      </span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <StatusIndicator
                        state={
                          t.status === "completed"
                            ? "online"
                            : t.status === "transferring"
                            ? "warn"
                            : "error"
                        }
                        label={t.status}
                      />
                      {t.status === "transferring" && (
                        <button
                          className="btn btn-danger btn-sm"
                          onClick={() => api.cancelFileTransfer(t.id)}
                        >
                          Cancel
                        </button>
                      )}
                    </div>
                  </div>
                  {t.status === "transferring" && (
                    <SegmentedProgress
                      percent={pct}
                      label={`${formatBytes(t.transferredBytes)} / ${formatBytes(t.sizeBytes)}`}
                    />
                  )}
                  <div className="mono muted" style={{ fontSize: 11 }}>
                    {t.status === "completed"
                      ? `saved to ${t.localPath} · sha256 ${t.sha256?.slice(0, 14) ?? "verified"}…`
                      : t.error ?? t.localPath}
                  </div>
                </div>
              );
            })}
          </div>
        </PhantomCard>
      )}

      {/* Expandable Network Diagnostics */}
      <PhantomCard variant="main" style={{ padding: 16 }}>
        <button
          type="button"
          className="btn btn-ghost"
          style={{ width: "100%", justifyContent: "space-between", padding: "2px 4px" }}
          onClick={() => setShowDiagnostics((v) => !v)}
        >
          <span className="eyebrow">network diagnostics &amp; local node identity</span>
          {showDiagnostics ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
        </button>

        {showDiagnostics && dashboard?.deviceIdentity && (
          <div
            className="mono"
            style={{
              marginTop: 12,
              paddingTop: 12,
              borderTop: "1px solid var(--border-subtle)",
              fontSize: 11.5,
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
              gap: 10,
              color: "var(--text-secondary)",
            }}
          >
            <div>
              <span className="muted">node name:</span> {dashboard.deviceIdentity.deviceName}
            </div>
            <div>
              <span className="muted">tcp listen port:</span> {dashboard.deviceIdentity.listenPort}
            </div>
            <div>
              <span className="muted">device id:</span> {dashboard.deviceIdentity.deviceId}
            </div>
            <div>
              <span className="muted">key fingerprint:</span> {dashboard.deviceIdentity.fingerprint}
            </div>
            <div>
              <span className="muted">encryption:</span> X25519 + HKDF-SHA256 + ChaCha20-Poly1305
            </div>
            <div>
              <span className="muted">discovery:</span> mDNS (_phantommesh._tcp.local.)
            </div>
          </div>
        )}
      </PhantomCard>

      {/* Pair a Device Modal */}
      {pairModalOpen && (
        <div className="modal-backdrop" onClick={() => setPairModalOpen(false)}>
          <div
            className="modal-panel phantom-card-main"
            style={{ padding: 24 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <EditorialHeading as="h2" size="md">
                pair a trusted device.
              </EditorialHeading>
              <button className="btn btn-ghost btn-sm" onClick={() => setPairModalOpen(false)}>
                <X size={15} />
              </button>
            </div>
            <p className="muted" style={{ fontSize: 12.5, marginTop: 6 }}>
              Select a nearby computer running PhantomMesh or enter its local network IP and port.
              Both devices must explicitly verify the matching 6-digit code.
            </p>

            {/* Discovered mDNS peers */}
            <div style={{ marginTop: 16 }}>
              <div className="eyebrow" style={{ marginBottom: 8 }}>
                nearby on local network ({discoveredPeers.length})
              </div>
              {discoveredPeers.length === 0 ? (
                <div
                  className="mono muted"
                  style={{
                    padding: 12,
                    background: "var(--surface-inset)",
                    borderRadius: 5,
                    border: "1px solid var(--border-subtle)",
                    fontSize: 11.5,
                  }}
                >
                  Listening for _phantommesh._tcp.local. peers… Make sure PhantomMesh is running on the other computer.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {discoveredPeers.map((peer) => (
                    <div
                      key={peer.deviceId}
                      style={{
                        padding: 10,
                        borderRadius: 5,
                        background: "var(--surface-inset)",
                        border: "1px solid var(--border-subtle)",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        gap: 10,
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 500 }}>{peer.name}</div>
                        <div className="mono muted" style={{ fontSize: 11 }}>
                          {peer.os} · {peer.host}:{peer.port}
                        </div>
                      </div>
                      <button
                        className="btn btn-primary btn-sm"
                        disabled={pairingBusy || peer.alreadyPaired}
                        onClick={() => handleInitiatePairing(peer.host, peer.port)}
                      >
                        {peer.alreadyPaired ? "Paired" : "Pair"}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <hr className="divider" style={{ margin: "18px 0" }} />

            {/* Manual LAN Pair */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const port = Number(manualPort);
                if (!manualHost.trim() || !Number.isFinite(port)) return;
                handleInitiatePairing(manualHost.trim(), port);
              }}
              style={{ display: "flex", flexDirection: "column", gap: 10 }}
            >
              <div className="eyebrow">manual local address</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 110px", gap: 8 }}>
                <input
                  className="input mono"
                  placeholder="192.168.1.42 or hostname.local"
                  value={manualHost}
                  onChange={(e) => setManualHost(e.target.value)}
                />
                <input
                  className="input mono"
                  placeholder="47892"
                  value={manualPort}
                  onChange={(e) => setManualPort(e.target.value)}
                />
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 6 }}>
                <button type="button" className="btn" onClick={() => setPairModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={pairingBusy}>
                  {pairingBusy ? "Waiting for remote approval…" : "Initiate pairing"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Remote Shared Folders Browser Modal */}
      {browsing && (
        <div className="modal-backdrop" onClick={() => setBrowsing(null)}>
          <div
            className="modal-panel phantom-card-main"
            style={{ maxWidth: 680, padding: 24 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div className="eyebrow">shared folders on remote device</div>
                <EditorialHeading as="h2" size="md" style={{ marginTop: 2 }}>
                  {browsing.deviceName}
                </EditorialHeading>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => setBrowsing(null)}>
                <X size={15} />
              </button>
            </div>

            {browsing.directories.length === 0 ? (
              <EmptyState
                title="no shared folders."
                description="This device has not enabled remote sharing on any indexed folder yet."
              />
            ) : (
              <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 12 }}>
                <div className="scope-chips">
                  {browsing.directories.map((dir) => (
                    <button
                      key={dir.id}
                      className="scope-chip"
                      onClick={() => {
                        const dev = pairedDevices.find((d) => d.id === browsing.deviceId);
                        if (dev) handleBrowse(dev, dir.path);
                      }}
                    >
                      {truncatePath(dir.path, 38)} ({dir.fileCount})
                    </button>
                  ))}
                </div>

                {browseLoading ? (
                  <div className="skeleton" style={{ height: 160 }} />
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 5, maxHeight: 340, overflowY: "auto" }}>
                    {browsing.files.map((f) => (
                      <div
                        key={f.id}
                        style={{
                          padding: "9px 11px",
                          borderRadius: 5,
                          background: "var(--surface-inset)",
                          border: "1px solid var(--border-subtle)",
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          gap: 10,
                        }}
                      >
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 500 }}>{f.name}</div>
                          <div className="mono muted" style={{ fontSize: 11 }}>
                            {truncatePath(f.path, 52)} · {formatBytes(f.sizeBytes)}
                          </div>
                        </div>
                        <button
                          className="btn btn-primary btn-sm"
                          onClick={() => handleTransfer(browsing.deviceId, f.path, f.name)}
                        >
                          <Download size={12} />
                          <span>Transfer</span>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      <ConfirmDialog
        open={revokeTarget !== null}
        title="revoke device trust?"
        description={
          revokeTarget
            ? `Unpairing ${revokeTarget.name} permanently removes its encryption key. It will immediately lose all remote search and file transfer access until explicitly paired again.`
            : ""
        }
        confirmLabel="Revoke trust"
        destructive
        onConfirm={handleConfirmRevoke}
        onCancel={() => setRevokeTarget(null)}
      />

      {pairedDevices.length > 0 && (
        <div className="mono muted" style={{ fontSize: 11, display: "flex", alignItems: "center", gap: 6 }}>
          <ShieldAlert size={13} />
          <span>
            Remote peers can only search and transfer files inside folders you explicitly mark as shared in Settings.
          </span>
        </div>
      )}
    </div>
  );
};

// ==================== src/pages/Sources.tsx ====================
type ActiveSourceModal = "local" | "github" | "stackoverflow" | "docs" | "devices" | "add" | null;

export const SourcesPage: React.FC = () => {
  const settings = useAppStore((s) => s.settings);
  const dashboard = useAppStore((s) => s.dashboard);
  const directories = useAppStore((s) => s.directories);
  const pairedDevices = useAppStore((s) => s.pairedDevices);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const setPage = useAppStore((s) => s.setPage);
  const pushToast = useAppStore((s) => s.pushToast);

  const [activeModal, setActiveModal] = useState<ActiveSourceModal>(null);
  const [ghStatus, setGhStatus] = useState<GitHubAuthStatus | null>(null);
  const [ghClientId, setGhClientId] = useState("");
  const [deviceCode, setDeviceCode] = useState<GitHubDeviceCodeResponse | null>(null);
  const [ghBusy, setGhBusy] = useState(false);

  const loadGhStatus = async () => {
    if (!isTauriRuntime()) return;
    try {
      const s = await api.getGitHubAuthStatus();
      setGhStatus(s);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    loadGhStatus();
  }, []);

  useEffect(() => {
    if (settings?.providers.githubClientId) {
      setGhClientId(settings.providers.githubClientId);
    }
  }, [settings?.providers.githubClientId]);

  const toggleProvider = async (
    key: "localEnabled" | "githubEnabled" | "stackoverflowEnabled" | "docsEnabled" | "remoteDevicesEnabled",
    val: boolean
  ) => {
    if (!settings) return;
    try {
      await updateSettings({
        ...settings,
        providers: { ...settings.providers, [key]: val },
      });
      pushToast("Source updated", undefined, "success");
    } catch (err) {
      pushToast("Failed to update source", err instanceof Error ? err.message : String(err), "error");
    }
  };

  const handleStartGitHubDeviceFlow = async () => {
    if (!ghClientId.trim()) {
      pushToast("Client ID required", "Enter a GitHub OAuth App Client ID with Device Flow enabled", "error");
      return;
    }
    setGhBusy(true);
    try {
      const resp = await api.githubStartDeviceFlow(ghClientId.trim());
      setDeviceCode(resp);
      pushToast("Verification code generated", `Enter ${resp.userCode} on GitHub`, "info");
    } catch (err) {
      pushToast("GitHub Device Flow failed", err instanceof Error ? err.message : String(err), "error");
    } finally {
      setGhBusy(false);
    }
  };

  const handlePollGitHub = async () => {
    if (!deviceCode) return;
    setGhBusy(true);
    try {
      const state = await api.githubPollDeviceFlow(ghClientId.trim(), deviceCode.deviceCode);
      if (state.startsWith("authorized:")) {
        setDeviceCode(null);
        await loadGhStatus();
        pushToast("GitHub connected", `Signed in as @${state.split(":")[1]} (stored in OS Keychain)`, "success");
      } else {
        pushToast("Authorization status", state.replace(/_/g, " "), "info");
      }
    } catch (err) {
      pushToast("Poll failed", err instanceof Error ? err.message : String(err), "error");
    } finally {
      setGhBusy(false);
    }
  };

  const handleDisconnectGitHub = async () => {
    try {
      await api.githubDisconnect();
      await loadGhStatus();
      pushToast("GitHub disconnected", "Removed token from OS credential storage", "info");
    } catch (err) {
      pushToast("Disconnect failed", err instanceof Error ? err.message : String(err), "error");
    }
  };

  const p = settings?.providers;
  const stats = dashboard?.stats;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div>
        <EditorialHeading size="xl">your sources.</EditorialHeading>
        <p className="muted" style={{ margin: "6px 0 0", fontSize: 13.5 }}>
          connect the places where your knowledge lives.
        </p>
      </div>

      {/* Three-column Guides-style grid */}
      <section className="three-col-grid">
        {/* Local Files */}
        <PhantomCard
          variant="card"
          interactive
          onClick={() => setActiveModal("local")}
          style={{ padding: 20, display: "flex", flexDirection: "column", justifyContent: "space-between", minHeight: 208 }}
        >
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <Folder size={19} />
              <StatusIndicator
                state={p?.localEnabled && directories.length > 0 ? "online" : p?.localEnabled ? "warn" : "offline"}
                label={
                  !p?.localEnabled
                    ? "disabled"
                    : directories.length > 0
                    ? "indexed"
                    : "no folders"
                }
              />
            </div>
            <div style={{ fontSize: 15.5, fontWeight: 550, marginTop: 14 }}>Local files</div>
            <p className="muted" style={{ fontSize: 12.5, margin: "6px 0 0" }}>
              Full-text SQLite FTS5 index over user-approved folders with incremental filesystem watching.
            </p>
          </div>
          <div className="mono muted tabular" style={{ fontSize: 11, marginTop: 14 }}>
            {directories.length} folders · {(stats?.totalFiles ?? 0).toLocaleString()} files ·{" "}
            {formatRelativeTime(stats?.lastIndexedAt)}
          </div>
        </PhantomCard>

        {/* GitHub */}
        <PhantomCard
          variant="card"
          interactive
          onClick={() => setActiveModal("github")}
          style={{ padding: 20, display: "flex", flexDirection: "column", justifyContent: "space-between", minHeight: 208 }}
        >
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <GitBranch size={19} />
              <StatusIndicator
                state={!p?.githubEnabled ? "offline" : ghStatus?.authenticated ? "online" : "online"}
                label={
                  !p?.githubEnabled
                    ? "disabled"
                    : ghStatus?.authenticated
                    ? `@${ghStatus.username}`
                    : "public search"
                }
              />
            </div>
            <div style={{ fontSize: 15.5, fontWeight: 550, marginTop: 14 }}>GitHub</div>
            <p className="muted" style={{ fontSize: 12.5, margin: "6px 0 0" }}>
              Search public repositories and issues out of the box, or connect via OAuth Device Flow for private repos.
            </p>
          </div>
          <div className="mono muted" style={{ fontSize: 11, marginTop: 14 }}>
            {ghStatus?.authenticated ? "private repos authorized" : "public repositories & issues"}
          </div>
        </PhantomCard>

        {/* Stack Overflow */}
        <PhantomCard
          variant="card"
          interactive
          onClick={() => setActiveModal("stackoverflow")}
          style={{ padding: 20, display: "flex", flexDirection: "column", justifyContent: "space-between", minHeight: 208 }}
        >
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <MessageSquareCode size={19} />
              <StatusIndicator
                state={p?.stackoverflowEnabled ? "online" : "offline"}
                label={p?.stackoverflowEnabled ? "active" : "disabled"}
              />
            </div>
            <div style={{ fontSize: 15.5, fontWeight: 550, marginTop: 14 }}>Stack Overflow</div>
            <p className="muted" style={{ fontSize: 12.5, margin: "6px 0 0" }}>
              Official Stack Exchange API v2.3 search returning ranked Q&amp;A threads with vote and answer counts.
            </p>
          </div>
          <div className="mono muted" style={{ fontSize: 11, marginTop: 14 }}>
            api.stackexchange.com/2.3
          </div>
        </PhantomCard>

        {/* Developer Documentation */}
        <PhantomCard
          variant="card"
          interactive
          onClick={() => setActiveModal("docs")}
          style={{ padding: 20, display: "flex", flexDirection: "column", justifyContent: "space-between", minHeight: 208 }}
        >
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <BookOpen size={19} />
              <StatusIndicator
                state={p?.docsEnabled ? "online" : "offline"}
                label={p?.docsEnabled ? "active" : "disabled"}
              />
            </div>
            <div style={{ fontSize: 15.5, fontWeight: 550, marginTop: 14 }}>
              Developer documentation
            </div>
            <p className="muted" style={{ fontSize: 12.5, margin: "6px 0 0" }}>
              Official search adapters for MDN Web Docs and Rust crates.io / docs.rs reference documentation.
            </p>
          </div>
          <div className="mono muted" style={{ fontSize: 11, marginTop: 14 }}>
            MDN Web Docs · docs.rs
          </div>
        </PhantomCard>

        {/* Paired Devices */}
        <PhantomCard
          variant="card"
          interactive
          onClick={() => setActiveModal("devices")}
          style={{ padding: 20, display: "flex", flexDirection: "column", justifyContent: "space-between", minHeight: 208 }}
        >
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <HardDrive size={19} />
              <StatusIndicator
                state={
                  !p?.remoteDevicesEnabled
                    ? "offline"
                    : pairedDevices.some((d) => d.status === "online")
                    ? "online"
                    : "warn"
                }
                label={
                  !p?.remoteDevicesEnabled
                    ? "disabled"
                    : `${pairedDevices.length} paired`
                }
              />
            </div>
            <div style={{ fontSize: 15.5, fontWeight: 550, marginTop: 14 }}>Paired devices</div>
            <p className="muted" style={{ fontSize: 12.5, margin: "6px 0 0" }}>
              Encrypted remote search across approved folders on trusted computers connected via PhantomLink.
            </p>
          </div>
          <div className="mono muted" style={{ fontSize: 11, marginTop: 14 }}>
            {stats?.sharedDirectories ?? 0} local folders shared out
          </div>
        </PhantomCard>

        {/* Extensibility card */}
        <PhantomCard
          variant="dashed"
          interactive
          onClick={() => setActiveModal("add")}
          style={{
            padding: 20,
            minHeight: 208,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            textAlign: "center",
          }}
        >
          <Plus size={22} />
          <div className="editorial-heading editorial-sm">add a source.</div>
          <div className="muted" style={{ fontSize: 12, maxWidth: 210 }}>
            Explore planned provider adapters and PhantomMesh&apos;s open provider trait.
          </div>
        </PhantomCard>
      </section>

      {/* Source Config Modals */}
      {activeModal && (
        <div className="modal-backdrop" onClick={() => setActiveModal(null)}>
          <div
            className="modal-panel phantom-card-main"
            style={{ padding: 24 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <EditorialHeading as="h2" size="md">
                {activeModal === "local" && "local files."}
                {activeModal === "github" && "github integration."}
                {activeModal === "stackoverflow" && "stack overflow."}
                {activeModal === "docs" && "developer documentation."}
                {activeModal === "devices" && "paired device search."}
                {activeModal === "add" && "extensible sources."}
              </EditorialHeading>
              <button className="btn btn-ghost btn-sm" onClick={() => setActiveModal(null)}>
                <X size={15} />
              </button>
            </div>

            {activeModal === "local" && p && (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontWeight: 500 }}>Enable local search</div>
                    <div className="muted" style={{ fontSize: 12 }}>
                      Always works completely offline using SQLite FTS5.
                    </div>
                  </div>
                  <ToggleSwitch
                    checked={p.localEnabled}
                    onChange={(v) => toggleProvider("localEnabled", v)}
                    ariaLabel="Toggle local search"
                  />
                </div>
                <button
                  className="btn btn-primary"
                  onClick={() => {
                    setActiveModal(null);
                    setPage("settings");
                  }}
                >
                  Manage indexed folders &amp; exclusions in Settings
                </button>
              </div>
            )}

            {activeModal === "github" && p && (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontWeight: 500 }}>Enable GitHub search</div>
                    <div className="muted" style={{ fontSize: 12 }}>
                      {ghStatus?.rateLimitNote ?? "Public repository & issue search active."}
                    </div>
                  </div>
                  <ToggleSwitch
                    checked={p.githubEnabled}
                    onChange={(v) => toggleProvider("githubEnabled", v)}
                    ariaLabel="Toggle GitHub search"
                  />
                </div>

                <hr className="divider" />

                {ghStatus?.authenticated ? (
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <StatusIndicator state="online" label={`Signed in as @${ghStatus.username}`} />
                      <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                        OAuth token stored securely in your OS Keychain.
                      </div>
                    </div>
                    <button className="btn btn-danger btn-sm" onClick={handleDisconnectGitHub}>
                      Disconnect
                    </button>
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    <div className="eyebrow">optional: connect private repositories (oauth device flow)</div>
                    <p className="muted" style={{ fontSize: 12, margin: 0 }}>
                      Public search requires no login. To search private repos without storing plaintext tokens, enter a GitHub OAuth App Client ID with Device Flow enabled.
                    </p>
                    <input
                      className="input mono"
                      placeholder="GitHub OAuth App Client ID (e.g. Iv1.xxxx)"
                      value={ghClientId}
                      onChange={(e) => setGhClientId(e.target.value)}
                    />
                    {!deviceCode ? (
                      <button
                        className="btn btn-primary"
                        disabled={ghBusy}
                        onClick={handleStartGitHubDeviceFlow}
                      >
                        Start GitHub Device Authorization
                      </button>
                    ) : (
                      <div
                        style={{
                          padding: 14,
                          borderRadius: 5,
                          background: "var(--surface-inset)",
                          border: "1px solid var(--border-card)",
                          display: "flex",
                          flexDirection: "column",
                          gap: 10,
                        }}
                      >
                        <div className="eyebrow">enter this code on github</div>
                        <div className="mono" style={{ fontSize: 22, letterSpacing: "0.14em" }}>
                          {deviceCode.userCode}
                        </div>
                        <div style={{ display: "flex", gap: 8 }}>
                          <button
                            className="btn btn-sm"
                            onClick={() => api.openExternalUrl(deviceCode.verificationUri)}
                          >
                            <ExternalLink size={12} />
                            <span>Open GitHub</span>
                          </button>
                          <button
                            className="btn btn-primary btn-sm"
                            disabled={ghBusy}
                            onClick={handlePollGitHub}
                          >
                            Check authorization
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {activeModal === "stackoverflow" && p && (
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontWeight: 500 }}>Enable Stack Overflow search</div>
                  <div className="muted" style={{ fontSize: 12 }}>
                    Queries official Stack Exchange API v2.3 when Web or All scope is active.
                  </div>
                </div>
                <ToggleSwitch
                  checked={p.stackoverflowEnabled}
                  onChange={(v) => toggleProvider("stackoverflowEnabled", v)}
                  ariaLabel="Toggle Stack Overflow"
                />
              </div>
            )}

            {activeModal === "docs" && p && (
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontWeight: 500 }}>Enable MDN Web Docs &amp; Rust docs.rs</div>
                  <div className="muted" style={{ fontSize: 12 }}>
                    Queries official documentation search APIs without scraping.
                  </div>
                </div>
                <ToggleSwitch
                  checked={p.docsEnabled}
                  onChange={(v) => toggleProvider("docsEnabled", v)}
                  ariaLabel="Toggle Docs search"
                />
              </div>
            )}

            {activeModal === "devices" && p && (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontWeight: 500 }}>Search paired PhantomLink devices</div>
                    <div className="muted" style={{ fontSize: 12 }}>
                      Queries online paired computers over ChaCha20-Poly1305 encrypted TCP channels.
                    </div>
                  </div>
                  <ToggleSwitch
                    checked={p.remoteDevicesEnabled}
                    onChange={(v) => toggleProvider("remoteDevicesEnabled", v)}
                    ariaLabel="Toggle remote devices search"
                  />
                </div>
                <button
                  className="btn"
                  onClick={() => {
                    setActiveModal(null);
                    setPage("devices");
                  }}
                >
                  Manage paired devices
                </button>
              </div>
            )}

            {activeModal === "add" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <p className="secondary" style={{ fontSize: 13, margin: 0 }}>
                  PhantomMesh uses a clean Rust <code className="mono">SearchProvider</code> trait so new search sources can be added without modifying the core engine.
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {[
                    { name: "Python & PyPI Docs", status: "planned" },
                    { name: "GitLab Self-Hosted", status: "planned" },
                    { name: "Linear / Jira Issues", status: "planned" },
                    { name: "Local Browser Bookmarks", status: "planned" },
                  ].map((item) => (
                    <div
                      key={item.name}
                      style={{
                        padding: "9px 12px",
                        background: "var(--surface-inset)",
                        border: "1px solid var(--border-subtle)",
                        borderRadius: 5,
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <span>{item.name}</span>
                      <span className="eyebrow">{item.status}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// ==================== src/pages/Settings.tsx ====================
export const SettingsPage: React.FC = () => {
  const settings = useAppStore((s) => s.settings);
  const dashboard = useAppStore((s) => s.dashboard);
  const directories = useAppStore((s) => s.directories);
  const indexingProgress = useAppStore((s) => s.indexingProgress);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const refreshDirectories = useAppStore((s) => s.refreshDirectories);
  const refreshDashboard = useAppStore((s) => s.refreshDashboard);
  const pushToast = useAppStore((s) => s.pushToast);

  const [deviceName, setDeviceName] = useState("");
  const [shortcutInput, setShortcutInput] = useState("");
  const [shortcutError, setShortcutError] = useState<string | null>(null);
  const [newExclusion, setNewExclusion] = useState("");
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [confirmDeleteIndex, setConfirmDeleteIndex] = useState(false);

  useEffect(() => {
    if (settings) {
      setDeviceName(settings.deviceName);
      setShortcutInput(settings.globalShortcut);
    }
  }, [settings]);

  const loadLogs = async () => {
    if (!isTauriRuntime()) return;
    try {
      const entries = await api.listAuditLogs();
      setLogs(entries);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    loadLogs();
  }, []);

  if (!settings) {
    return <div className="muted mono">Loading settings…</div>;
  }

  const patchSettings = async (patch: Partial<typeof settings>) => {
    try {
      setShortcutError(null);
      await updateSettings({ ...settings, ...patch });
      pushToast("Settings saved", undefined, "success");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (patch.globalShortcut !== undefined) {
        setShortcutError(msg);
      }
      pushToast("Could not save settings", msg, "error");
    }
  };

  const handleAddFolder = async () => {
    try {
      const picked = await pickFolderDialog("Choose a directory to index in PhantomMesh");
      if (!picked) return;
      pushToast("Indexing directory", picked, "info");
      await api.addIndexedDirectory(picked, false);
      await refreshDirectories();
      pushToast("Directory indexed", picked, "success");
    } catch (err) {
      pushToast("Failed to add folder", err instanceof Error ? err.message : String(err), "error");
    }
  };

  const handleRemoveFolder = async (id: string, path: string) => {
    try {
      await api.removeIndexedDirectory(id);
      await refreshDirectories();
      pushToast("Directory removed", `Purged index entries for ${path}`, "info");
    } catch (err) {
      pushToast("Remove failed", err instanceof Error ? err.message : String(err), "error");
    }
  };

  const handleToggleRemoteShare = async (id: string, share: boolean) => {
    try {
      await api.setDirectoryRemoteShare(id, share);
      await refreshDirectories();
      pushToast(
        share ? "Folder shared on PhantomLink" : "Folder set to local-only",
        undefined,
        "info"
      );
    } catch (err) {
      pushToast("Update failed", err instanceof Error ? err.message : String(err), "error");
    }
  };

  const handleRebuildIndex = async () => {
    try {
      pushToast("Rebuilding index", "Scanning all configured folders…", "info");
      await api.rebuildIndex();
      await refreshDirectories();
      pushToast("Index rebuilt", undefined, "success");
    } catch (err) {
      pushToast("Rebuild failed", err instanceof Error ? err.message : String(err), "error");
    }
  };

  const handlePickTransferDir = async () => {
    try {
      const picked = await pickFolderDialog("Choose folder for incoming PhantomLink file transfers");
      if (picked) {
        await patchSettings({ transferDestination: picked });
      }
    } catch (err) {
      pushToast("Folder pick failed", err instanceof Error ? err.message : String(err), "error");
    }
  };

  const handleExportDiagnostics = async () => {
    try {
      const bundle = await api.exportDiagnostics();
      await copyText(JSON.stringify(bundle, null, 2));
      pushToast("Diagnostics copied", "Redacted diagnostic JSON copied to clipboard", "success");
    } catch (err) {
      pushToast("Export failed", err instanceof Error ? err.message : String(err), "error");
    }
  };

  const handleDeleteIndex = async () => {
    try {
      await api.deleteLocalIndex();
      await refreshDirectories();
      await refreshDashboard();
      pushToast("Local index deleted", "All indexed metadata and FTS5 entries were wiped", "info");
    } catch (err) {
      pushToast("Delete failed", err instanceof Error ? err.message : String(err), "error");
    } finally {
      setConfirmDeleteIndex(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      <div>
        <EditorialHeading size="xl">settings.</EditorialHeading>
        <p className="muted" style={{ margin: "6px 0 0", fontSize: 13.5 }}>
          local-first preferences, indexing rules, device security, and diagnostics.
        </p>
      </div>

      {/* General */}
      <PhantomCard variant="card" style={{ padding: 20 }}>
        <div className="eyebrow" style={{ marginBottom: 14 }}>
          general
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10, alignItems: "end" }}>
            <div>
              <label className="muted" style={{ fontSize: 12, display: "block", marginBottom: 5 }}>
                Device display name (advertised on PhantomLink LAN)
              </label>
              <input
                className="input"
                value={deviceName}
                onChange={(e) => setDeviceName(e.target.value)}
              />
            </div>
            <button
              className="btn"
              onClick={() => patchSettings({ deviceName: deviceName.trim() || settings.deviceName })}
            >
              Save name
            </button>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10, alignItems: "end" }}>
            <div>
              <label className="muted" style={{ fontSize: 12, display: "block", marginBottom: 5 }}>
                Global search palette shortcut (e.g. CommandOrControl+Shift+K or CommandOrControl+Space)
              </label>
              <input
                className="input mono"
                value={shortcutInput}
                onChange={(e) => setShortcutInput(e.target.value)}
              />
              {shortcutError && (
                <div className="mono" style={{ color: "#e4a7a7", fontSize: 11.5, marginTop: 5 }}>
                  {shortcutError}
                </div>
              )}
            </div>
            <button
              className="btn"
              onClick={() => patchSettings({ globalShortcut: shortcutInput.trim() })}
            >
              Apply shortcut
            </button>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontWeight: 500 }}>Default search scope</div>
              <div className="muted" style={{ fontSize: 12 }}>
                Initial scope selected when opening search.
              </div>
            </div>
            <select
              className="input mono"
              style={{ width: 170 }}
              value={settings.defaultScope}
              onChange={(e) => patchSettings({ defaultScope: e.target.value as SearchScope })}
            >
              <option value="all">all</option>
              <option value="local">local</option>
              <option value="devices">devices</option>
              <option value="github">github</option>
              <option value="web">web</option>
              <option value="commands">commands</option>
            </select>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontWeight: 500 }}>Launch on startup</div>
              <div className="muted" style={{ fontSize: 12 }}>
                Automatically start PhantomMesh in the background when you sign into your computer.
              </div>
            </div>
            <ToggleSwitch
              checked={settings.launchOnStartup}
              onChange={(v) => patchSettings({ launchOnStartup: v })}
              ariaLabel="Toggle launch on startup"
            />
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontWeight: 500 }}>Minimize to tray / menu bar on close</div>
              <div className="muted" style={{ fontSize: 12 }}>
                Keep global shortcut and PhantomLink active while dashboard window is closed.
              </div>
            </div>
            <ToggleSwitch
              checked={settings.minimizeToTray}
              onChange={(v) => patchSettings({ minimizeToTray: v })}
              ariaLabel="Toggle minimize to tray"
            />
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontWeight: 500 }}>Surface grain &amp; card grid texture</div>
              <div className="muted" style={{ fontSize: 12 }}>
                Toggle Phantom&apos;s grainy backdrop and subtle 20px surface card grid.
              </div>
            </div>
            <ToggleSwitch
              checked={settings.showGrainTexture && settings.showCardGrid}
              onChange={(v) => patchSettings({ showGrainTexture: v, showCardGrid: v })}
              ariaLabel="Toggle Phantom textures"
            />
          </div>
        </div>
      </PhantomCard>

      {/* Search & Indexed Directories */}
      <PhantomCard variant="card" style={{ padding: 20 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 14,
          }}
        >
          <div>
            <div className="eyebrow">search &amp; local index</div>
            <div className="mono muted tabular" style={{ fontSize: 11.5, marginTop: 4 }}>
              {(dashboard?.stats.totalFiles ?? 0).toLocaleString()} indexed files · database{" "}
              {formatBytes(dashboard?.stats.databaseSizeBytes ?? 0)}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-sm" onClick={handleRebuildIndex} disabled={indexingProgress.active}>
              <RefreshCw size={12} />
              <span>Rebuild index</span>
            </button>
            <button className="btn btn-primary btn-sm" onClick={handleAddFolder}>
              <FolderPlus size={12} />
              <span>Add folder</span>
            </button>
          </div>
        </div>

        {indexingProgress.active && (
          <div style={{ marginBottom: 14 }}>
            <SegmentedProgress
              percent={indexingProgress.percent}
              label={indexingProgress.statusText}
            />
          </div>
        )}

        {directories.length === 0 ? (
          <div
            className="mono muted"
            style={{
              padding: 14,
              background: "var(--surface-inset)",
              borderRadius: 5,
              border: "1px solid var(--border-subtle)",
              fontSize: 12,
            }}
          >
            No directories indexed yet. Click &ldquo;Add folder&rdquo; to select directories you want PhantomMesh to search.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {directories.map((dir) => (
              <div
                key={dir.id}
                style={{
                  padding: "10px 12px",
                  borderRadius: 5,
                  background: "var(--surface-inset)",
                  border: "1px solid var(--border-subtle)",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 10,
                  flexWrap: "wrap",
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div className="mono" style={{ fontSize: 12.5, wordBreak: "break-all" }}>
                    {dir.path}
                  </div>
                  <div className="mono muted tabular" style={{ fontSize: 11, marginTop: 2 }}>
                    {dir.fileCount} files · indexed {formatRelativeTime(dir.lastIndexedAt)}
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <button
                    className={`btn btn-sm ${dir.shareRemotely ? "btn-primary" : ""}`}
                    onClick={() => handleToggleRemoteShare(dir.id, !dir.shareRemotely)}
                    title="Allow trusted paired PhantomLink devices to search and request files from this folder"
                  >
                    <Share2 size={12} />
                    <span>{dir.shareRemotely ? "Shared on Mesh" : "Local only"}</span>
                  </button>
                  <button
                    className="btn btn-danger btn-sm"
                    onClick={() => handleRemoveFolder(dir.id, dir.path)}
                    aria-label={`Remove ${dir.path}`}
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Exclusions Editor */}
        <div style={{ marginTop: 18 }}>
          <div className="eyebrow" style={{ marginBottom: 8 }}>
            excluded paths &amp; secret patterns ({settings.excludedPatterns.length})
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
            {settings.excludedPatterns.map((pat) => (
              <span
                key={pat}
                className="mono"
                style={{
                  fontSize: 11,
                  padding: "3px 8px",
                  borderRadius: 4,
                  background: "var(--surface-inset)",
                  border: "1px solid var(--border-subtle)",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                {pat}
                <button
                  type="button"
                  style={{ background: "none", border: "none", cursor: "pointer", padding: 0, color: "var(--text-muted)" }}
                  onClick={() =>
                    patchSettings({
                      excludedPatterns: settings.excludedPatterns.filter((x) => x !== pat),
                    })
                  }
                  aria-label={`Remove exclusion ${pat}`}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const clean = newExclusion.trim();
              if (!clean || settings.excludedPatterns.includes(clean)) return;
              setNewExclusion("");
              patchSettings({ excludedPatterns: [...settings.excludedPatterns, clean] });
            }}
            style={{ display: "flex", gap: 8 }}
          >
            <input
              className="input mono"
              placeholder="Add glob exclusion (e.g. **/secrets/** or *.sqlite)"
              value={newExclusion}
              onChange={(e) => setNewExclusion(e.target.value)}
            />
            <button type="submit" className="btn">
              Add rule
            </button>
          </form>
        </div>
      </PhantomCard>

      {/* Devices & Privacy */}
      <PhantomCard variant="card" style={{ padding: 20 }}>
        <div className="eyebrow" style={{ marginBottom: 14 }}>
          devices &amp; privacy
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 500 }}>Incoming transfer destination</div>
              <div className="mono muted" style={{ fontSize: 11.5, marginTop: 2, wordBreak: "break-all" }}>
                {settings.transferDestination}
              </div>
            </div>
            <button className="btn btn-sm" onClick={handlePickTransferDir}>
              Change folder
            </button>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontWeight: 500 }}>Allow remote search from paired devices</div>
              <div className="muted" style={{ fontSize: 12 }}>
                Applies only to folders explicitly toggled &ldquo;Shared on Mesh&rdquo;.
              </div>
            </div>
            <ToggleSwitch
              checked={settings.allowRemoteSearch}
              onChange={(v) => patchSettings({ allowRemoteSearch: v })}
              ariaLabel="Toggle remote search"
            />
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontWeight: 500 }}>Allow manual clipboard receive (disabled by default)</div>
              <div className="muted" style={{ fontSize: 12 }}>
                When enabled, trusted paired devices can send text snippets to this machine.
              </div>
            </div>
            <ToggleSwitch
              checked={settings.allowClipboardReceive}
              onChange={(v) => patchSettings({ allowClipboardReceive: v })}
              ariaLabel="Toggle clipboard receive"
            />
          </div>

          <hr className="divider" />

          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <button
              className="btn btn-sm"
              onClick={async () => {
                await api.clearSearchHistory();
                pushToast("Search history cleared", undefined, "success");
              }}
            >
              Clear search history
            </button>
            <button
              className="btn btn-danger btn-sm"
              onClick={() => setConfirmDeleteIndex(true)}
            >
              Delete local search index
            </button>
          </div>
        </div>
      </PhantomCard>

      {/* Advanced & Redacted Diagnostics */}
      <PhantomCard variant="main" style={{ padding: 20 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 12,
          }}
        >
          <div className="eyebrow">advanced &amp; redacted application logs</div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-sm" onClick={loadLogs}>
              <RefreshCw size={12} />
              <span>Refresh</span>
            </button>
            <button className="btn btn-sm" onClick={handleExportDiagnostics}>
              <Copy size={12} />
              <span>Copy redacted diagnostics</span>
            </button>
          </div>
        </div>

        <pre className="code-preview" style={{ maxHeight: 220 }}>
          {logs.length === 0
            ? "No recent diagnostic events recorded."
            : logs
                .slice(0, 25)
                .map((l) => `[${l.createdAt}] ${l.level.toUpperCase()} (${l.component}): ${l.message}`)
                .join("\n")}
        </pre>
      </PhantomCard>

      <ConfirmDialog
        open={confirmDeleteIndex}
        title="delete local search index?"
        description="This removes all indexed file metadata and FTS5 full-text records from SQLite. Your actual files on disk are never modified or deleted."
        confirmLabel="Delete index"
        destructive
        onConfirm={handleDeleteIndex}
        onCancel={() => setConfirmDeleteIndex(false)}
      />
    </div>
  );
};

// ==================== src/App.tsx ====================
export const App: React.FC = () => {
  const isPaletteWindow =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("mode") === "palette";

  const page = useAppStore((s) => s.page);
  const setPage = useAppStore((s) => s.setPage);
  const settings = useAppStore((s) => s.settings);
  const directories = useAppStore((s) => s.directories);
  const error = useAppStore((s) => s.error);
  const inAppPaletteOpen = useAppStore((s) => s.inAppPaletteOpen);
  const setInAppPaletteOpen = useAppStore((s) => s.setInAppPaletteOpen);
  const toasts = useAppStore((s) => s.toasts);
  const dismissToast = useAppStore((s) => s.dismissToast);
  const pushToast = useAppStore((s) => s.pushToast);

  const refreshAll = useAppStore((s) => s.refreshAll);
  const refreshDashboard = useAppStore((s) => s.refreshDashboard);
  const refreshDevices = useAppStore((s) => s.refreshDevices);
  const setIndexingProgress = useAppStore((s) => s.setIndexingProgress);
  const upsertTransferProgress = useAppStore((s) => s.upsertTransferProgress);
  const addPendingPairing = useAppStore((s) => s.addPendingPairing);
  const upsertDiscoveredPeer = useAppStore((s) => s.upsertDiscoveredPeer);

  useEffect(() => {
    document.body.classList.add("grid-enabled");
    if (isPaletteWindow) return;

    refreshAll();

    // In-app Cmd+K / Ctrl+K shortcut to open search palette overlay
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setInAppPaletteOpen(!useAppStore.getState().inAppPaletteOpen);
      }
    };
    window.addEventListener("keydown", onKeyDown);

    const unlisteners: (() => void)[] = [];
    if (isTauriRuntime()) {
      Promise.all([
        events.onIndexerProgress((prog) => {
          setIndexingProgress(prog);
          if (!prog.active) {
            refreshDashboard();
          }
        }),
        events.onIndexerFileUpdated(() => {
          refreshDashboard();
        }),
        events.onTransferProgress((t) => {
          upsertTransferProgress(t);
        }),
        events.onPairingRequest((req) => {
          addPendingPairing(req);
          pushToast(
            `Pairing request from ${req.peerName}`,
            `Verify code ${req.sasCode} in Devices`,
            "info"
          );
        }),
        events.onPeerDiscovered((peer) => {
          upsertDiscoveredPeer(peer);
        }),
        events.onDevicePaired((dev) => {
          refreshDevices();
          pushToast("Device paired", `${dev.name} connected via PhantomLink`, "success");
        }),
        events.onNavigate((route) => {
          if (["home", "search", "devices", "sources", "settings"].includes(route)) {
            setPage(route as PageId);
          }
        }),
      ]).then((fns) => {
        unlisteners.push(...fns);
      });
    }

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      unlisteners.forEach((fn) => fn());
    };
  }, [
    isPaletteWindow,
    refreshAll,
    refreshDashboard,
    refreshDevices,
    setIndexingProgress,
    upsertTransferProgress,
    addPendingPairing,
    upsertDiscoveredPeer,
    setInAppPaletteOpen,
    setPage,
    pushToast,
  ]);

  if (isPaletteWindow) {
    return (
      <>
        <SearchPalette standaloneWindow />
        <ToastStack toasts={toasts} onDismiss={dismissToast} />
      </>
    );
  }

  const grainClass = settings?.showGrainTexture === false ? "" : "grain-enabled";
  const showOnboarding =
    settings && !settings.onboardingCompleted && directories.length === 0 && page === "home";

  return (
    <div className={`app-shell phantom-grain-bg ${grainClass}`}>
      <TopNav />

      <main className="main-container">
        {error && (
          <PhantomCard
            variant="main"
            style={{
              padding: 16,
              marginBottom: 20,
              borderColor: "rgba(196, 126, 126, 0.55)",
            }}
          >
            <div className="eyebrow" style={{ color: "#e4a7a7" }}>
              backend connection notice
            </div>
            <div className="mono" style={{ fontSize: 12, marginTop: 6 }}>
              {error}
            </div>
          </PhantomCard>
        )}

        {showOnboarding ? (
          <OnboardingView />
        ) : (
          <>
            {page === "home" && <HomePage />}
            {page === "search" && <SearchPage />}
            {page === "devices" && <DevicesPage />}
            {page === "sources" && <SourcesPage />}
            {page === "settings" && <SettingsPage />}
          </>
        )}
      </main>

      {inAppPaletteOpen && <SearchPalette onClose={() => setInAppPaletteOpen(false)} />}
      <ToastStack toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
};

export default App;