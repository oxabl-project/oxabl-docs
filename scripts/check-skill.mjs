// Offline consistency check of the vendored skill in src/skill/oxabl and of the
// docs pages that mention it. Needs no network and no oxabl release.
//   node scripts/check-skill.mjs [--skill <dir>] [--content <dir>]
import { existsSync, readdirSync, readFileSync } from "node:fs"
import { join, relative, sep } from "node:path"

const root = join(import.meta.dirname, "..")
const args = process.argv.slice(2)
const option = (name, fallback) => {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : fallback
}
const skillDir = option("--skill", join(root, "src", "skill", "oxabl"))
const contentDir = option("--content", join(root, "src", "content"))

const problems = []
const refPattern = /references\/[A-Za-z0-9._-]+\.md/g

function walk(dir, keep) {
  const out = []
  if (!existsSync(dir)) return out
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...walk(path, keep))
    else if (keep(entry.name)) out.push(path)
  }
  return out
}

const files = new Set(
  walk(skillDir, () => true).map((p) => relative(skillDir, p).split(sep).join("/"))
)

if (!files.has("SKILL.md")) {
  problems.push("SKILL.md is missing")
} else {
  const skill = readFileSync(join(skillDir, "SKILL.md"), "utf8")
  const front = /^---\n([\s\S]*?)\n---\n/.exec(skill)?.[1]
  if (front === undefined) problems.push("SKILL.md has no front matter")
  else {
    if (!/^name: oxabl$/m.test(front)) problems.push("SKILL.md front matter lacks `name: oxabl`")
    const description = /^description: (.+)$/m.exec(front)?.[1]
    if (!description) problems.push("SKILL.md front matter lacks `description`")
    else if (description.length > 1024) problems.push("SKILL.md description is over 1024 characters")
    if (!/^metadata:\n\s+oxabl-version: \S+$/m.test(front)) {
      problems.push("SKILL.md front matter lacks `metadata.oxabl-version`")
    }
  }
}

const references = [...files].filter((f) => f.startsWith("references/"))
if (references.length > 4) problems.push(`${references.length} reference files, at most 4 allowed`)

// Every file a skill file links must exist.
for (const file of files) {
  if (!file.endsWith(".md")) continue
  const text = readFileSync(join(skillDir, file), "utf8")
  for (const [ref] of text.matchAll(refPattern)) {
    if (!files.has(ref)) problems.push(`${file} links ${ref}, which does not exist`)
  }
}

// Every skill path or reference name a docs page mentions must exist.
const pages = walk(contentDir, (n) => /\.mdx?$/.test(n))
for (const page of pages) {
  const name = relative(contentDir, page).split(sep).join("/")
  const text = readFileSync(page, "utf8")
  for (const [ref] of text.matchAll(refPattern)) {
    if (!files.has(ref)) problems.push(`${name} names ${ref}, which is not in the skill`)
  }
  for (const m of text.matchAll(/\/skill\/([A-Za-z0-9._/-]+)/g)) {
    const path = m[1].replace(/[.,;:]+$/, "")
    if (path.includes("$")) continue
    const folder = path.endsWith("/") ? path : null
    if (folder ? ![...files].some((f) => f.startsWith(folder)) : !files.has(path)) problems.push(`${name} names /skill/${path}, which is not in the skill`)
  }
}

if (problems.length > 0) {
  console.error(`skill check failed:\n${problems.map((p) => `  - ${p}`).join("\n")}`)
  process.exit(1)
}
console.log(`skill check passed: ${files.size} files, ${pages.length} pages`)
