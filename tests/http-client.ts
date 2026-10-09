/**
 * A cookie-keeping HTTP client for end-to-end tests: one instance per simulated person.
 * Requests to *.localhost hosts are sent to the test server with the right Host header, so
 * newspaper hosts work without DNS.
 */
export const E2E_PORT = Number(process.env.E2E_PORT ?? 3100);
export const PANEL_ORIGIN = `http://localhost:${E2E_PORT}`;

export function siteOrigin(tenantSlug: string): string {
  return `http://${tenantSlug}.localhost:${E2E_PORT}`;
}

export type HttpResponse = {
  status: number;
  headers: Headers;
  text: string;
  location: string | null;
  json<T = unknown>(): T;
};

export class HttpClient {
  private cookies = new Map<string, string>();

  constructor(private readonly defaultHeaders: Record<string, string> = {}) {}

  async request(
    method: string,
    url: string,
    init: { body?: string | URLSearchParams; headers?: Record<string, string> } = {},
  ): Promise<HttpResponse> {
    const target = new URL(url, PANEL_ORIGIN);
    const headers = new Headers({ ...this.defaultHeaders, ...init.headers });
    // Route every *.localhost host to the local server while keeping the Host header.
    headers.set("host", target.host);
    const cookie = [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; ");
    if (cookie) headers.set("cookie", cookie);
    if (init.body instanceof URLSearchParams) {
      headers.set("content-type", "application/x-www-form-urlencoded");
    }
    const res = await fetch(`http://127.0.0.1:${E2E_PORT}${target.pathname}${target.search}`, {
      method,
      headers,
      body: init.body?.toString(),
      redirect: "manual",
    });
    for (const set of res.headers.getSetCookie()) {
      const [pair] = set.split(";");
      const [name, ...value] = pair!.split("=");
      const v = value.join("=");
      if (/max-age=0|expires=thu, 01 jan 1970/i.test(set) || v === "")
        this.cookies.delete(name!.trim());
      else this.cookies.set(name!.trim(), v);
    }
    const text = await res.text();
    return {
      status: res.status,
      headers: res.headers,
      text,
      location: res.headers.get("location"),
      json: <T>() => JSON.parse(text) as T,
    };
  }

  get(url: string, headers?: Record<string, string>) {
    return this.request("GET", url, { headers });
  }

  post(
    url: string,
    body?: string | URLSearchParams | Record<string, string>,
    headers?: Record<string, string>,
  ) {
    const payload =
      body && typeof body === "object" && !(body instanceof URLSearchParams)
        ? new URLSearchParams(body)
        : body;
    return this.request("POST", url, { body: payload, headers });
  }

  cookie(name: string): string | undefined {
    return this.cookies.get(name);
  }
}
