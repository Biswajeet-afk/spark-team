export type ApiRequest = {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: string;
};

const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"];

function stripFence(text: string) {
  const m = text.trim().match(/^```[a-z]*\n([\s\S]*?)\n?```$/i);
  return (m ? m[1] : text).trim();
}

function unquote(s: string) {
  const t = s.trim();
  if ((t.startsWith("'") && t.endsWith("'")) || (t.startsWith('"') && t.endsWith('"'))) return t.slice(1, -1);
  return t;
}

/** Tokenise a shell command respecting single/double quotes. */
function tokens(cmd: string) {
  const out: string[] = [];
  const re = /'([^']*)'|"((?:\\.|[^"\\])*)"|(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(cmd.replace(/\\\n/g, " ")))) out.push(m[1] ?? m[2]?.replace(/\\"/g, '"') ?? m[3]);
  return out;
}

export function parseCurl(text: string): ApiRequest | null {
  const src = stripFence(text);
  if (!/^curl\s/i.test(src)) return null;
  const t = tokens(src).slice(1);
  const req: ApiRequest = { method: "", url: "", headers: {}, body: "" };
  for (let i = 0; i < t.length; i++) {
    const tok = t[i];
    if (tok === "-X" || tok === "--request") req.method = (t[++i] ?? "").toUpperCase();
    else if (tok === "-H" || tok === "--header") {
      const [k, ...v] = (t[++i] ?? "").split(":");
      if (k) req.headers[k.trim()] = v.join(":").trim();
    } else if (["-d", "--data", "--data-raw", "--data-binary"].includes(tok)) req.body = t[++i] ?? "";
    else if (/^https?:\/\//i.test(unquote(tok))) req.url = unquote(tok);
  }
  if (!req.url) return null;
  if (!req.method) req.method = req.body ? "POST" : "GET";
  return req;
}

export function parseJsonRequest(text: string): ApiRequest | null {
  try {
    const obj = JSON.parse(stripFence(text));
    if (!obj || typeof obj !== "object" || typeof obj.url !== "string" || !/^https?:\/\//.test(obj.url)) return null;
    const method = String(obj.method ?? "GET").toUpperCase();
    if (!METHODS.includes(method)) return null;
    return {
      method,
      url: obj.url,
      headers: obj.headers && typeof obj.headers === "object" ? obj.headers : {},
      body: obj.body === undefined ? "" : typeof obj.body === "string" ? obj.body : JSON.stringify(obj.body, null, 2),
    };
  } catch {
    return null;
  }
}

export function detectApiRequest(text: string): ApiRequest | null {
  if (!text) return null;
  return parseCurl(text) ?? parseJsonRequest(text);
}

/** Pull a JSON object/array from a message (raw or fenced). */
export function extractJson(text: string): unknown | null {
  const fenced = text.match(/```(?:json)?\n([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text.slice(text.search(/[[{]/));
  try {
    return JSON.parse(candidate.trim());
  } catch {
    return null;
  }
}
