import type { Works } from "../types/cms"

export type Kind = "app" | "image"

export type Work = {
  id: number
  title: string
  kind: Kind
  date: string
  place: string
  /** index into ACCENTS */
  accent: number
  /** featured cards render a little larger, like the reference "recap" items */
  featured: boolean
  /** small image used in the cloud */
  thumb: string
  /** large image shown when a work is opened */
  full: string
  link: string
}

export function rand(seed: number) {
  const x = Math.sin(seed * 9301 + 49297) * 233280
  return x - Math.floor(x)
}

// accent palette taken from the reference: [background, border, text]
export const ACCENTS: [string, string, string][] = [
  ["bg-[#00c853]", "border-[#00c853]", "text-white"],
  ["bg-[#2979ff]", "border-[#2979ff]", "text-white"],
  ["bg-[#ff2fae]", "border-[#ff2fae]", "text-white"],
  ["bg-[#ffc400]", "border-[#ffc400]", "text-black"],
  ["bg-[#e8442e]", "border-[#e8442e]", "text-white"],
  ["bg-[#26262b]", "border-[#26262b]", "text-white"],
]

// CMS image fields arrive as a URL string (or, defensively, an object with a url)
function fileUrl(v: unknown): string {
  if (typeof v === "string") return v
  if (v && typeof v === "object" && "url" in v && typeof (v as { url: unknown }).url === "string") return (v as { url: string }).url
  return ""
}

/** Map CMS "works" entries (already in CMS sort order) to gallery works. */
export function toWorks(items: Works[]): Work[] {
  const out: Work[] = []
  for (const item of items) {
    const b = item?.body
    const full = fileUrl(b?.image)
    const thumb = fileUrl(b?.thumbnail) || full
    if (!thumb) continue
    const i = out.length
    out.push({
      id: i,
      title: b?.title || "untitled",
      kind: b?.kind === "app" ? "app" : "image",
      date: b?.date ?? "",
      place: b?.place ?? "",
      accent: i % 5,
      featured: !!b?.featured,
      thumb,
      full: full || thumb,
      link: b?.link ?? "",
    })
  }
  return out
}
