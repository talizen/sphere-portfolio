// Local content: every collection is a JSON file in src/content/<collection>.json,
// already sorted the way it should be shown. Edit those files to change the site's content.
type Entry = { id?: string; slug: string; sort?: number; body: any }

const collections = import.meta.glob('../../content/*.json', { eager: true, import: 'default' }) as Record<string, Entry[]>

function entries(key: string): Entry[] {
  return (collections[`../../content/${key}.json`] ?? []).map((e) => ({ id: e.slug, ...e }))
}

export async function listContents<T = Entry>(key: string, options: { limit?: number; offset?: number; [k: string]: unknown } = {}) {
  const all = entries(key)
  const offset = options.offset ?? 0
  const limit = options.limit ?? 20
  return { list: all.slice(offset, offset + limit) as unknown as T[], total: all.length }
}

export async function getContent<T = Entry>(key: string, slug: string) {
  return (entries(key).find((e) => e.slug === slug) ?? null) as unknown as T | null
}
