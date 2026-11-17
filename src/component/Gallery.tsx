import { useEffect, useRef, useState, type PointerEvent as RPointerEvent } from "react"
import { ACCENTS, rand, type Work } from "./works"
import About from "./About"

type Mode = "sphere" | "heart" | "smiley" | "star" | "grid"
type Filter = "all" | "app" | "image"
type ParamKey = "rotate" | "noise" | "zoom" | "shape" | "depth"

// same order as the reference site
const MODES: Mode[] = ["sphere", "heart", "smiley", "star", "grid"]
const SHAPES: Mode[] = ["sphere", "heart", "smiley", "star"]
const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "all" },
  { key: "app", label: "apps" },
  { key: "image", label: "images" },
]
const OWNER = "your name’s"

// per-layout tuning taken from the reference: jitter amount and card scale
const SETTINGS: Record<Mode, { noise: number; card: number }> = {
  sphere: { noise: 1, card: 1 },
  heart: { noise: 0.2, card: 0.7 },
  smiley: { noise: 0.12, card: 0.58 },
  star: { noise: 0.12, card: 0.6 },
  grid: { noise: 0.02, card: 1 },
}

// ---------- camera (40° vertical fov perspective, like the reference) ----------
const TAN = Math.tan((20 * Math.PI) / 180)
const PX0 = 100 // DOM px per world unit before scaling
const CARD = 1.8 // longest card side in world units
const GOLDEN = Math.PI * (3 - Math.sqrt(5))

const noise = (e: number) => {
  const t = 43758.5453 * Math.sin(127.1 * e + 311.7)
  return t - Math.floor(t) - 0.5
}
const fract = (e: number) => e - Math.floor(e)
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))

type Vec = [number, number, number]

// ---------- layouts (world space, y up) ----------
function sphere(t: number, n: number): Vec {
  const i = 1 - 2 * (n <= 1 ? 0 : t / (n - 1))
  const r = Math.sqrt(Math.max(0, 1 - i * i))
  const a = t * GOLDEN
  return [Math.cos(a) * r * 4.6, 4.6 * i * 0.92, Math.sin(a) * r * 4.6]
}

function heart(t: number): Vec {
  const e = fract(0.61803398875 * t) * Math.PI * 2
  const s = Math.sin(e)
  const r = 13 * Math.cos(e) - 5 * Math.cos(2 * e) - 2 * Math.cos(3 * e) - Math.cos(4 * e)
  const a = Math.pow(fract(0.7548776662 * t), 0.35)
  return [16 * s * s * s * a * 0.3, (r + 2.6) * a * 0.3, 1.2 * noise(5 * t + 4)]
}

function smiley(t: number, n: number): Vec {
  const i = n <= 1 ? 0 : t / n
  const u = fract(0.61803398875 * t + 0.13)
  const v = fract(0.7548776662 * t + 0.37)
  if (i < 0.44) {
    const a = (i / 0.44) * Math.PI * 2
    return [4.3 * Math.sin(a), 4.3 * Math.cos(a), 0.9 * noise(5 * t + 4)]
  }
  if (i < 0.55) {
    const a = u * Math.PI * 2
    const s = Math.sqrt(v)
    return [1.5 * (i < 0.495 ? -1 : 1) + 0.5 * Math.cos(a) * s, 1.35 + 0.95 * Math.sin(a) * s, 0.7 * noise(5 * t + 4)]
  }
  const a = (Math.PI / 180) * (205 + ((i - 0.55) / 0.45) * 130)
  const r = 2.55 + 0.35 * noise(11 * t + 3)
  return [Math.cos(a) * r, Math.sin(a) * r + 0.35, 0.7 * noise(5 * t + 4)]
}

function star(t: number): Vec {
  const e = 10 * fract(0.61803398875 * t)
  const k = Math.floor(e)
  const f = e - k
  const a = (k / 10) * Math.PI * 2 - Math.PI / 2
  const b = ((k + 1) / 10) * Math.PI * 2 - Math.PI / 2
  const ra = k % 2 === 0 ? 4.9 : 2
  const rb = k % 2 === 0 ? 2 : 4.9
  const x = Math.cos(a) * ra + (Math.cos(b) * rb - Math.cos(a) * ra) * f
  const y = -(Math.sin(a) * ra + (Math.sin(b) * rb - Math.sin(a) * ra) * f)
  const u = Math.pow(fract(0.7548776662 * t), 0.4)
  return [x * u, y * u + 0.2, 0.9 * noise(5 * t + 4)]
}

function shapePoint(mode: Mode, t: number, n: number): Vec {
  if (mode === "heart") return heart(t)
  if (mode === "smiley") return smiley(t, n)
  if (mode === "star") return star(t)
  return sphere(t, n)
}

// ---------- card runtime state ----------
type Card = {
  x: number
  y: number
  z: number
  scale: number
  vis: number
  intro: number
  introduced: boolean
  introDelay: number
  dist: number
  ordinal: number
  on: boolean
  loaded: boolean
  baseW: number
  baseH: number
  gridX: number
  gridY: number
  gridScale: number
  // last projected screen rect (centre + half sizes) for frame / idle hover
  sx: number
  sy: number
  hw: number
  hh: number
}

// deterministic shuffle for the masonry order
function gridOrder(n: number) {
  const k = Array.from({ length: n }, (_, i) => i)
  for (let i = k.length - 1; i > 0; i--) {
    const j = Math.floor(rand(i * 7 + 3) * (i + 1))
    ;[k[i], k[j]] = [k[j], k[i]]
  }
  return k
}

// card size in world units from an image aspect ratio (longest side = CARD)
function baseSize(aspect: number) {
  const a = Number.isFinite(aspect) && aspect > 0 ? aspect : 1
  return a >= 1 ? { baseW: CARD, baseH: CARD / a } : { baseW: CARD * a, baseH: CARD }
}

function Chevron({ dir }: { dir: "left" | "right" }) {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points={dir === "left" ? "10,3 5,8 10,13" : "6,3 11,8 6,13"} />
    </svg>
  )
}

function Mark() {
  // hand-drawn style initials — replace with your own mark
  return (
    <svg viewBox="0 0 60 36" className="h-[34px] w-auto" fill="none" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 6 C10 14, 14 18, 16 22 M28 5 C24 14, 18 26, 12 33" />
      <path d="M36 32 L36 14 C36 10, 39 8, 43 8 C48 8, 50 12, 50 17 L50 32" />
    </svg>
  )
}

// ---------- main ----------
export default function Gallery({ works }: { works: Work[] }) {
  // works come from the CMS via getServerSideProps and stay fixed for the page's lifetime
  const WORKS = works
  const [modeIdx, setModeIdx] = useState(0)
  const [filter, setFilter] = useState<Filter>("all")
  const [hovered, setHovered] = useState<number | null>(null)
  const [selected, setSelected] = useState<number | null>(null)
  const [about, setAbout] = useState(false)
  const [scrubbing, setScrubbing] = useState<ParamKey | null>(null)
  const [ready, setReady] = useState(false)
  const [fullLoaded, setFullLoaded] = useState<number | null>(null)
  const mode = MODES[modeIdx]

  const stageRef = useRef<HTMLDivElement>(null)
  const cardRefs = useRef<(HTMLButtonElement | null)[]>([])
  const overlayRef = useRef<HTMLDivElement>(null)
  const frameRef = useRef<HTMLDivElement>(null)
  const chipRefs = useRef<Record<string, HTMLSpanElement | null>>({})
  const gridOrderRef = useRef(gridOrder(WORKS.length))
  const cards = useRef<Card[]>(
    WORKS.map((_, t) => {
      // real ratio is read from the image once it loads
      const { baseW, baseH } = baseSize(1)
      const [x, y, z] = sphere(t, WORKS.length)
      return {
        x, y, z, scale: 0.0001, vis: 0, intro: 0, introduced: false,
        introDelay: (noise(11 * t + 3) + 0.5) * 1300,
        dist: 15, ordinal: t, on: true, loaded: false, baseW, baseH,
        gridX: 0, gridY: 0, gridScale: 0.5, sx: 0, sy: 0, hw: 0, hh: 0,
      }
    }),
  )
  const live = useRef({
    mode: mode as Mode,
    filter: filter as Filter,
    about: false,
    hovered: null as number | null,
    selected: null as number | null,
    count: WORKS.length,
    // rotation (rad), rotation velocity, shape snap blend
    rot: 0.6,
    rotVel: 0,
    snap: 0,
    noiseBlend: 1,
    cardBlend: 1,
    noiseMul: 1,
    depth: 0.035,
    zoom: 0,
    camZ: 15,
    aboutBlend: 0,
    // grid scroll
    scroll: 0,
    scrollVel: 0,
    gridHeight: 0,
    dragging: false,
    moved: 0,
    lastMove: 0,
    nextIdle: 0,
    idle: false,
    w: 0,
    start: 0,
  })

  // thumbnail loaded: size the card to the photo's real ratio and let it fly in
  const imageReady = (id: number, img: HTMLImageElement) => {
    const c = cards.current[id]
    if (img.naturalWidth > 0 && img.naturalHeight > 0) {
      Object.assign(c, baseSize(img.naturalWidth / img.naturalHeight))
      const el = cardRefs.current[id]
      if (el) {
        el.style.width = `${c.baseW * PX0}px`
        el.style.height = `${c.baseH * PX0}px`
      }
    }
    img.dataset.loaded = ""
    c.loaded = true
  }

  const setHover = (id: number | null) => {
    if (live.current.hovered === id) return
    live.current.hovered = id
    setHovered(id)
  }

  useEffect(() => {
    const L = live.current
    L.mode = mode
    L.about = about
    L.selected = selected
  }, [mode, about, selected])

  // filter → recompute ordinals; newly shown cards pop out from the centre
  useEffect(() => {
    const L = live.current
    L.filter = filter
    let i = 0
    WORKS.forEach((w, id) => {
      const c = cards.current[id]
      const on = filter === "all" || w.kind === filter
      if (on && !c.on) {
        c.x = 1.5 * noise(3 * id)
        c.y = 1.5 * noise(5 * id)
        c.z = -2
      }
      c.on = on
      if (on) c.ordinal = i++
    })
    L.count = Math.max(1, i)
    L.scroll = 0
  }, [filter])

  useEffect(() => {
    live.current.scroll = 0
    live.current.scrollVel = 0
  }, [mode])

  // ---- animation loop ----
  useEffect(() => {
    const L = live.current
    L.start = performance.now()
    L.lastMove = L.start
    cards.current.forEach((c, id) => {
      const el = cardRefs.current[id]
      if (el) {
        el.style.width = `${c.baseW * PX0}px`
        el.style.height = `${c.baseH * PX0}px`
      }
    })
    // images that finished loading before hydration never fire onLoad
    cardRefs.current.forEach((el, id) => {
      const img = el?.querySelector("img")
      if (img?.complete && img.naturalWidth > 0) imageReady(id, img)
    })
    // never wait forever on slow images
    const fallback = window.setTimeout(() => cards.current.forEach((c) => (c.loaded = true)), 6000)

    const frame = { x: 0, y: 0, w: 0, h: 0, init: false }
    const from = { x: 0, y: 0, w: 0, h: 0 }
    let frameTarget: number | null = -1
    let frameSwitch = 0
    let last = performance.now()
    let tickN = 0
    let raf = 0

    const tick = () => {
      raf = requestAnimationFrame(tick)
      const stage = stageRef.current
      if (!stage) return
      const now = performance.now()
      const dt = Math.min((now - last) / 1000, 0.05)
      last = now
      const time = (now - L.start) / 1000
      const W = stage.clientWidth
      const H = stage.clientHeight
      if (!W || !H) return
      L.w = W
      const aspect = W / H
      const baseZ = Math.max(15, 3.9 / (TAN * aspect))
      L.camZ += (clamp(baseZ + L.zoom, 6, 40) - L.camZ) * 0.08
      const camZ = L.camZ
      const E = TAN * camZ // half visible height at z = 0
      const f = H / 2 / TAN // px per world unit at distance 1
      const yShift = aspect < 0.8 ? -0.07 * E : 0
      const m = L.mode
      const isShape = m === "heart" || m === "smiley" || m === "star"

      // masonry grid layout
      let gridTop = 0
      if (m === "grid") {
        const span = E * aspect * 1.84
        const cols = Math.max(2, Math.round(span / 1.7))
        const cell = span / cols
        const cw = 0.92 * cell
        const gap = 0.08 * cell
        const heights = new Array(cols).fill(0)
        for (const id of gridOrderRef.current) {
          const c = cards.current[id]
          if (!c.on) continue
          const s = cw / c.baseW
          const h = c.baseH * s
          let col = 0
          for (let k = 1; k < cols; k++) if (heights[k] < heights[col]) col = k
          c.gridScale = s
          c.gridX = (col - (cols - 1) / 2) * cell
          c.gridY = heights[col] + h / 2
          heights[col] += h + gap
        }
        L.gridHeight = Math.max(...heights)
        gridTop = 0.8 * E
        if (!L.dragging) {
          L.scroll += L.scrollVel
          L.scrollVel *= 0.94
        }
        L.scroll = clamp(L.scroll, 0, Math.max(0, L.gridHeight - 1.55 * E))
      }

      const set = SETTINGS[m]
      L.noiseBlend += (set.noise - L.noiseBlend) * 0.05
      L.cardBlend += (set.card - L.cardBlend) * 0.06
      const jitter = (0.09 + 0.075 * (1 + Math.sin(0.045 * time + 2))) * L.noiseBlend * L.noiseMul

      // sphere spins slowly; flat shapes ease back to face the camera and sway
      const snapTarget = m === "sphere" ? 0 : 1
      L.snap += (snapTarget - L.snap) * 0.06
      L.rot += 0.07 * dt * (1 - L.snap)
      if (L.snap > 0.01 && !L.dragging) {
        const k = Math.round(L.rot / (Math.PI * 2)) * Math.PI * 2
        L.rot += (k - L.rot) * 0.09 * L.snap
      }
      L.rot += L.rotVel
      L.rotVel *= 0.94
      const R = L.rot + (isShape ? 0.15 * Math.sin(0.35 * time) * L.snap : 0)
      const cR = Math.cos(R)
      const sR = Math.sin(R)

      L.aboutBlend += ((L.about ? 1 : 0) - L.aboutBlend) * 0.11
      const lift = L.aboutBlend * (m === "grid" ? L.gridHeight + 2.5 * E : 3.2 * E)
      const zMul = L.depth / 0.035
      const elapsed = now - L.start
      const n = L.count

      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity

      cards.current.forEach((c, id) => {
        const t = c.ordinal
        const w = WORKS[id]
        const shown = c.on && elapsed >= c.introDelay && c.loaded ? 1 : 0
        if (shown && !c.introduced) c.introduced = true
        if (c.introduced) c.intro += (1 - c.intro) * 0.055
        c.vis += (shown - c.vis) * 0.12
        const isSel = L.selected === id
        const isHov = L.hovered === id && !L.idle

        if (c.on) {
          let px: number, py: number, pz: number
          if (m === "grid") {
            px = c.gridX
            py = gridTop - c.gridY + L.scroll
            pz = 0.06 * noise(5 * t + 4)
          } else {
            ;[px, py, pz] = shapePoint(m, t, n)
            if (m !== "sphere") pz *= zMul
          }
          px += noise(3 * t + 1) * jitter * 6
          py += noise(3 * t + 2) * jitter * 6
          let tx = px * cR + pz * sR
          let tz = -px * sR + pz * cR
          let ty = py + lift + yShift
          if (isSel) {
            tx = 0
            ty = 0.25
            tz = camZ - 6
          } else if (isHov && m === "grid") {
            const s = Math.min(2.2 * c.gridScale, 3.4 / c.baseH, 4.6 / c.baseW)
            const hx = (c.baseW * s) / 2 + 0.15
            const hy = (c.baseH * s) / 2 + 0.15
            const r = E * aspect
            tx = clamp(tx, -r + hx, r - hx)
            ty = clamp(ty, -E + hy, E - hy)
          }
          const e = isSel ? 0.12 : 0.14
          c.x += (tx - c.x) * e
          c.y += (ty - c.y) * e
          c.z += (tz - c.z) * e
        }

        let ts = m === "grid" ? c.gridScale : L.cardBlend * (w.featured ? 1.35 : 1)
        if (isSel) {
          const full = 12 * TAN
          ts = Math.min((0.62 * full) / c.baseH, (0.82 * full * aspect) / c.baseW)
        } else if (isHov && m === "grid") {
          ts = Math.min(2.2 * c.gridScale, 3.4 / c.baseH, 4.6 / c.baseW)
        }
        c.scale += (ts - c.scale) * 0.12
        const s = Math.max(0.0001, c.scale * c.vis)

        const d = camZ - c.z
        c.dist += (Math.hypot(c.x, c.y, d) - c.dist) * 0.12
        const el = cardRefs.current[id]
        if (d <= 0.2) {
          if (el) el.style.visibility = "hidden"
          return
        }
        const k = f / d
        c.sx = W / 2 + c.x * k
        c.sy = H / 2 - c.y * k
        c.hw = (c.baseW / 2) * s * k
        c.hh = (c.baseH / 2) * s * k

        if (el) {
          const bw = c.baseW * PX0
          const bh = c.baseH * PX0
          el.style.transform = `translate3d(${(c.sx - bw / 2).toFixed(2)}px, ${(c.sy - bh / 2).toFixed(2)}px, 0) scale(${((s * k) / PX0).toFixed(4)})`
          el.style.opacity = c.intro.toFixed(3)
          let zi = Math.round((100 - c.dist) * 100) + (w.featured ? 12 : 0)
          if (isSel || (isHov && m === "grid")) zi += 20000
          el.style.zIndex = String(zi)
          const visible = c.vis > 0.01
          el.style.visibility = visible ? "visible" : "hidden"
          el.style.pointerEvents = c.on && c.vis > 0.5 ? "auto" : "none"
        }
        if (c.on && !isSel && c.vis > 0.5) {
          minX = Math.min(minX, c.sx)
          maxX = Math.max(maxX, c.sx)
          minY = Math.min(minY, c.sy)
          maxY = Math.max(maxY, c.sy)
        }
      })

      // ---- idle: after a pause, the cloud hovers random cards by itself ----
      const idle = !L.about && now - L.lastMove > 2500 && !L.dragging && L.selected === null
      L.idle = idle
      if (idle && now > L.nextIdle) {
        L.nextIdle = now + 2200 + 1400 * Math.random()
        let pick: number | null = null
        for (let tries = 0; tries < 10 && pick === null; tries++) {
          const qx = W / 2 + (Math.random() * 1.3 - 0.65) * (W / 2)
          const qy = H / 2 + (Math.random() * 1.3 - 0.65) * (H / 2)
          let best = -Infinity
          cards.current.forEach((c, id) => {
            if (!c.on || c.vis < 0.5) return
            if (Math.abs(qx - c.sx) > c.hw || Math.abs(qy - c.sy) > c.hh) return
            if (-c.dist > best) {
              best = -c.dist
              pick = id
            }
          })
        }
        if (pick !== null) setHover(pick)
      }

      // ---- morphing frame: cloud bbox → hovered card → focused card ----
      const target = L.selected ?? L.hovered
      const overlay = overlayRef.current
      const box = frameRef.current
      if (overlay && box) {
        let tx: number, ty: number, tw: number, th: number
        const tc = target !== null ? cards.current[target] : null
        if (tc && tc.on) {
          tx = tc.sx - tc.hw - 10
          ty = tc.sy - tc.hh - 10
          tw = tc.hw * 2 + 20
          th = tc.hh * 2 + 20
        } else if (Number.isFinite(minX)) {
          tx = Math.max(34, minX - 46)
          ty = Math.max(96, minY - 46)
          tw = Math.min(W - 34, maxX + 46) - tx
          th = Math.min(H - 34, maxY + 46) - ty
        } else {
          tx = frame.x
          ty = frame.y
          tw = frame.w
          th = frame.h
        }
        const tgt = tc && tc.on ? target : null
        if (!frame.init) {
          Object.assign(frame, { x: tx, y: ty, w: tw, h: th, init: true })
          frameTarget = tgt
        } else {
          if (tgt !== frameTarget) {
            frameTarget = tgt
            Object.assign(from, frame)
            frameSwitch = now
          }
          if (tgt !== null) {
            const p = Math.min(1, (now - frameSwitch) / 160)
            const e = 1 - (1 - p) ** 3
            frame.x = from.x + (tx - from.x) * e
            frame.y = from.y + (ty - from.y) * e
            frame.w = from.w + (tw - from.w) * e
            frame.h = from.h + (th - from.h) * e
          } else {
            frame.x += (tx - frame.x) * 0.22
            frame.y += (ty - frame.y) * 0.22
            frame.w += (tw - frame.w) * 0.22
            frame.h += (th - frame.h) * 0.22
          }
        }
        const x = frame.x, y = frame.y, fw = Math.max(0, frame.w), fh = Math.max(0, frame.h)
        box.style.transform = `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0)`
        box.style.width = `${fw.toFixed(2)}px`
        box.style.height = `${fh.toFixed(2)}px`
        const cloud = tgt === null
        overlay.dataset.mode = cloud ? "cloud" : "card"
        overlay.style.opacity = !L.about && (m !== "grid" || !cloud) ? "1" : "0"

        const put = (key: string, text: string | null, px: number, py: number, ax: number, ay: number) => {
          const el = chipRefs.current[key]
          if (!el) return
          if (text !== null && el.textContent !== text) el.textContent = text
          el.style.transform = `translate3d(${(px - el.offsetWidth * ax).toFixed(2)}px, ${(py - el.offsetHeight * ay).toFixed(2)}px, 0)`
        }
        const tw2 = tgt !== null ? WORKS[tgt] : null
        const filterLabel = FILTERS.find((q) => q.key === L.filter)?.label
        if (cloud) put("label", `${OWNER} ${filterLabel} · ${n}`, x + 96, y, 0, 0.5)
        else put("label", `${tw2!.date} · ${tw2!.place}`, x, y + 1, 0, 1)
        put("caption", tw2 ? (tw2.link && L.selected === tgt ? `${tw2.title} ↗` : tw2.title) : "", x + fw, y + fh - 1, 1, 0)
        if (tickN++ % 5 === 0) {
          const deg = ((((L.rot * 180) / Math.PI) % 360) + 360) % 360
          chipRefs.current.rotate!.textContent = `rotate~ ${deg.toFixed(1)}`
          chipRefs.current.noise!.textContent = `noise~ ${jitter.toFixed(2)}`
          chipRefs.current.zoom!.textContent = `zoom~ ${camZ.toFixed(1)}`
          chipRefs.current.shape!.textContent = `shape~ ${m} ${n}`
          chipRefs.current.depth!.textContent = `depth~ ${L.depth.toFixed(3)}`
        }
        put("rotate", null, x, y, 1 / 3, 0.5)
        put("noise", null, x + fw, y, 2 / 3, 0.5)
        put("zoom", null, x, y + fh, 1 / 3, 0.5)
        put("shape", null, x + fw / 2, y + fh, 0.5, 0.5)
        put("depth", null, x + fw, y + fh, 2 / 3, 0.5)
      }
    }
    raf = requestAnimationFrame(tick)
    setReady(true)
    return () => {
      cancelAnimationFrame(raf)
      window.clearTimeout(fallback)
    }
  }, [])

  // ---- stage drag / wheel ----
  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return
    let lx = 0, ly = 0
    const down = (e: PointerEvent) => {
      const L = live.current
      L.dragging = true
      L.moved = 0
      lx = e.clientX
      ly = e.clientY
    }
    const move = (e: PointerEvent) => {
      const L = live.current
      L.lastMove = performance.now()
      if (L.idle) {
        L.idle = false
        setHover(null)
      }
      if (!L.dragging) return
      const dx = e.clientX - lx
      const dy = e.clientY - ly
      lx = e.clientX
      ly = e.clientY
      L.moved += Math.abs(dx) + Math.abs(dy)
      if (L.mode === "grid") {
        const d = (-dy * (2 * TAN * L.camZ)) / Math.max(1, stage.clientHeight)
        L.scroll += d
        L.scrollVel = d
      } else L.rotVel = 0.004 * dx
    }
    const up = () => {
      live.current.dragging = false
    }
    const wheel = (e: WheelEvent) => {
      const L = live.current
      if (L.mode !== "grid") return
      e.preventDefault()
      L.lastMove = performance.now()
      L.scroll += 0.014 * e.deltaY
    }
    stage.addEventListener("pointerdown", down)
    window.addEventListener("pointermove", move)
    window.addEventListener("pointerup", up)
    stage.addEventListener("wheel", wheel, { passive: false })
    return () => {
      stage.removeEventListener("pointerdown", down)
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerup", up)
      stage.removeEventListener("wheel", wheel)
    }
  }, [])

  // ---- scrubbable parameter chips ----
  const startScrub = (key: ParamKey) => (e: RPointerEvent) => {
    e.stopPropagation()
    e.preventDefault()
    const L = live.current
    let lastX = e.clientX
    let acc = 0
    setScrubbing(key)
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - lastX
      lastX = ev.clientX
      if (key === "rotate") L.rotVel = 0.006 * dx
      if (key === "noise") L.noiseMul = clamp(L.noiseMul + dx * 0.01, 0, 5)
      if (key === "zoom") L.zoom = clamp(L.zoom + dx * 0.05, -8, 20)
      if (key === "depth") L.depth = clamp(L.depth + dx * 0.0004, 0, 0.3)
      if (key === "shape") {
        acc += dx
        if (Math.abs(acc) > 48) {
          const step = acc > 0 ? 1 : -1
          acc = 0
          setModeIdx((mi) => {
            const cur = SHAPES.indexOf(MODES[mi])
            const next = SHAPES[(Math.max(0, cur) + step + SHAPES.length) % SHAPES.length]
            return MODES.indexOf(next)
          })
        }
      }
    }
    const up = () => {
      setScrubbing(null)
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerup", up)
    }
    window.addEventListener("pointermove", move)
    window.addEventListener("pointerup", up)
  }

  // ---- keyboard: esc closes, arrows switch layout or step through focused works ----
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (selected !== null) setSelected(null)
        else setAbout(false)
        return
      }
      if (about) return
      if (selected !== null && (e.key === "ArrowRight" || e.key === "ArrowLeft")) {
        e.preventDefault()
        const step = e.key === "ArrowRight" ? 1 : -1
        const n = live.current.count
        const ord = (((cards.current[selected].ordinal + step) % n) + n) % n
        const next = cards.current.findIndex((c) => c.on && c.ordinal === ord)
        if (next >= 0) setSelected(next)
        return
      }
      if (e.key === "ArrowRight") setModeIdx((mi) => Math.min(MODES.length - 1, mi + 1))
      if (e.key === "ArrowLeft") setModeIdx((mi) => Math.max(0, mi - 1))
    }
    window.addEventListener("keydown", key)
    return () => window.removeEventListener("keydown", key)
  }, [about, selected])

  const focusId = selected ?? hovered
  const focusWork = focusId !== null ? WORKS[focusId] : null
  const accent = focusWork ? ACCENTS[focusWork.accent] : ACCENTS[5]
  const chip = `absolute left-0 top-0 whitespace-nowrap px-1.5 py-0.5 font-mono text-[10px] leading-tight will-change-transform transition-[opacity,background-color] duration-300 ${accent[0]} ${accent[2]}`

  return (
    <div className="fixed inset-0 overflow-hidden bg-[#bfbfbf] font-sans text-black antialiased">
      <a href="/" className="absolute left-[30px] top-[25px] z-30 sm:left-6 sm:top-4" aria-label="home">
        <Mark />
      </a>

      <button
        onClick={() => {
          setSelected(null)
          setAbout((a) => !a)
        }}
        className="absolute right-[30px] top-[30px] z-30 cursor-pointer whitespace-nowrap text-[17px] lowercase leading-none tracking-[-0.02em] text-black/80 transition-colors duration-200 hover:text-black sm:right-6 sm:top-4"
      >
        <span className="relative inline-flex h-[17px] overflow-hidden">
          <span className={`block transition-transform duration-500 ease-[cubic-bezier(.2,.8,.2,1)] ${about ? "-translate-y-full" : "translate-y-0"}`}>
            about me
          </span>
          <span
            className={`absolute right-0 top-0 block transition-transform duration-500 ease-[cubic-bezier(.2,.8,.2,1)] ${about ? "translate-y-0" : "translate-y-full"}`}
          >
            close
          </span>
        </span>
      </button>

      {/* stage */}
      <div
        ref={stageRef}
        onClick={() => {
          // any click while a work is open closes it
          if (live.current.moved < 5 && selected !== null) setSelected(null)
        }}
        className={`absolute inset-0 isolate z-10 touch-none select-none ${about ? "pointer-events-none" : ""} ${
          hovered !== null && !live.current.idle ? "cursor-pointer" : "cursor-grab active:cursor-grabbing"
        }`}
      >
        {WORKS.map((w, id) => (
          <button
            key={w.id}
            ref={(el) => {
              cardRefs.current[id] = el
            }}
            onPointerEnter={() => {
              if (!live.current.dragging) {
                live.current.idle = false
                setHover(id)
              }
            }}
            onPointerLeave={() => {
              if (live.current.hovered === id) setHover(null)
            }}
            onClick={(e) => {
              e.stopPropagation()
              if (live.current.moved >= 5) return
              setSelected((s) => (s === null ? id : null))
            }}
            className="invisible absolute left-0 top-0 origin-center cursor-pointer bg-white p-px opacity-0"
            aria-label={w.title}
          >
            <span className="relative block h-full w-full overflow-hidden bg-[#aeaeb2]">
              <img
                src={w.thumb}
                alt={w.title}
                loading="eager"
                decoding="async"
                draggable={false}
                onLoad={(e) => imageReady(id, e.currentTarget)}
                onError={(e) => {
                  // retry once, then keep the grey placeholder
                  const img = e.currentTarget
                  if (!img.dataset.retried) {
                    img.dataset.retried = ""
                    img.src = `${w.thumb}?r=1`
                  } else cards.current[id].loaded = true
                }}
                className="h-full w-full object-cover text-transparent opacity-0 transition-opacity duration-300 data-loaded:opacity-100"
              />
              {selected === id && (
                <img
                  src={w.full}
                  alt=""
                  draggable={false}
                  onLoad={() => setFullLoaded(id)}
                  className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-300 ${fullLoaded === id ? "opacity-100" : "opacity-0"}`}
                />
              )}
            </span>
          </button>
        ))}
      </div>

      {/* morphing frame + value chips */}
      <div ref={overlayRef} data-mode="cloud" className="group pointer-events-none absolute inset-0 z-20 opacity-0 transition-opacity duration-300">
        <div ref={frameRef} className={`absolute left-0 top-0 border transition-[border-color] duration-300 will-change-transform ${accent[1]}`} />
        {(["rotate", "noise", "zoom", "shape", "depth"] as ParamKey[]).map((k) => (
          <span
            key={k}
            ref={(el) => {
              chipRefs.current[k] = el
            }}
            onPointerDown={startScrub(k)}
            className={`${chip} pointer-events-auto cursor-ew-resize group-data-[mode=card]:pointer-events-none group-data-[mode=card]:opacity-0 ${
              scrubbing === k ? "brightness-75" : "hover:brightness-75"
            }`}
          />
        ))}
        <span
          ref={(el) => {
            chipRefs.current.label = el
          }}
          className={chip}
        />
        <span
          ref={(el) => {
            chipRefs.current.caption = el
          }}
          onClick={() => {
            const link = selected !== null ? WORKS[selected]?.link : ""
            if (link) window.open(link, "_blank", "noopener,noreferrer")
          }}
          className={`${chip} group-data-[mode=cloud]:opacity-0 ${selected !== null && WORKS[selected]?.link ? "pointer-events-auto cursor-pointer hover:underline" : ""}`}
        />
      </div>

      {WORKS.length === 0 && (
        <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center text-[17px] lowercase tracking-[-0.02em] text-black/50">
          no works yet — add some in the cms
        </div>
      )}

      {/* bottom fade */}
      <div className="pointer-events-none absolute bottom-0 left-0 right-0 z-[15] h-[130px] bg-[linear-gradient(to_top,#bfbfbf_30%,rgba(191,191,191,0.85)_50%,rgba(191,191,191,0.55)_68%,rgba(191,191,191,0.25)_84%,rgba(191,191,191,0))] sm:h-44" />

      {/* mode switcher */}
      <div className="absolute bottom-3.5 left-[30px] z-30 sm:bottom-5 sm:left-6">
        <div
          className={`flex h-9 items-center text-[17px] lowercase leading-none tracking-[-0.02em] transition-[transform,opacity] duration-700 ease-[cubic-bezier(.2,.8,.2,1)] ${
            ready && !about ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-[22px] opacity-0"
          }`}
        >
          <button
            onClick={() => setModeIdx((mi) => Math.max(0, mi - 1))}
            className={`-ml-[5px] grid h-8 w-8 cursor-pointer place-items-center transition-colors ${modeIdx === 0 ? "text-black/35" : "text-black/85 hover:text-black"}`}
            aria-label="previous shape"
          >
            <Chevron dir="left" />
          </button>
          <span className="relative block h-[20px] w-[64px] overflow-hidden text-center text-black/85">
            {MODES.map((mm, mi) => (
              <span
                key={mm}
                className={`absolute inset-0 transition-[transform,opacity] duration-500 ease-[cubic-bezier(.2,.8,.2,1)] ${
                  mi === modeIdx ? "translate-y-0 opacity-100" : mi < modeIdx ? "-translate-y-[14px] opacity-0" : "translate-y-[14px] opacity-0"
                }`}
              >
                {mm}
              </span>
            ))}
          </span>
          <button
            onClick={() => setModeIdx((mi) => Math.min(MODES.length - 1, mi + 1))}
            className={`grid h-8 w-8 cursor-pointer place-items-center transition-colors ${
              modeIdx === MODES.length - 1 ? "text-black/35" : "text-black/85 hover:text-black"
            }`}
            aria-label="next shape"
          >
            <Chevron dir="right" />
          </button>
        </div>
      </div>

      {/* filters */}
      <div
        className={`absolute bottom-3.5 right-[30px] z-30 flex h-9 items-center gap-6 transition-[transform,opacity] delay-100 duration-700 ease-[cubic-bezier(.2,.8,.2,1)] sm:bottom-5 sm:right-6 ${
          ready && !about ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-[22px] opacity-0"
        }`}
      >
        {FILTERS.map((fl) => (
          <button
            key={fl.key}
            onClick={() => {
              setSelected(null)
              setFilter(fl.key)
            }}
            className={`cursor-pointer text-[17px] lowercase leading-none tracking-[-0.02em] transition-colors duration-200 ${
              filter === fl.key ? "text-black/85" : "text-black/35 hover:text-black/70"
            }`}
          >
            {fl.label}
          </button>
        ))}
      </div>

      <About open={about} />
    </div>
  )
}
