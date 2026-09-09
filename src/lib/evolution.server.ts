const base = () => (process.env["EVOLUTION_API_URL"] ?? "").replace(/\/+$/, "");
const key = () => process.env["EVOLUTION_API_KEY"] ?? "";

async function call(path: string, init?: RequestInit) {
  if (!base() || !key()) throw new Error("لم يتم ضبط إعدادات Evolution API");
  const res = await fetch(`${base()}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      apikey: key(),
      ...(init?.headers ?? {}),
    },
  });
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!res.ok) {
    const msg =
      (body as { message?: string; error?: string } | null)?.message ??
      (body as { error?: string } | null)?.error ??
      `فشل الاتصال بخادم واتساب (${res.status})`;
    throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
  }
  return body as Record<string, unknown>;
}

export async function createInstance(instanceName: string, number: string, webhookUrl: string) {
  return call("/instance/create", {
    method: "POST",
    body: JSON.stringify({
      instanceName,
      number: number.replace(/\D/g, ""),
      qrcode: true,
      integration: "WHATSAPP-BAILEYS",
      webhook: {
        url: webhookUrl,
        byEvents: false,
        base64: false,
        events: ["MESSAGES_UPSERT"],
      },
    }),
  });
}

export async function connectInstance(instanceName: string, number?: string) {
  const q = number ? `?number=${encodeURIComponent(number.replace(/\D/g, ""))}` : "";
  return call(`/instance/connect/${encodeURIComponent(instanceName)}${q}`, { method: "GET" });
}

export async function instanceState(instanceName: string) {
  return call(`/instance/connectionState/${encodeURIComponent(instanceName)}`, { method: "GET" });
}

export async function logoutInstance(instanceName: string) {
  return call(`/instance/logout/${encodeURIComponent(instanceName)}`, { method: "DELETE" });
}

export async function deleteInstance(instanceName: string) {
  try {
    await logoutInstance(instanceName);
  } catch {
    /* ignore */
  }
  try {
    await call(`/instance/delete/${encodeURIComponent(instanceName)}`, { method: "DELETE" });
  } catch {
    /* ignore */
  }
}

export async function setWebhook(instanceName: string, webhookUrl: string) {
  return call(`/webhook/set/${encodeURIComponent(instanceName)}`, {
    method: "POST",
    body: JSON.stringify({
      webhook: {
        enabled: true,
        url: webhookUrl,
        byEvents: false,
        base64: false,
        events: ["MESSAGES_UPSERT"],
      },
    }),
  });
}

export async function sendText(instanceName: string, number: string, text: string) {
  return call(`/message/sendText/${encodeURIComponent(instanceName)}`, {
    method: "POST",
    body: JSON.stringify({ number: number.replace(/\D/g, ""), text }),
  });
}
