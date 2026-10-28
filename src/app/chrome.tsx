import Link from "next/link";
import { Fringe } from "./fringe";
import { RingMark } from "./ring";

const NAV = [
  { id: "desk", href: "/", label: "Desk" },
  { id: "benchmark", href: "/benchmark", label: "Against Luxy's stylists" },
  { id: "watch", href: "/watch", label: "Watch list" },
] as const;

/**
 * The masthead sits on the rail the shades hang from: the current page hangs from it on a steel line, and every
 * page but the desk (which opens on the full ring) carries a short fringe of the shades under it.
 */
export function Masthead({ current, fringe = true }: { current?: (typeof NAV)[number]["id"]; fringe?: boolean }) {
  return (
    <header className="masthead">
      <div className="page-measure masthead-row">
        <Link href="/" className="flex items-center gap-2.5 text-ink" aria-label="Swatchless, home">
          <RingMark size={30} className="text-steel" />
          <span className="font-display text-[28px] leading-none">Swatchless</span>
        </Link>
        <nav aria-label="Main">
          <ul className="masthead-nav">
            {NAV.map((n) => (
              <li key={n.id}>
                <Link href={n.href} aria-current={current === n.id ? "page" : undefined} className={current === n.id ? "nav-current" : "nav-link"}>
                  {n.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
      {fringe && <Fringe />}
    </header>
  );
}

export function Footer() {
  return (
    <footer className="site-footer">
      <div className="page-measure flex flex-col gap-3 pb-8 pt-8 text-muted">
        <p className="text-[15px]">
          Built by Jonathan Andrei for stylists who answer the same colour question all day. More of what I build at{" "}
          <a className="text-link" href="https://jonathansolvesproblems.com">
            jonathansolvesproblems.com
          </a>
          .
        </p>
        <p className="max-w-[80ch] text-[13.5px] leading-relaxed">
          Product data comes from each store&rsquo;s public catalogue. Product photos belong to Luxy Hair, Halo Couture and Ellen Wille and are shown
          small, with their source. Measurements and renders by YouCam (Perfect Corp). Not affiliated with any of these stores.
        </p>
      </div>
    </footer>
  );
}
