import test from "node:test"
import assert from "node:assert/strict"
import { GraphInput } from "./graph.ts"

test("GraphInput accepts a graph without positions and fills them", () => {
  const r = GraphInput.safeParse({ nodes: [{ id: "trigger", type: "trigger", data: { event: "" } }], edges: [] })
  assert.ok(r.success)
  assert.equal(typeof r.data.nodes[0].position.x, "number")
})
