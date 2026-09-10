import { createFileRoute } from "@tanstack/react-router";

type EvoPayload = {
  event?: string;
  data?: {
    key?: { remoteJid?: string; fromMe?: boolean; id?: string };
    message?: Record<string, unknown>;
    pushName?: string;
  };
};

function extractText(message: Record<string, unknown> | undefined): string {
  if (!message) return "";
  const m = message as Record<string, any>;
  return (
    m["conversation"] ??
    m["extendedTextMessage"]?.text ??
    m["imageMessage"]?.caption ??
    m["videoMessage"]?.caption ??
    m["buttonsResponseMessage"]?.selectedDisplayText ??
    m["listResponseMessage"]?.title ??
    ""
  );
}

export const Route = createFileRoute("/api/public/evolution/$agentId")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const payload = (await request.json().catch(() => ({}))) as EvoPayload;
        const event = (payload.event ?? "").toLowerCase().replace(/_/g, ".");
        if (event && !event.includes("messages.upsert")) {
          return new Response("ignored");
        }
        const key = payload.data?.key;
        const jid = key?.remoteJid ?? "";
        const text = extractText(payload.data?.message);
        if (!jid || key?.fromMe || !text.trim() || jid.endsWith("@g.us")) {
          return new Response("skip");
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: agent } = await supabaseAdmin
          .from("agents")
          .select("*")
          .eq("id", params.agentId)
          .maybeSingle();
        if (!agent || !agent.active) return new Response("no agent");

        const { data: files } = await supabaseAdmin
          .from("knowledge_files")
          .select("file_name, content")
          .eq("agent_id", agent.id);

        const { data: history } = await supabaseAdmin
          .from("messages")
          .select("role, content")
          .eq("agent_id", agent.id)
          .eq("remote_jid", jid)
          .order("created_at", { ascending: false })
          .limit(12);

        const { data: sources } = await supabaseAdmin
          .from("data_sources")
          .select("label, project_url, anon_key")
          .eq("agent_id", agent.id);

        let dbKnowledge = "";
        if (sources && sources.length) {
          const { snapshot } = await import("@/lib/supabase-source.server");
          const chunks: string[] = [];
          for (const s of sources.slice(0, 3)) {
            const snap = await snapshot(s.project_url, s.anon_key);
            if (snap) chunks.push(`### قاعدة بيانات ${s.label}\n${snap}`);
          }
          dbKnowledge = chunks.join("\n\n").slice(0, 40000);
        }

        const isFirst = !history || history.length === 0;
        const knowledge = (files ?? [])
          .map((f) => `### ${f.file_name}\n${f.content.slice(0, 20000)}`)
          .join("\n\n")
          .slice(0, 60000);

        const system = [
          `أنت مساعد ذكي اسمك «${agent.ai_name}» وتعمل عبر واتساب.`,
          agent.persona ? `شخصيتك: ${agent.persona}` : "",
          agent.job ? `مهمتك: ${agent.job}` : "",
          `تحدّث دائمًا باللغة العربية بأسلوب واضح ومختصر ومهذّب.`,
          isFirst && agent.greeting
            ? `هذه أول رسالة من العميل، ابدأ ردّك بالترحيب التالي مع ذكر اسمك: ${agent.greeting}`
            : `عرّف بنفسك باسم ${agent.ai_name} عند الحاجة فقط.`,
          agent.employee_number
            ? `إذا طلب العميل التحدث مع موظف بشري أو كانت حالته تستدعي تدخل موظف، لا تعطه أي رقم تواصل إطلاقًا، بل أخبره أنه سيتم تحويله لموظف، وأضف في آخر ردّك السطر التالي حرفيًا: [HANDOFF]\nملخص: <ملخص قصير لطلب العميل>\nممنوع منعًا باتًا ذكر أي أرقام هواتف داخلية أو أرقام موظفين.`
            : "لا تعطِ العميل أي أرقام تواصل داخلية.",
          knowledge
            ? `اعتمد في إجاباتك على المعلومات التالية، ولا تخترع معلومات غير موجودة فيها:\n${knowledge}`
            : "",
          dbKnowledge ? `بيانات من قاعدة بيانات العميل (استخدمها للإجابة):\n${dbKnowledge}` : "",
        ]
          .filter(Boolean)
          .join("\n");

        const messages = [
          { role: "system", content: system },
          ...[...(history ?? [])].reverse().map((h) => ({ role: h.role, content: h.content })),
          { role: "user", content: text },
        ];

        let reply = "";
        try {
          const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${process.env["LOVABLE_API_KEY"]}`,
            },
            body: JSON.stringify({ model: "google/gemini-3.8-flash", messages }),
          });
          if (!res.ok) {
            console.error("AI error", res.status, await res.text());
            return new Response("ai error", { status: 200 });
          }
          const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
          reply = json.choices?.[0]?.message?.content?.trim() ?? "";
        } catch (e) {
          console.error(e);
          return new Response("ai failed", { status: 200 });
        }
        if (!reply) return new Response("empty");

        const evo = await import("@/lib/evolution.server");
        try {
          await evo.sendText(agent.instance_name, jid.split("@")[0]!, reply);
        } catch (e) {
          console.error("send failed", e);
        }

        await supabaseAdmin.from("messages").insert([
          { agent_id: agent.id, remote_jid: jid, role: "user", content: text },
          { agent_id: agent.id, remote_jid: jid, role: "assistant", content: reply },
        ]);

        return new Response("ok");
      },
      GET: async () => new Response("ok"),
    },
  },
});
