import { useCallback, useEffect, useRef, useState } from "react";
import type { PeerClient } from "../webrtc/client";
import {
  attachDesktopInput,
  attachHiddenKeyboard,
  attachTouchTrackpad,
  isTouchPrimary,
  type InputEvent,
} from "../webrtc/input";
import { SessionToolbar } from "./SessionToolbar";

type Props = { client: PeerClient; onExit: () => void };

/**
 * Full-screen remote-desktop viewport.
 *
 * - Desktop: mouse + physical keyboard captured on the whole window.
 * - Mobile: whole screen becomes a trackpad; toolbar exposes modifiers +
 *   opens the OS keyboard via a hidden textarea.
 */
export function SessionView({ client, onExit }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const inputChannelRef = useRef<RTCDataChannel | null>(null);
  const keyboardHandleRef = useRef<ReturnType<typeof attachHiddenKeyboard> | null>(null);

  const [state, setState] = useState<string>("connecting");
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const [isTouch] = useState<boolean>(() => isTouchPrimary());

  // Stable "send" function that writes to the DataChannel when ready.
  const send = useCallback((msg: InputEvent) => {
    const ch = inputChannelRef.current;
    if (ch && ch.readyState === "open") {
      ch.send(JSON.stringify(msg));
    }
  }, []);

  // Wire the WebRTC events. This effect deliberately does NOT own the client's
  // lifetime: re-running it is harmless because `PeerClient.on` just overwrites
  // the handler slot, whereas closing the client in its cleanup would tear down
  // a live session every time the parent re-renders with a new `onExit`.
  useEffect(() => {
    const offs = [
      client.on("onTrack", (stream) => {
        const v = videoRef.current;
        if (v) v.srcObject = stream;
      }),
      client.on("onDataChannel", (label, channel) => {
        if (label === "input") inputChannelRef.current = channel;
      }),
      client.on("onStateChange", (s) => setState(s)),
      client.on("onClose", () => onExit()),
    ];
    // `on` appends rather than replaces, so this cleanup is what keeps a
    // re-run from stacking duplicate handlers.
    return () => offs.forEach((off) => off());
  }, [client, onExit]);

  // The client lives exactly as long as this component is mounted — nothing else.
  useEffect(() => () => client.close(), [client]);

  // Attach the appropriate input handler once we have the container.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    if (isTouch) {
      const detachTouch = attachTouchTrackpad(container, send);
      const kb = attachHiddenKeyboard(container, send);
      keyboardHandleRef.current = kb;
      return () => {
        detachTouch();
        kb.dispose();
      };
    } else {
      return attachDesktopInput(container, send);
    }
  }, [isTouch, send]);

  // Ctrl+Esc exits session (desktop).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && e.ctrlKey) {
        e.preventDefault();
        onExit();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onExit]);

  const toggleKeyboard = () => {
    const kb = keyboardHandleRef.current;
    if (!kb) return;
    if (keyboardOpen) {
      kb.blur();
      setKeyboardOpen(false);
    } else {
      kb.focus();
      setKeyboardOpen(true);
    }
  };

  return (
    <div
      ref={containerRef}
      style={{
        position: "fixed",
        inset: 0,
        background: "black",
        overflow: "hidden",
        touchAction: "none",
      }}
    >
      <video
        ref={videoRef}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "contain",
          pointerEvents: "none",
        }}
        autoPlay
        playsInline
        muted={false}
      />

      {state !== "connected" && state !== "completed" && (
        <div style={statusBadge}>
          {state} {isTouch ? "" : "(ctrl+esc to exit)"}
        </div>
      )}

      {isTouch && (
        <SessionToolbar
          send={send}
          keyboardOpen={keyboardOpen}
          onToggleKeyboard={toggleKeyboard}
          onExit={onExit}
        />
      )}
    </div>
  );
}

const statusBadge: React.CSSProperties = {
  position: "fixed",
  top: "env(safe-area-inset-top, 8px)",
  left: 8,
  padding: "4px 8px",
  background: "rgba(0,0,0,0.6)",
  color: "#fff",
  borderRadius: 4,
  fontSize: 12,
  fontFamily: "ui-monospace, monospace",
  zIndex: 20,
  pointerEvents: "none",
};
