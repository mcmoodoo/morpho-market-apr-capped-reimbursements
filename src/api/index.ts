/**
 * Dashboard API: read-only JSON API for reports and overpayments.
 * Serves dashboard at GET / (and /dashboard/* assets).
 *
 * Endpoints:
 *   GET /health
 *   GET /markets
 *   GET /reports/latest?marketId=0x...
 *   GET /reports/:id
 *   GET /reports/:id/overpayments
 *   GET /borrowers/:address/overpayments
 *
 * Amounts are returned in micro-USDC (string) — divide by 1e6 for USDC.
 */

import { join } from "node:path";
import {
  getReportById,
  getLatestReportForMarket,
  getOverpaymentsForReport,
  getOverpaymentsByBorrower,
  getMarkets,
  type Report,
  type ReportOverpaymentRow,
  type BorrowerOverpaymentRow,
} from "../lib/refund/db.ts";

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

function reportToJson(r: Report): Record<string, unknown> {
  return {
    id: r.id,
    marketId: r.marketId,
    fromBlock: r.fromBlock,
    toBlock: r.toBlock,
    startTimestamp: r.startTimestamp,
    endTimestamp: r.endTimestamp,
    eventCount: r.eventCount,
    borrowerCount: r.borrowerCount,
    totalOverpayment: r.totalOverpayment.toString(),
    createdAt: r.createdAt,
  };
}

function overpaymentToJson(row: ReportOverpaymentRow): Record<string, unknown> {
  return {
    borrowerAddress: row.borrowerAddress,
    overpayment: row.overpayment.toString(),
  };
}

function borrowerOverpaymentToJson(row: BorrowerOverpaymentRow): Record<string, unknown> {
  return {
    reportId: row.reportId,
    marketId: row.marketId,
    createdAt: row.createdAt,
    overpayment: row.overpayment.toString(),
  };
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

  // GET /reports/latest?marketId=...
  if (pathSegments.length === 2 && pathSegments[0] === "reports" && pathSegments[1] === "latest") {
    const marketId = searchParams.get("marketId");
    if (!marketId || !marketId.trim()) {
      return errorResponse("Missing query parameter: marketId", 400);
    }
    const report = getLatestReportForMarket(marketId.trim());
    if (!report) return errorResponse("No report found for this market", 404);
    return jsonResponse(reportToJson(report));
  }

  // GET /reports/:id
  if (pathSegments.length === 2 && pathSegments[0] === "reports") {
    const id = Number(pathSegments[1]);
    if (!Number.isInteger(id) || id < 1) {
      return errorResponse("Invalid report id", 400);
    }
    const report = getReportById(id);
    if (!report) return errorResponse("Report not found", 404);
    return jsonResponse(reportToJson(report));
  }

  // GET /reports/:id/overpayments
  if (pathSegments.length === 3 && pathSegments[0] === "reports" && pathSegments[2] === "overpayments") {
    const id = Number(pathSegments[1]);
    if (!Number.isInteger(id) || id < 1) {
      return errorResponse("Invalid report id", 400);
    }
    const report = getReportById(id);
    if (!report) return errorResponse("Report not found", 404);
    const rows = getOverpaymentsForReport(id);
    return jsonResponse({ reportId: id, overpayments: rows.map(overpaymentToJson) });
  }

  // GET /borrowers/:address/overpayments
  if (pathSegments.length === 3 && pathSegments[0] === "borrowers" && pathSegments[2] === "overpayments") {
    const address = pathSegments[1];
    if (!address || !address.startsWith("0x") || address.length < 10) {
      return errorResponse("Invalid borrower address", 400);
    }
    const rows = getOverpaymentsByBorrower(address);
    return jsonResponse({ borrowerAddress: address, overpayments: rows.map(borrowerOverpaymentToJson) });
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
