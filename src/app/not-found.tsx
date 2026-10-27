import Link from "next/link";
import { Footer, Masthead } from "./chrome";

export default function NotFound() {
  return (
    <>
      <title>Nothing at this address · Swatchless</title>
      <Masthead />
      <main className="mx-auto flex w-full max-w-[1240px] flex-1 flex-col gap-5 px-4 pb-16 pt-10 sm:px-8">
        <h1 className="max-w-[20ch] text-[clamp(2.2rem,4.5vw,3.6rem)] leading-[1.04]">Nothing at this address</h1>
        <p className="max-w-[52ch] text-[17px] leading-relaxed text-muted">
          This link does not match a page or a saved consult. Each consult is saved at its own link, with its renders, so check the link
          from the reply, or start a new consult from the desk.
        </p>
        <Link href="/" className="tag-button self-start">
          Back to the desk
        </Link>
      </main>
      <Footer />
    </>
  );
}
