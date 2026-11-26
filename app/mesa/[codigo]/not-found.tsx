import Link from "next/link";
import { CircleX } from "lucide-react";
import { Brand } from "@/components/brand";
import { ThemeToggle } from "@/components/theme-toggle";

export default function TableNotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col bg-[var(--cream)] px-5 py-6 text-[var(--ink)]">
      <div className="flex items-center justify-between">
        <Brand compact />
        <ThemeToggle />
      </div>
      <div className="my-auto rounded-[2rem] bg-[var(--paper)] p-8 text-center shadow-[0_8px_30px_rgba(0,0,0,0.05)] ring-1 ring-black/[0.06] dark:bg-neutral-900 dark:ring-white/10">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-red-500/10 text-red-600 dark:text-red-400">
          <CircleX size={28} />
        </span>
        <h1 className="mt-5 font-display text-2xl font-semibold tracking-[-0.025em]">
          Esta mesa no existe
        </h1>
        <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">
          Escanea nuevamente el código QR colocado en tu mesa o solicita ayuda al personal.
        </p>
        <Link
          className="focus-ring mt-6 inline-flex min-h-11 items-center justify-center rounded-full bg-neutral-950 px-6 text-sm font-semibold text-white transition active:scale-95 dark:bg-white dark:text-neutral-950"
          href="/"
        >
          Ir al inicio
        </Link>
      </div>
    </main>
  );
}
