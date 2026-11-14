import { Link } from "react-router-dom";

/**
 * The one back button every page uses: big, yellow, clearly labelled, always
 * top-left. Says where it goes ("Back to games"), so nobody has to guess.
 */
export default function BackButton({ to = "/", label = "Back to games" }: { to?: string; label?: string }) {
  return (
    <Link to={to} className="back-btn">
      <span className="back-btn-arrow" aria-hidden="true">
        ←
      </span>
      {label}
    </Link>
  );
}
