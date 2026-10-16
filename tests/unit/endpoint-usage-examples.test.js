import { describe, it, expect } from "vitest";
import {
  buildUsageExample,
  USAGE_DEFAULT_MESSAGE,
  USAGE_LANGUAGES,
  USAGE_OS,
} from "@/app/(dashboard)/dashboard/endpoint/usageExamples.js";

const base = {
  baseUrl: "http://localhost:3499/v1",
  apiKey: "sk-test-123456",
  model: "oc/grok-code-fast-1",
  message: "Hello!",
};

describe("usage example constants", () => {
  it("offers curl, node, python, php and go for both OS targets", () => {
    expect(USAGE_LANGUAGES.map((l) => l.id)).toEqual(["curl", "node", "python", "php", "go"]);
    expect(USAGE_OS.map((o) => o.id)).toEqual(["unix", "windows"]);
  });
});

describe("buildUsageExample", () => {
  it("fills endpoint, key, model and message into every language", () => {
    for (const language of USAGE_LANGUAGES) {
      const { code, filename } = buildUsageExample({ ...base, language: language.id });
      expect(code).toContain("http://localhost:3499/v1");
      expect(code).toContain("sk-test-123456");
      expect(code).toContain("oc/grok-code-fast-1");
      expect(code).toContain("Hello!");
      expect(code.endsWith("\n")).toBe(true);
      expect(filename).toBeTruthy();
    }
  });

  it("normalizes trailing slashes in the base URL", () => {
    const { code } = buildUsageExample({ ...base, baseUrl: "http://x:1/v1///", language: "curl" });
    expect(code).toContain("http://x:1/v1/chat/completions");
    expect(code).not.toContain("v1//");
  });

  it("falls back to placeholders for empty fields", () => {
    const { code } = buildUsageExample({ language: "curl" });
    expect(code).toContain("YOUR_API_KEY");
    expect(code).toContain("your-model-id");
    expect(code).toContain(USAGE_DEFAULT_MESSAGE);
  });

  it("suggests a filename per language", () => {
    expect(buildUsageExample({ ...base, language: "node" }).filename).toBe("chat.mjs");
    expect(buildUsageExample({ ...base, language: "python" }).filename).toBe("chat.py");
    expect(buildUsageExample({ ...base, language: "php" }).filename).toBe("chat.php");
    expect(buildUsageExample({ ...base, language: "go" }).filename).toBe("main.go");
  });

  it("falls back to the POSIX curl example for unknown languages", () => {
    const { code, filename } = buildUsageExample({ ...base, language: "unknown" });
    expect(filename).toBe("chat.sh");
    expect(code.startsWith("curl ")).toBe(true);
  });

  it("uses OS-appropriate curl (bash vs PowerShell)", () => {
    const unix = buildUsageExample({ ...base, language: "curl", os: "unix" });
    const win = buildUsageExample({ ...base, language: "curl", os: "windows" });
    expect(unix.filename).toBe("chat.sh");
    expect(win.filename).toBe("chat.ps1");
    expect(unix.code).toContain(" \\\n"); // backslash line continuations
    expect(win.code).toContain("`\n"); // PowerShell backtick continuations
    expect(win.code).toContain("curl.exe");
    expect(win.code).toContain("PowerShell");
  });

  it("adjusts the Python install/run hints per OS", () => {
    const unix = buildUsageExample({ ...base, language: "python", os: "unix" }).code;
    const win = buildUsageExample({ ...base, language: "python", os: "windows" }).code;
    expect(unix).toContain("pip install requests");
    expect(unix).toContain("python3 chat.py");
    expect(win).toContain("py -m pip install requests");
    expect(win).toContain("py chat.py");
  });

  it("escapes single quotes for each shell's quoting style", () => {
    const message = "It's a test";
    const unix = buildUsageExample({ ...base, message, language: "curl", os: "unix" }).code;
    const win = buildUsageExample({ ...base, message, language: "curl", os: "windows" }).code;
    // bash single-quoted payload: ' closes, \' escapes, ' reopens
    expect(unix).toContain("It'\\''s a test");
    // PowerShell single-quoted payload: quote doubles
    expect(win).toContain("It''s a test");
  });

  it("keeps the JSON body single-line even for multi-line messages", () => {
    const { code } = buildUsageExample({ ...base, message: "line1\nline2", language: "curl" });
    const dataLine = code.trimEnd().split("\n").pop();
    expect(dataLine).toContain("\\n"); // escaped inside the JSON string
    expect(dataLine.includes("\n")).toBe(false);
  });

  it("embeds string-safe literals for Python, PHP, Node and Go", () => {
    const message = "It's \\ \"quoted\"";
    const py = buildUsageExample({ ...base, message, language: "python" }).code;
    const node = buildUsageExample({ ...base, message, language: "node" }).code;
    const go = buildUsageExample({ ...base, message, language: "go" }).code;
    const php = buildUsageExample({ ...base, message, language: "php" }).code;
    // JSON string literals are valid Python/JavaScript/Go literals
    expect(py).toContain(`MESSAGE = ${JSON.stringify(message)}`);
    expect(node).toContain(`const MESSAGE = ${JSON.stringify(message)};`);
    expect(go).toContain(JSON.stringify(message));
    // PHP single-quoted: backslash doubled, single quote escaped, double quotes stay literal
    expect(php).toContain("It\\'s \\\\ \"quoted\"");
  });
});
