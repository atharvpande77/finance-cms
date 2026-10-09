import { describe, expect, it } from "vitest";
import { HttpClient } from "../http-client";
import { E2E_CRON_SECRET } from "./global-setup";

describe("scheduled job endpoint", () => {
  const http = new HttpClient();

  it("[E2E-UI-29] cron endpoint rejects callers without the secret", async () => {
    expect((await http.post("/api/cron/deemed")).status).toBe(401);
    expect(
      (await http.post("/api/cron/deemed", undefined, { authorization: "Bearer wrong" })).status,
    ).toBe(401);
  });

  it("[E2E-UI-30] cron endpoint runs with the secret", async () => {
    const res = await http.post("/api/cron/deemed", undefined, {
      authorization: `Bearer ${E2E_CRON_SECRET}`,
    });
    expect(res.status).toBe(200);
    expect(res.json()).toMatchObject({
      published: expect.any(Number),
      purgedLeads: expect.any(Number),
      prunedViews: expect.any(Number),
      mail: { sent: 0, failed: 0 },
    });
  });
});
