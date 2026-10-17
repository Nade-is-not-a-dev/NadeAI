import {
  deleteModelAlias,
  getModelAliases,
  getSettings,
  setModelAlias,
  updateSettings,
} from "@/lib/localDb";
import { mergeMaskedModels, splitModelId } from "@/shared/utils/nadeaiModels";

export const dynamic = "force-dynamic";

// Plain web Response (not NextResponse) keeps these handlers importable in
// unit tests without pulling the Next.js runtime into the module graph.

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function promptMapFrom(settings) {
  const models = settings?.systemPrompts?.models;
  return models && typeof models === "object" ? models : {};
}

async function savePrompts(prompts) {
  const settings = await getSettings();
  const sp = settings?.systemPrompts || {};
  await updateSettings({ systemPrompts: { ...sp, models: prompts } });
}

// GET /api/nadeai/models — masked models = slashed aliases + their prompts.
export async function GET() {
  try {
    const [aliases, settings] = await Promise.all([getModelAliases(), getSettings()]);
    return json({
      models: mergeMaskedModels(aliases, promptMapFrom(settings)),
      promptsEnabled: settings?.systemPrompts?.enabled === true,
    });
  } catch (error) {
    return json({ error: error?.message || "Failed to load masked models" }, 500);
  }
}

// PUT /api/nadeai/models — create, edit or rename one masked model.
export async function PUT(request) {
  try {
    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: "Invalid JSON body" }, 400);
    }

    const fakeId = String(body?.fakeId || "").trim();
    const realId = String(body?.realId || "").trim();
    const previousFakeId = String(body?.previousFakeId || "").trim();
    const systemPrompt = typeof body?.systemPrompt === "string" ? body.systemPrompt.trim() : "";

    if (!splitModelId(fakeId)) {
      return json({ error: 'Public id must read "provider/model" (e.g. nadeai/claude-fable-5.1).' }, 400);
    }
    if (!splitModelId(realId)) {
      return json({ error: 'Real target must read "provider/model" (e.g. oc/deepseek-v4.1-flash-free).' }, 400);
    }
    if (fakeId === realId) {
      return json({ error: "Public id and real target must differ." }, 400);
    }

    const [aliases, settings] = await Promise.all([getModelAliases(), getSettings()]);
    if (fakeId !== previousFakeId && aliases[fakeId]) {
      return json({ error: `Public id "${fakeId}" is already used by another entry.` }, 409);
    }

    if (previousFakeId && previousFakeId !== fakeId) {
      await deleteModelAlias(previousFakeId);
    }
    await setModelAlias(fakeId, realId);

    const currentPrompts = promptMapFrom(settings);
    const nextPrompts = { ...currentPrompts };
    if (systemPrompt) nextPrompts[fakeId] = systemPrompt;
    else delete nextPrompts[fakeId];
    if (previousFakeId && previousFakeId !== fakeId) delete nextPrompts[previousFakeId];

    if (JSON.stringify(nextPrompts) !== JSON.stringify(currentPrompts)) {
      await savePrompts(nextPrompts);
    }

    const pub = splitModelId(fakeId);
    const real = splitModelId(realId);
    return json({
      ok: true,
      model: {
        id: fakeId,
        provider: pub.provider,
        model: pub.model,
        realProvider: real.provider,
        realModel: real.model,
        realId,
        systemPrompt,
      },
      promptsEnabled: settings?.systemPrompts?.enabled === true,
    });
  } catch (error) {
    return json({ error: error?.message || "Failed to save masked model" }, 500);
  }
}

// DELETE /api/nadeai/models?fakeId=a/b — drop the alias and its prompt.
export async function DELETE(request) {
  try {
    const fakeId = String(new URL(request.url).searchParams.get("fakeId") || "").trim();
    if (!splitModelId(fakeId)) {
      return json({ error: "fakeId query param required (provider/model)." }, 400);
    }
    await deleteModelAlias(fakeId);

    const settings = await getSettings();
    const currentPrompts = promptMapFrom(settings);
    if (fakeId in currentPrompts) {
      const nextPrompts = { ...currentPrompts };
      delete nextPrompts[fakeId];
      await savePrompts(nextPrompts);
    }
    return json({ ok: true });
  } catch (error) {
    return json({ error: error?.message || "Failed to delete masked model" }, 500);
  }
}
