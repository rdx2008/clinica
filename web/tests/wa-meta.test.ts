import { test } from "node:test";
import assert from "node:assert/strict";
import { mapMetaStatus } from "../src/lib/wa-meta.ts";

test("status de modelo da Meta vira status local", () => {
  assert.equal(mapMetaStatus("APPROVED"), "APROVADO");
  assert.equal(mapMetaStatus("REJECTED"), "REJEITADO");
  assert.equal(mapMetaStatus("PAUSED"), "REJEITADO");
  assert.equal(mapMetaStatus("PENDING"), "PENDENTE");
  assert.equal(mapMetaStatus("IN_APPEAL"), "PENDENTE");
});
