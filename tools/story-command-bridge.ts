import http from "node:http";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { ROOT } from "./spec_story_lib.ts";

const DEFAULT_PORT = 4311;

type ActionName =
  | "refresh_next"
  | "approve_preview"
  | "approve_apply"
  | "promote_story_preview"
  | "promote_story_apply"
  | "start_story"
  | "request_review"
  | "changes_requested"
  | "complete_story"
  | "block_story"
  | "unblock_story"
  | "draft_bridge_preview"
  | "draft_bridge_write";

interface ActionRequest {
  action: ActionName;
  storyId?: string;
  auditPath?: string;
  candidateIndex?: number;
}

interface ActionResponse {
  ok: boolean;
  action?: ActionName;
  summary?: string;
  result?: unknown;
  error?: string;
}

function npmCommand(): string {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

function sendJson(
  res: http.ServerResponse,
  statusCode: number,
  payload: unknown
): void {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  });
  res.end(`${JSON.stringify(payload, null, 2)}\n`);
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function runNpmJson(script: string, args: string[] = []): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      npmCommand(),
      ["run", "--silent", script, ...(args.length > 0 ? ["--", ...args] : [])],
      {
        cwd: ROOT,
        env: process.env,
        stdio: ["ignore", "pipe", "pipe"]
      }
    );

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(
          new Error(stderr.trim() || `Command failed with exit code ${code}`)
        );
        return;
      }
      try {
        resolve(JSON.parse(stdout));
      } catch (error) {
        reject(
          new Error(`Expected JSON output, got:\n${stdout}\n${String(error)}`)
        );
      }
    });
  });
}

function runNpmText(script: string, args: string[] = []): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      npmCommand(),
      ["run", "--silent", script, ...(args.length > 0 ? ["--", ...args] : [])],
      {
        cwd: ROOT,
        env: process.env,
        stdio: ["ignore", "pipe", "pipe"]
      }
    );

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(
          new Error(stderr.trim() || `Command failed with exit code ${code}`)
        );
        return;
      }
      resolve(stdout);
    });
  });
}

async function rebuildReport(): Promise<void> {
  await runNpmText("stories:review-report");
}

async function runAction(request: ActionRequest): Promise<ActionResponse> {
  switch (request.action) {
    case "refresh_next": {
      const result = await runNpmJson("stories:next", ["--json"]);
      await rebuildReport();
      const typed = result as { plan?: { summary?: { selected?: number } } };
      return {
        ok: true,
        action: request.action,
        summary: `Review and tranche refreshed. Selected ${typed.plan?.summary?.selected ?? 0} stories.`,
        result
      };
    }
    case "approve_preview": {
      const result = await runNpmJson("stories:approve", ["--json"]);
      const typed = result as { promote?: { promotable?: unknown[] } };
      return {
        ok: true,
        action: request.action,
        summary: `Tranche preview ready. ${typed.promote?.promotable?.length ?? 0} stories are promotable.`,
        result
      };
    }
    case "approve_apply": {
      const result = await runNpmJson("stories:approve", ["--json", "--apply"]);
      await rebuildReport();
      const typed = result as { promote?: { promoted?: unknown[] } };
      return {
        ok: true,
        action: request.action,
        summary: `Promoted ${typed.promote?.promoted?.length ?? 0} stories from the current tranche.`,
        result
      };
    }
    case "promote_story_preview": {
      if (!request.storyId) {
        throw new Error("promote_story_preview requires storyId.");
      }
      const result = await runNpmJson("stories:approve", [
        "--json",
        "--ids",
        request.storyId
      ]);
      return {
        ok: true,
        action: request.action,
        summary: `Preview ready for ${request.storyId}.`,
        result
      };
    }
    case "promote_story_apply": {
      if (!request.storyId) {
        throw new Error("promote_story_apply requires storyId.");
      }
      const result = await runNpmJson("stories:approve", [
        "--json",
        "--ids",
        request.storyId,
        "--apply"
      ]);
      await rebuildReport();
      return {
        ok: true,
        action: request.action,
        summary: `Promoted ${request.storyId} to approved.`,
        result
      };
    }
    case "start_story": {
      if (!request.storyId) {
        throw new Error("start_story requires storyId.");
      }
      const result = await runNpmJson("stories:start", [
        "--json",
        "--id",
        request.storyId
      ]);
      await rebuildReport();
      return {
        ok: true,
        action: request.action,
        summary: `Started ${request.storyId}.`,
        result
      };
    }
    case "request_review": {
      if (!request.storyId) {
        throw new Error("request_review requires storyId.");
      }
      const result = await runNpmJson("stories:request-review", [
        "--json",
        "--id",
        request.storyId
      ]);
      await rebuildReport();
      return {
        ok: true,
        action: request.action,
        summary: `${request.storyId} moved to in_review.`,
        result
      };
    }
    case "changes_requested": {
      if (!request.storyId) {
        throw new Error("changes_requested requires storyId.");
      }
      const result = await runNpmJson("stories:changes-requested", [
        "--json",
        "--id",
        request.storyId
      ]);
      await rebuildReport();
      return {
        ok: true,
        action: request.action,
        summary: `${request.storyId} moved to changes_requested.`,
        result
      };
    }
    case "complete_story": {
      if (!request.storyId) {
        throw new Error("complete_story requires storyId.");
      }
      const result = await runNpmJson("stories:complete", [
        "--json",
        "--id",
        request.storyId
      ]);
      await rebuildReport();
      return {
        ok: true,
        action: request.action,
        summary: `Completed ${request.storyId}.`,
        result
      };
    }
    case "block_story": {
      if (!request.storyId) {
        throw new Error("block_story requires storyId.");
      }
      const result = await runNpmJson("stories:block", [
        "--json",
        "--id",
        request.storyId
      ]);
      await rebuildReport();
      return {
        ok: true,
        action: request.action,
        summary: `Blocked ${request.storyId}.`,
        result
      };
    }
    case "unblock_story": {
      if (!request.storyId) {
        throw new Error("unblock_story requires storyId.");
      }
      const result = await runNpmJson("stories:unblock", [
        "--json",
        "--id",
        request.storyId
      ]);
      await rebuildReport();
      return {
        ok: true,
        action: request.action,
        summary: `Unblocked ${request.storyId}.`,
        result
      };
    }
    case "draft_bridge_preview": {
      if (!request.auditPath || typeof request.candidateIndex !== "number") {
        throw new Error(
          "draft_bridge_preview requires auditPath and candidateIndex."
        );
      }
      const result = await runNpmJson("stories:bridge:llm", [
        "--from-audit",
        request.auditPath,
        "--candidate-index",
        String(request.candidateIndex)
      ]);
      const typed = result as { story?: { id?: string; title?: string } };
      return {
        ok: true,
        action: request.action,
        summary: `Drafted preview ${typed.story?.id ?? "story"}${typed.story?.title ? `: ${typed.story.title}` : ""}.`,
        result
      };
    }
    case "draft_bridge_write": {
      if (!request.auditPath || typeof request.candidateIndex !== "number") {
        throw new Error(
          "draft_bridge_write requires auditPath and candidateIndex."
        );
      }
      const result = await runNpmJson("stories:bridge:llm", [
        "--from-audit",
        request.auditPath,
        "--candidate-index",
        String(request.candidateIndex),
        "--write"
      ]);
      await rebuildReport();
      const typed = result as { story?: { id?: string; title?: string } };
      return {
        ok: true,
        action: request.action,
        summary: `Saved bridge draft ${typed.story?.id ?? "story"}${typed.story?.title ? `: ${typed.story.title}` : ""}.`,
        result
      };
    }
    default:
      throw new Error(
        `Unsupported action: ${String((request as ActionRequest).action)}`
      );
  }
}

async function handleRun(
  req: http.IncomingMessage,
  res: http.ServerResponse
): Promise<void> {
  const raw = await readBody(req);
  const payload = JSON.parse(raw || "{}") as Partial<ActionRequest>;
  if (!payload.action) {
    sendJson(res, 400, { ok: false, error: "Missing action." });
    return;
  }
  try {
    const response = await runAction(payload as ActionRequest);
    sendJson(res, 200, response);
  } catch (error) {
    sendJson(res, 500, {
      ok: false,
      action: payload.action,
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

async function main(): Promise<void> {
  const port =
    Number.parseInt(process.env.STORY_COMMAND_BRIDGE_PORT ?? "", 10) ||
    DEFAULT_PORT;
  const server = http.createServer(async (req, res) => {
    try {
      if (req.method === "OPTIONS") {
        sendJson(res, 204, {});
        return;
      }
      if (req.method === "GET" && req.url === "/health") {
        sendJson(res, 200, { ok: true, port, root: ROOT });
        return;
      }
      if (req.method === "POST" && req.url === "/run") {
        await handleRun(req, res);
        return;
      }
      sendJson(res, 404, { ok: false, error: "Not found." });
    } catch (error) {
      sendJson(res, 500, {
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  server.listen(port, "127.0.0.1", () => {
    process.stdout.write(
      `Story command bridge listening on http://127.0.0.1:${port}\n`
    );
  });
}

const entrypoint = process.argv[1];
if (entrypoint && fileURLToPath(import.meta.url) === entrypoint) {
  void main();
}
