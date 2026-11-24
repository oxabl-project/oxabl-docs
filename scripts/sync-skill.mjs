// Keeps src/skill/oxabl, the copy of the oxabl agent skill that the site serves
// at /skill/, in step with oxabl.
//   node scripts/sync-skill.mjs --from <dir> [--version <x.y.z>]   copy a local skill directory
//   node scripts/sync-skill.mjs --tag oxabl-vX.Y.Z                 fetch the skill of a release tag
//   node scripts/sync-skill.mjs --latest-tag                       print the latest release tag
//   node scripts/sync-skill.mjs --check                            compare with the latest release
// --check writes nothing and exits 1 on a difference, 2 when it could not tell
// (network error, no release, missing file): an unknown answer is never a pass.
// The skill source says `oxabl-version: dev`; --tag and --check fill in the tag's version.
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { dirname, join, relative, sep } from "node:path"

const root = join(import.meta.dirname, "..")
// Overridable, like the URLs below, so a test keeps its hands off the real copy.
const dest = process.env.OXABL_SKILL_DEST ?? join(root, "src", "skill", "oxabl")
const repo = "oxabl-project/oxabl"
const skillPath = "crates/oxabl/skill"
const apiBase = process.env.OXABL_SKILL_API_URL ?? "https://api.github.com"
const rawBase = process.env.OXABL_SKILL_RAW_URL ?? "https://raw.githubusercontent.com"
const tagPattern = /^oxabl-v(\d+)\.(\d+)\.(\d+)$/
const devLine = "oxabl-version: dev"
const maxReleasePages = 10

class Fail extends Error {
  constructor(message, code = 2) {
    super(message)
    this.code = code
  }
}

function usage() {
  throw new Fail(
    "usage: sync-skill.mjs --from <dir> [--version <x.y.z>] | --tag oxabl-vX.Y.Z | --latest-tag | --check"
  )
}

function parseArgs(argv) {
  const opts = {}
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === "--check") opts.check = true
    else if (arg === "--latest-tag") opts.latestTag = true
    else if (arg === "--from" || arg === "--tag" || arg === "--version") {
      const value = argv[++i]
      if (!value || value.startsWith("--")) usage()
      opts[arg.slice(2)] = value
    } else usage()
  }
  const modes = [opts.check, opts.latestTag, opts.from, opts.tag].filter(Boolean).length
  if (modes !== 1) usage()
  if (opts.version && !opts.from) usage()
  if (opts.version && !/^\d+\.\d+\.\d+$/.test(opts.version)) {
    throw new Fail(`--version ${opts.version} is not x.y.z`)
  }
  return opts
}

async function getText(url, headers = {}) {
  let res
  try {
    res = await fetch(url, {
      signal: AbortSignal.timeout(30_000),
      headers: { "user-agent": "oxabl-docs-sync-skill", ...headers },
    })
  } catch (error) {
    throw new Fail(`cannot fetch ${url}: ${error.cause?.code ?? error.message}`)
  }
  if (!res.ok) throw new Fail(`cannot fetch ${url}: HTTP ${res.status}`)
  return res.text()
}

// A map of path inside the skill (`SKILL.md`, `references/x.md`) to its text.
function readDirectory(dir) {
  if (!existsSync(join(dir, "SKILL.md"))) throw new Fail(`${dir} has no SKILL.md`)
  const files = new Map()
  const walk = (current) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const path = join(current, entry.name)
      if (entry.isDirectory()) walk(path)
      else files.set(relative(dir, path).split(sep).join("/"), readFileSync(path, "utf8"))
    }
  }
  walk(dir)
  return files
}

function fillVersion(files, version) {
  const skill = files.get("SKILL.md")
  if (!skill.includes(devLine)) {
    throw new Fail(`SKILL.md has no "${devLine}" line to fill in`)
  }
  files.set("SKILL.md", skill.replace(devLine, `oxabl-version: ${version}`))
}

function validate(files) {
  const skill = files.get("SKILL.md") ?? ""
  const front = /^---\n([\s\S]*?)\n---\n/.exec(skill)?.[1] ?? ""
  if (!/^name: oxabl$/m.test(front)) throw new Fail("SKILL.md front matter lacks `name: oxabl`")
  if (!/^metadata:\n\s+oxabl-version: \S+$/m.test(front)) {
    throw new Fail("SKILL.md front matter lacks `metadata.oxabl-version`")
  }
}

// The newest published oxabl-vX.Y.Z release. GitHub's own "latest" release is
// whichever component released last (the VS Code extension, for one), so it is
// no help here.
async function latestTag() {
  const headers = { accept: "application/vnd.github+json" }
  if (process.env.GITHUB_TOKEN) headers.authorization = `Bearer ${process.env.GITHUB_TOKEN}`
  for (let page = 1; page <= maxReleasePages; page++) {
    const body = await getText(`${apiBase}/repos/${repo}/releases?per_page=100&page=${page}`, headers)
    let releases
    try {
      releases = JSON.parse(body)
    } catch {
      throw new Fail("the releases answer is not JSON")
    }
    if (!Array.isArray(releases)) throw new Fail("the releases answer is not a list")
    if (releases.length === 0) break
    const found = releases
      .filter((r) => !r.draft && !r.prerelease && tagPattern.test(r.tag_name ?? ""))
      .map((r) => r.tag_name)
    if (found.length > 0) {
      const key = (tag) => tagPattern.exec(tag).slice(1).map(Number)
      return found.sort((a, b) => {
        const [x, y] = [key(a), key(b)]
        return x[0] - y[0] || x[1] - y[1] || x[2] - y[2]
      })[found.length - 1]
    }
  }
  throw new Fail(`no published oxabl-vX.Y.Z release found for ${repo}`)
}

// SKILL.md and every references/*.md it links, followed through the reference files.
async function fetchSkill(tag) {
  if (!tagPattern.test(tag)) throw new Fail(`${tag} is not an oxabl-vX.Y.Z tag`)
  const files = new Map()
  const fetchFile = async (path) => {
    files.set(path, await getText(`${rawBase}/${repo}/${tag}/${skillPath}/${path}`))
  }
  await fetchFile("SKILL.md")
  const queue = ["SKILL.md"]
  while (queue.length > 0) {
    const text = files.get(queue.shift())
    for (const [path] of text.matchAll(/references\/[A-Za-z0-9._-]+\.md/g)) {
      if (files.has(path)) continue
      await fetchFile(path)
      queue.push(path)
    }
  }
  fillVersion(files, tag.slice("oxabl-v".length))
  validate(files)
  return files
}

function write(files) {
  rmSync(dest, { recursive: true, force: true })
  for (const [path, text] of files) {
    const target = join(dest, path)
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, text)
  }
}

function differences(expected, vendored) {
  const out = []
  for (const [path, text] of expected) {
    if (!vendored.has(path)) out.push(`${path}: missing from src/skill/oxabl`)
    else if (vendored.get(path) !== text) out.push(`${path}: differs from the release`)
  }
  for (const path of vendored.keys()) {
    if (!expected.has(path)) out.push(`${path}: not in the release`)
  }
  return out
}

async function main() {
  const opts = parseArgs(process.argv.slice(2))
  if (opts.from) {
    const files = readDirectory(opts.from)
    if (opts.version) fillVersion(files, opts.version)
    validate(files)
    write(files)
    console.log(`copied ${files.size} files from ${opts.from} to src/skill/oxabl`)
  } else if (opts.latestTag) {
    console.log(await latestTag())
  } else if (opts.tag) {
    const files = await fetchSkill(opts.tag)
    write(files)
    console.log(`fetched ${files.size} files of ${opts.tag} to src/skill/oxabl`)
  } else {
    const tag = await latestTag()
    const expected = await fetchSkill(tag)
    const vendored = existsSync(dest) ? readDirectory(dest) : new Map()
    const diff = differences(expected, vendored)
    if (diff.length > 0) {
      throw new Fail(
        `src/skill/oxabl is not the skill of ${tag}:\n${diff.map((d) => `  - ${d}`).join("\n")}\n` +
          `run: node scripts/sync-skill.mjs --tag ${tag}`,
        1
      )
    }
    console.log(`skill check passed: src/skill/oxabl is the skill of ${tag}`)
  }
}

main().catch((error) => {
  console.error(error instanceof Fail ? `skill: ${error.message}` : error)
  process.exit(error instanceof Fail ? error.code : 2)
})
