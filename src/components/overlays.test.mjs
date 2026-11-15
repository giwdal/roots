import test from "node:test"
import assert from "node:assert/strict"
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"

const ALLOWED = ["src/components/content-sheet.tsx"]
const BAD = [/from "@\/components\/ui\/(dialog|sheet)"/, /from "@base-ui\/react\/(dialog|drawer)"/, /url-dialog/]

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name)
    if (e.isDirectory()) return p === "src/components/ui" ? [] : walk(p)
    return /\.tsx?$/.test(e.name) ? [p] : []
  })
}

test("overlays: only bottom sheets outside the allowed exceptions", () => {
  const offenders = walk("src").filter((f) => !ALLOWED.includes(f) && BAD.some((re) => re.test(readFileSync(f, "utf8"))))
  assert.deepEqual(offenders, [], "use ContentSheet / UrlSheet, see docs/design/app.md#overlays")
})
