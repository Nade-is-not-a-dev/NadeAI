/**
 * OpenCode2API — OpenCode free/paid models through a self-hosted opencode2api
 * gateway (https://github.com/jasonxu114514/opencode2api).
 *
 * Why a separate provider instead of reusing `opencode` / `opencode-zen`:
 * those talk to opencode.ai directly and must reproduce the v2 client
 * fingerprint (session headers + `read`/`shell` tool declarations). That
 * fingerprint is enforced per source IP — the same code answers 200 from a
 * residential egress and 403 FreeTierError from a datacentre one. The gateway
 * is OpenAI-compatible and already performs that handshake upstream, so a
 * connection pointing at it needs no cloaking here at all: plain
 * `Authorization: Bearer <server_key>` and a normal request body.
 *
 * baseUrl is a connection-level field (providerSpecificData.baseUrl), so the
 * same registry entry serves a gateway on localhost, on the LAN, or on a
 * remote host. transport.baseUrl below is only the fallback used when a
 * connection leaves it empty.
 */

export default {
  id: "opencode2api",
  priority: 46,
  hasFree: true,
  alias: "o2a",
  aliases: ["opencode-2api", "oc2a"],
  uiAlias: "o2a",
  display: {
    name: "OpenCode2API",
    icon: "hub",
    color: "#E87040",
    textIcon: "O2",
    website: "https://github.com/jasonxu114514/opencode2api",
    notice: {
      text: "Self-hosted opencode2api gateway. Point the connection's Base URL at the gateway (default http://127.0.0.1:5678) and paste one of its server_keys as the API key. The gateway handles OpenCode's client fingerprint, so no cloaking is needed here.",
    },
  },
  category: "apikey",
  authType: "apikey",
  transport: {
    baseUrl: "http://127.0.0.1:5678/v1/chat/completions",
    format: "openai",
    validateUrl: "http://127.0.0.1:5678/v1/models",
    // No modelsFetcher on purpose: its url is fixed at registry time while this
    // provider's host is chosen per connection, so a fetcher would always probe
    // the wrong gateway. The curated list below is the model source instead.
  },
  // Verified working against a live gateway on 2026-10-17. Models the gateway
  // filters out (protocol it does not expose) and paid ids the anonymous lane
  // rejects are deliberately absent — an explicit list beats a stale fetch.
  models: [
    { id: "space-bunny-free", name: "Space Bunny Free" },
    { id: "deepseek-v4.1-flash-free", name: "DeepSeek V4.1 Flash Free" },
    { id: "beam-free", name: "Beam Free" },
    { id: "longcat-2.5-preview-free", name: "LongCat 2.5 Preview Free" },
    { id: "mimo-v2.6-flash-free", name: "MiMo v2.6 Flash Free" },
    { id: "big-pickle", name: "Big Pickle" },
    { id: "glm-5.3-flash-free", name: "GLM 5.3 Flash Free" },
    { id: "nemotron-3.5-lightning-free", name: "Nemotron 3.5 Lightning Free" },
    { id: "nemotron-3.5-super-vl-free", name: "Nemotron 3.5 Super VL Free" },
  ],
  serviceKinds: ["llm"],
};
