import { getSettings, updateSettings } from "@/lib/localDb";

export const dynamic = "force-dynamic";

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function readConfig(settings) {
  const config = settings?.nadeaiAssistant;
  return config && typeof config === "object" ? config : {};
}

// GET /api/nadeai/assistant/config — current assistant settings.
export async function GET() {
  try {
    const settings = await getSettings();
    const config = readConfig(settings);
    return json({
      model: config.model || process.env.NADEAI_ASSISTANT_MODEL || "",
      systemPromptExtra: config.systemPromptExtra || "",
    });
  } catch (error) {
    return json({ error: error?.message || "Failed to load assistant config" }, 500);
  }
}

// PUT /api/nadeai/assistant/config — update model and/or extra instructions.
export async function PUT(request) {
  try {
    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: "Invalid JSON body" }, 400);
    }

    const settings = await getSettings();
    const next = { ...readConfig(settings) };

    if (Object.prototype.hasOwnProperty.call(body || {}, "model")) {
      const model = String(body.model || "").trim();
      if (model.length > 200) return json({ error: "model id too long (max 200)" }, 400);
      next.model = model;
    }
    if (Object.prototype.hasOwnProperty.call(body || {}, "systemPromptExtra")) {
      const extra = String(body.systemPromptExtra || "");
      if (extra.length > 4000) return json({ error: "systemPromptExtra too long (max 4000)" }, 400);
      next.systemPromptExtra = extra.trim();
    }

    await updateSettings({ nadeaiAssistant: next });
    return json({ ok: true, model: next.model || "", systemPromptExtra: next.systemPromptExtra || "" });
  } catch (error) {
    return json({ error: error?.message || "Failed to save assistant config" }, 500);
  }
}
