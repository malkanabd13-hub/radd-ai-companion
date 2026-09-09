import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

function origin() {
  try {
    return new URL(getRequest().url).origin;
  } catch {
    return "";
  }
}

const agentInput = z.object({
  ai_name: z.string().min(1),
  whatsapp_number: z.string().min(6),
  employee_number: z.string().optional().default(""),
  persona: z.string().default(""),
  job: z.string().default(""),
  greeting: z.string().default(""),
});

export const listAgents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("agents")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const getAgent = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: agent, error } = await context.supabase
      .from("agents")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!agent) throw new Error("لم يتم العثور على المساعد");
    const { data: files } = await context.supabase
      .from("knowledge_files")
      .select("id, file_name, created_at, content")
      .eq("agent_id", data.id)
      .order("created_at", { ascending: false });
    return {
      agent,
      files: (files ?? []).map((f) => ({
        id: f.id,
        file_name: f.file_name,
        created_at: f.created_at,
        size: f.content.length,
      })),
    };
  });

export const createAgent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => agentInput.parse(d))
  .handler(async ({ data, context }) => {
    const instanceName = `radd_${context.userId.slice(0, 8)}_${Date.now().toString(36)}`;
    const { data: agent, error } = await context.supabase
      .from("agents")
      .insert({
        user_id: context.userId,
        ai_name: data.ai_name,
        whatsapp_number: data.whatsapp_number.replace(/\D/g, ""),
        employee_number: data.employee_number?.replace(/\D/g, "") || null,
        persona: data.persona,
        job: data.job,
        greeting: data.greeting,
        instance_name: instanceName,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);

    const evo = await import("./evolution.server");
    try {
      await evo.createInstance(instanceName, data.whatsapp_number, `${origin()}/api/public/evolution/${agent.id}`);
    } catch (e) {
      return { agent, warning: e instanceof Error ? e.message : "تعذّر إنشاء الجلسة" };
    }
    return { agent, warning: null };
  });

export const updateAgent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    agentInput.partial().extend({ id: z.string().uuid(), active: z.boolean().optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { id, ...rest } = data;
    const { error } = await context.supabase.from("agents").update({ ...rest, updated_at: new Date().toISOString() }).eq("id", id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteAgent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: agent } = await context.supabase
      .from("agents")
      .select("instance_name")
      .eq("id", data.id)
      .maybeSingle();
    if (agent) {
      const evo = await import("./evolution.server");
      await evo.deleteInstance(agent.instance_name);
    }
    const { error } = await context.supabase.from("agents").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const connectAgent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; pairing?: boolean }) =>
    z.object({ id: z.string().uuid(), pairing: z.boolean().optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: agent } = await context.supabase
      .from("agents")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (!agent) throw new Error("لم يتم العثور على المساعد");

    const evo = await import("./evolution.server");
    const hook = `${origin()}/api/public/evolution/${agent.id}`;
    try {
      await evo.createInstance(agent.instance_name, agent.whatsapp_number, hook);
    } catch {
      try {
        await evo.setWebhook(agent.instance_name, hook);
      } catch {
        /* ignore */
      }
    }
    const res = (await evo.connectInstance(
      agent.instance_name,
      data.pairing ? agent.whatsapp_number : undefined,
    )) as Record<string, unknown>;

    const base64 = (res["base64"] as string | undefined) ?? undefined;
    const code = (res["pairingCode"] as string | undefined) ?? undefined;
    return { qr: base64 ?? null, pairingCode: code ?? null };
  });

export const agentStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: agent } = await context.supabase
      .from("agents")
      .select("id, instance_name")
      .eq("id", data.id)
      .maybeSingle();
    if (!agent) throw new Error("لم يتم العثور على المساعد");
    const evo = await import("./evolution.server");
    let state = "disconnected";
    try {
      const res = (await evo.instanceState(agent.instance_name)) as {
        instance?: { state?: string };
        state?: string;
      };
      state = res?.instance?.state ?? res?.state ?? "disconnected";
    } catch {
      state = "disconnected";
    }
    await context.supabase.from("agents").update({ status: state }).eq("id", agent.id);
    return { status: state };
  });

export const addKnowledge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        agent_id: z.string().uuid(),
        file_name: z.string().min(1),
        base64: z.string().min(1),
        is_pdf: z.boolean(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const bytes = Uint8Array.from(atob(data.base64), (c) => c.charCodeAt(0));
    let content = "";
    if (data.is_pdf) {
      const { extractText, getDocumentProxy } = await import("unpdf");
      const pdf = await getDocumentProxy(bytes);
      const out = await extractText(pdf, { mergePages: true });
      content = Array.isArray(out.text) ? out.text.join("\n") : out.text;
    } else {
      content = new TextDecoder("utf-8").decode(bytes);
    }
    content = content.replace(/\u0000/g, "").trim().slice(0, 200000);
    if (!content) throw new Error("لم نتمكن من قراءة نص من هذا الملف");

    const { error } = await context.supabase.from("knowledge_files").insert({
      agent_id: data.agent_id,
      user_id: context.userId,
      file_name: data.file_name,
      content,
    });
    if (error) throw new Error(error.message);
    return { ok: true, chars: content.length };
  });

export const addKnowledgeText = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ agent_id: z.string().uuid(), title: z.string().min(1), content: z.string().min(1) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("knowledge_files").insert({
      agent_id: data.agent_id,
      user_id: context.userId,
      file_name: data.title,
      content: data.content.slice(0, 200000),
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteKnowledge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("knowledge_files").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
