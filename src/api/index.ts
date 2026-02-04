/**
 * Dashboard API: read-only JSON API. Overpayments computed on-demand from events.
 * Serves dashboard at GET / (and /dashboard/* assets).
 *
 * Endpoints:
 *   GET /health
 *   GET /markets
 *   GET /markets/:marketId/overpayments
 *   GET /borrowers/:address/overpayments
 *
 * Amounts are returned in micro-USDC (string) — divide by 1e6 for USDC.
 */

import { join } from "node:path";
import { getEvents, getMarkets, getIndexerStatus } from "../lib/refund/db.ts";
import { calculateOverpayments, calculateOverpaymentsWithStats } from "../lib/refund/calculator.ts";
import { APR_CAP_PERCENT } from "../lib/refund/config.ts";

const PORT = Number(process.env.API_PORT ?? 3000);
const DASHBOARD_DIR = join(import.meta.dir, "../dashboard");

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}

function errorResponse(message: string, status: number): Response {
  return jsonResponse({ error: message }, status);
}

function parseIntParam(value: string | null): number | undefined {
  if (!value) return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

async function handleGet(pathSegments: string[], searchParams: URLSearchParams): Promise<Response> {
  // GET /health
  if (pathSegments.length === 1 && pathSegments[0] === "health") {
    return jsonResponse({ status: "ok" });
  }

  // GET /config (e.g. APR cap used for overpayment logic)
  if (pathSegments.length === 1 && pathSegments[0] === "config") {
    return jsonResponse({ aprCapPercent: Number(APR_CAP_PERCENT) });
  }

  // GET /status/indexer
  if (pathSegments.length === 2 && pathSegments[0] === "status" && pathSegments[1] === "indexer") {
    const status = await getIndexerStatus();
    return jsonResponse({ markets: status });
  }

  // GET /markets
  if (pathSegments.length === 1 && pathSegments[0] === "markets") {
    const markets = await getMarkets();
    return jsonResponse({ markets });
  }

  // GET /markets/:marketId
  if (pathSegments.length === 2 && pathSegments[0] === "markets") {
    const marketId = pathSegments[1];
    if (!marketId) return errorResponse("Missing market id", 400);
    const status = (await getIndexerStatus()).find((m) => m.marketId === marketId.toLowerCase());
    if (!status) return errorResponse("Market not found", 404);
    return jsonResponse(status);
  }

  // GET /markets/:marketId/overpayments[?fromTs=&toTs=]
  if (pathSegments.length === 3 && pathSegments[0] === "markets" && pathSegments[2] === "overpayments") {
    const marketId = pathSegments[1];
    if (!marketId) return errorResponse("Missing market id", 400);
    const fromTs = parseIntParam(searchParams.get("fromTimestamp"));
    const toTs = parseIntParam(searchParams.get("toTimestamp"));

    let timeline = await getEvents(marketId.trim());
    if (timeline.length === 0) return errorResponse("No events found for this market", 404);

    if (fromTs !== undefined) {
      timeline = timeline.filter((e) => e.timestamp >= fromTs);
    }
    if (toTs !== undefined) {
      timeline = timeline.filter((e) => e.timestamp <= toTs);
    }
    if (timeline.length === 0) return errorResponse("No events in requested window", 404);

    const startTimestamp = Math.min(...timeline.map((e) => e.timestamp));
    const endTimestamp = Math.max(...timeline.map((e) => e.timestamp));
    const result = calculateOverpaymentsWithStats(timeline, startTimestamp, endTimestamp);
    const entries = [...result.overpayments.entries()]
      .filter(([, amount]) => amount > 0n)
      .sort((a, b) => (a[1] > b[1] ? -1 : a[1] < b[1] ? 1 : 0));
    const totalOverpayment = entries.reduce((sum, [, amount]) => sum + amount, 0n);

    return jsonResponse({
      marketId: marketId.trim().toLowerCase(),
      startTimestamp,
      endTimestamp,
      eventCount: timeline.length,
      borrowerCount: entries.length,
      totalOverpayment: totalOverpayment.toString(),
      activeBorrowersUnderCap: result.activeBorrowersUnderCap,
      activeBorrowersAboveCap: result.activeBorrowersAboveCap,
      borrowers: entries.map(([address, amount]) => ({
        borrowerAddress: address,
        overpayment: amount.toString(),
      })),
    });
  }

  // GET /markets/:marketId/events[?type=&fromBlock=&toBlock=&limit=&offset=]
  if (pathSegments.length === 3 && pathSegments[0] === "markets" && pathSegments[2] === "events") {
    const marketId = pathSegments[1];
    if (!marketId) return errorResponse("Missing market id", 400);
    const type = searchParams.get("type");
    const fromBlockParam = parseIntParam(searchParams.get("fromBlock"));
    const toBlockParam = parseIntParam(searchParams.get("toBlock"));
    const limit = parseIntParam(searchParams.get("limit")) ?? 100;
    const offset = parseIntParam(searchParams.get("offset")) ?? 0;

    let fromBlock: bigint | undefined;
    let toBlock: bigint | undefined;
    if (fromBlockParam !== undefined) fromBlock = BigInt(fromBlockParam);
    if (toBlockParam !== undefined) toBlock = BigInt(toBlockParam);

    let events = await getEvents(marketId.trim(), fromBlock, toBlock);
    if (type) {
      events = events.filter((e) => e.type === type);
    }
    const total = events.length;
    const slice = events.slice(offset, offset + limit);

    return jsonResponse({
      marketId: marketId.trim().toLowerCase(),
      total,
      events: slice,
    });
  }

  // GET /borrowers/:address/overpayments
  if (pathSegments.length === 3 && pathSegments[0] === "borrowers" && pathSegments[2] === "overpayments") {
    const address = pathSegments[1];
    if (!address || !address.startsWith("0x") || address.length < 10) {
      return errorResponse("Invalid borrower address", 400);
    }
    const normalized = address.trim().toLowerCase();
    const fromTs = parseIntParam(searchParams.get("fromTimestamp"));
    const toTs = parseIntParam(searchParams.get("toTimestamp"));
    const marketFilter = searchParams.get("marketId")?.toLowerCase();

    const markets = (await getMarkets()).filter((m) => !marketFilter || m === marketFilter);
    const overpayments: Array<{ marketId: string; overpayment: string }> = [];
    for (const marketId of markets) {
      let timeline = await getEvents(marketId);
      if (fromTs !== undefined) {
        timeline = timeline.filter((e) => e.timestamp >= fromTs);
      }
      if (toTs !== undefined) {
        timeline = timeline.filter((e) => e.timestamp <= toTs);
      }
      if (timeline.length === 0) continue;
      const startTimestamp = Math.min(...timeline.map((e) => e.timestamp));
      const endTimestamp = Math.max(...timeline.map((e) => e.timestamp));
      const map = calculateOverpayments(timeline, startTimestamp, endTimestamp);
      const amount = map.get(normalized);
      if (amount != null && amount > 0n) {
        overpayments.push({ marketId, overpayment: amount.toString() });
      }
    }
    return jsonResponse({ borrowerAddress: address, overpayments });
  }

  // GET /borrowers/:address/events[?marketId=&type=&fromBlock=&toBlock=&limit=&offset=]
  if (pathSegments.length === 3 && pathSegments[0] === "borrowers" && pathSegments[2] === "events") {
    const address = pathSegments[1];
    if (!address || !address.startsWith("0x") || address.length < 10) {
      return errorResponse("Invalid borrower address", 400);
    }
    const normalized = address.trim().toLowerCase();
    const marketFilter = searchParams.get("marketId")?.toLowerCase();
    const type = searchParams.get("type");
    const fromBlockParam = parseIntParam(searchParams.get("fromBlock"));
    const toBlockParam = parseIntParam(searchParams.get("toBlock"));
    const limit = parseIntParam(searchParams.get("limit")) ?? 100;
    const offset = parseIntParam(searchParams.get("offset")) ?? 0;

    let fromBlock: bigint | undefined;
    let toBlock: bigint | undefined;
    if (fromBlockParam !== undefined) fromBlock = BigInt(fromBlockParam);
    if (toBlockParam !== undefined) toBlock = BigInt(toBlockParam);

    const markets = (await getMarkets()).filter((m) => !marketFilter || m === marketFilter);
    const all: unknown[] = [];
    for (const marketId of markets) {
      let events = (await getEvents(marketId, fromBlock, toBlock)).filter(
        (e) =>
          ("borrower" in e ? (e as any).borrower?.toLowerCase() === normalized : false) &&
          (!type || e.type === type)
      );
      for (const e of events) {
        all.push({ marketId, event: e });
      }
    }
    const total = all.length;
    const slice = all.slice(offset, offset + limit);
    return jsonResponse({ borrowerAddress: address, total, events: slice });
  }

  // GET /analytics/top-borrowers?marketId=...&fromTimestamp=&toTimestamp=&limit=
  if (pathSegments.length === 2 && pathSegments[0] === "analytics" && pathSegments[1] === "top-borrowers") {
    const marketId = searchParams.get("marketId");
    if (!marketId) return errorResponse("Missing marketId", 400);
    const fromTs = parseIntParam(searchParams.get("fromTimestamp"));
    const toTs = parseIntParam(searchParams.get("toTimestamp"));
    const limit = parseIntParam(searchParams.get("limit")) ?? 50;

    let timeline = await getEvents(marketId.trim());
    if (fromTs !== undefined) {
      timeline = timeline.filter((e) => e.timestamp >= fromTs);
    }
    if (toTs !== undefined) {
      timeline = timeline.filter((e) => e.timestamp <= toTs);
    }
    if (timeline.length === 0) return errorResponse("No events for this market/window", 404);

    const startTimestamp = Math.min(...timeline.map((e) => e.timestamp));
    const endTimestamp = Math.max(...timeline.map((e) => e.timestamp));
    const overpayments = calculateOverpayments(timeline, startTimestamp, endTimestamp);
    const entries = [...overpayments.entries()]
      .filter(([, amount]) => amount > 0n)
      .sort((a, b) => (a[1] > b[1] ? -1 : a[1] < b[1] ? 1 : 0))
      .slice(0, limit);

    return jsonResponse({
      marketId: marketId.trim().toLowerCase(),
      fromTimestamp: fromTs ?? startTimestamp,
      toTimestamp: toTs ?? endTimestamp,
      borrowers: entries.map(([address, amount]) => ({
        borrowerAddress: address,
        overpayment: amount.toString(),
      })),
    });
  }

  // GET /analytics/market-summary?fromTimestamp=&toTimestamp=
  if (pathSegments.length === 2 && pathSegments[0] === "analytics" && pathSegments[1] === "market-summary") {
    const fromTs = parseIntParam(searchParams.get("fromTimestamp"));
    const toTs = parseIntParam(searchParams.get("toTimestamp"));
    const markets = await getMarkets();
    const summary: Array<{
      marketId: string;
      eventCount: number;
      borrowerCount: number;
      totalOverpayment: string;
      activeBorrowersUnderCap: number;
      activeBorrowersAboveCap: number;
      startTimestamp: number | null;
      endTimestamp: number | null;
    }> = [];

    for (const marketId of markets) {
      let timeline = await getEvents(marketId);
      if (fromTs !== undefined) {
        timeline = timeline.filter((e) => e.timestamp >= fromTs);
      }
      if (toTs !== undefined) {
        timeline = timeline.filter((e) => e.timestamp <= toTs);
      }
      if (timeline.length === 0) {
        summary.push({
          marketId,
          eventCount: 0,
          borrowerCount: 0,
          totalOverpayment: "0",
          activeBorrowersUnderCap: 0,
          activeBorrowersAboveCap: 0,
          startTimestamp: null,
          endTimestamp: null,
        });
        continue;
      }
      const startTimestamp = Math.min(...timeline.map((e) => e.timestamp));
      const endTimestamp = Math.max(...timeline.map((e) => e.timestamp));
      const result = calculateOverpaymentsWithStats(timeline, startTimestamp, endTimestamp);
      const entries = [...result.overpayments.entries()].filter(([, amount]) => amount > 0n);
      const totalOverpayment = entries.reduce((sum, [, amount]) => sum + amount, 0n);
      summary.push({
        marketId,
        eventCount: timeline.length,
        borrowerCount: entries.length,
        totalOverpayment: totalOverpayment.toString(),
        activeBorrowersUnderCap: result.activeBorrowersUnderCap,
        activeBorrowersAboveCap: result.activeBorrowersAboveCap,
        startTimestamp,
        endTimestamp,
      });
    }

    return jsonResponse({ markets: summary });
  }

  return errorResponse("Not found", 404);
}

const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    if (req.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      });
    }
    if (req.method !== "GET") {
      return errorResponse("Method not allowed", 405);
    }
    const url = new URL(req.url);
    const pathname = url.pathname.replace(/\/$/, "") || "/";
    const segments = pathname.replace(/^\/+|\/+$/g, "").split("/");

    // Dashboard: GET / or GET /dashboard -> index.html
    const isRoot = segments.length === 0 || (segments.length === 1 && (segments[0] === "" || segments[0] === "dashboard"));
    if (isRoot) {
      const file = Bun.file(join(DASHBOARD_DIR, "index.html"));
      return new Response(file, {
        headers: { "Content-Type": "text/html" },
      });
    }
    // Dashboard assets: GET /dashboard/dist/main.js, GET /dashboard/styles.css
    if (segments[0] === "dashboard") {
      if (segments[1] === "dist" && segments[2] === "main.js") {
        const file = Bun.file(join(DASHBOARD_DIR, "dist", "main.js"));
        return new Response(file, { headers: { "Content-Type": "application/javascript" } });
      }
      if (segments[1] === "styles.css") {
        const file = Bun.file(join(DASHBOARD_DIR, "styles.css"));
        return new Response(file, { headers: { "Content-Type": "text/css" } });
      }
    }

    try {
      return await handleGet(segments, url.searchParams);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return errorResponse(message, 500);
    }
  },
});

console.log(`Dashboard API listening on http://localhost:${server.port}`);
