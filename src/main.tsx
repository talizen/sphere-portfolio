import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import * as PageIndex from './page/Index'
import { BuiltWithTalizen } from './BuiltWithTalizen'

type PageModule = { default: (props: any) => any; getServerSideProps?: (ctx: any) => any }

// Each page is a plain <a href> link, so a full page load per navigation is fine.
const routes: { path: string; mod: PageModule }[] = [
  { path: '/', mod: PageIndex as PageModule },
]

function match(pathname: string) {
  const parts = pathname.replace(/\/+$/, '').split('/').filter(Boolean)
  for (const r of routes) {
    const want = r.path.split('/').filter(Boolean)
    if (want.length !== parts.length) continue
    const params: Record<string, string> = {}
    if (want.every((w, i) => (w.startsWith(':') ? ((params[w.slice(1)] = decodeURIComponent(parts[i])), true) : w === parts[i].toLowerCase())))
      return { mod: r.mod, params }
  }
  return null
}

function NotFound() {
  return (
    <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', fontFamily: 'system-ui, sans-serif' }}>
      <p>
        Page not found. <a href="/">Go home</a>
      </p>
    </main>
  )
}

async function main() {
  const root = createRoot(document.getElementById('root')!)
  const found = match(window.location.pathname)
  let Page: (props: any) => any = NotFound
  let props: Record<string, unknown> = {}
  if (found) {
    Page = found.mod.default
    props = { params: found.params }
    if (found.mod.getServerSideProps) {
      // Pages written for Talizen load their data here (from src/content/*.json) before rendering.
      const query = Object.fromEntries(new URLSearchParams(window.location.search))
      const result = await found.mod.getServerSideProps({ params: found.params, query })
      if (result?.redirect) return window.location.replace(result.redirect.destination)
      if (result?.notFound) Page = NotFound
      else props = { ...props, ...(result?.props ?? {}) }
    }
  }
  root.render(
    <StrictMode>
      <Page {...props} />
      <BuiltWithTalizen />
    </StrictMode>,
  )
}

main()
