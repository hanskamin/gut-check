import { request as httpsRequest } from "node:https";
export const runtime = "nodejs";
export const maxDuration = 60;

const H: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
  "sec-ch-ua": '"Chromium";v="131", "Not_A Brand";v="24"',
  "sec-ch-ua-mobile": "?0",
  "sec-ch-ua-platform": '"macOS"',
  "sec-fetch-dest": "empty",
  "sec-fetch-mode": "cors",
  "sec-fetch-site": "same-origin",
  Referer: "https://www.fsis.usda.gov/recalls",
};

function probe(label: string, fn: () => Promise<unknown>) {
  return fn().then(
    (v) => ({ label, result: v }),
    (e) => ({ label, error: e instanceof Error ? e.message : String(e) }),
  );
}

export async function GET() {
  const viaNodeHttps = () =>
    new Promise((resolve, reject) => {
      const req = httpsRequest(
        "https://www.fsis.usda.gov/fsis/api/recall/v/1",
        { headers: H },
        (res) => {
          let bytes = 0;
          res.on("data", (c: Buffer) => (bytes += c.length));
          res.on("end", () => resolve({ status: res.statusCode, bytes }));
        },
      );
      req.setTimeout(30_000, () => req.destroy(new Error("timeout")));
      req.on("error", reject);
      req.end();
    });

  const viaFetch = async () => {
    const r = await fetch("https://www.fsis.usda.gov/fsis/api/recall/v/1", { headers: H });
    return { status: r.status, bytes: (await r.arrayBuffer()).byteLength };
  };

  const bareFetch = async () => {
    const r = await fetch("https://www.fsis.usda.gov/fsis/api/recall/v/1");
    return { status: r.status };
  };

  return Response.json({
    probes: await Promise.all([
      probe("node:https+headers", viaNodeHttps),
      probe("fetch+headers", viaFetch),
      probe("fetch bare", bareFetch),
    ]),
  });
}
