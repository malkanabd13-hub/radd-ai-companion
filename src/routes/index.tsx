import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Bot, BrainCircuit, MessageSquareText, QrCode } from "lucide-react";
import logo from "@/assets/radd-logo.png";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "ردّ | مساعد ذكي يرد على عملائك في واتساب" },
      {
        name: "description",
        content: "ردّ يربط رقم واتساب عملك بذكاء اصطناعي عربي يجيب من ملفاتك وبيانات شركتك على مدار الساعة.",
      },
      { property: "og:title", content: "ردّ | مساعد واتساب الذكي بالعربية" },
      { property: "og:description", content: "اربط رقمك، أضف معرفتك، وحدد شخصية الذكاء — وابدأ الرد تلقائيًا." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Home,
});

function Home() {
  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-6">
        <div className="flex items-center gap-2">
          <img src={logo} alt="شعار ردّ" width={40} height={40} className="h-10 w-10" />
          <span className="brand-text text-3xl font-extrabold">ردّ</span>
        </div>
        <Link to="/auth">
          <Button variant="secondary" className="font-bold">
            الدخول
          </Button>
        </Link>
      </header>

      <main className="mx-auto max-w-6xl px-4">
        <section className="py-16 text-center sm:py-24">
          <h1 className="text-4xl font-extrabold leading-tight sm:text-6xl">
            دع <span className="brand-text">ردّ</span> يرد على عملائك في واتساب
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-muted-foreground">
            اربط رقم واتساب شركتك خلال دقيقة، ارفع ملفاتك ومعلوماتك، وحدّد شخصية المساعد واسمه — وسيتولى الرد
            بالعربية على مدار الساعة.
          </p>
          <div className="mt-9 flex flex-wrap justify-center gap-3">
            <Link to="/auth">
              <Button size="lg" className="brand-gradient px-8 text-base font-bold text-primary-foreground">
                ابدأ الآن مجانًا
              </Button>
            </Link>
          </div>
        </section>

        <section className="grid gap-4 pb-24 sm:grid-cols-2 lg:grid-cols-4">
          <Feature icon={<QrCode className="h-6 w-6" />} title="ربط فوري" text="امسح رمز QR أو استخدم كود الربط لتوصيل رقمك." />
          <Feature icon={<BrainCircuit className="h-6 w-6" />} title="معرفة خاصة" text="ارفع PDF أو نصوصًا ليجيب الذكاء من بياناتك أنت." />
          <Feature icon={<Bot className="h-6 w-6" />} title="شخصية واسم" text="حدّد اسم المساعد وشخصيته ومهمته وطريقة ترحيبه." />
          <Feature icon={<MessageSquareText className="h-6 w-6" />} title="تحويل للموظف" text="أضف رقم موظف ليحوّل العميل عند الحاجة." />
        </section>
      </main>

      <footer className="border-t border-border/60 py-8 text-center text-sm text-muted-foreground">
        ردّ — مساعد واتساب الذكي بالعربية
      </footer>
    </div>
  );
}

function Feature({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <div className="glow-card rounded-3xl border border-border bg-card p-6">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/15 text-primary">{icon}</div>
      <h2 className="mt-4 text-lg font-bold">{title}</h2>
      <p className="mt-2 text-sm text-muted-foreground">{text}</p>
    </div>
  );
}
