// Placeholder biography — replace each entry with your own story.
const ENTRIES = [
  {
    head: "today · 2026 · your city",
    color: ["bg-[#26262b]", "border-[#26262b]", "text-white"],
    body: "i'm a designer making things for the internet — small experiments, tools and products, mostly for fun and sometimes for work.",
  },
  {
    head: "studio · 2024 — now · your city",
    color: ["bg-[#1f8bff]", "border-[#1f8bff]", "text-white"],
    body: "running a tiny independent studio. we build playful interfaces with friends and say no to most meetings.",
  },
  {
    head: "side projects · 2021 — 2024 · online",
    color: ["bg-[#ff2d9b]", "border-[#ff2d9b]", "text-white"],
    body: "started posting one idea a week. some became apps, most stayed as images. all of them live in the cloud you just played with.",
  },
  {
    head: "company · 2018 — 2021 · somewhere",
    color: ["bg-[#ffd400]", "border-[#ffd400]", "text-black"],
    body: "worked on a product team designing core flows, onboarding and a lot of buttons that people pressed every day.",
  },
  {
    head: "school · 2014 — 2018 · elsewhere",
    color: ["bg-[#12c25a]", "border-[#12c25a]", "text-white"],
    body: "studied visual communication, learned to code by accident, and never really stopped.",
  },
]

const LINKS = [
  { label: "twitter/x", href: "#" },
  { label: "instagram", href: "#" },
  { label: "email", href: "mailto:hello@example.com" },
]

export default function About({ open }: { open: boolean }) {
  return (
    <div
      className={`absolute inset-0 z-20 transition-opacity duration-500 ${open ? "opacity-100" : "pointer-events-none opacity-0"}`}
    >
      <div className="absolute inset-x-0 bottom-[70px] top-0 overflow-y-auto [mask-image:linear-gradient(to_bottom,black_85%,transparent)]">
        <div className="mx-auto flex w-full max-w-[592px] flex-col gap-10 px-6 pb-24 pt-[136px]">
          {ENTRIES.map((e, i) => (
            <section
              key={e.head}
              className={`transition-[transform,opacity] duration-700 ease-[cubic-bezier(.2,.8,.2,1)] ${
                open ? "translate-y-0 opacity-100" : "translate-y-[14px] opacity-0"
              } ${["delay-0", "delay-75", "delay-150", "delay-200", "delay-300"][i] ?? ""}`}
            >
              <span className={`inline-block px-1.5 py-0.5 font-mono text-[10px] leading-tight ${e.color[0]} ${e.color[2]}`}>
                {e.head}
              </span>
              <p className={`border px-3.5 py-3 text-[17px] lowercase leading-[1.6] tracking-[-0.02em] text-black/80 ${e.color[1]}`}>
                {e.body}
              </p>
            </section>
          ))}
        </div>
      </div>
      <div className="absolute inset-x-0 bottom-5 flex justify-center gap-6 text-[17px] lowercase tracking-[-0.02em]">
        {LINKS.map((l) => (
          <a key={l.label} href={l.href} className="text-black/50 transition-colors hover:text-black">
            {l.label}
          </a>
        ))}
      </div>
    </div>
  )
}
