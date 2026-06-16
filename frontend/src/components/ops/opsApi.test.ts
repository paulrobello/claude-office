import { beforeEach, describe, expect, it, vi } from "vitest";

import { listDestinations, runDeploy } from "./opsApi";

describe("opsApi", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("listDestinations GETs the destinations endpoint", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => [{ id: "alocalizai" }] });
    vi.stubGlobal("fetch", fetchMock);
    const out = await listDestinations();
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8000/api/v1/ops/destinations",
    );
    expect(out[0].id).toBe("alocalizai");
  });

  it("runDeploy POSTs dry_run to the dest run endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 202,
      json: async () => ({ run_id: "x" }),
    });
    vi.stubGlobal("fetch", fetchMock);
    await runDeploy("alocalizai", true);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8000/api/v1/ops/alocalizai/run",
      expect.objectContaining({ method: "POST" }),
    );
  });
});
