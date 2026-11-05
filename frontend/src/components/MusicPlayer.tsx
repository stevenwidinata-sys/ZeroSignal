import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { playTrack, setMusicVolume, trackForPath } from "../platform/music";
import { useSettings } from "../store/settings";

/**
 * Plays the right track for the current page. Browsers block sound until the
 * user interacts, so music starts after the first click or key press, and it
 * pauses while the tab is hidden.
 */
export default function MusicPlayer() {
  const { pathname } = useLocation();
  const music = useSettings((s) => s.music);
  const musicVolume = useSettings((s) => s.musicVolume);
  const [unlocked, setUnlocked] = useState(false);
  const [visible, setVisible] = useState(() => document.visibilityState !== "hidden");

  useEffect(() => {
    if (unlocked) return;
    const unlock = () => setUnlocked(true);
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, [unlocked]);

  useEffect(() => {
    const onChange = () => setVisible(document.visibilityState !== "hidden");
    document.addEventListener("visibilitychange", onChange);
    return () => document.removeEventListener("visibilitychange", onChange);
  }, []);

  useEffect(() => {
    setMusicVolume(musicVolume);
  }, [musicVolume]);

  const track = music && musicVolume > 0 && unlocked && visible ? trackForPath(pathname) : null;
  useEffect(() => {
    playTrack(track);
  }, [track]);

  // Stop when the app unmounts (e.g. hot reload).
  useEffect(() => () => playTrack(null), []);

  return null;
}
