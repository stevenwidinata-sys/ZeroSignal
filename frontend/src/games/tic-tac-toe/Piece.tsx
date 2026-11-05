import Avatar from "../../character/Avatar";
import { useCharacter } from "../../store/character";
import { usePhoto } from "../../store/photo";
import Chip from "../connect-four/Chip";
import { findFace } from "./items";

interface Props {
  face: string;
  size?: number;
  className?: string;
}

/** One Tic-Tac-Toe piece: X/O, emoji, Angry Bird chip, your character or your photo. */
export default function Piece({ face, size = 64, className }: Props) {
  const art = findFace(face).art;
  const photoUrl = usePhoto((s) => s.url);
  const loadout = useCharacter((s) => s.view?.loadout);
  const cls = `ttt-piece ${className ?? ""}`;

  switch (art.kind) {
    case "x":
      return (
        <svg viewBox="0 0 100 100" width={size} height={size} className={cls} aria-hidden="true">
          <path d="M22 22 L78 78 M78 22 L22 78" stroke="#03040c" strokeWidth="22" strokeLinecap="round" />
          <path d="M22 22 L78 78 M78 22 L22 78" stroke={art.color} strokeWidth="14" strokeLinecap="round" />
        </svg>
      );
    case "o":
      return (
        <svg viewBox="0 0 100 100" width={size} height={size} className={cls} aria-hidden="true">
          <circle cx="50" cy="50" r="30" fill="none" stroke="#03040c" strokeWidth="22" />
          <circle cx="50" cy="50" r="30" fill="none" stroke={art.color} strokeWidth="14" />
        </svg>
      );
    case "emoji":
      return (
        <span className={cls} style={{ fontSize: size * 0.78, lineHeight: 1 }} aria-hidden="true">
          {art.value}
        </span>
      );
    case "chip":
      return <Chip skin={art.value} size={size} className={cls} />;
    case "avatar":
      return (
        <span className={`${cls} ttt-round`} style={{ width: size, height: size }} aria-hidden="true">
          <Avatar loadout={loadout} size={size} crop="head" />
        </span>
      );
    case "photo":
      return photoUrl ? (
        <img src={photoUrl} width={size} height={size} className={`${cls} ttt-round ttt-photo`} alt="" />
      ) : (
        <span className={`${cls} ttt-round ttt-photo-missing`} style={{ width: size, height: size, fontSize: size * 0.5 }} aria-hidden="true">
          📷
        </span>
      );
  }
}
