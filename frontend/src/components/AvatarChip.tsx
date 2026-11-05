import { useEffect } from "react";
import { Link } from "react-router-dom";
import Avatar from "../character/Avatar";
import { useCharacter } from "../store/character";

/** Small face + name in the nav; links to the wardrobe. */
export default function AvatarChip({ username }: { username: string }) {
  const view = useCharacter((s) => s.view);
  const load = useCharacter((s) => s.load);

  useEffect(() => {
    if (!view) void load();
  }, [view, load]);

  return (
    <Link to="/profile" className="user-chip avatar-chip" title="My character">
      <Avatar loadout={view?.loadout} size={28} crop="head" />
      {username}
    </Link>
  );
}
