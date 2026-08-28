import test from "node:test";
import assert from "node:assert/strict";
import { observatoryData } from "../src/dashboard.js";

test("observatory filters public traffic to STORM_ALERT", async () => {
  const payloads = [
    { current_epoch: 288, next_epoch_at: "2026-08-28T12:36:57Z" },
    { intents: { STORM_ALERT: [{ miner_slug: "tempest-storm-intelligence", rank: 2, score: 0.9 }] } },
    { results: [
      { routing: { intent: "STORM_ALERT", miner_slug: "tempest-storm-intelligence" }, question: { text: "Storm?" }, execution: { result: { verdict: "low" } } },
      { routing: { intent: "CRYPTO_PRICE", miner_slug: "other" }, question: { text: "BTC?" } }
    ] }
  ];
  let index = 0;
  const fakeFetch = async () => ({ ok: true, json: async () => payloads[index++] });
  const data = await observatoryData(fakeFetch);
  assert.equal(data.traffic.length, 1);
  assert.equal(data.traffic[0].question, "Storm?");
});

