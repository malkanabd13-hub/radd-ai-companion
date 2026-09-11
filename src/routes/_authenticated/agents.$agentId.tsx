import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import {
  getAgent,
  updateAgent,
  deleteAgent,
  connectAgent,
  agentStatus,
  addKnowledge,
  addKnowledgeText,
  deleteKnowledge,
  addDataSource,
  deleteDataSource,
} from "@/lib/radd.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { ArrowRight, Database, FileText, QrCode, RefreshCw, Trash2, Upload } from "lucide-react";

export const Route = createFileRoute("/_authenticated/agents/$agentId")({
  head: () => ({
    meta: [
      { title: "إعدادات المساعد | ردّ" },
      { name: "description", content: "اربط واتساب عبر رمز QR، عدّل شخصية المساعد، وأضف ملفات المعرفة." },
      { property: "og:title", content: "إعدادات المساعد في ردّ" },
      { property: "og:description", content: "ربط واتساب، الشخصية، وقاعدة المعرفة." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AgentPage,
});

function AgentPage() {
  const { agentId } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const fetchAgent = useServerFn(getAgent);
  const save = useServerFn(updateAgent);
  const remove = useServerFn(deleteAgent);
  const connect = useServerFn(connectAgent);
  const status = useServerFn(agentStatus);
  const upload = useServerFn(addKnowledge);
  const addText = useServerFn(addKnowledgeText);
  const removeFile = useServerFn(deleteKnowledge);

  const fileRef = useRef<HTMLInputElement>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [pairing, setPairing] = useState<string | null>(null);
  const [note, setNote] = useState({ title: "", content: "" });

  const { data, isLoading } = useQuery({
    queryKey: ["agent", agentId],
    queryFn: () => fetchAgent({ data: { id: agentId } }),
  });

  const [form, setForm] = useState({
    ai_name: "",
    whatsapp_number: "",
    employee_number: "",
    persona: "",
    job: "",
    greeting: "",
  });

  useEffect(() => {
    if (data?.agent) {
      setForm({
        ai_name: data.agent.ai_name,
        whatsapp_number: data.agent.whatsapp_number,
        employee_number: data.agent.employee_number ?? "",
        persona: data.agent.persona,
        job: data.agent.job,
        greeting: data.agent.greeting,
      });
    }
  }, [data?.agent]);

  const statusQuery = useQuery({
    queryKey: ["agent-status", agentId],
    queryFn: () => status({ data: { id: agentId } }),
    refetchInterval: 8000,
  });
  const connected = statusQuery.data?.status === "open";

  useEffect(() => {
    if (connected) setQr(null);
  }, [connected]);

  const connectMutation = useMutation({
    mutationFn: (usePairing: boolean) => connect({ data: { id: agentId, pairing: usePairing } }),
    onSuccess: (res) => {
      setQr(res.qr);
      setPairing(res.pairingCode);
      if (!res.qr && !res.pairingCode) toast.info("لم يصل رمز جديد، قد يكون الرقم متصلاً بالفعل");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveMutation = useMutation({
    mutationFn: () => save({ data: { id: agentId, ...form } }),
    onSuccess: () => {
      toast.success("تم الحفظ");
      qc.invalidateQueries({ queryKey: ["agent", agentId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function onFile(file: File) {
    const buf = new Uint8Array(await file.arrayBuffer());
    let binary = "";
    for (const b of buf) binary += String.fromCharCode(b);
    try {
      await upload({
        data: {
          agent_id: agentId,
          file_name: file.name,
          base64: btoa(binary),
          is_pdf: file.name.toLowerCase().endsWith(".pdf") || file.type === "application/pdf",
        },
      });
      toast.success("تمت إضافة الملف إلى المعرفة");
      qc.invalidateQueries({ queryKey: ["agent", agentId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذّر رفع الملف");
    }
  }

  if (isLoading || !data) return <p className="p-10 text-muted-foreground">جارٍ التحميل...</p>;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <Link to="/dashboard" className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary">
        <ArrowRight className="h-4 w-4" /> رجوع للوحة التحكم
      </Link>

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-extrabold">{data.agent.ai_name}</h1>
        <span
          className={`rounded-full px-4 py-1.5 text-sm font-bold ${
            connected ? "bg-primary/15 text-primary" : "bg-secondary text-muted-foreground"
          }`}
        >
          {connected ? "متصل بواتساب" : "غير متصل"}
        </span>
      </div>

      <Tabs defaultValue="connect" dir="rtl">
        <TabsList className="grid w-full grid-cols-3 bg-secondary">
          <TabsTrigger value="connect">الربط</TabsTrigger>
          <TabsTrigger value="brain">الشخصية</TabsTrigger>
          <TabsTrigger value="knowledge">المعرفة</TabsTrigger>
        </TabsList>

        <TabsContent value="connect" className="mt-6">
          <div className="glow-card rounded-3xl border border-border bg-card p-6 text-center">
            {connected ? (
              <p className="py-10 text-lg font-bold text-primary">الرقم {data.agent.whatsapp_number} متصل ويعمل الآن.</p>
            ) : qr ? (
              <img
                src={qr.startsWith("data:") ? qr : `data:image/png;base64,${qr}`}
                alt="رمز QR لربط واتساب"
                width={280}
                height={280}
                className="mx-auto h-70 w-70 rounded-2xl bg-white p-3"
              />
            ) : (
              <div className="py-8">
                <QrCode className="mx-auto h-12 w-12 text-primary" />
                <p className="mt-3 text-muted-foreground">اضغط لتوليد رمز الربط ثم امسحه من واتساب &gt; الأجهزة المرتبطة.</p>
              </div>
            )}

            {pairing && !connected && (
              <p className="mt-4 text-lg">
                كود الربط: <span className="font-mono font-bold text-primary">{pairing}</span>
              </p>
            )}

            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <Button
                onClick={() => connectMutation.mutate(false)}
                disabled={connectMutation.isPending}
                className="brand-gradient font-bold text-primary-foreground"
              >
                <QrCode className="ml-2 h-4 w-4" /> رمز QR
              </Button>
              <Button variant="secondary" onClick={() => connectMutation.mutate(true)} disabled={connectMutation.isPending}>
                ربط بكود رقمي
              </Button>
              <Button variant="ghost" onClick={() => statusQuery.refetch()}>
                <RefreshCw className="ml-2 h-4 w-4" /> تحديث الحالة
              </Button>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="brain" className="mt-6">
          <form
            className="glow-card space-y-4 rounded-3xl border border-border bg-card p-6"
            onSubmit={(e) => {
              e.preventDefault();
              saveMutation.mutate();
            }}
          >
            <div className="space-y-2">
              <Label>اسم الذكاء</Label>
              <Input value={form.ai_name} onChange={(e) => setForm({ ...form, ai_name: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>رقم الواتساب</Label>
              <Input value={form.whatsapp_number} onChange={(e) => setForm({ ...form, whatsapp_number: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>رقم الموظف</Label>
              <Input value={form.employee_number} onChange={(e) => setForm({ ...form, employee_number: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>الشخصية</Label>
              <Textarea rows={3} value={form.persona} onChange={(e) => setForm({ ...form, persona: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>المهمة</Label>
              <Textarea rows={3} value={form.job} onChange={(e) => setForm({ ...form, job: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>رسالة الترحيب</Label>
              <Textarea rows={3} value={form.greeting} onChange={(e) => setForm({ ...form, greeting: e.target.value })} />
            </div>
            <div className="flex flex-wrap gap-3">
              <Button type="submit" disabled={saveMutation.isPending} className="brand-gradient font-bold text-primary-foreground">
                حفظ التعديلات
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={async () => {
                  if (!confirm("حذف هذا المساعد نهائيًا؟")) return;
                  await remove({ data: { id: agentId } });
                  toast.success("تم الحذف");
                  navigate({ to: "/dashboard" });
                }}
              >
                <Trash2 className="ml-2 h-4 w-4" /> حذف المساعد
              </Button>
            </div>
          </form>
        </TabsContent>

        <TabsContent value="knowledge" className="mt-6 space-y-4">
          <div className="glow-card rounded-3xl border border-border bg-card p-6">
            <p className="mb-4 text-muted-foreground">
              ارفع ملفات PDF أو نصية ليجيب الذكاء من محتواها، أو الصق معلومات مباشرة.
            </p>
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.txt,.md,.csv,.json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onFile(f);
                e.target.value = "";
              }}
            />
            <Button onClick={() => fileRef.current?.click()} className="brand-gradient font-bold text-primary-foreground">
              <Upload className="ml-2 h-4 w-4" /> رفع ملف
            </Button>

            <form
              className="mt-6 space-y-3"
              onSubmit={async (e) => {
                e.preventDefault();
                if (!note.title || !note.content) return;
                await addText({ data: { agent_id: agentId, ...note } });
                setNote({ title: "", content: "" });
                toast.success("تمت الإضافة");
                qc.invalidateQueries({ queryKey: ["agent", agentId] });
              }}
            >
              <Input
                placeholder="عنوان المعلومة (مثال: الأسعار)"
                value={note.title}
                onChange={(e) => setNote({ ...note, title: e.target.value })}
              />
              <Textarea
                rows={4}
                placeholder="اكتب المعلومات هنا..."
                value={note.content}
                onChange={(e) => setNote({ ...note, content: e.target.value })}
              />
              <Button type="submit" variant="secondary">
                إضافة نص للمعرفة
              </Button>
            </form>
          </div>

          <div className="space-y-2">
            {data.files.length === 0 && <p className="text-muted-foreground">لا توجد مصادر معرفة بعد.</p>}
            {data.files.map((f) => (
              <div key={f.id} className="flex items-center justify-between rounded-2xl border border-border bg-card p-4">
                <div className="flex items-center gap-3">
                  <FileText className="h-5 w-5 text-primary" />
                  <div>
                    <p className="font-bold">{f.file_name}</p>
                    <p className="text-xs text-muted-foreground">{f.size} حرف</p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={async () => {
                    await removeFile({ data: { id: f.id } });
                    qc.invalidateQueries({ queryKey: ["agent", agentId] });
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
