import { listContents } from "../lib/talizen/cms"
import type { Works } from "../types/cms"
import Gallery from "../component/Gallery"
import { toWorks, type Work } from "../component/works"

export const metadata = {
  title: "your name — internet designer",
  description: "a sphere of small things made for the internet",
}

const PAGE = 100
const MAX = 600

export async function getServerSideProps() {
  const items: Works[] = []
  try {
    // load every work, in the order set in the CMS (bigger sort first)
    while (items.length < MAX) {
      const res = await listContents<Works>("works", { limit: PAGE, offset: items.length, orderBy: "sort desc, id desc" })
      const list = res?.list ?? []
      items.push(...list)
      if (list.length < PAGE || items.length >= (res?.total ?? 0)) break
    }
  } catch {
    // fall through with whatever loaded; the gallery shows an empty state
  }
  return { props: { works: toWorks(items) } }
}

export default function Index({ works }: { works: Work[] }) {
  return <Gallery works={works ?? []} />
}
