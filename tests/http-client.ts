import http from "node:http";

/**
 * A cookie-keeping HTTP client for end-to-end tests: one instance per simulated person.
 * Every request goes to the local test server with the URL's host as the Host header, so
 * newspaper hosts (tarunbharat.localhost, ...) work without DNS.
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
    // node:http, not fetch: fetch silently replaces a custom Host header, and every
    // newspaper host must reach the local server under its own name.
    const headers: Record<string, string> = {
      ...this.defaultHeaders,
      ...init.headers,
      host: target.host,
    };
    const cookie = [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; ");
    if (cookie) headers.cookie = cookie;
    const body = init.body?.toString();
    if (init.body instanceof URLSearchParams) {
      headers["content-type"] = "application/x-www-form-urlencoded";
    }
    if (body !== undefined) headers["content-length"] = String(Buffer.byteLength(body));

    const { status, rawHeaders, text } = await new Promise<{
      status: number;
      rawHeaders: string[];
      text: string;
    }>((resolve, reject) => {
      const req = http.request(
        {
          host: "127.0.0.1",
          port: E2E_PORT,
          method,
          path: `${target.pathname}${target.search}`,
          headers,
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on("data", (c: Buffer) => chunks.push(c));
          res.on("end", () =>
            resolve({
              status: res.statusCode ?? 0,
              rawHeaders: res.rawHeaders,
              text: Buffer.concat(chunks).toString("utf8"),
            }),
          );
          res.on("error", reject);
        },
      );
      req.on("error", reject);
      if (body !== undefined) req.write(body);
      req.end();
    });

    const responseHeaders = new Headers();
    for (let i = 0; i < rawHeaders.length; i += 2) {
      responseHeaders.append(rawHeaders[i]!, rawHeaders[i + 1]!);
    }
    for (const set of responseHeaders.getSetCookie()) {
      const [pair] = set.split(";");
      const [name, ...value] = pair!.split("=");
      const v = value.join("=");
      if (/max-age=0|expires=thu, 01 jan 1970/i.test(set) || v === "")
        this.cookies.delete(name!.trim());
      else this.cookies.set(name!.trim(), v);
    }
    return {
      status,
      headers: responseHeaders,
      text,
      location: responseHeaders.get("location"),
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
