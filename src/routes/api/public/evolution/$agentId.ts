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
    m["documentMessage"]?.caption ??
    m["buttonsResponseMessage"]?.selectedDisplayText ??
    m["listResponseMessage"]?.title ??
    ""
  );
}

/** Detects an incoming media message and returns its kind + declared mime type. */
function detectMedia(message: Record<string, unknown> | undefined) {
  if (!message) return null;
  const m = message as Record<string, any>;
  const candidates: { kind: "audio" | "image" | "video"; node: any }[] = [
    { kind: "audio", node: m["audioMessage"] },
    { kind: "image", node: m["imageMessage"] },
    { kind: "video", node: m["videoMessage"] },
  ];
  for (const c of candidates) {
    if (c.node) return { kind: c.kind, mimetype: (c.node.mimetype as string | undefined) ?? "" };
  }
  return null;
}

const mediaLabel = { audio: "مقطع صوتي", image: "صورة", video: "مقطع فيديو" } as const;

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
        const media = detectMedia(payload.data?.message);
        if (!jid || key?.fromMe || jid.endsWith("@g.us") || (!text.trim() && !media)) {
          return new Response("skip");
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: agent } = await supabaseAdmin
          .from("agents")
          .select("*")
          .eq("id", params.agentId)
          .maybeSingle();
        if (!agent || !agent.active) return new Response("no agent");

        const evo = await import("@/lib/evolution.server");

        // Download media (voice notes, photos, videos) so the AI can understand it.
        let mediaPart: { data: string; mimetype: string } | null = null;
        if (media && key?.id) {
          try {
            const got = await evo.getMediaBase64(agent.instance_name, key.id);
            if (got.base64) {
              mediaPart = { data: got.base64, mimetype: got.mimetype || media.mimetype || "" };
            }
          } catch (e) {
            console.error("media download failed", e);
          }
        }

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
          .select("label, project_url, anon_key, tables")
          .eq("agent_id", agent.id);

        let dbKnowledge = "";
        if (sources && sources.length) {
          const { snapshot } = await import("@/lib/supabase-source.server");
          const chunks: string[] = [];
          for (const s of sources.slice(0, 3)) {
            const snap = await snapshot(s.project_url, s.anon_key, s.tables ?? []);
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
          `قد يرسل العميل رسائل صوتية أو صورًا أو فيديو، افهم محتواها وأجب عنها مباشرة.`,
          isFirst && agent.greeting
            ? `هذه أول رسالة من العميل، ابدأ ردّك بالترحيب التالي مع ذكر اسمك: ${agent.greeting}`
            : `عرّف بنفسك باسم ${agent.ai_name} عند الحاجة فقط.`,
          agent.employee_number
            ? `إذا طلب العميل التحدث مع موظف بشري أو كانت حالته تستدعي تدخل موظف، لا تعطه أي رقم تواصل إطلاقًا، بل أخبره أنه سيتم تحويله لموظف، وأضف في آخر ردّك سطرًا منفصلًا بهذا الشكل حرفيًا:\n[HANDOFF] <ملخص قصير لطلب العميل وما دار في المحادثة>\nهذا السطر داخلي ولن يراه العميل. ممنوع منعًا باتًا ذكر أي أرقام هواتف داخلية أو أرقام موظفين.`
            : "لا تعطِ العميل أي أرقام تواصل داخلية.",
          knowledge
            ? `اعتمد في إجاباتك على المعلومات التالية، ولا تخترع معلومات غير موجودة فيها:\n${knowledge}`
            : "",
          dbKnowledge ? `بيانات من قاعدة بيانات العميل (استخدمها للإجابة):\n${dbKnowledge}` : "",
        ]
          .filter(Boolean)
          .join("\n");

        const userText = text.trim() || (media ? `(أرسل العميل ${mediaLabel[media.kind]})` : "");

        const userContent: unknown = mediaPart
          ? [
              { type: "text", text: userText },
              mediaPart.mimetype.startsWith("image/")
                ? { type: "image_url", image_url: { url: `data:${mediaPart.mimetype};base64,${mediaPart.data}` } }
                : {
                    type: "file",
                    file: {
                      filename: media?.kind === "audio" ? "voice-note" : "media",
                      file_data: `data:${mediaPart.mimetype || "application/octet-stream"};base64,${mediaPart.data}`,
                    },
                  },
            ]
          : userText;

        const baseMessages = [
          { role: "system", content: system },
          ...[...(history ?? [])].reverse().map((h) => ({ role: h.role, content: h.content })),
        ];

        async function askAI(content: unknown) {
          const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${process.env["LOVABLE_API_KEY"]}`,
            },
            body: JSON.stringify({
              model: "google/gemini-3.8-flash",
              messages: [...baseMessages, { role: "user", content }],
            }),
          });
          if (!res.ok) {
            console.error("AI error", res.status, (await res.text()).slice(0, 500));
            return null;
          }
          const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
          return json.choices?.[0]?.message?.content?.trim() ?? "";
        }

        let reply: string | null = null;
        try {
          reply = await askAI(userContent);
          // If the media attachment was rejected, answer the text part instead of going silent.
          if (reply === null && mediaPart) {
            reply = await askAI(
              `${userText}\n(تعذّر تحليل المرفق، اعتذر بلطف واطلب من العميل توضيح طلبه كتابةً)`,
            );
          }
        } catch (e) {
          console.error(e);
          return new Response("ai failed", { status: 200 });
        }
        if (!reply) return new Response("empty");

        // Split the internal handoff line out of the customer-facing reply.
        const handoffMatch = reply.match(/\[HANDOFF\]\s*:?\s*(?:ملخص\s*:)?\s*([\s\S]*)$/i);
        const handoffSummary = handoffMatch?.[1]?.trim() ?? "";
        const clientReply = reply.replace(/\[HANDOFF\][\s\S]*$/i, "").trim();
        const finalReply = clientReply || "سيتم تحويلك إلى أحد موظفينا للمساعدة، شكرًا لانتظارك.";

        const clientNumber = jid.split("@")[0]!;
        try {
          await evo.sendText(agent.instance_name, clientNumber, finalReply);
        } catch (e) {
          console.error("send failed", e);
        }

        // Notify the human employee privately with the client's details and a summary.
        if (handoffMatch && agent.employee_number) {
          const notice = [
            `🔔 طلب تحويل لموظف من «${agent.ai_name}»`,
            `اسم العميل: ${payload.data?.pushName || "غير معروف"}`,
            `رقم العميل: +${clientNumber}`,
            `آخر رسالة: ${userText}`,
            handoffSummary ? `ملخص المحادثة: ${handoffSummary}` : "",
          ]
            .filter(Boolean)
            .join("\n");
          try {
            await evo.sendText(agent.instance_name, agent.employee_number, notice);
          } catch (e) {
            console.error("employee notify failed", e);
          }
        }

        await supabaseAdmin.from("messages").insert([
          { agent_id: agent.id, remote_jid: jid, role: "user", content: userText },
          { agent_id: agent.id, remote_jid: jid, role: "assistant", content: finalReply },
        ]);

        return new Response("ok");
      },
      GET: async () => new Response("ok"),
    },
  },
});
