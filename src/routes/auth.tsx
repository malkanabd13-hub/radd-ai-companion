import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { phoneToEmail, normalizePhone } from "@/lib/phone-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import logo from "@/assets/radd-logo.png";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "تسجيل الدخول | ردّ - مساعد واتساب الذكي" },
      { name: "description", content: "أنشئ حسابك في ردّ برقم جوالك وابدأ بتشغيل مساعد ذكي يرد على عملائك في واتساب." },
      { property: "og:title", content: "تسجيل الدخول إلى ردّ" },
      { property: "og:description", content: "حساب ردّ برقم الجوال بدون بريد إلكتروني." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/dashboard" });
    });
  }, [navigate]);

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: phoneToEmail(phone),
      password,
    });
    setLoading(false);
    if (error) {
      toast.error("رقم الجوال أو كلمة المرور غير صحيحة");
      return;
    }
    toast.success("أهلاً بك مجددًا");
    navigate({ to: "/dashboard" });
  }

  async function signUp(e: React.FormEvent) {
    e.preventDefault();
    const digits = normalizePhone(phone);
    if (digits.length < 8) {
      toast.error("أدخل رقم جوال صحيح مع رمز الدولة");
      return;
    }
    if (password.length < 6) {
      toast.error("كلمة المرور 6 أحرف على الأقل");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email: phoneToEmail(phone),
      password,
      options: { data: { phone: digits, full_name: name } },
    });
    if (error) {
      setLoading(false);
      toast.error(
        error.message.includes("already") ? "هذا الرقم مسجّل مسبقًا" : "تعذّر إنشاء الحساب",
      );
      return;
    }
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: phoneToEmail(phone),
      password,
    });
    setLoading(false);
    if (signInError) {
      toast.error("تم إنشاء الحساب، حاول تسجيل الدخول");
      return;
    }
    toast.success("تم إنشاء حسابك");
    navigate({ to: "/dashboard" });
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <Link to="/" className="mb-8 flex flex-col items-center gap-3">
          <img src={logo} alt="شعار ردّ" width={72} height={72} className="h-16 w-16" />
          <span className="brand-text text-4xl font-extrabold">ردّ</span>
        </Link>

        <div className="glow-card rounded-3xl border border-border bg-card p-6">
          <Tabs defaultValue="signin" dir="rtl">
            <TabsList className="grid w-full grid-cols-2 bg-secondary">
              <TabsTrigger value="signin">دخول</TabsTrigger>
              <TabsTrigger value="signup">حساب جديد</TabsTrigger>
            </TabsList>

            <TabsContent value="signin">
              <form onSubmit={signIn} className="mt-5 space-y-4">
                <Field label="رقم الجوال" value={phone} onChange={setPhone} placeholder="9665xxxxxxxx" />
                <Field label="كلمة المرور" value={password} onChange={setPassword} type="password" />
                <Button type="submit" disabled={loading} className="w-full brand-gradient font-bold text-primary-foreground">
                  {loading ? "جارٍ الدخول..." : "تسجيل الدخول"}
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="signup">
              <form onSubmit={signUp} className="mt-5 space-y-4">
                <Field label="الاسم" value={name} onChange={setName} placeholder="اسمك أو اسم شركتك" />
                <Field label="رقم الجوال" value={phone} onChange={setPhone} placeholder="9665xxxxxxxx" />
                <Field label="كلمة المرور" value={password} onChange={setPassword} type="password" />
                <Button type="submit" disabled={loading} className="w-full brand-gradient font-bold text-primary-foreground">
                  {loading ? "جارٍ الإنشاء..." : "إنشاء الحساب"}
                </Button>
                <p className="text-center text-xs text-muted-foreground">
                  لا حاجة لتأكيد أي بريد إلكتروني، الحساب يعمل مباشرة.
                </p>
              </form>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </main>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="bg-secondary/60"
        required
      />
    </div>
  );
}
