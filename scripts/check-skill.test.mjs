// Black-box test of scripts/check-skill.mjs on fixture skill and content
// folders: it reads the exit code and output.
//   node --test scripts/check-skill.test.mjs
import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { mkdirSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { after, before, describe, test } from "node:test"

const script = join(import.meta.dirname, "check-skill.mjs")
const scratch = join(import.meta.dirname, "..", ".skill-test-check")

const skill = (version) => `---
name: oxabl
description: Test skill.
metadata:
  oxabl-version: ${version}
---

See references/check.md.
`

before(() => {
  rmSync(scratch, { recursive: true, force: true })
  mkdirSync(scratch, { recursive: true })
})
after(() => rmSync(scratch, { recursive: true, force: true }))

// Writes a skill folder with this version and an empty content folder.
function fixture(name, version) {
  const dir = join(scratch, name)
  mkdirSync(join(dir, "skill", "references"), { recursive: true })
  mkdirSync(join(dir, "content"), { recursive: true })
  writeFileSync(join(dir, "skill", "SKILL.md"), skill(version))
  writeFileSync(join(dir, "skill", "references", "check.md"), "# Check\n")
  return dir
}

function check(dir) {
  const run = spawnSync(
    process.execPath,
    [script, "--skill", join(dir, "skill"), "--content", join(dir, "content")],
    { encoding: "utf8" }
  )
  return { code: run.status, out: run.stdout + run.stderr }
}

describe("oxabl-version", () => {
  test("a release version passes", () => {
    const { code, out } = check(fixture("release", "5.10.0"))
    assert.equal(code, 0, out)
  })

  test("`dev` fails and the output names the version", () => {
    const { code, out } = check(fixture("dev", "dev"))
    assert.equal(code, 1, out)
    assert.match(out, /oxabl-version/)
  })

  for (const version of ["5.10", "v5.10.0", "5.10.0-rc.1", "latest"]) {
    test(`${version} fails`, () => {
      const { code, out } = check(fixture(`bad-${version}`, version))
      assert.equal(code, 1, out)
    })
  }
})
