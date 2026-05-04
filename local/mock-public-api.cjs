/**
 * Local mock of GET /public/invoice/:id and POST /public/decision for fast SPA demos (no AWS).
 * @see README-test.md
 */
"use strict";

const http = require("node:http");
const { URL } = require("node:url");

const PORT = Number(process.env.MOCK_API_PORT || 3009);

/** @type {Map<string, Record<string, unknown>>} */
const store = new Map();

function seedDemoRows() {
  store.set("demo-inv-low", {
    invoiceId: "demo-inv-low",
    reviewSessionId: "demo-session-low",
    status: "AWAITING_HUMAN",
    minConfidence: 72,
    manualVerificationRequired: true,
    taskToken: "mock-task-token-low",
    ocrSummary: JSON.stringify({
      expenseDocuments: [{ SummaryFields: [{ Type: { Text: "TOTAL" }, ValueDetection: { Text: "100.00" } }] }],
    }),
  });
  store.set("demo-inv-high", {
    invoiceId: "demo-inv-high",
    reviewSessionId: "demo-session-high",
    status: "AWAITING_HUMAN",
    minConfidence: 96,
    manualVerificationRequired: false,
    taskToken: "mock-task-token-high",
    ocrSummary: JSON.stringify({ expenseDocuments: [], note: "high confidence demo" }),
  });
}

function json(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, content-type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  });
  res.end(body);
}

seedDemoRows();

const server = http.createServer((req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "authorization, content-type",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    });
    res.end();
    return;
  }

  const url = new URL(req.url || "/", `http://127.0.0.1:${PORT}`);

  if (req.method === "GET" && url.pathname.startsWith("/public/invoice/")) {
    const invoiceId = decodeURIComponent(url.pathname.replace(/^\/public\/invoice\//, "").split("/")[0] || "");
    const session = url.searchParams.get("session");
    if (!invoiceId || !session) {
      json(res, 400, { error: "invoiceId and session are required" });
      return;
    }
    const item = store.get(invoiceId);
    if (!item) {
      json(res, 404, { error: "Not found" });
      return;
    }
    if (item.reviewSessionId !== session) {
      json(res, 403, { error: "Invalid session" });
      return;
    }
    if (item.status !== "AWAITING_HUMAN") {
      json(res, 409, { error: "Invoice is not awaiting review" });
      return;
    }
    let ocr;
    try {
      ocr = JSON.parse(String(item.ocrSummary || "{}"));
    } catch {
      ocr = item.ocrSummary;
    }
    json(res, 200, {
      invoiceId,
      minConfidence: item.minConfidence,
      status: item.status,
      manualVerificationRequired: item.manualVerificationRequired === true,
      ocrSummary: ocr,
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/public/decision") {
    let buf = "";
    req.on("data", (c) => {
      buf += c;
    });
    req.on("end", () => {
      let raw = {};
      try {
        raw = JSON.parse(buf || "{}");
      } catch {
        json(res, 400, { error: "Invalid JSON" });
        return;
      }
      const invoiceId = raw.invoiceId;
      const session = raw.session;
      const action = raw.action;
      if (!invoiceId || !session || !action) {
        json(res, 400, { error: "invoiceId, session, and action are required" });
        return;
      }
      const item = store.get(invoiceId);
      if (!item) {
        json(res, 404, { error: "Not found" });
        return;
      }
      if (item.reviewSessionId !== session) {
        json(res, 403, { error: "Invalid session" });
        return;
      }
      if (!item.taskToken) {
        json(res, 409, { error: "No pending task token" });
        return;
      }
      console.log("[mock-public-api] decision (demo only, no Step Functions)", {
        invoiceId,
        action,
        reason: raw.reason,
      });
      item.status = action === "APPROVE" ? "APPROVED_MOCK" : "REJECTED_MOCK";
      json(res, 200, { ok: true, demo: true });
    });
    return;
  }

  if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/health")) {
    res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
    res.end(
      `Mock public API — http://127.0.0.1:${PORT}/\n\n` +
        `Seeded URLs (open in browser after SPA dev server):\n` +
        `  Low confidence (editable JSON):\n` +
        `    http://localhost:5173/?invoiceId=demo-inv-low&session=demo-session-low\n` +
        `  High confidence (read-only JSON):\n` +
        `    http://localhost:5173/?invoiceId=demo-inv-high&session=demo-session-high\n\n` +
        `SPA:  cd spa && npm run dev\n` +
        `      set VITE_API_BASE_URL=http://127.0.0.1:${PORT}\n`,
    );
    return;
  }

  json(res, 404, { error: "Not found" });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`[mock-public-api] http://127.0.0.1:${PORT}/`);
});
