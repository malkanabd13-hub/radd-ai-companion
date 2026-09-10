// Reads a client's own Supabase project (project URL + anon key) as a knowledge source.

function clean(url: string) {
  return url.trim().replace(/\/+$/, "");
}

async function rest(url: string, key: string, path: string) {
  const res = await fetch(`${clean(url)}/rest/v1${path}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`(${res.status}) ${await res.text()}`);
  return res.json();
}

export async function listTables(url: string, key: string): Promise<string[]> {
  const spec = (await rest(url, key, "/")) as { definitions?: Record<string, unknown>; paths?: Record<string, unknown> };
  const fromDefs = spec.definitions ? Object.keys(spec.definitions) : [];
  if (fromDefs.length) return fromDefs;
  return Object.keys(spec.paths ?? {})
    .filter((p) => p.startsWith("/") && p.length > 1 && !p.startsWith("/rpc"))
    .map((p) => p.slice(1));
}

export async function verifySource(url: string, key: string) {
  if (!/^https?:\/\//.test(url.trim())) throw new Error("رابط المشروع غير صحيح");
  try {
    const tables = await listTables(url, key);
    return { tables };
  } catch (e) {
    throw new Error(`تعذّر الاتصال بقاعدة البيانات: ${e instanceof Error ? e.message : "خطأ غير معروف"}`);
  }
}

/** Pulls a compact snapshot of the readable tables to feed the AI. */
export async function snapshot(url: string, key: string, maxTables = 6, rowsPerTable = 15) {
  let tables: string[] = [];
  try {
    tables = await listTables(url, key);
  } catch {
    return "";
  }
  const parts: string[] = [];
  for (const t of tables.slice(0, maxTables)) {
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
