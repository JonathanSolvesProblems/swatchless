import Link from "next/link";
import { RingMark } from "./ring";

const NAV = [
  { id: "desk", href: "/", label: "Desk" },
  { id: "benchmark", href: "/benchmark", label: "Against Luxy's stylists" },
  { id: "watch", href: "/watch", label: "Watch list" },
] as const;

export function Masthead({ current }: { current: (typeof NAV)[number]["id"] }) {
  return (
    <header className="mx-auto flex w-full max-w-[1240px] flex-wrap items-center justify-between gap-4 px-4 py-5 sm:px-8">
      <Link href="/" className="flex items-center gap-2.5 text-ink" aria-label="Swatchless, home">
        <RingMark size={30} className="text-steel" />
        <span className="font-display text-[28px] leading-none">Swatchless</span>
      </Link>
      <nav aria-label="Main">
        <ul className="flex flex-wrap gap-5 text-[15px]">
          {NAV.map((n) => (
            <li key={n.id}>
              <Link
                href={n.href}
                aria-current={current === n.id ? "page" : undefined}
                className={current === n.id ? "text-ink underline decoration-steel decoration-2 underline-offset-8" : "text-muted hover:text-ink"}
              >
                {n.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </header>
  );
}

export function Footer() {
  return (
    <footer className="mx-auto w-full max-w-[1240px] border-t border-rule px-4 py-8 text-sm text-muted sm:px-8">
      <p className="text-[15px]">
        Built by Jonathan Andrei for stylists who answer the same colour question all day. More of what I build at{" "}
        <a className="text-link" href="https://jonathansolvesproblems.com">
          jonathansolvesproblems.com
        </a>
        .
      </p>
      <p className="mt-3 max-w-[80ch] text-[12.5px] leading-relaxed">
        Product data comes from each store&rsquo;s public catalogue. Product photos belong to Luxy Hair, Halo Couture and Ellen Wille and are shown
        small, with their source. Try-ons by YouCam (Perfect Corp). Not affiliated with any of these stores.
      </p>
    </footer>
  );
}
