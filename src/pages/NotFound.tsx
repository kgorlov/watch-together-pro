import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft, Film, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

const generateRoomCode = () => Math.random().toString(36).slice(2, 8).toUpperCase();

const NotFound = () => {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  const createRoom = () => {
    navigate(`/room/${generateRoomCode()}`);
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 text-foreground">
      <div className="pointer-events-none absolute inset-0 bg-hero opacity-80" aria-hidden />
      <div className="pointer-events-none absolute left-1/2 top-1/4 h-[420px] w-[420px] -translate-x-1/2 rounded-full bg-primary/20 blur-[130px]" aria-hidden />

      <main className="relative z-10 w-full max-w-xl text-center">
        <div className="mx-auto mb-7 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-primary shadow-glow">
          <Film className="h-7 w-7 text-primary-foreground" />
        </div>

        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.35em] text-primary-glow">404</p>
        <h1 className="font-display text-4xl font-bold sm:text-5xl">Комната или страница не найдена</h1>
        <p className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-muted-foreground sm:text-base">
          Ссылка могла устареть, код комнаты набран с ошибкой или страница была перемещена.
        </p>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Button onClick={() => navigate("/")} variant="ghost" className="h-12 rounded-xl">
            <ArrowLeft className="mr-2 h-4 w-4" />
            На главную
          </Button>
          <Button onClick={createRoom} className="h-12 rounded-xl bg-gradient-primary shadow-glow">
            <Plus className="mr-2 h-4 w-4" />
            Создать комнату
          </Button>
        </div>
      </main>
    </div>
  );
};

export default NotFound;
