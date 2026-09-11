// Reads a client's own Supabase project (project URL + anon/publishable key) as a knowledge source.

function clean(url: string) {
  return url.trim().replace(/\/+$/, "");
}

function headers(key: string) {
  const h: Record<string, string> = { apikey: key.trim(), Accept: "application/json" };
  // Legacy JWT anon keys accept a bearer; new opaque sb_publishable_ keys must not send one.
  if (!key.trim().startsWith("sb_")) h["Authorization"] = `Bearer ${key.trim()}`;
  return h;
}

async function rest(url: string, key: string, path: string) {
  const res = await fetch(`${clean(url)}/rest/v1${path}`, { headers: headers(key) });
  const text = await res.text();
  if (!res.ok) throw new Error(`(${res.status}) ${text.slice(0, 300)}`);
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** Try to discover tables from the OpenAPI root. Many projects restrict this to service_role. */
export async function listTables(url: string, key: string): Promise<string[]> {
  try {
    const spec = (await rest(url, key, "/")) as
      | { definitions?: Record<string, unknown>; paths?: Record<string, unknown> }
      | null;
    if (!spec) return [];
    const fromDefs = spec.definitions ? Object.keys(spec.definitions) : [];
    if (fromDefs.length) return fromDefs;
    return Object.keys(spec.paths ?? {})
      .filter((p) => p.startsWith("/") && p.length > 1 && !p.startsWith("/rpc"))
      .map((p) => p.slice(1));
  } catch {
    return [];
  }
}

/** Checks the URL + key pair without needing service_role privileges. */
export async function verifySource(url: string, key: string, tables: string[] = []) {
  if (!/^https?:\/\//.test(url.trim())) throw new Error("رابط المشروع غير صحيح");

  // A request to a surely-missing table: a valid key gives 404/200-ish, a bad key gives 401/403.
  const probe = await fetch(`${clean(url)}/rest/v1/__radd_probe__?select=*&limit=1`, {
    headers: headers(key),
  }).catch(() => null);
  if (!probe) throw new Error("تعذّر الوصول إلى رابط المشروع، تأكد من الرابط");
  if (probe.status === 401 || probe.status === 403) {
    throw new Error("المفتاح غير صحيح، استخدم مفتاح anon / publishable الخاص بالمشروع");
  }

  const discovered = await listTables(url, key);
  const list = tables.length ? tables : discovered;

  // If tables were given, make sure at least one is readable.
  if (tables.length) {
    const readable: string[] = [];
    for (const t of tables) {
      try {
        await rest(url, key, `/${encodeURIComponent(t)}?select=*&limit=1`);
        readable.push(t);
      } catch {
        /* not readable */
      }
    }
    if (!readable.length) {
      throw new Error("لم نتمكن من قراءة أي جدول من الجداول المحددة، تأكد من الأسماء وصلاحيات القراءة");
    }
    return { tables: readable };
  }

  return { tables: list };
}

/** Pulls a compact snapshot of the readable tables to feed the AI. */
export async function snapshot(
  url: string,
  key: string,
  tables: string[] = [],
  maxTables = 6,
  rowsPerTable = 15,
) {
  const list = tables.length ? tables : await listTables(url, key);
  if (!list.length) return "";
  const parts: string[] = [];
  for (const t of list.slice(0, maxTables)) {
    try {
      const rows = (await rest(url, key, `/${encodeURIComponent(t)}?select=*&limit=${rowsPerTable}`)) as unknown[];
      if (Array.isArray(rows) && rows.length) {
        parts.push(`#### جدول ${t}\n${JSON.stringify(rows).slice(0, 6000)}`);
      }
    } catch {
      /* table not readable with anon key */
    }
  }
  return parts.join("\n\n").slice(0, 30000);
}
