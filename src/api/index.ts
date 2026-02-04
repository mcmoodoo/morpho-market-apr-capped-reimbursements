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
import { getEvents, getMarkets } from "../lib/refund/db.ts";
import { calculateOverpayments } from "../lib/refund/calculator.ts";

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

function handleGet(pathSegments: string[], searchParams: URLSearchParams): Response {
  // GET /health
  if (pathSegments.length === 1 && pathSegments[0] === "health") {
    return jsonResponse({ status: "ok" });
  }

  // GET /markets
  if (pathSegments.length === 1 && pathSegments[0] === "markets") {
    const markets = getMarkets();
    return jsonResponse({ markets });
  }

  // GET /markets/:marketId/overpayments
  if (pathSegments.length === 3 && pathSegments[0] === "markets" && pathSegments[2] === "overpayments") {
    const marketId = pathSegments[1];
    if (!marketId) return errorResponse("Missing market id", 400);
    const timeline = getEvents(marketId.trim());
    if (timeline.length === 0) return errorResponse("No events found for this market", 404);
    const startTimestamp = Math.min(...timeline.map((e) => e.timestamp));
    const endTimestamp = Math.max(...timeline.map((e) => e.timestamp));
    const overpayments = calculateOverpayments(timeline, startTimestamp, endTimestamp);
    const entries = [...overpayments.entries()]
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
      borrowers: entries.map(([address, amount]) => ({
        borrowerAddress: address,
        overpayment: amount.toString(),
      })),
    });
  }

  // GET /borrowers/:address/overpayments
  if (pathSegments.length === 3 && pathSegments[0] === "borrowers" && pathSegments[2] === "overpayments") {
    const address = pathSegments[1];
    if (!address || !address.startsWith("0x") || address.length < 10) {
      return errorResponse("Invalid borrower address", 400);
    }
    const normalized = address.trim().toLowerCase();
    const markets = getMarkets();
    const overpayments: Array<{ marketId: string; overpayment: string }> = [];
    for (const marketId of markets) {
      const timeline = getEvents(marketId);
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

  return errorResponse("Not found", 404);
}

const server = Bun.serve({
  port: PORT,
  fetch(req) {
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
      return handleGet(segments, url.searchParams);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return errorResponse(message, 500);
    }
  },
});

console.log(`Dashboard API listening on http://localhost:${server.port}`);
