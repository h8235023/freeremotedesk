import { StrictMode, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { invoke } from "@tauri-apps/api/core";
import { getVersion } from "@tauri-apps/api/app";
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";
import { HostPeer } from "./webrtc/host";
import { SetupWizard } from "./SetupWizard";
import { applyDocumentLang, getLang, setLang, t, useI18n } from "./i18n";
import { LanguageSwitch } from "./i18n/LanguageSwitch";
import { rich } from "./i18n/rich";
import type { MessageKey } from "./i18n/en";
import type { InputEvent } from "./protocol";
import type { TransferDone, TransferProgress } from "./webrtc/files";
import type { AgentConfig, TrustedClientSummary } from "./types";

type UiState =
  | { kind: "loading" }
  | { kind: "setup"; current: AgentConfig }
  | { kind: "idle"; config: AgentConfig; trusted: TrustedClientSummary[] }
  | { kind: "listening"; config: AgentConfig; trusted: TrustedClientSummary[]; pairCode: string | null; sessionState: string | null }
  | { kind: "incoming"; config: AgentConfig; trusted: TrustedClientSummary[]; clientId: string; clientName: string }
  | { kind: "error"; config: AgentConfig | null; message: string };

/**
 * File-transfer status for the window. Deliberately NOT part of `UiState` —
 * threading it through the union would mean touching every place that builds a
 * listening state, for a value that is purely presentational.
 */
type TransferStatus =
  | { kind: "progress"; direction: "in" | "out"; name: string; done: number; total: number }
  | { kind: "done"; direction: "in" | "out"; name: string; path?: string }
  | { kind: "error"; reason: string };

/**
 * Wire reason codes → message keys. A map rather than a template string so a
 * typo is a typecheck failure instead of a raw code shown to the user.
 */
const TRANSFER_REASON_KEY: Record<string, MessageKey> = {
  too_large: "file.reason.too_large",
  busy: "file.reason.busy",
  io: "file.reason.io",
  cancelled: "file.reason.cancelled",
  interrupted: "file.reason.interrupted",
  incomplete: "file.reason.incomplete",
  unsupported: "file.reason.unsupported",
  protocol: "file.reason.protocol",
};

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v < 10 ? v.toFixed(1) : Math.round(v)} ${units[i]}`;
}

function App() {
  useI18n(); // re-render on language change
  const [state, setState] = useState<UiState>({ kind: "loading" });
  const [transfer, setTransfer] = useState<TransferStatus | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const persistentPeerRef = useRef<HostPeer | null>(null);
  const pairPeerRef = useRef<HostPeer | null>(null);

  /** The peer a file-transfer action should target: whichever is live. */
  function activePeer(): HostPeer | null {
    const pair = pairPeerRef.current;
    if (pair?.filesReady()) return pair;
    const persistent = persistentPeerRef.current;
    if (persistent?.filesReady()) return persistent;
    return pair ?? persistent;
  }
  const hostName = t("agent.hostName");

  useEffect(() => {
    document.title = "FreeRemoteDesk Agent";
    applyDocumentLang();
    void bootstrap();
    // Request notification permission opportunistically.
    void ensureNotificationPermission();
    return () => {
      persistentPeerRef.current?.close();
      pairPeerRef.current?.close();
    };
  }, []);

  async function ensureNotificationPermission() {
    try {
      const granted = await isPermissionGranted();
      if (!granted) await requestPermission();
    } catch { /* ignore — notifications are best-effort */ }
  }

  async function bootstrap() {
    try {
      const config = await invoke<AgentConfig>("get_config");
      // The Rust config is the source of truth for language — it's what the tray
      // menu was built from. Adopt it so the two halves of the app agree.
      if (config.language === "zh-CN" || config.language === "en") {
        setLang(config.language);
      } else {
        // First run: persist the locale-detected language so the tray menu
        // agrees with the UI from the next launch on.
        invoke("set_language", { language: getLang() }).catch(() => {});
      }
      if (!config.signaling_url) {
        setState({ kind: "setup", current: config });
        return;
      }
      const trusted = await invoke<TrustedClientSummary[]>("list_trusted_clients");

      // Auto-listen if we have any trusted clients — user doesn't need to click.
      // We open the WS but do NOT capture the screen yet; capture happens on
      // acceptIncoming() (a user click) when a client tries to connect.
      if (trusted.length > 0) {
        await autoStartListening(config, trusted);
        return;
      }
      setState({ kind: "idle", config, trusted });
    } catch (err) {
      setState({
        kind: "error",
        config: null,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  async function refreshTrusted(): Promise<TrustedClientSummary[]> {
    try { return await invoke<TrustedClientSummary[]>("list_trusted_clients"); }
    catch { return []; }
  }

  /** Open the persistent WS without capturing screen — auto-called on boot. */
  async function autoStartListening(
    config: AgentConfig,
    trusted: TrustedClientSummary[],
  ) {
    try {
      const persistent = wireHostPeerHandlers(
        new HostPeer({
          code: `host-${config.agent_id}`,
          signalingUrl: config.signaling_url!,
          mode: "persistent",
          hostId: config.agent_id,
          hostName,
        }),
        config,
        trusted,
      );
      persistentPeerRef.current = persistent;
      await persistent.connect();

      setState({
        kind: "listening",
        config,
        trusted,
        pairCode: null,
        sessionState: null,
      });
    } catch (err) {
      // If signaling URL is unreachable, fall back to idle.
      setState({
        kind: "idle",
        config,
        trusted,
      });
      console.warn("auto-listen failed:", err);
    }
  }

  /**
   * Shared file-transfer wiring. The window is usually hidden and only 480×640,
   * so the OS notification is the primary UX here — the status line is for when
   * someone happens to be looking at it.
   */
  function wireFileHandlers(peer: HostPeer) {
    peer.onFiles({
      onOpen: () => setTransfer(null),
      onIncoming: (name, size) =>
        setTransfer({ kind: "progress", direction: "in", name, done: 0, total: size }),
      onProgress: (p: TransferProgress) =>
        setTransfer({
          kind: "progress",
          direction: p.direction,
          name: p.name,
          done: p.done,
          total: p.total,
        }),
      onDone: (d: TransferDone) => {
        setTransfer({ kind: "done", direction: d.direction, name: d.name, path: d.path });
        const body = t(
          d.direction === "in" ? "file.notification.saved" : "file.notification.sent",
          { name: d.name },
        );
        try {
          sendNotification({ title: "FreeRemoteDesk", body });
        } catch { /* notifications are best-effort */ }
      },
      onError: (reason: string) => setTransfer({ kind: "error", reason }),
    });
  }

  function wireHostPeerHandlers(
    peer: HostPeer,
    config: AgentConfig,
    trusted: TrustedClientSummary[],
  ): HostPeer {
    peer.on("onInput", onRemoteInput);
    wireFileHandlers(peer);

    peer.on("onStateChange", (s) =>
      setState((prev) =>
        prev.kind === "listening" ? { ...prev, sessionState: s } : prev,
      ),
    );

    peer.on("onSessionEnded", async () => {
      const fresh = await refreshTrusted();
      setState((prev) =>
        prev.kind === "listening" || prev.kind === "incoming"
          ? { kind: "listening", config, trusted: fresh, pairCode: null, sessionState: null }
          : prev,
      );
    });

    peer.on("onIncomingAuth", async (clientId) => {
      const fresh = await refreshTrusted();
      const client = fresh.find((c) => c.client_id === clientId);
      const clientName = client?.name ?? t("agent.trustedDevice");

      // Fire OS notification + focus window.
      try {
        await sendNotification({
          title: "FreeRemoteDesk",
          body: t("agent.notification.body", { name: clientName }),
        });
      } catch { /* best effort */ }
      try { await invoke("focus_window"); } catch { /* best effort */ }

      setState({ kind: "incoming", config, trusted: fresh, clientId, clientName });
    });

    peer.on("onError", (err) =>
      setState({ kind: "error", config, message: err.message }),
    );

    peer.on("onClose", (reason) => {
      persistentPeerRef.current = null;
      setState({ kind: "idle", config, trusted });
      if (reason) console.log("persistent host closed:", reason);
    });

    return peer;
  }

  /** User-gesture handler: called when user clicks "Start listening" on the
   *  idle screen. Captures the screen up-front for the case where they want
   *  to start listening BEFORE any trusted client exists yet. */
  async function manuallyStartListening(config: AgentConfig) {
    try {
      const persistent = wireHostPeerHandlers(
        new HostPeer({
          code: `host-${config.agent_id}`,
          signalingUrl: config.signaling_url!,
          mode: "persistent",
          hostId: config.agent_id,
          hostName,
        }),
        config,
        [],
      );
      persistentPeerRef.current = persistent;
      await persistent.captureScreen();
      await persistent.connect();
      const trusted = await refreshTrusted();
      setState({
        kind: "listening",
        config,
        trusted,
        pairCode: null,
        sessionState: null,
      });
    } catch (err) {
      setState({
        kind: "error",
        config,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  /** User clicks Accept on the incoming-auth prompt. */
  async function acceptIncoming() {
    const peer = persistentPeerRef.current;
    if (!peer) return;
    try {
      await peer.acceptIncoming();     // captureScreen + auth.ok + WebRTC
      setState((prev) =>
        prev.kind === "incoming"
          ? { kind: "listening", config: prev.config, trusted: prev.trusted, pairCode: null, sessionState: "connecting" }
          : prev,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // If user cancelled the screen picker, go back to listening.
      if (msg.includes("Permission denied") || msg.includes("NotAllowed")) {
        peer.rejectIncoming("user cancelled screen selection");
        setState((prev) =>
          prev.kind === "incoming"
            ? { kind: "listening", config: prev.config, trusted: prev.trusted, pairCode: null, sessionState: null }
            : prev,
        );
        return;
      }
      setState((prev) => ({
        kind: "error",
        config: prev.kind !== "loading" && "config" in prev && prev.config ? prev.config : null,
        message: msg,
      }));
    }
  }

  function declineIncoming() {
    const peer = persistentPeerRef.current;
    if (!peer) return;
    peer.rejectIncoming("declined by user");
    setState((prev) =>
      prev.kind === "incoming"
        ? { kind: "listening", config: prev.config, trusted: prev.trusted, pairCode: null, sessionState: null }
        : prev,
    );
  }

  async function startPairCode(config: AgentConfig) {
    try {
      const code = await invoke<string>("request_pairing_code");
      const pair = new HostPeer({
        code,
        signalingUrl: config.signaling_url!,
        mode: "pair",
        hostId: config.agent_id,
        hostName,
      });
      pairPeerRef.current = pair;

      // If persistent peer already captured, reuse. Otherwise capture now.
      const persistent = persistentPeerRef.current;
      if (persistent) {
        // TypeScript is unhappy about private access; use bracket notation for hack.
        const persistentStream = (persistent as unknown as { stream: MediaStream | null }).stream;
        if (persistentStream) {
          // Share the same stream instance.
          (pair as unknown as { stream: MediaStream }).stream = persistentStream;
        } else {
          await pair.captureScreen();
        }
      } else {
        await pair.captureScreen();
      }
      await pair.connect();

      pair.on("onInput", onRemoteInput);
      wireFileHandlers(pair);
      // Pair mode used to skip this, so `sessionState` stayed empty for the
      // whole pairing and the window showed no connection progress at all.
      pair.on("onStateChange", (s) =>
        setState((prev) =>
          prev.kind === "listening" ? { ...prev, sessionState: s } : prev,
        ),
      );
      // The host persists the new trusted client during pair.save; surface it in
      // the list right away instead of waiting for the pair session to close.
      pair.on("onTrustedClientAdded", async () => {
        const trusted = await refreshTrusted();
        setState((prev) =>
          prev.kind === "listening" ? { ...prev, trusted } : prev,
        );
      });
      pair.on("onClose", async () => {
        pairPeerRef.current = null;
        const trusted = await refreshTrusted();
        setState((prev) =>
          prev.kind === "listening"
            ? { ...prev, pairCode: null, sessionState: null, trusted }
            : prev,
        );
      });
      pair.on("onError", (err) =>
        setState({ kind: "error", config, message: err.message }),
      );

      setState((prev) =>
        prev.kind === "listening" ? { ...prev, pairCode: code } : prev,
      );
    } catch (err) {
      setState({
        kind: "error",
        config,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  async function revoke(clientId: string) {
    await invoke("revoke_trusted_client", { clientId });
    const trusted = await refreshTrusted();
    setState((prev) =>
      prev.kind === "listening" ? { ...prev, trusted } : prev,
    );
  }

  function openSettings() {
    const currentConfig =
      "config" in state && state.config
        ? state.config
        : {
            signaling_url: null,
            pwa_url: null,
            agent_id: "",
            pairing_code_len: null,
            language: null,
            max_transfer_bytes: null,
            trusted_clients: {},
          };
    persistentPeerRef.current?.close();
    pairPeerRef.current?.close();
    setState({ kind: "setup", current: currentConfig });
  }

  function stopEverything(config: AgentConfig) {
    persistentPeerRef.current?.close();
    pairPeerRef.current?.close();
    persistentPeerRef.current = null;
    pairPeerRef.current = null;
    setState({ kind: "idle", config, trusted: [] });
  }

  // ---------- Render ----------

  if (state.kind === "loading") {
    return <Layout><div style={{ opacity: 0.5 }}>{t("agent.loading")}</div></Layout>;
  }

  if (state.kind === "setup") {
    return (
      <Layout>
        <SetupWizard current={state.current} onSaved={() => bootstrap()} />
      </Layout>
    );
  }

  if (state.kind === "error") {
    return (
      <Layout>
        <h1 style={{ margin: 0 }}>FreeRemoteDesk</h1>
        <div style={{ color: "#ef4444", maxWidth: 380, textAlign: "center" }}>
          <div style={{ marginBottom: "0.4rem" }}>{t("agent.error.title")}</div>
          {/* Raw diagnostic text — deliberately untranslated; some of it comes
              from the browser (e.g. "Permission denied") and is matched on. */}
          <div style={{ opacity: 0.7, fontSize: "0.85rem" }}>{state.message}</div>
        </div>
        <button onClick={bootstrap}>{t("agent.reload")}</button>
      </Layout>
    );
  }

  if (state.kind === "incoming") {
    return (
      <Layout>
        <h1 style={{ margin: 0 }}>FreeRemoteDesk</h1>
        <div style={styles.incomingCard}>
          <div style={styles.incomingTitle}>{t("agent.incoming.title")}</div>
          <div style={styles.incomingSub}>
            {rich(t("agent.incoming.body", { name: state.clientName }))}
          </div>
          <div style={styles.incomingSub}>{t("agent.incoming.hint")}</div>
          <div style={{ display: "flex", gap: "0.6rem", marginTop: "0.4rem" }}>
            <button onClick={acceptIncoming} style={styles.primary}>{t("agent.action.accept")}</button>
            <button onClick={declineIncoming}>{t("agent.action.decline")}</button>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <h1 style={{ margin: 0 }}>FreeRemoteDesk</h1>

      {state.kind === "idle" && (
        <>
          <button onClick={() => manuallyStartListening(state.config)} style={styles.primary}>
            {t("agent.idle.start")}
          </button>
          <div style={styles.hint}>{t("agent.idle.hint")}</div>
        </>
      )}

      {state.kind === "listening" && (
        <>
          <div style={styles.statusRow}>
            <div style={styles.dot} />
            <span>
              {state.sessionState
                ? t("agent.status.session", { state: state.sessionState })
                : t(
                    state.trusted.length === 1
                      ? "agent.status.listening.one"
                      : "agent.status.listening.many",
                    { n: state.trusted.length },
                  )}
            </span>
          </div>

          {state.trusted.length > 0 && (
            <div style={styles.list}>
              <div style={styles.listTitle}>{t("agent.trusted.title")}</div>
              {state.trusted.map((tc) => (
                <div key={tc.client_id} style={styles.listRow}>
                  <span>{tc.name}</span>
                  <button style={styles.linkBtn} onClick={() => revoke(tc.client_id)}>
                    {t("agent.action.revoke")}
                  </button>
                </div>
              ))}
            </div>
          )}

          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            {state.pairCode ? (
              <CodeDisplay code={state.pairCode} />
            ) : (
              <button onClick={() => startPairCode(state.config)}>
                {t("agent.action.addDevice")}
              </button>
            )}
          </div>

          {state.config.pwa_url && (
            <div style={{ ...styles.hint, opacity: 0.5 }}>
              PWA: {state.config.pwa_url}
            </div>
          )}

          <input
            ref={fileInputRef}
            type="file"
            style={{ display: "none" }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              // Clear first so picking the same file twice still fires onChange.
              e.target.value = "";
              if (!file) return;
              const peer = activePeer();
              if (!peer?.filesReady()) {
                setTransfer({ kind: "error", reason: "protocol" });
                return;
              }
              // onFiles.onError surfaces any failure; no need to double-report.
              void peer.sendFile(file).catch(() => {});
            }}
          />
          {(() => {
            const canSend = Boolean(
              pairPeerRef.current?.filesReady() || persistentPeerRef.current?.filesReady(),
            );
            return (
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={!canSend}
                style={{ ...styles.linkBtn, ...(canSend ? null : styles.disabledBtn) }}
              >
                {t("file.action.send")}
              </button>
            );
          })()}

          {transfer && (
            <div
              style={{
                ...styles.hint,
                color: transfer.kind === "error" ? "#fca5a5" : undefined,
              }}
            >
              {transfer.kind === "progress" &&
                rich(
                  t(
                    transfer.direction === "in"
                      ? "file.status.receiving"
                      : "file.status.sending",
                    {
                      name: transfer.name,
                      done: formatBytes(transfer.done),
                      total: formatBytes(transfer.total),
                    },
                  ),
                )}
              {transfer.kind === "done" &&
                rich(
                  transfer.direction === "in"
                    ? t("file.status.saved", {
                        name: transfer.name,
                        folder: transfer.path ?? "",
                      })
                    : t("file.status.sent", { name: transfer.name }),
                )}
              {transfer.kind === "error" &&
                t("file.status.failed", {
                  reason: t(TRANSFER_REASON_KEY[transfer.reason] ?? "file.reason.io"),
                })}
            </div>
          )}

          <button onClick={() => stopEverything(state.config)} style={styles.linkBtn}>
            {t("agent.action.stopListening")}
          </button>
        </>
      )}

      <button onClick={openSettings} style={{ ...styles.linkBtn, marginTop: "0.5rem" }}>
        {t("agent.action.settings")}
      </button>

      <LanguageSwitch
        style={{ marginTop: "0.25rem" }}
        onChange={(next) => {
          invoke("set_language", { language: next }).catch(() => {});
        }}
      />

      <AboutBlock />
    </Layout>
  );
}

const UPSTREAM_URL = "https://github.com/Teylersf/freeremotedesk";
const FORK_URL = "https://github.com/h8235023/freeremotedesk";

/**
 * Version + attribution.
 *
 * The version comes from `getVersion()`, which reads the running bundle rather
 * than anything baked into the UI — so it always reports what is actually
 * installed, even when the app was updated without this file being touched.
 */
function AboutBlock() {
  useI18n();
  const [version, setVersion] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    getVersion()
      .then(setVersion)
      .catch(() => setVersion(null));
  }, []);

  return (
    <div style={styles.about}>
      <button style={styles.linkBtn} onClick={() => setOpen((v) => !v)}>
        {t("about.show")}
      </button>

      {open && (
        <div style={styles.aboutBody}>
          <div style={styles.aboutVersion}>
            {version
              ? t("about.version", { version })
              : t("about.versionUnknown")}
          </div>
          <div>{rich(t("about.fork", { upstream: UPSTREAM_URL }))}</div>
          <div>{t("about.ai")}</div>
          <div>{t("about.license")}</div>
          <div style={styles.aboutLinks}>
            <a href={UPSTREAM_URL} target="_blank" rel="noreferrer" style={styles.aboutLink}>
              {t("about.upstream")}
            </a>
            <a href={FORK_URL} target="_blank" rel="noreferrer" style={styles.aboutLink}>
              {t("about.thisFork")}
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontFamily: "system-ui, sans-serif",
        background: "#0a0a0a",
        color: "#f5f5f5",
        minHeight: "100vh",
        padding: "2rem",
        display: "flex",
        flexDirection: "column",
        gap: "1.2rem",
        alignItems: "center",
        justifyContent: "flex-start",
      }}
    >
      {children}
    </div>
  );
}

function CodeDisplay({ code }: { code: string }) {
  return (
    <div
      style={{
        fontFamily: "ui-monospace, monospace",
        fontSize: "2.4rem",
        letterSpacing: "0.3em",
        background: "#171717",
        padding: "0.8rem 1.6rem",
        borderRadius: 8,
        border: "1px solid #2a2a2a",
        userSelect: "all",
      }}
    >
      {code}
    </div>
  );
}

function onRemoteInput(evt: InputEvent) {
  invoke("inject_input", { event: evt }).catch((e) => {
    console.warn("inject_input failed", e);
  });
}

const styles: Record<string, React.CSSProperties> = {
  primary: {
    background: "#4ade80",
    color: "#000",
    border: 0,
    padding: "0.9rem 1.8rem",
    borderRadius: 6,
    fontSize: "1rem",
    fontWeight: 600,
    cursor: "pointer",
  },
  hint: { opacity: 0.6, fontSize: "0.9rem", textAlign: "center" },
  statusRow: {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
    background: "#171717",
    border: "1px solid #2a2a2a",
    padding: "0.5rem 0.9rem",
    borderRadius: 6,
    fontSize: "0.9rem",
  },
  dot: {
    width: 8, height: 8, borderRadius: "50%",
    background: "#4ade80", boxShadow: "0 0 8px #4ade80",
  },
  list: {
    display: "flex", flexDirection: "column", gap: "0.4rem",
    width: "100%", maxWidth: 360,
    background: "#171717", border: "1px solid #2a2a2a",
    borderRadius: 6, padding: "0.6rem",
  },
  listTitle: { opacity: 0.5, fontSize: "0.75rem", textTransform: "uppercase" },
  listRow: {
    display: "flex", justifyContent: "space-between", alignItems: "center",
    padding: "0.3rem 0",
  },
  about: {
    marginTop: "0.75rem",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "0.4rem",
    maxWidth: "100%",
  },
  aboutBody: {
    display: "flex",
    flexDirection: "column",
    gap: "0.45rem",
    fontSize: "0.72rem",
    lineHeight: 1.5,
    opacity: 0.65,
    textAlign: "center",
    borderTop: "1px solid #2a2a2a",
    paddingTop: "0.6rem",
  },
  aboutVersion: {
    fontFamily: "ui-monospace, monospace",
    opacity: 0.9,
  },
  aboutLinks: { display: "flex", gap: "0.9rem", justifyContent: "center" },
  aboutLink: { color: "#4ade80", textDecoration: "none" },
  disabledBtn: {
    opacity: 0.45,
    cursor: "not-allowed",
  },
  linkBtn: {
    background: "transparent", border: 0, color: "#888",
    cursor: "pointer", fontSize: "0.85rem", textDecoration: "underline",
    padding: 0,
  },
  incomingCard: {
    display: "flex", flexDirection: "column", gap: "0.7rem",
    background: "#171717", border: "1px solid #4ade80",
    borderRadius: 10, padding: "1.4rem",
    maxWidth: 400, width: "100%",
    boxShadow: "0 0 24px rgba(74, 222, 128, 0.35)",
  },
  incomingTitle: {
    color: "#4ade80", fontSize: "0.75rem",
    textTransform: "uppercase", letterSpacing: "0.05em",
  },
  incomingSub: { fontSize: "0.95rem", lineHeight: 1.5, opacity: 0.85 },
};

const root = document.getElementById("root");
if (!root) throw new Error("#root missing");
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
