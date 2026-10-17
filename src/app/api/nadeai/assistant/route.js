import { getSettings } from "@/lib/localDb";
import { runAssistantTurn } from "@/lib/nadeai/assistant/agent.js";

export const dynamic = "force-dynamic";

const SSE_HEADERS = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
  "X-Accel-Buffering": "no",
};

function errorJson(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

// POST /api/nadeai/assistant — run one assistant turn, streamed as SSE.
// Body: { messages: [{role, content}], model?, page?: { path } }
export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return errorJson({ error: "Invalid JSON body" }, 400);
  }

  const messages = Array.isArray(body?.messages) ? body.messages : [];
  if (!messages.length) return errorJson({ error: "messages required" }, 400);

  let settings = null;
  try {
    settings = await getSettings();
  } catch {
    settings = null;
  }
  const config = settings?.nadeaiAssistant && typeof settings.nadeaiAssistant === "object" ? settings.nadeaiAssistant : {};
  const model = String(body?.model || config.model || process.env.NADEAI_ASSISTANT_MODEL || "").trim();
  if (!model) {
    return errorJson({ error: "Assistant model not set — pick one in the assistant panel.", code: "model_unset" }, 409);
  }

  const page = body?.page && typeof body.page === "object" ? { path: String(body.page.path || "") } : null;
  const systemPromptExtra = typeof config.systemPromptExtra === "string" ? config.systemPromptExtra : "";

  const encoder = new TextEncoder();
  let closed = false;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          closed = true;
        }
      };

      send({ type: "start", model, page: page?.path || null });
      try {
        for await (const event of runAssistantTurn({
          messages,
          model,
          page,
          systemPromptExtra,
          signal: request.signal,
        })) {
          send(event);
        }
      } catch (error) {
        send({ type: "error", message: String(error?.message || error) });
      } finally {
        send({ type: "end" });
        try {
          controller.close();
        } catch {
          // Already closed (client disconnected).
        }
      }
    },
    cancel() {
      closed = true;
    },
  });

  return new Response(stream, { headers: SSE_HEADERS });
}
