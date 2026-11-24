// Black-box test of scripts/sync-skill.mjs: it runs the script against a local
// stand-in for GitHub and reads its exit code and output.
//   node --test scripts/sync-skill.test.mjs
import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { createServer } from "node:http"
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { after, before, describe, test } from "node:test"

const script = join(import.meta.dirname, "sync-skill.mjs")
const scratch = join(import.meta.dirname, "..", ".skill-test")

const skillSource = `---
name: oxabl
description: Test skill.
metadata:
  oxabl-version: dev
---

See references/commands.md.
`
const commandsSource = "# Commands\n\nSee references/more.md.\n"
const moreSource = "# More\n"

const release = (tag, extra = {}) => ({ tag_name: tag, draft: false, prerelease: false, ...extra })

let server
let base
// What the stand-in serves; each test sets what it needs.
let releases
let raw

before(async () => {
  rmSync(scratch, { recursive: true, force: true })
  mkdirSync(scratch, { recursive: true })
  server = createServer((req, res) => {
    const url = new URL(req.url, "http://localhost")
    if (url.pathname === "/repos/oxabl-project/oxabl/releases") {
      const page = Number(url.searchParams.get("page") ?? "1")
      res.setHeader("content-type", "application/json")
      res.end(JSON.stringify(page === 1 ? releases : []))
      return
    }
    const prefix = "/oxabl-project/oxabl/"
    const path = url.pathname.startsWith(prefix) ? url.pathname.slice(prefix.length) : ""
    if (path in raw) {
      res.end(raw[path])
      return
    }
    res.statusCode = 404
    res.end("not found")
  })
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve))
  base = `http://127.0.0.1:${server.address().port}`
})

after(() => {
  server.close()
  rmSync(scratch, { recursive: true, force: true })
})

function reset() {
  releases = [
    release("oxabl_vscode-v9.9.9"),
    release("oxabl-v5.10.1", { prerelease: true }),
    release("oxabl-v5.10.0"),
    release("oxabl-v5.9.0"),
    release("oxabl_workspace-v3.6.2"),
  ]
  const at = (tag) => `${tag}/crates/oxabl/skill`
  raw = {}
  for (const tag of ["oxabl-v5.10.0", "oxabl-v5.9.0"]) {
    raw[`${at(tag)}/SKILL.md`] = skillSource
    raw[`${at(tag)}/references/commands.md`] = commandsSource
    raw[`${at(tag)}/references/more.md`] = moreSource
  }
}

// The vendored copy a passing check expects: oxabl-v5.10.0 with its version filled in.
function vendor(name) {
  const dir = join(scratch, name)
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(join(dir, "references"), { recursive: true })
  writeFileSync(join(dir, "SKILL.md"), skillSource.replace("oxabl-version: dev", "oxabl-version: 5.10.0"))
  writeFileSync(join(dir, "references", "commands.md"), commandsSource)
  writeFileSync(join(dir, "references", "more.md"), moreSource)
  return dir
}

function run(args, env = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [script, ...args], {
      env: {
        ...process.env,
        OXABL_SKILL_API_URL: base,
        OXABL_SKILL_RAW_URL: base,
        ...env,
      },
    })
    let out = ""
    child.stdout.on("data", (d) => (out += d))
    child.stderr.on("data", (d) => (out += d))
    child.on("close", (code) => resolve({ code, out }))
  })
}

describe("--check", () => {
  test("passes when the vendored copy is the newest release, ignoring other components and pre-releases", async () => {
    reset()
    const dest = vendor("same")
    const { code, out } = await run(["--check"], { OXABL_SKILL_DEST: dest })
    assert.equal(code, 0, out)
    assert.match(out, /skill of oxabl-v5\.10\.0/)
  })

  test("fails and names the file when a vendored file differs", async () => {
    reset()
    const dest = vendor("changed")
    writeFileSync(join(dest, "references", "commands.md"), "# Commands\n\nedited\n")
    const { code, out } = await run(["--check"], { OXABL_SKILL_DEST: dest })
    assert.equal(code, 1, out)
    assert.match(out, /references\/commands\.md: differs from the release/)
  })

  test("fails on the version line", async () => {
    reset()
    const dest = vendor("version")
    writeFileSync(join(dest, "SKILL.md"), skillSource)
    const { code, out } = await run(["--check"], { OXABL_SKILL_DEST: dest })
    assert.equal(code, 1, out)
    assert.match(out, /SKILL\.md: differs from the release/)
  })

  test("fails on a missing and on an extra vendored file", async () => {
    reset()
    const dest = vendor("shape")
    rmSync(join(dest, "references", "more.md"))
    writeFileSync(join(dest, "references", "extra.md"), "x\n")
    const { code, out } = await run(["--check"], { OXABL_SKILL_DEST: dest })
    assert.equal(code, 1, out)
    assert.match(out, /references\/more\.md: missing/)
    assert.match(out, /references\/extra\.md: not in the release/)
  })

  test("fails when the vendored copy is absent", async () => {
    reset()
    const { code, out } = await run(["--check"], { OXABL_SKILL_DEST: join(scratch, "absent") })
    assert.equal(code, 1, out)
    assert.match(out, /SKILL\.md: missing/)
  })

  test("fails when GitHub cannot be reached", async () => {
    reset()
    const dest = vendor("offline")
    const { code, out } = await run(["--check"], {
      OXABL_SKILL_DEST: dest,
      OXABL_SKILL_API_URL: "http://127.0.0.1:1",
      OXABL_SKILL_RAW_URL: "http://127.0.0.1:1",
    })
    assert.equal(code, 2, out)
    assert.match(out, /cannot fetch/)
  })

  test("fails when a release file is missing", async () => {
    reset()
    const dest = vendor("gone")
    delete raw["oxabl-v5.10.0/crates/oxabl/skill/references/more.md"]
    const { code, out } = await run(["--check"], { OXABL_SKILL_DEST: dest })
    assert.equal(code, 2, out)
    assert.match(out, /references\/more\.md: HTTP 404/)
  })

  test("fails when no oxabl release is published", async () => {
    reset()
    releases = [release("oxabl_vscode-v9.9.9"), release("oxabl-v5.10.0", { draft: true })]
    const { code, out } = await run(["--check"], { OXABL_SKILL_DEST: vendor("none") })
    assert.equal(code, 2, out)
    assert.match(out, /no published oxabl-vX\.Y\.Z release/)
  })

  test("fails when the release has no version line to fill", async () => {
    reset()
    raw["oxabl-v5.10.0/crates/oxabl/skill/SKILL.md"] = skillSource.replace("oxabl-version: dev", "oxabl-version: 1")
    const { code, out } = await run(["--check"], { OXABL_SKILL_DEST: vendor("noline") })
    assert.equal(code, 2, out)
    assert.match(out, /no "oxabl-version: dev" line/)
  })

  test("writes nothing", async () => {
    reset()
    const dest = vendor("readonly")
    writeFileSync(join(dest, "references", "commands.md"), "edited\n")
    await run(["--check"], { OXABL_SKILL_DEST: dest })
    assert.equal(readFileSync(join(dest, "references", "commands.md"), "utf8"), "edited\n")
  })
})

describe("--tag and --from", () => {
  test("--tag fetches the files and fills in the version", async () => {
    reset()
    const dest = join(scratch, "tag")
    const { code, out } = await run(["--tag", "oxabl-v5.9.0"], { OXABL_SKILL_DEST: dest })
    assert.equal(code, 0, out)
    assert.match(readFileSync(join(dest, "SKILL.md"), "utf8"), /oxabl-version: 5\.9\.0/)
    assert.equal(readFileSync(join(dest, "references", "more.md"), "utf8"), moreSource)
  })

  test("--tag rejects a tag that is not an oxabl release", async () => {
    reset()
    const { code, out } = await run(["--tag", "oxabl_vscode-v0.11.0"], { OXABL_SKILL_DEST: join(scratch, "bad") })
    assert.equal(code, 2, out)
    assert.equal(existsSync(join(scratch, "bad")), false)
  })

  test("--tag leaves the copy alone when a file cannot be fetched", async () => {
    reset()
    const dest = vendor("keep")
    delete raw["oxabl-v5.10.0/crates/oxabl/skill/references/commands.md"]
    const { code } = await run(["--tag", "oxabl-v5.10.0"], { OXABL_SKILL_DEST: dest })
    assert.equal(code, 2)
    assert.equal(readFileSync(join(dest, "references", "more.md"), "utf8"), moreSource)
  })

  test("--from copies a directory, drops files it lacks, and fills in --version", async () => {
    const source = join(scratch, "source")
    rmSync(source, { recursive: true, force: true })
    mkdirSync(join(source, "references"), { recursive: true })
    writeFileSync(join(source, "SKILL.md"), skillSource)
    writeFileSync(join(source, "references", "commands.md"), commandsSource)
    const dest = vendor("from")
    const { code, out } = await run(["--from", source, "--version", "5.10.0"], { OXABL_SKILL_DEST: dest })
    assert.equal(code, 0, out)
    assert.match(readFileSync(join(dest, "SKILL.md"), "utf8"), /oxabl-version: 5\.10\.0/)
    assert.equal(existsSync(join(dest, "references", "more.md")), false)
  })

  test("--from refuses a directory without a valid SKILL.md", async () => {
    const source = join(scratch, "invalid")
    rmSync(source, { recursive: true, force: true })
    mkdirSync(source, { recursive: true })
    writeFileSync(join(source, "SKILL.md"), "---\nname: other\n---\n")
    const { code, out } = await run(["--from", source], { OXABL_SKILL_DEST: join(scratch, "invalid-dest") })
    assert.equal(code, 2, out)
    assert.match(out, /name: oxabl/)
  })

  test("no mode, or two modes, is a usage error", async () => {
    assert.equal((await run([])).code, 2)
    assert.equal((await run(["--check", "--tag", "oxabl-v5.9.0"])).code, 2)
  })
})
