import { useEffect, useState } from "react";
import { useFlash, useFps, useShortcuts } from "../platform/display";
import { useSettings } from "../store/settings";

/** FPS counter, shortcut keys, and the short message after a shortcut. */
export default function DisplayOverlays() {
  useShortcuts();
  const showFps = useSettings((s) => s.showFps);
  const fps = useFps(showFps);
  const flash = useFlash();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!flash.text) return;
    setVisible(true);
    const id = window.setTimeout(() => setVisible(false), 1500);
    return () => window.clearTimeout(id);
  }, [flash.text, flash.at]);

  return (
    <>
      {showFps && fps !== null && (
        <div className="fps-counter" aria-hidden="true">
          {fps} FPS
        </div>
      )}
      <div className={`shortcut-flash${visible ? " show" : ""}`} role="status" aria-live="polite">
        {visible ? flash.text : ""}
      </div>
    </>
  );
}
