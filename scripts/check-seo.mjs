// Black-box check of what search engines and link previews read.
//   node scripts/check-seo.mjs          the built site in dist/client (after `npm run build`)
//   node scripts/check-seo.mjs --live   what https://docs.oxabl.org serves (after a deploy)
import { existsSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"

const root = join(import.meta.dirname, "..")
const dist = join(root, "dist", "client")
const site = "https://docs.oxabl.org"
const live = process.argv.includes("--live")
// Fetch from elsewhere (a local server of dist/client) while expecting the real URLs.
const base = process.env.OXABL_SEO_BASE ?? site
const failures = []
const check = (ok, what) => {
  if (!ok) failures.push(what)
}

const fileFor = (path) =>
  join(dist, path.endsWith("/") ? `${path}index.html` : path)

// One reader for both modes: { status, type, headers, bytes, text } or null.
async function get(path) {
  if (live) {
    try {
      const res = await fetch(new URL(path, base), {
        redirect: "manual",
        signal: AbortSignal.timeout(15_000),
        headers: { "user-agent": "oxabl-seo-check (+https://oxabl.org)" },
      })
      const bytes = Buffer.from(await res.arrayBuffer())
      return {
        status: res.status,
        type: res.headers.get("content-type") ?? "",
        headers: res.headers,
        bytes,
        text: bytes.toString("utf8"),
      }
    } catch {
      return null
    }
  }
  const file = fileFor(path)
  if (!existsSync(file) || !statSync(file).isFile()) return null
  const bytes = readFileSync(file)
  return { status: 200, type: "", headers: new Headers(), bytes, text: bytes.toString("utf8") }
}

if (live) {
  // Wait until the edge serves this build (home page and card equal dist/client),
  // so a stale edge neither fails a good deploy nor hides a bad one.
  const deadline = Date.now() + 180_000
  for (;;) {
    const [home, card] = await Promise.all([get("/"), get("/og/index.png")])
    if (
      home?.status === 200 &&
      card?.status === 200 &&
      home.bytes.equals(readFileSync(fileFor("/"))) &&
      card.bytes.equals(readFileSync(join(dist, "og/index.png")))
    )
      break
    if (Date.now() > deadline) {
      const seen = (r) => (r ? `${r.status} ${r.type} ${r.bytes.length} bytes` : "no response")
      console.error(
        `SEO check failed (live): the deploy is not serving this build after 180 s (/: ${seen(home)}; /og/index.png: ${seen(card)})`
      )
      process.exit(1)
    }
    await new Promise((resolve) => setTimeout(resolve, 5000))
  }
}

const attr = (tag, name) =>
  new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'>]+))`, "i")
    .exec(tag)
    ?.slice(1)
    .find((v) => v !== undefined) ?? null
const metaContent = (html, key, value) =>
  [...html.matchAll(/<meta\s[^>]*>/gi)]
    .map((m) => m[0])
    .filter((tag) => attr(tag, key)?.toLowerCase() === value.toLowerCase())
    .map((tag) => attr(tag, "content") ?? "")
const blocksIndexing = (value) => /noindex|none/i.test(value)
const robotsMetas = (html) =>
  ["robots", "googlebot", "bingbot"].flatMap((n) => metaContent(html, "name", n))
const canonicals = (html) =>
  [...html.matchAll(/<link\s[^>]*>/gi)]
    .map((m) => m[0])
    .filter((tag) => /canonical/i.test(attr(tag, "rel") ?? ""))
    .map((tag) => attr(tag, "href"))
// Does a robots.txt path rule match "/" (Google semantics: * wildcard, trailing $)?
const matchesRoot = (rule) =>
  rule !== "" &&
  new RegExp("^" + rule.replace(/[.+?^{}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")).test("/")

const sitemapIndex = await get("/sitemap-index.xml")
check(
  sitemapIndex?.status === 200 && sitemapIndex.text.includes("sitemap-0.xml"),
  "sitemap-index.xml lists sitemap-0.xml"
)
const sitemap = await get("/sitemap-0.xml")
check(sitemap?.status === 200, "sitemap-0.xml is served")
const locs = [...(sitemap?.text ?? "").matchAll(/<loc>([^<]*)<\/loc>/g)].map((m) => m[1])
check(locs.length >= 10, "sitemap lists the docs pages")
check(!locs.some((l) => /\/404\/?$/.test(l)), "sitemap omits the 404")

const descriptions = new Map()
for (const loc of locs) {
  check(loc.startsWith(`${site}/`), `sitemap page ${loc} is on ${site}`)
  const path = new URL(loc).pathname
  const page = await get(path)
  if (!page || page.status !== 200) {
    check(false, `${loc} is served`)
    continue
  }
  const html = page.text
  check(
    JSON.stringify(canonicals(html)) === JSON.stringify([loc]),
    `${path} has exactly one canonical, itself`
  )
  check(!robotsMetas(html).some(blocksIndexing), `${path} has no noindex robots meta`)
  check(
    !blocksIndexing(page.headers.get("x-robots-tag") ?? ""),
    `${path} has no noindex X-Robots-Tag header`
  )
  check(
    html.split("<title>").length === 2 && /<title>[^<]{3,}<\/title>/.test(html),
    `${path} has exactly one title`
  )
  const description = metaContent(html, "name", "description")
  check(
    description.length === 1 && description[0].trim().length >= 50,
    `${path} has one description of 50+ characters`
  )
  if (description[0]) {
    check(!descriptions.has(description[0]), `${path} description is unique (also ${descriptions.get(description[0])})`)
    descriptions.set(description[0], path)
  }
  const ogUrl = metaContent(html, "property", "og:url")[0]
  const ogImage = metaContent(html, "property", "og:image")[0] ?? ""
  check(ogUrl === loc, `${path} og:url is ${loc}`)
  check(ogImage.startsWith(`${site}/og/`), `${path} og:image is an absolute card URL`)
  check(
    metaContent(html, "name", "twitter:card")[0] === "summary_large_image",
    `${path} twitter:card is summary_large_image`
  )
  if (!live && ogImage.startsWith(site)) {
    const png = join(dist, new URL(ogImage).pathname)
    const bytes = existsSync(png) ? readFileSync(png) : Buffer.alloc(0)
    check(
      bytes.length > 1000 &&
        bytes.subarray(1, 4).toString() === "PNG" &&
        bytes.subarray(-8, -4).toString() === "IEND",
      `${path} og:image is a complete PNG in dist`
    )
  }
  const blocks = [
    ...html.matchAll(/<script\s[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g),
  ]
  check(blocks.length > 0, `${path} has JSON-LD`)
  for (const block of blocks) {
    try {
      check(JSON.parse(block[1])["@context"] === "https://schema.org", `${path} JSON-LD has the schema.org @context`)
    } catch {
      check(false, `${path} JSON-LD parses`)
    }
  }
  if (path === "/") {
    check(
      blocks.some((b) => b[1].includes('"https://oxabl.org/#software"')),
      "home JSON-LD ties the docs to https://oxabl.org/#software"
    )
  }
}

const robots = await get("/robots.txt")
check(robots?.status === 200, "/robots.txt is served")
if (robots) {
  if (live) check(robots.type.startsWith("text/plain"), "/robots.txt is text/plain")
  check(robots.text.includes(`Sitemap: ${site}/sitemap-index.xml`), "robots.txt points to the sitemap")
  const searchAgents = ["*", "googlebot", "bingbot"]
  let agents = []
  let inRules = false
  for (const raw of robots.text.split(/\r?\n/)) {
    const [field, ...rest] = raw.replace(/#.*/, "").trim().split(":")
    const name = field.trim().toLowerCase()
    const value = rest.join(":").trim()
    if (name === "user-agent") {
      if (inRules) agents = []
      agents.push(value.toLowerCase())
      inRules = false
    } else if (name) {
      inRules = true
      if (name === "disallow" && agents.some((a) => searchAgents.includes(a)) && matchesRoot(value))
        check(false, "robots.txt does not disallow the whole site")
    }
  }
}

// The 404 page is served with status 200 at /404 as an asset, so it must say noindex itself.
const notFound = await get(live ? "/404" : "/404.html")
check(notFound !== null && notFound.status === 200, "the 404 page exists")
if (notFound) {
  check(
    metaContent(notFound.text, "name", "robots").some(blocksIndexing),
    "the 404 page has a noindex robots meta"
  )
}
if (live) {
  const unknown = await get(`/no-such-page-${Date.now()}/`)
  check(unknown?.status === 404, "an unknown path answers 404")
}

if (failures.length > 0) {
  console.error(
    `SEO check failed (${live ? "live" : "dist"}):\n${failures.map((f) => `  - ${f}`).join("\n")}`
  )
  process.exit(1)
}
console.log(`SEO check passed (${live ? "live" : "dist"}, ${locs.length} pages)`)
