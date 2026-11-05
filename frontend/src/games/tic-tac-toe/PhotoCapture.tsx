import { useEffect, useRef, useState, type PointerEvent } from "react";
import { usePhoto } from "../../store/photo";

const VIEW = 220; // crop preview size (px)
const OUT = 128; // uploaded size (px)

interface Props {
  open: boolean;
  onClose: () => void;
}

/**
 * Take or upload a photo, crop it to a circle, and save it as your private
 * Tic-Tac-Toe face. Cropping and shrinking happen in the browser, so the
 * original full-size picture never leaves your device.
 */
export default function PhotoCapture({ open, onClose }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const img = useRef<HTMLImageElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const drag = useRef<{ x: number; y: number } | null>(null);
  const current = usePhoto((s) => s.url);
  const save = usePhoto((s) => s.save);
  const remove = usePhoto((s) => s.remove);
  const [mode, setMode] = useState<"upload" | "camera">("upload");
  const [src, setSrc] = useState<string | null>(null);
  const [natural, setNatural] = useState({ w: 1, h: 1 });
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function stopCamera() {
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
  }

  function reset() {
    stopCamera();
    if (src) URL.revokeObjectURL(src);
    setSrc(null);
    setZoom(1);
    setOffset({ x: 0, y: 0 });
    setError(null);
    setMode("upload");
  }

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
    if (!open) reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => () => stopCamera(), []);

  async function startCamera() {
    setError(null);
    setMode("camera");
    setSrc(null);
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: 640, height: 640 } });
      stream.current = s;
      if (video.current) video.current.srcObject = s;
    } catch {
      setError("Camera not available. Allow camera access, or upload a picture instead.");
      setMode("upload");
    }
  }

  function snap() {
    const v = video.current;
    if (!v || !v.videoWidth) return;
    const c = document.createElement("canvas");
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    const ctx = c.getContext("2d")!;
    // Mirror like a selfie so it matches the live preview.
    ctx.translate(c.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(v, 0, 0);
    stopCamera();
    c.toBlob((b) => {
      if (b) choose(b);
    }, "image/jpeg", 0.92);
  }

  function choose(file: Blob) {
    if (!file.type.startsWith("image/")) {
      setError("Please choose an image file.");
      return;
    }
    if (src) URL.revokeObjectURL(src);
    setSrc(URL.createObjectURL(file));
    setZoom(1);
    setOffset({ x: 0, y: 0 });
    setError(null);
    setMode("upload");
  }

  // "Cover" scale: the short side fills the circle at zoom 1.
  const scale = (VIEW / Math.min(natural.w, natural.h)) * zoom;
  const dispW = natural.w * scale;
  const dispH = natural.h * scale;
  const clamp = (o: { x: number; y: number }) => ({
    x: Math.max(-(dispW - VIEW) / 2, Math.min((dispW - VIEW) / 2, o.x)),
    y: Math.max(-(dispH - VIEW) / 2, Math.min((dispH - VIEW) / 2, o.y)),
  });

  function onDown(e: PointerEvent) {
    drag.current = { x: e.clientX - offset.x, y: e.clientY - offset.y };
    (e.target as Element).setPointerCapture(e.pointerId);
  }
  function onMove(e: PointerEvent) {
    if (drag.current) setOffset(clamp({ x: e.clientX - drag.current.x, y: e.clientY - drag.current.y }));
  }

  async function confirm() {
    const image = img.current;
    if (!image) return;
    setBusy(true);
    setError(null);
    try {
      const c = document.createElement("canvas");
      c.width = OUT;
      c.height = OUT;
      const ctx = c.getContext("2d")!;
      const r = OUT / VIEW;
      const left = (VIEW / 2 + offset.x - dispW / 2) * r;
      const top = (VIEW / 2 + offset.y - dispH / 2) * r;
      ctx.drawImage(image, left, top, dispW * r, dispH * r);
      const blob = await new Promise<Blob | null>((res) => c.toBlob(res, "image/jpeg", 0.85));
      if (!blob) throw new Error("could not process the picture");
      await save(blob);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "could not save photo");
    } finally {
      setBusy(false);
    }
  }

  async function deletePhoto() {
    if (!window.confirm("Delete your photo? It will be removed from the server.")) return;
    setBusy(true);
    try {
      await remove();
    } catch (e) {
      setError(e instanceof Error ? e.message : "could not delete");
    } finally {
      setBusy(false);
    }
  }

  return (
    <dialog ref={dialog} className="settings-dialog photo-dialog" aria-labelledby="photo-title" onClose={onClose}>
      <div className="settings-body">
        <div className="settings-head">
          <h2 id="photo-title">📷 My photo face</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div className="segmented">
          <label className={`btn btn-sm${mode === "upload" && !src ? "" : " btn-ghost"} photo-upload`}>
            🖼 Upload
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) {
                  stopCamera();
                  choose(f);
                }
                e.target.value = "";
              }}
            />
          </label>
          <button className={`btn-sm${mode === "camera" ? "" : " btn-ghost"}`} onClick={() => void startCamera()}>
            🎥 Camera
          </button>
        </div>

        <div className="photo-stage" style={{ width: VIEW, height: VIEW }}>
          {mode === "camera" && !src && <video ref={video} autoPlay playsInline muted className="photo-video" />}
          {src && (
            <img
              ref={img}
              src={src}
              alt="Your photo, drag to position"
              draggable={false}
              onLoad={(e) => setNatural({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
              onPointerDown={onDown}
              onPointerMove={onMove}
              onPointerUp={() => (drag.current = null)}
              style={{
                width: dispW,
                height: dispH,
                transform: `translate(${(VIEW - dispW) / 2 + offset.x}px, ${(VIEW - dispH) / 2 + offset.y}px)`,
              }}
            />
          )}
          {!src && mode === "upload" &&
            (current ? (
              <img src={current} alt="Your current photo" className="photo-current" />
            ) : (
              <span className="photo-empty">Upload a picture or use your camera</span>
            ))}
          <span className="photo-ring" aria-hidden="true" />
        </div>

        {mode === "camera" && !src && (
          <button className="btn-green" onClick={snap}>
            📸 Take photo
          </button>
        )}
        {src && (
          <label className="row-label">
            <span>Zoom</span>
            <input
              type="range"
              min={1}
              max={3}
              step={0.05}
              value={zoom}
              onChange={(e) => {
                setZoom(Number(e.target.value));
                setOffset((o) => o);
              }}
            />
          </label>
        )}

        <p className="hint">
          🔒 Private: your photo is only shown to you (and a friend on this screen). It's stored small (128×128) and
          deleted with your account.
        </p>
        {error && (
          <div className="error" role="alert">
            {error}
          </div>
        )}
        <div className="settings-foot">
          {current ? (
            <button className="btn-ghost btn-sm" onClick={() => void deletePhoto()} disabled={busy}>
              🗑 Delete photo
            </button>
          ) : (
            <span />
          )}
          <button className="btn-green btn-sm" onClick={() => void confirm()} disabled={!src || busy}>
            {busy ? "Saving…" : "✓ Use this photo"}
          </button>
        </div>
      </div>
    </dialog>
  );
}
