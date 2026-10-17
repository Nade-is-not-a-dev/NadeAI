// NadeAI Assistant — tool definitions (OpenAI function-calling format).
// Pure module: imported by the agent runner and by unit tests.

export const UI_TOOL_NAMES = new Set(["open_page", "spotlight"]);

export const ASSISTANT_TOOLS = [
  {
    type: "function",
    function: {
      name: "get_providers",
      description:
        "List configured provider connections: provider id, account label, active flag, auth type and last test status. Call this before test_provider to know which providers exist.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "test_provider",
      description:
        "Run the dashboard's connection test for the accounts of one provider (credential validity + latency, one network probe per account, max 6). Slow — prefer it when the user asks to check a specific provider.",
      parameters: {
        type: "object",
        properties: {
          provider: {
            type: "string",
            description: "Provider id or routing alias, e.g. 'anthropic', 'oc', 'gemini'.",
          },
        },
        required: ["provider"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "test_model",
      description:
        "Ping one routable model id end-to-end through the router (sends 'hi', measures latency). Returns ok/latency/error. kind defaults to 'llm'.",
      parameters: {
        type: "object",
        properties: {
          model: { type: "string", description: "Model id as a client would request it, e.g. 'oc/deepseek-v4.1-flash-free' or a masked id like 'nadeai/claude-fable-5.1'." },
          kind: { type: "string", enum: ["llm", "embedding", "image", "stt", "systemone"] },
        },
        required: ["model"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_models",
      description:
        "Search routable model ids (what clients can request) and masked models. Free-text `query` matches id and display name; `provider` filters by provider id/alias. Returns up to `limit` compact entries (default 15, max 40).",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Substring to match, e.g. 'vision', 'deepseek', 'free'." },
          provider: { type: "string", description: "Provider id or alias, e.g. 'oc'." },
          limit: { type: "number" },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_usage",
      description:
        "Usage statistics from the local usage database: total requests/tokens/cost, top providers and models, recent requests. period defaults to '7d'.",
      parameters: {
        type: "object",
        properties: {
          period: { type: "string", enum: ["today", "24h", "7d", "30d", "all"] },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_console_logs",
      description:
        "Read the server console log buffer (same as the Console Log page). Optionally filter lines by a substring such as a provider id or 'error'.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string" },
          limit: { type: "number" },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_app_status",
      description:
        "Version, build commit, uptime, port and counts (provider connections, API keys, masked models).",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "open_page",
      description:
        "Navigate the dashboard to a page. Use it whenever the answer involves something on another page.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "One of the dashboard paths from the system prompt, e.g. '/dashboard/providers'." },
        },
        required: ["path"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "spotlight",
      description:
        "Highlight one control on a dashboard page with a short note (the UI draws a spotlight). Use it for every 'where / how do I…' answer. `target` must be a target id from the system prompt; pass `path` when the control is on another page so the dashboard navigates first.",
      parameters: {
        type: "object",
        properties: {
          target: { type: "string", description: "Target id, e.g. 'providers-add-openai' or 'nadeai-add'." },
          note: { type: "string", description: "One short line shown next to the highlight, in the user's language." },
          path: { type: "string", description: "Dashboard path to open first, when the target lives on another page." },
        },
        required: ["target"],
        additionalProperties: false,
      },
    },
  },
];

export const ASSISTANT_TOOL_NAMES = ASSISTANT_TOOLS.map((t) => t.function.name);
