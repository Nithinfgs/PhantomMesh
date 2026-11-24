import React from "react";
import {
  BookOpen,
  Code2,
  FileCode2,
  FileJson,
  FileText,
  Folder,
  GitBranch,
  Globe,
  HardDrive,
  Laptop,
  MessageSquareCode,
  Monitor,
  Terminal,
  X,
} from "lucide-react";
import type { ResultSource, ToastMessage } from "./types";

export const PhantomLogoMark: React.FC<{ size?: number; className?: string }> = ({ size = 22, className = "" }) => (
  <svg width={size} height={size} viewBox="0 0 64 64" fill="none" className={className} aria-hidden="true">
    <defs>
      <linearGradient id="pm-bg" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#1B1B1E" />
        <stop offset="100%" stopColor="#0E0E10" />
      </linearGradient>
      <linearGradient id="pm-top-facet" x1="32" y1="12" x2="32" y2="32" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.16" />
        <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0.02" />
      </linearGradient>
      <linearGradient id="pm-p-glow" x1="21" y1="19" x2="41" y2="32" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#FFFFFF" />
        <stop offset="100%" stopColor="#CCCCCC" />
      </linearGradient>
    </defs>

    <rect x="2" y="2" width="60" height="60" rx="14" fill="url(#pm-bg)" stroke="#4A4A50" strokeWidth="1.2" />
    <rect x="4.5" y="4.5" width="55" height="55" rx="11.5" fill="none" stroke="#26262B" strokeWidth="0.8" />

    <path d="M 7 11 L 7 7 L 11 7 M 53 7 L 57 7 L 57 11 M 7 53 L 7 57 L 11 57 M 53 57 L 57 57 L 57 53" stroke="#505058" strokeWidth="1" strokeLinecap="square" />

    <polygon points="32,12 49,22 49,42 32,52 15,42 15,22" fill="#131316" stroke="#505058" strokeWidth="1.2" strokeLinejoin="round" />
    <polygon points="32,12 49,22 32,32 15,22" fill="url(#pm-top-facet)" stroke="#3A3A42" strokeWidth="0.8" />
    <polygon points="15,22 32,32 32,52 15,42" fill="#161619" stroke="#303036" strokeWidth="0.8" />
    <polygon points="49,22 49,42 32,52 32,32" fill="#1D1D22" stroke="#303036" strokeWidth="0.8" />

    <g stroke="#787882" strokeWidth="1" strokeDasharray="1.5 1.5">
      <line x1="32" y1="12" x2="32" y2="19" />
      <line x1="15" y1="22" x2="21" y2="19" />
      <line x1="49" y1="22" x2="41" y2="25" />
      <line x1="15" y1="42" x2="21" y2="44" />
      <line x1="49" y1="42" x2="43" y2="44" />
      <line x1="32" y1="41" x2="32" y2="52" />
    </g>

    <path d="M 21 44 L 21 32 L 32 41 L 43 32 L 43 44" stroke="#DCDCE0" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M 21 44 L 21 19 L 35 19 L 41 25 L 35 32 L 21 32" stroke="url(#pm-p-glow)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />

    <circle cx="21" cy="19" r="2.2" fill="#FFFFFF" />
    <circle cx="35" cy="19" r="1.8" fill="#ECECEC" />
    <circle cx="41" cy="25" r="2.2" fill="#FFFFFF" />
    <circle cx="21" cy="32" r="2.6" fill="#FFFFFF" />
    <circle cx="43" cy="32" r="2.4" fill="#ECECEC" />
    <circle cx="32" cy="41" r="2.6" fill="#FFFFFF" />
    <circle cx="21" cy="44" r="2" fill="#B7B7B7" />
    <circle cx="43" cy="44" r="2" fill="#B7B7B7" />
    <circle cx="32" cy="12" r="1.6" fill="#999999" />
    <circle cx="32" cy="52" r="1.6" fill="#999999" />
  </svg>
);

export const PhantomLogoLockup: React.FC<{ size?: number; className?: string }> = ({ size = 28, className = "" }) => (
  <div className={`brand-lockup ${className}`} style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
    <PhantomLogoMark size={size} />
    <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.15 }}>
      <span className="brand-wordmark">PHANTOMMESH</span>
      <span className="mono" style={{ fontSize: 9, letterSpacing: "0.14em", color: "var(--text-muted)", marginTop: 2 }}>
        P2P MESH // FTS5
      </span>
    </div>
  </div>
);

export const PhantomCard: React.FC<{
  variant?: "card" | "main" | "dashed";
  interactive?: boolean;
  className?: string;
  style?: React.CSSProperties;
  onClick?: () => void;
  children: React.ReactNode;
}> = ({ variant = "card", interactive = false, className = "", style, onClick, children }) => {
  const base =
    variant === "main"
      ? "phantom-card-main"
      : variant === "dashed"
      ? "phantom-dashed-card"
      : "phantom-card";
  const cls = `${base} ${interactive ? "phantom-card-interactive" : ""} ${className}`.trim();

  if (onClick) {
    return (
      <div
        role="button"
        tabIndex={0}
        className={cls}
        style={style}
        onClick={onClick}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onClick();
          }
        }}
      >
        {children}
      </div>
    );
  }
  return (
    <div className={cls} style={style}>
      {children}
    </div>
  );
};

export const EditorialHeading: React.FC<{
  as?: "h1" | "h2" | "h3";
  size?: "xl" | "lg" | "md" | "sm";
  children: React.ReactNode;
  style?: React.CSSProperties;
}> = ({ as = "h1", size = "lg", children, style }) => {
  const Tag = as;
  return (
    <Tag className={`editorial-heading editorial-${size}`} style={style}>
      {children}
    </Tag>
  );
};

export const KbdBadge: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <kbd className="kbd">{children}</kbd>
);

export const StatusIndicator: React.FC<{
  state: "online" | "offline" | "warn" | "error";
  label: string;
}> = ({ state, label }) => (
  <span className="status-pill">
    <span className={`status-dot ${state}`} />
    <span>{label}</span>
  </span>
);

export const SegmentedProgress: React.FC<{ percent: number; label?: string }> = ({
  percent,
  label,
}) => {
  const clamped = Math.max(0, Math.min(100, percent));
  const filledCount = Math.round((clamped / 100) * 20);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div className="segmented-bar" role="progressbar" aria-valuenow={clamped} aria-valuemin={0} aria-valuemax={100}>
        {Array.from({ length: 20 }).map((_, idx) => (
          <div key={idx} className={`segmented-bar-cell ${idx < filledCount ? "filled" : ""}`} />
        ))}
      </div>
      {label && (
        <div
          className="mono tabular muted"
          style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}
        >
          <span>{label}</span>
          <span>{clamped}%</span>
        </div>
      )}
    </div>
  );
};

export const SourceIcon: React.FC<{
  source: ResultSource | "folder" | "device_mac" | "device_win" | "device_linux";
  kind?: string;
  size?: number;
}> = ({ source, kind = "", size = 15 }) => {
  const props = { size, strokeWidth: 1.75 };
  if (source === "folder") return <Folder {...props} />;
  if (source === "device_mac") return <Laptop {...props} />;
  if (source === "device_win" || source === "device_linux") return <Monitor {...props} />;
  if (source === "github") return <GitBranch {...props} />;
  if (source === "stack_overflow") return <MessageSquareCode {...props} />;
  if (source === "docs") return <BookOpen {...props} />;
  if (source === "remote_device") return <HardDrive {...props} />;
  if (source === "command") return <Terminal {...props} />;

  const k = kind.toLowerCase();
  if (["json", "toml", "yaml", "yml"].includes(k)) return <FileJson {...props} />;
  if (["rs", "ts", "tsx", "js", "jsx", "py", "go", "c", "cpp", "java", "sh", "sql"].includes(k)) {
    return <FileCode2 {...props} />;
  }
  if (["html", "css", "scss", "vue", "svelte"].includes(k)) return <Code2 {...props} />;
  if (k === "web") return <Globe {...props} />;
  return <FileText {...props} />;
};

export const EmptyState: React.FC<{
  title: string;
  description: string;
  action?: React.ReactNode;
}> = ({ title, description, action }) => (
  <div
    style={{
      padding: "28px 18px",
      textAlign: "center",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: 8,
    }}
  >
    <div className="editorial-heading editorial-sm" style={{ color: "var(--text-primary)" }}>
      {title}
    </div>
    <p className="muted" style={{ margin: 0, maxWidth: 380, fontSize: 12.5 }}>
      {description}
    </p>
    {action && <div style={{ marginTop: 8 }}>{action}</div>}
  </div>
);

export const ConfirmDialog: React.FC<{
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}> = ({ open, title, description, confirmLabel, destructive = false, onConfirm, onCancel }) => {
  if (!open) return null;
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div
        className="modal-panel phantom-card-main"
        style={{ maxWidth: 440, padding: 22 }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="editorial-heading editorial-md" style={{ marginBottom: 8 }}>
          {title}
        </div>
        <p className="secondary" style={{ margin: "0 0 20px", fontSize: 13 }}>
          {description}
        </p>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button className="btn" onClick={onCancel}>
            Cancel
          </button>
          <button
            className={`btn ${destructive ? "btn-danger" : "btn-primary"}`}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

export const ToastStack: React.FC<{
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}> = ({ toasts, onDismiss }) => {
  if (toasts.length === 0) return null;
  return (
    <div className="toast-stack" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className="toast-item">
          <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
            <span
              className={`status-dot ${
                t.kind === "error" ? "error" : t.kind === "success" ? "online" : "warn"
              }`}
              style={{ marginTop: 5 }}
            />
            <div>
              <div style={{ fontWeight: 500, color: "var(--text-primary)" }}>{t.title}</div>
              {t.detail && (
                <div className="muted mono" style={{ fontSize: 11, marginTop: 2 }}>
                  {t.detail}
                </div>
              )}
            </div>
          </div>
          <button
            className="btn btn-ghost btn-sm"
            style={{ padding: 2 }}
            onClick={() => onDismiss(t.id)}
            aria-label="Dismiss notification"
          >
            <X size={13} />
          </button>
        </div>
      ))}
    </div>
  );
};

export const ToggleSwitch: React.FC<{
  checked: boolean;
  onChange: (next: boolean) => void;
  ariaLabel: string;
}> = ({ checked, onChange, ariaLabel }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={ariaLabel}
    className={`toggle-switch ${checked ? "on" : ""}`}
    onClick={() => onChange(!checked)}
  />
);
