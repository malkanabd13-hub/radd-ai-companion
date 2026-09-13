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
  const accepts = ["application/openapi+json", "application/json"];
  for (const accept of accepts) {
    try {
      const res = await fetch(`${clean(url)}/rest/v1/`, {
        headers: { ...headers(key), Accept: accept },
      });
      if (!res.ok) continue;
      const spec = (await res.json()) as {
        definitions?: Record<string, unknown>;
        paths?: Record<string, unknown>;
        components?: { schemas?: Record<string, unknown> };
      };
      const fromDefs = spec.definitions ? Object.keys(spec.definitions) : [];
      if (fromDefs.length) return fromDefs;
      const fromComponents = spec.components?.schemas ? Object.keys(spec.components.schemas) : [];
      if (fromComponents.length) return fromComponents;
      const fromPaths = Object.keys(spec.paths ?? {})
        .filter((p) => p.startsWith("/") && p.length > 1 && !p.startsWith("/rpc"))
        .map((p) => p.slice(1));
      if (fromPaths.length) return fromPaths;
    } catch {
      /* try next */
    }
  }
  return [];
}

/** Keeps only the tables the anon key can actually read. */
async function readable(url: string, key: string, tables: string[]) {
  const ok: string[] = [];
  await Promise.all(
    tables.map(async (t) => {
      try {
        await rest(url, key, `/${encodeURIComponent(t)}?select=*&limit=1`);
        ok.push(t);
      } catch {
        /* not readable */
      }
    }),
  );
  return ok;
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

  const wanted = tables.length ? tables : await listTables(url, key);
  if (!wanted.length) {
    throw new Error(
      "تم قبول المفتاح لكن لم نتمكن من اكتشاف الجداول تلقائيًا، اكتب أسماء الجداول يدويًا مفصولة بفاصلة",
    );
  }

  const list = await readable(url, key, wanted);
  if (!list.length) {
    throw new Error(
      "لم نتمكن من قراءة أي جدول، تأكد من أسماء الجداول ومن وجود سياسة قراءة عامة (anon) عليها",
    );
  }
  return { tables: list };
}

/** Pulls a full snapshot of the readable tables to feed the AI. */
export async function snapshot(
  url: string,
  key: string,
  tables: string[] = [],
  maxTables = 25,
  rowsPerTable = 2000,
) {
  const list = tables.length ? tables : await listTables(url, key);
  if (!list.length) return "";
  const parts: string[] = [];
  for (const t of list.slice(0, maxTables)) {
    try {
      const rows = (await rest(
        url,
        key,
        `/${encodeURIComponent(t)}?select=*&limit=${rowsPerTable}`,
      )) as unknown[];
      if (Array.isArray(rows) && rows.length) {
        const columns = Object.keys(rows[0] as Record<string, unknown>);
        parts.push(
          `#### جدول ${t}\nالأعمدة: ${columns.join(", ")}\nعدد الصفوف المعروضة: ${rows.length}\n${JSON.stringify(rows).slice(0, 60000)}`,
        );
      } else if (Array.isArray(rows)) {
        parts.push(`#### جدول ${t}\n(لا توجد صفوف متاحة)`);
      }
    } catch {
      /* table not readable with anon key */
    }
  }
  return parts.join("\n\n").slice(0, 250000);
}
