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
  it("offers curl, node, python, php and go for every OS target", () => {
    expect(USAGE_LANGUAGES.map((l) => l.id)).toEqual(["curl", "node", "python", "php", "go"]);
    expect(USAGE_OS.map((o) => o.id)).toEqual(["unix", "windows", "windows-ps"]);
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
    expect(buildUsageExample({ ...base, language: "curl", os: "windows" }).filename).toBe("chat.cmd");
    expect(buildUsageExample({ ...base, language: "curl", os: "windows-ps" }).filename).toBe("chat.ps1");
  });

  it("falls back to the POSIX curl example for unknown languages", () => {
    const { code, filename } = buildUsageExample({ ...base, language: "unknown" });
    expect(filename).toBe("chat.sh");
    expect(code.startsWith("curl ")).toBe(true);
  });

  it("uses OS-appropriate curl (bash vs cmd.exe)", () => {
    const unix = buildUsageExample({ ...base, language: "curl", os: "unix" });
    const win = buildUsageExample({ ...base, language: "curl", os: "windows" });
    expect(unix.filename).toBe("chat.sh");
    expect(win.filename).toBe("chat.cmd");
    expect(unix.code).toContain(" \\\n"); // backslash line continuations
    expect(win.code).toContain(" ^\n"); // cmd.exe caret continuations
    expect(win.code).toContain("curl.exe");
    expect(win.code).toContain("REM Windows Command Prompt");
  });

  it("offers a PowerShell variant that avoids native argument quoting", () => {
    const message = "It's a \"quoted\" test";
    const ps = buildUsageExample({ ...base, message, language: "curl", os: "windows-ps" });
    expect(ps.filename).toBe("chat.ps1");
    expect(ps.code).toContain("Invoke-RestMethod -Method Post");
    expect(ps.code).not.toContain("curl.exe");
    expect(ps.code).toContain(" `\n"); // PowerShell backtick continuations
    // body is an exact single-quoted literal: apostrophes doubled, nothing expands
    const body = JSON.stringify({ model: base.model, messages: [{ role: "user", content: message }] });
    expect(ps.code).toContain(`-Body '${body.replace(/'/g, "''")}'`);
    expect(ps.code).toContain("$response.choices[0].message.content");
  });

  it("treats PowerShell as Windows for the python hints", () => {
    const ps = buildUsageExample({ ...base, language: "python", os: "windows-ps" }).code;
    expect(ps).toContain("py -m pip install requests");
    expect(ps).toContain("py chat.py");
  });

  it("cmd.exe receives the exact JSON body after caret-join + CRT parsing", () => {
    // Minimal Windows argv parser: double quotes toggle, backslashes follow
    // the 2n / 2n+1 rules. Used to prove the generated line hands curl.exe
    // byte-identical JSON (single-quoted JSON was the bug this guards).
    const parse = (line) => {
      const args = [];
      let cur = "";
      let inQuotes = false;
      let started = false;
      let i = 0;
      while (i < line.length) {
        const ch = line[i];
        if (ch === "\\") {
          let backslashes = 0;
          while (line[i] === "\\") { backslashes++; i++; }
          if (line[i] === '"') {
            cur += "\\".repeat(Math.floor(backslashes / 2));
            if (backslashes % 2 === 1) { cur += '"'; i++; }
          } else {
            cur += "\\".repeat(backslashes);
          }
          started = true;
          continue;
        }
        if (ch === '"') { inQuotes = !inQuotes; started = true; i++; continue; }
        if ((ch === " " || ch === "\t") && !inQuotes) {
          if (started) { args.push(cur); cur = ""; started = false; }
          i++;
          continue;
        }
        cur += ch;
        started = true;
        i++;
      }
      if (started) args.push(cur);
      return args;
    };

    // parser sanity
    expect(parse('a "b c" d')).toEqual(["a", "b c", "d"]);
    expect(parse('"{\\"x\\":1}"')).toEqual(['{"x":1}']);

    const messages = [
      "Hello!",
      "It's a \"quoted\" test",
      "line1\nline2",
      "ends with backslash \\",
      "100% done",
    ];
    for (const message of messages) {
      const { code } = buildUsageExample({ ...base, message, language: "curl", os: "windows" });
      // cmd joins caret-continued lines, then the CRT parses argv
      const joined = code.trimEnd().split("\n").filter((l) => !l.startsWith("REM")).join(" ").replace(/\^/g, " ");
      const args = parse(joined);
      const dIndex = args.indexOf("-d");
      expect(dIndex, message).toBeGreaterThan(-1);
      const expected = JSON.stringify({ model: base.model, messages: [{ role: "user", content: message }] });
      expect(args[dIndex + 1], message).toBe(expected);
    }
  });

  it("adjusts the Python install/run hints per OS", () => {
    const unix = buildUsageExample({ ...base, language: "python", os: "unix" }).code;
    const win = buildUsageExample({ ...base, language: "python", os: "windows" }).code;
    expect(unix).toContain("pip install requests");
    expect(unix).toContain("python3 chat.py");
    expect(win).toContain("py -m pip install requests");
    expect(win).toContain("py chat.py");
  });

  it("escapes single quotes for the bash payload, leaves cmd untouched", () => {
    const message = "It's a test";
    const unix = buildUsageExample({ ...base, message, language: "curl", os: "unix" }).code;
    // bash single-quoted payload: ' closes, \' escapes, ' reopens
    expect(unix).toContain("It'\\''s a test");
    // cmd treats single quotes literally — no escaping needed
    const win = buildUsageExample({ ...base, message, language: "curl", os: "windows" }).code;
    expect(win).toContain("It's a test");
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
