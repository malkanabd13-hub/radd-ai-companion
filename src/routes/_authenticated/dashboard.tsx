import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { listAgents, createAgent } from "@/lib/radd.functions";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Bot, LogOut, Plus, Smartphone } from "lucide-react";
import logo from "@/assets/radd-logo.png";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "لوحة التحكم | ردّ" },
      { name: "description", content: "أدر مساعديك الأذكياء على واتساب: الربط، الشخصية، والمعرفة." },
      { property: "og:title", content: "لوحة تحكم ردّ" },
      { property: "og:description", content: "إدارة مساعدي واتساب الأذكياء." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const fetchAgents = useServerFn(listAgents);
  const create = useServerFn(createAgent);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    ai_name: "",
    whatsapp_number: "",
    employee_number: "",
    persona: "",
    job: "",
    greeting: "",
  });

  const { data: agents = [], isLoading } = useQuery({
    queryKey: ["agents"],
    queryFn: () => fetchAgents(),
  });

  const mutation = useMutation({
    mutationFn: () => create({ data: form }),
    onSuccess: (res) => {
      setOpen(false);
      if (res.warning) toast.warning(res.warning);
      else toast.success("تم إنشاء المساعد");
      qc.invalidateQueries({ queryKey: ["agents"] });
      navigate({ to: "/agents/$agentId", params: { agentId: res.agent.id } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="min-h-screen">
      <header className="border-b border-border/60 bg-card/40 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
          <Link to="/" className="flex items-center gap-2">
            <img src={logo} alt="شعار ردّ" width={36} height={36} className="h-9 w-9" loading="lazy" />
            <span className="brand-text text-2xl font-extrabold">ردّ</span>
          </Link>
          <Button
            variant="ghost"
            onClick={async () => {
              await supabase.auth.signOut();
              navigate({ to: "/auth" });
            }}
          >
            <LogOut className="ml-2 h-4 w-4" /> خروج
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-10">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-extrabold">مساعدوك الأذكياء</h1>
            <p className="mt-1 text-muted-foreground">اربط رقم واتساب، درّب الذكاء، ودعه يرد نيابة عنك.</p>
          </div>

          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="brand-gradient font-bold text-primary-foreground">
                <Plus className="ml-2 h-4 w-4" /> مساعد جديد
              </Button>
            </DialogTrigger>
            <DialogContent dir="rtl" className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>إنشاء مساعد جديد</DialogTitle>
              </DialogHeader>
              <form
                className="space-y-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  mutation.mutate();
                }}
              >
                <div className="space-y-2">
                  <Label>اسم الذكاء الاصطناعي (يذكره في الترحيب)</Label>
                  <Input
                    required
                    value={form.ai_name}
                    onChange={(e) => setForm({ ...form, ai_name: e.target.value })}
                    placeholder="مثال: سارة"
                  />
                </div>
                <div className="space-y-2">
                  <Label>رقم الواتساب الذي سيعمل عليه الذكاء</Label>
                  <Input
                    required
                    value={form.whatsapp_number}
                    onChange={(e) => setForm({ ...form, whatsapp_number: e.target.value })}
                    placeholder="9665xxxxxxxx"
                  />
                </div>
                <div className="space-y-2">
                  <Label>رقم الموظف (للتحويل البشري)</Label>
                  <Input
                    value={form.employee_number}
                    onChange={(e) => setForm({ ...form, employee_number: e.target.value })}
                    placeholder="9665xxxxxxxx"
                  />
                </div>
                <div className="space-y-2">
                  <Label>شخصية الذكاء</Label>
                  <Textarea
                    value={form.persona}
                    onChange={(e) => setForm({ ...form, persona: e.target.value })}
                    placeholder="ودود، مختصر، يستخدم اللهجة العربية الفصحى المبسطة"
                  />
                </div>
                <div className="space-y-2">
                  <Label>مهمته / وظيفته</Label>
                  <Textarea
                    value={form.job}
                    onChange={(e) => setForm({ ...form, job: e.target.value })}
                    placeholder="الرد على استفسارات العملاء عن المنتجات والأسعار وحجز المواعيد"
                  />
                </div>
                <div className="space-y-2">
                  <Label>رسالة الترحيب الأولى</Label>
                  <Textarea
                    value={form.greeting}
                    onChange={(e) => setForm({ ...form, greeting: e.target.value })}
                    placeholder="أهلاً بك! أنا سارة مساعدتك الذكية، كيف أقدر أخدمك؟"
                  />
                </div>
                <Button
                  type="submit"
                  disabled={mutation.isPending}
                  className="w-full brand-gradient font-bold text-primary-foreground"
                >
                  {mutation.isPending ? "جارٍ الإنشاء..." : "إنشاء وربط"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {isLoading ? (
          <p className="text-muted-foreground">جارٍ التحميل...</p>
        ) : agents.length === 0 ? (
          <div className="glow-card rounded-3xl border border-dashed border-border bg-card/50 p-12 text-center">
            <Bot className="mx-auto h-10 w-10 text-primary" />
            <p className="mt-4 text-lg font-bold">لا يوجد مساعد بعد</p>
            <p className="mt-1 text-muted-foreground">أنشئ أول مساعد واربطه برقم واتساب خلال دقيقة.</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {agents.map((a) => (
              <Link
                key={a.id}
                to="/agents/$agentId"
                params={{ agentId: a.id }}
                className="glow-card group rounded-2xl border border-border bg-card p-5 transition hover:border-primary/60"
              >
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-bold">{a.ai_name}</h2>
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-bold ${
                      a.status === "open"
                        ? "bg-primary/15 text-primary"
                        : "bg-secondary text-muted-foreground"
                    }`}
                  >
                    {a.status === "open" ? "متصل" : "غير متصل"}
                  </span>
                </div>
                <p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
                  <Smartphone className="h-4 w-4" /> {a.whatsapp_number}
                </p>
                <p className="mt-3 line-clamp-2 text-sm text-muted-foreground">{a.job || "بدون وصف مهمة"}</p>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
