import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Play, Sparkles, Users, Youtube, Upload, MessagesSquare, Film, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import heroImg from "@/assets/hero-cinema.jpg";

const generateRoomCode = () =>
  Math.random().toString(36).slice(2, 8).toUpperCase();

const Index = () => {
  const navigate = useNavigate();
  const [joinCode, setJoinCode] = useState("");
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const createRoom = () => {
    const code = generateRoomCode();
    navigate(`/room/${code}`);
  };

  const joinRoom = (e: React.FormEvent) => {
    e.preventDefault();
    if (!joinCode.trim()) return;
    navigate(`/room/${joinCode.trim().toUpperCase()}`);
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      {/* Background visuals */}
      <div className="absolute inset-0 bg-hero" aria-hidden />
      <div
        className="absolute inset-0 opacity-30 mix-blend-screen"
        style={{ backgroundImage: `url(${heroImg})`, backgroundSize: "cover", backgroundPosition: "center" }}
        aria-hidden
      />
      <div className="absolute inset-0 noise" aria-hidden />

      {/* Floating glow orbs */}
      <div className="pointer-events-none absolute -top-32 -left-20 h-[420px] w-[420px] rounded-full bg-primary/30 blur-[120px] animate-pulse-glow" aria-hidden />
      <div className="pointer-events-none absolute bottom-0 right-0 h-[500px] w-[500px] rounded-full bg-accent/20 blur-[140px] animate-pulse-glow" style={{ animationDelay: "1.5s" }} aria-hidden />

      {/* Nav */}
      <header className="relative z-10 mx-auto flex max-w-7xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-primary shadow-glow">
            <Film className="h-5 w-5 text-primary-foreground" />
          </div>
          <span className="font-display text-xl font-bold tracking-tight">Lumen</span>
        </div>
        <nav className="hidden items-center gap-8 text-sm text-muted-foreground md:flex">
          <a href="#features" className="transition-colors hover:text-foreground">Возможности</a>
          <a href="#how" className="transition-colors hover:text-foreground">Как это работает</a>
          <a href="#faq" className="transition-colors hover:text-foreground">Вопросы</a>
        </nav>
        <Button variant="ghost" onClick={createRoom} className="hidden md:inline-flex">
          Создать комнату
        </Button>
      </header>

      {/* Hero */}
      <main className="relative z-10 mx-auto max-w-7xl px-6">
        <section className={`pt-16 pb-24 text-center ${mounted ? "animate-fade-up" : "opacity-0"}`}>
          <div className="mx-auto inline-flex items-center gap-2 rounded-full glass px-4 py-1.5 text-xs font-medium text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5 text-primary-glow" />
            Совместный кинопросмотр в реальном времени
          </div>

          <h1 className="mx-auto mt-8 max-w-4xl font-display text-5xl font-bold leading-[1.05] tracking-tight md:text-7xl lg:text-[88px]">
            Один сеанс.
            <br />
            <span className="text-gradient">Любое расстояние.</span>
          </h1>

          <p className="mx-auto mt-6 max-w-xl text-lg text-muted-foreground">
            Смотрите YouTube и свои видео синхронно с друзьями. Чат, реакции
            и плеер в одной красивой комнате.
          </p>

          <div className="mx-auto mt-12 grid max-w-2xl gap-4 md:grid-cols-[1fr_auto_1fr] md:items-stretch">
            <Button
              onClick={createRoom}
              size="lg"
              className="h-14 rounded-2xl bg-gradient-primary text-base font-semibold shadow-glow transition-transform hover:scale-[1.02]"
            >
              <Play className="mr-2 h-5 w-5" /> Создать комнату
            </Button>

            <div className="flex items-center justify-center text-xs uppercase tracking-widest text-muted-foreground md:flex-col">
              <span className="px-2">или</span>
            </div>

            <form onSubmit={joinRoom} className="flex h-14 items-stretch overflow-hidden rounded-2xl glass">
              <Input
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                placeholder="Код комнаты"
                maxLength={10}
                className="h-full flex-1 border-0 bg-transparent px-5 text-base tracking-[0.2em] placeholder:tracking-normal placeholder:text-muted-foreground/70 focus-visible:ring-0"
              />
              <Button type="submit" variant="ghost" className="h-full rounded-none px-5 hover:bg-primary/20">
                Войти <ArrowRight className="ml-1.5 h-4 w-4" />
              </Button>
            </form>
          </div>

          {/* Stats strip */}
          <div className="mx-auto mt-16 flex max-w-3xl flex-wrap items-center justify-center gap-x-12 gap-y-4 text-sm text-muted-foreground">
            <div className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" /> Без задержек</div>
            <div>Без регистрации</div>
            <div>До 50 зрителей в комнате</div>
            <div>HD качество</div>
          </div>
        </section>

        {/* Features */}
        <section id="features" className="grid gap-6 pb-24 md:grid-cols-3">
          {[
            {
              icon: Youtube,
              title: "YouTube",
              text: "Вставьте ссылку — видео загрузится и засинхронится у всех зрителей одной кнопкой.",
            },
            {
              icon: Upload,
              title: "Свои файлы",
              text: "Загружайте локальные видео в формате MP4 / WebM и смотрите вместе с друзьями.",
            },
            {
              icon: MessagesSquare,
              title: "Живой чат",
              text: "Обсуждайте моменты в реальном времени. Эмодзи-реакции, статус зрителей онлайн.",
            },
          ].map((f, i) => (
            <article
              key={f.title}
              className="group relative overflow-hidden rounded-3xl border border-border/60 bg-gradient-card p-8 shadow-elevated transition-all hover:-translate-y-1 hover:shadow-glow"
              style={{ animationDelay: `${i * 100}ms` }}
            >
              <div className="absolute -right-16 -top-16 h-44 w-44 rounded-full bg-primary/20 blur-3xl transition-opacity group-hover:opacity-80" />
              <div className="relative">
                <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/15 ring-1 ring-primary/30">
                  <f.icon className="h-6 w-6 text-primary-glow" />
                </div>
                <h3 className="mb-2 font-display text-2xl font-semibold">{f.title}</h3>
                <p className="text-muted-foreground leading-relaxed">{f.text}</p>
              </div>
            </article>
          ))}
        </section>

        {/* How it works */}
        <section id="how" className="pb-28">
          <div className="mb-12 text-center">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.3em] text-primary-glow">Как это работает</p>
            <h2 className="font-display text-4xl font-bold md:text-5xl">Три шага до сеанса</h2>
          </div>
          <div className="relative grid gap-6 md:grid-cols-3">
            {[
              { n: "01", t: "Создайте комнату", d: "Получите уникальный код и поделитесь им с друзьями." },
              { n: "02", t: "Выберите источник", d: "Вставьте ссылку YouTube или загрузите свой видеофайл." },
              { n: "03", t: "Смотрите вместе", d: "Плеер синхронизируется автоматически. Чат всегда под рукой." },
            ].map((s) => (
              <div key={s.n} className="relative rounded-3xl border border-border/60 bg-card/60 p-8 backdrop-blur">
                <div className="font-display text-6xl font-bold text-gradient">{s.n}</div>
                <h3 className="mt-4 font-display text-xl font-semibold">{s.t}</h3>
                <p className="mt-2 text-muted-foreground">{s.d}</p>
              </div>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section className="mb-24">
          <div className="relative overflow-hidden rounded-[36px] border border-border/60 bg-gradient-card p-10 text-center shadow-elevated md:p-16">
            <div className="absolute inset-0 bg-gradient-primary opacity-20" aria-hidden />
            <div className="relative">
              <Users className="mx-auto h-10 w-10 text-primary-glow" />
              <h2 className="mt-4 font-display text-4xl font-bold md:text-5xl">Готовы начать сеанс?</h2>
              <p className="mx-auto mt-3 max-w-md text-muted-foreground">
                Одним кликом создайте комнату и пригласите друзей.
              </p>
              <Button
                onClick={createRoom}
                size="lg"
                className="mt-8 h-14 rounded-2xl bg-foreground px-8 text-base font-semibold text-background hover:bg-foreground/90"
              >
                <Play className="mr-2 h-5 w-5" /> Создать комнату сейчас
              </Button>
            </div>
          </div>
        </section>

        <footer id="faq" className="border-t border-border/50 py-10 text-center text-sm text-muted-foreground">
          © {new Date().getFullYear()} Lumen — совместный кинопросмотр. Курсовой проект.
        </footer>
      </main>
    </div>
  );
};

export default Index;
