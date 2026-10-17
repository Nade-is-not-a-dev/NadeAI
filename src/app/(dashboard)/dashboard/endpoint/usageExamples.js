// Usage-example generator for the dashboard Endpoint page ("Usage Examples").
//
// Pure functions: build a copy-paste-ready snippet for the chosen language and
// target OS. The API key and endpoint are filled in by the caller; the model
// and message come from the form (a placeholder is used when a field is
// empty so the snippet stays syntactically valid).
//
// OS adjustments: cURL is genuinely different per OS — cmd.exe gets caret
// continuations and MSVC-quoted JSON; PowerShell gets an Invoke-RestMethod
// variant side-stepping the native-argument quoting that can mangle inline
// JSON; Python differs in the install/run hint lines; the remaining languages
// are OS-invariant.

export const USAGE_LANGUAGES = [
  { id: "curl", label: "cURL" },
  { id: "node", label: "Node.js" },
  { id: "python", label: "Python" },
  { id: "php", label: "PHP" },
  { id: "go", label: "Go" },
];

export const USAGE_OS = [
  { id: "unix", label: "Linux / macOS" },
  { id: "windows", label: "Windows (cmd)" },
  { id: "windows-ps", label: "Windows (PowerShell)" },
];

export const USAGE_DEFAULT_MESSAGE = "Hello! Reply in one short sentence.";

const DEFAULT_KEY = "YOUR_API_KEY";
const DEFAULT_MODEL = "your-model-id";

const trimTrailing = (baseUrl) => String(baseUrl || "http://localhost:3499/v1").replace(/\/+$/, "");

// POSIX shell single-quoted literal: close quote, escaped quote, reopen.
const shSingle = (s) => "'" + String(s).replace(/'/g, "'\\''") + "'";
// Windows command-line literal (MSVC/CRT rules): wrap in quotes and double
// every backslash run that sits before an embedded quote or the closing quote
// (2n/comma rules), so the target receives the exact bytes. Backslashes not
// touching a quote stay single.
const winQuote = (s) => {
  const text = String(s);
  let out = "\"";
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "\\") {
      let run = 0;
      while (text[i + run] === "\\") run++;
      const next = text[i + run];
      out += "\\".repeat(next === "\"" || next === undefined ? run * 2 : run);
      i += run - 1;
    } else if (ch === "\"") {
      out += "\\\"";
    } else {
      out += ch;
    }
  }
  return out + "\"";
};
// PowerShell single-quoted literal: only the quote needs doubling — nothing
// else expands inside it, so embedded $/@/backtick stay literal.
const psSingle = (s) => "'" + String(s).replace(/'/g, "''") + "'";
// PHP single-quoted literal.
const phpSingle = (s) => "'" + String(s).replace(/\\/g, "\\\\").replace(/'/g, "\\'") + "'";

const chatBody = ({ model, message }) => JSON.stringify({
  model,
  messages: [{ role: "user", content: message }],
});

function buildCurl({ base, key, model, message, os }) {
  const url = `${base}/chat/completions`;
  const body = chatBody({ model, message });
  if (os === "windows") {
    // Command Prompt (cmd.exe): curl.exe ships with Windows 10+; the JSON is
    // quoted with the MSVC argv rules (backslash runs doubled only before
    // quotes, embedded quotes as \") so curl.exe receives the exact bytes, and
    // ^ continues the line both pasted interactively and inside a .cmd file.
    return [
      "REM Windows Command Prompt (cmd.exe)",
      `curl.exe "${url}" ^`,
      `  -H "Content-Type: application/json" ^`,
      `  -H "Authorization: Bearer ${key}" ^`,
      `  -d ${winQuote(body)}`,
    ].join("\n");
  }
  return [
    `curl "${url}" \\`,
    `  -H "Content-Type: application/json" \\`,
    `  -H "Authorization: Bearer ${key}" \\`,
    `  -d ${shSingle(body)}`,
  ].join("\n");
}

function buildPowerShell({ base, key, model, message }) {
  // PowerShell-native: Invoke-RestMethod receives the body as a .NET string, so
  // none of the native-command-line quoting that can mangle inline JSON
  // (curl.exe + PowerShell argument passing) applies — this runs as pasted.
  const body = chatBody({ model, message });
  return [
    "# Windows PowerShell - no curl needed (Invoke-RestMethod)",
    "$response = Invoke-RestMethod -Method Post `",
    `  -Uri ${psSingle(`${base}/chat/completions`)} \``,
    "  -ContentType 'application/json' `",
    `  -Headers @{ Authorization = ${psSingle(`Bearer ${key}`)} } \``,
    `  -Body ${psSingle(body)}`,
    "",
    "$response.choices[0].message.content",
  ].join("\n");
}

function buildNode({ base, key, model, message }) {
  return [
    "// 9router usage example — Node.js 18+ (built-in fetch)",
    "// Run: node chat.mjs",
    `const BASE_URL = ${JSON.stringify(base)};`,
    `const API_KEY = ${JSON.stringify(key)};`,
    `const MODEL = ${JSON.stringify(model)};`,
    `const MESSAGE = ${JSON.stringify(message)};`,
    "",
    "const res = await fetch(`${BASE_URL}/chat/completions`, {",
    "  method: \"POST\",",
    "  headers: {",
    "    \"Content-Type\": \"application/json\",",
    "    \"Authorization\": `Bearer ${API_KEY}`,",
    "  },",
    "  body: JSON.stringify({",
    "    model: MODEL,",
    "    messages: [{ role: \"user\", content: MESSAGE }],",
    "  }),",
    "});",
    "",
    "if (!res.ok) {",
    "  console.error(`HTTP ${res.status}:`, await res.text());",
    "  process.exit(1);",
    "}",
    "",
    "const data = await res.json();",
    "console.log(data.choices?.[0]?.message?.content ?? JSON.stringify(data));",
  ].join("\n");
}

function buildPython({ base, key, model, message, os }) {
  const windows = String(os).startsWith("windows");
  const install = windows ? "py -m pip install requests" : "pip install requests";
  const run = windows ? "py chat.py" : "python3 chat.py";
  return [
    "# 9router usage example — Python 3",
    `# Install: ${install}   ·   Run: ${run}`,
    "import requests",
    "",
    `BASE_URL = ${JSON.stringify(base)}`,
    `API_KEY = ${JSON.stringify(key)}`,
    `MODEL = ${JSON.stringify(model)}`,
    `MESSAGE = ${JSON.stringify(message)}`,
    "",
    "res = requests.post(",
    "    f\"{BASE_URL}/chat/completions\",",
    "    headers={",
    "        \"Content-Type\": \"application/json\",",
    "        \"Authorization\": f\"Bearer {API_KEY}\",",
    "    },",
    "    json={",
    "        \"model\": MODEL,",
    "        \"messages\": [{\"role\": \"user\", \"content\": MESSAGE}],",
    "    },",
    "    timeout=120,",
    ")",
    "res.raise_for_status()",
    "data = res.json()",
    "print(data[\"choices\"][0][\"message\"][\"content\"])",
  ].join("\n");
}

function buildPhp({ base, key, model, message }) {
  return [
    "<?php",
    "// 9router usage example — PHP 7.4+ (ext-curl)",
    "// Run: php chat.php",
    `$baseUrl = ${phpSingle(base)};`,
    `$apiKey  = ${phpSingle(key)};`,
    `$model   = ${phpSingle(model)};`,
    `$message = ${phpSingle(message)};`,
    "",
    "$payload = json_encode([",
    "    \"model\" => $model,",
    "    \"messages\" => [[\"role\" => \"user\", \"content\" => $message]],",
    "]);",
    "",
    "$ch = curl_init(\"{$baseUrl}/chat/completions\");",
    "curl_setopt_array($ch, [",
    "    CURLOPT_RETURNTRANSFER => true,",
    "    CURLOPT_POST => true,",
    "    CURLOPT_HTTPHEADER => [",
    "        \"Content-Type: application/json\",",
    "        \"Authorization: Bearer {$apiKey}\",",
    "    ],",
    "    CURLOPT_POSTFIELDS => $payload,",
    "]);",
    "",
    "$response = curl_exec($ch);",
    "$status = curl_getinfo($ch, CURLINFO_HTTP_CODE);",
    "curl_close($ch);",
    "",
    "if ($status !== 200 || $response === false) {",
    "    fwrite(STDERR, \"HTTP {$status}: {$response}\\n\");",
    "    exit(1);",
    "}",
    "",
    "$data = json_decode($response, true);",
    "echo $data[\"choices\"][0][\"message\"][\"content\"] . \"\\n\";",
  ].join("\n");
}

function buildGo({ base, key, model, message }) {
  return [
    "// 9router usage example — Go 1.21+",
    "// Run: go run main.go",
    "package main",
    "",
    "import (",
    "\t\"bytes\"",
    "\t\"encoding/json\"",
    "\t\"fmt\"",
    "\t\"io\"",
    "\t\"net/http\"",
    "\t\"os\"",
    ")",
    "",
    "type chatResponse struct {",
    "\tChoices []struct {",
    "\t\tMessage struct {",
    "\t\t\tContent string `json:\"content\"`",
    "\t\t} `json:\"message\"`",
    "\t} `json:\"choices\"`",
    "}",
    "",
    "func main() {",
    `\tbaseURL := ${JSON.stringify(base)}`,
    `\tapiKey := ${JSON.stringify(key)}`,
    "",
    "\tpayload := map[string]any{",
    `\t\t\"model\": ${JSON.stringify(model)},`,
    "\t\t\"messages\": []map[string]string{",
    `\t\t\t{\"role\": \"user\", \"content\": ${JSON.stringify(message)}},`,
    "\t\t},",
    "\t}",
    "\tbody, _ := json.Marshal(payload)",
    "",
    "\treq, _ := http.NewRequest(\"POST\", baseURL+\"/chat/completions\", bytes.NewReader(body))",
    "\treq.Header.Set(\"Content-Type\", \"application/json\")",
    "\treq.Header.Set(\"Authorization\", \"Bearer \"+apiKey)",
    "",
    "\tres, err := http.DefaultClient.Do(req)",
    "\tif err != nil {",
    "\t\tfmt.Fprintln(os.Stderr, err)",
    "\t\tos.Exit(1)",
    "\t}",
    "\tdefer res.Body.Close()",
    "",
    "\traw, _ := io.ReadAll(res.Body)",
    "\tif res.StatusCode != http.StatusOK {",
    "\t\tfmt.Fprintf(os.Stderr, \"HTTP %d: %s\\n\", res.StatusCode, raw)",
    "\t\tos.Exit(1)",
    "\t}",
    "",
    "\tvar out chatResponse",
    "\tif err := json.Unmarshal(raw, &out); err != nil || len(out.Choices) == 0 {",
    "\t\tfmt.Println(string(raw))",
    "\t\treturn",
    "\t}",
    "\tfmt.Println(out.Choices[0].Message.Content)",
    "}",
  ].join("\n");
}

/**
 * Build the example snippet.
 * @returns {{ code: string, filename: string }}
 */
export function buildUsageExample({
  language = "curl",
  os = "unix",
  baseUrl,
  apiKey,
  model,
  message,
} = {}) {
  const base = trimTrailing(baseUrl);
  const key = (typeof apiKey === "string" && apiKey.trim()) || DEFAULT_KEY;
  const mdl = (typeof model === "string" && model.trim()) || DEFAULT_MODEL;
  const msg = (typeof message === "string" && message.trim()) || USAGE_DEFAULT_MESSAGE;
  const ctx = { base, key, model: mdl, message: msg, os };

  let code;
  let filename;
  switch (language) {
    case "node":
      code = buildNode(ctx);
      filename = "chat.mjs";
      break;
    case "python":
      code = buildPython(ctx);
      filename = "chat.py";
      break;
    case "php":
      code = buildPhp(ctx);
      filename = "chat.php";
      break;
    case "go":
      code = buildGo(ctx);
      filename = "main.go";
      break;
    case "curl":
    default:
      code = os === "windows-ps" ? buildPowerShell(ctx) : buildCurl(ctx);
      filename = os === "windows" ? "chat.cmd" : os === "windows-ps" ? "chat.ps1" : "chat.sh";
      break;
  }
  return { code: `${code}\n`, filename };
}
