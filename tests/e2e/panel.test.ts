import { describe, expect, it } from "vitest";
import { pageText } from "../http-client";
import { DEMO_PASSWORD, demoEmail, menuLinks, person, signInFully } from "./auth-helpers";

describe("panel shell", () => {
  it("sends anyone without a session to sign-in", async () => {
    const visitor = person();
    for (const path of ["/dashboard", "/articles", "/finance", "/"]) {
      const res = await visitor.get(path);
      expect(res.location, path).toMatch(/\/(login|dashboard)$/);
    }
    expect((await visitor.get("/dashboard")).location).toBe("/login");
  });

  it("shows each role its own menu and refuses other areas", async () => {
    const cases: Array<{ name: string; menu: string[]; refused: string[] }> = [
      { name: "writer.amc", menu: ["/dashboard", "/articles"], refused: ["/leads", "/publisher"] },
      {
        name: "admin.amc",
        menu: ["/dashboard", "/articles", "/leads", "/calculators", "/reports", "/users"],
        refused: ["/finance", "/widgets"],
      },
      { name: "editor.tb", menu: ["/dashboard", "/publisher"], refused: ["/articles", "/reports"] },
      {
        name: "super.abc",
        menu: [
          "/dashboard",
          "/articles",
          "/calculators",
          "/reports",
          "/finance",
          "/widgets",
          "/ads",
          "/users",
        ],
        refused: ["/leads", "/publisher"],
      },
    ];
    for (const c of cases) {
      const client = await signInFully(c.name);
      const dashboard = await client.get("/dashboard");
      expect(menuLinks(dashboard), c.name).toEqual(c.menu);
      for (const path of c.menu.slice(1)) {
        const res = await client.get(path);
        expect(res.status, `${c.name} ${path}`).toBe(200);
        // Areas not built yet are guarded placeholders.
        if (path !== "/articles") expect(res.text).toContain("data-area-stub");
      }
      for (const path of c.refused) {
        const res = await client.get(path);
        expect(res.status, `${c.name} ${path}`).toBe(403);
        expect(pageText(res.text)).toContain("isn't part of your roles");
      }
    }
  });

  it("refuses a form post from another origin", async () => {
    const client = person();
    const res = await client.submitForm(
      "/login",
      "login",
      { email: demoEmail("writer.b"), password: DEMO_PASSWORD },
      { origin: "https://evil.example" },
    );
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.location).toBeNull();
    expect(client.cookie("abc_session")).toBeUndefined();
  });

  it("serves the panel only on the panel host", async () => {
    const res = await person().get("http://tarunbharat.localhost:3100/login");
    expect(res.status).toBe(404);
  });
});
