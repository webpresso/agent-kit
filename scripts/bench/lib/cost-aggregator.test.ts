import { describe, expect, it } from "vitest";

import type { Usage } from "./usage-extractor";
import { aggregateCosts, costOf, loadPricing, pricingTableSchema } from "./cost-aggregator";

const PRICING = loadPricing();

describe("cost-aggregator", () => {
  it("costOf returns USD rounded to 6 decimals for hand-checked case 1", () => {
    const usage: Usage = {
      input_tokens: 1_000_000,
      output_tokens: 0,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
      duration_ms: 1,
    };

    expect(costOf(usage, PRICING, "claude-sonnet-4-5")).toBe(3);
  });

  it("costOf returns USD rounded to 6 decimals for hand-checked case 2", () => {
    const usage: Usage = {
      input_tokens: 0,
      output_tokens: 200_000,
      cache_creation_input_tokens: 100_000,
      cache_read_input_tokens: 500_000,
      duration_ms: 1,
    };

    // 0.2 * 15 + 0.1 * 3.75 + 0.5 * 0.30 = 3 + 0.375 + 0.15 = 3.525
    expect(costOf(usage, PRICING, "claude-sonnet-4-5")).toBe(3.525);
  });

  it("costOf returns USD rounded to 6 decimals for hand-checked case 3", () => {
    const usage: Usage = {
      input_tokens: 123_456,
      output_tokens: 78_900,
      cache_creation_input_tokens: 45_678,
      cache_read_input_tokens: 9_876,
      duration_ms: 1,
    };

    // 0.123456 * 3 + 0.0789 * 15 + 0.045678 * 3.75 + 0.009876 * 0.30 = 1.7281233
    expect(costOf(usage, PRICING, "claude-sonnet-4-5")).toBe(1.728123);
  });

  it("aggregateCosts returns mean, std, n, and total", () => {
    const usages: Usage[] = [
      {
        input_tokens: 1_000_000,
        output_tokens: 0,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
        duration_ms: 1,
      },
      {
        input_tokens: 2_000_000,
        output_tokens: 0,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
        duration_ms: 1,
      },
    ];

    expect(aggregateCosts(usages, PRICING, "claude-sonnet-4-5")).toStrictEqual({
      mean: 4.5,
      std: 1.5,
      n: 2,
      total: 9,
    });
  });

  it("costOf throws when the pricing table does not have the requested model", () => {
    expect(() =>
      costOf(
        {
          input_tokens: 1,
          output_tokens: 1,
          cache_creation_input_tokens: 1,
          cache_read_input_tokens: 1,
          duration_ms: 1,
        },
        PRICING,
        "missing-model",
      ),
    ).toThrowError("Missing pricing for model: missing-model");
  });

  it("pricing JSON validates against the zod schema with aliases and four prices", () => {
    const parsed = pricingTableSchema.parse(PRICING);
    const entry = parsed.entries.find((candidate) => candidate.model === "claude-sonnet-4-5");

    expect(entry).toMatchObject({
      aliases: expect.arrayContaining(["claude-sonnet-4-5", "sonnet-4.5"]),
      input_per_mtok_usd: 3,
      output_per_mtok_usd: 15,
      cache_write_per_mtok_usd: 3.75,
      cache_read_per_mtok_usd: 0.3,
    });
  });

  it("supports alternate aliases that map to the same model price row", () => {
    const usage: Usage = {
      input_tokens: 1_000_000,
      output_tokens: 0,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
      duration_ms: 1,
    };

    expect(costOf(usage, PRICING, "sonnet-4.5")).toBe(3);
  });
});
