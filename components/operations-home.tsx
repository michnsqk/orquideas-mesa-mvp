import Link from "next/link";
import {
  ArrowRight,
  ChefHat,
  ExternalLink,
  HandPlatter,
  QrCode,
  ShieldCheck,
  ShoppingBag,
  Smartphone,
} from "lucide-react";
import { Brand } from "@/components/brand";
import { ThemeToggle } from "@/components/theme-toggle";

export function OperationsHome() {
  return (
    <main className="min-h-dvh bg-[var(--cream)] text-[var(--ink)]">
      {/* ── Header bar ── */}
      <header className="sticky top-0 z-20 border-b border-black/[0.06] bg-[var(--cream)]/85 backdrop-blur-xl dark:border-white/[0.08]">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3.5 sm:px-6">
          <Brand compact />
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/12 px-3 py-1.5 text-xs font-semibold text-emerald-800 dark:text-emerald-300">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 pulse-dot" />
              En operación
            </span>
            <ThemeToggle />
          </div>
        </div>
      </header>

      {/* ── Editorial Hero (Apple + Pixel) ── */}
      <section className="mx-auto max-w-5xl px-4 pt-8 pb-6 sm:px-6 sm:pt-14 sm:pb-10">
        <div className="overflow-hidden rounded-[2rem] bg-[var(--paper)] p-6 shadow-[0_8px_32px_rgba(0,0,0,0.04)] ring-1 ring-black/[0.06] dark:bg-neutral-900 dark:ring-white/10 sm:p-10">
          <span className="inline-flex items-center rounded-full bg-black/[0.05] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-600 dark:bg-white/[0.08] dark:text-neutral-300">
            Cocina de barrio · Av. Orquídeas
          </span>
          <h1 className="mt-4 max-w-2xl font-display text-[2rem] font-semibold leading-[1.06] tracking-[-0.035em] text-pretty sm:text-5xl">
            Pide desde la mesa.{" "}
            <span className="text-neutral-500 dark:text-neutral-400">
              Sigue tu orden en tiempo real.
            </span>
          </h1>
          <p className="mt-4 max-w-xl text-[15px] leading-6 text-neutral-500 dark:text-neutral-400 sm:text-base">
            Escanea el código QR de tu mesa, elige tus platillos y recíbelos sin esperar. Cocina,
            meseros y tu cuenta sincronizados al instante.
          </p>
          <div className="mt-7 flex flex-wrap gap-2.5">
            <Link
              className="focus-ring inline-flex min-h-12 items-center gap-2 rounded-full bg-neutral-950 px-5 text-sm font-semibold text-white shadow-sm transition active:scale-95 dark:bg-white dark:text-neutral-950"
              href="/mesa/A1"
            >
              Abrir Mesa A1 <ExternalLink size={15} />
            </Link>
            <Link
              className="focus-ring inline-flex min-h-12 items-center gap-2 rounded-full bg-black/[0.055] px-5 text-sm font-semibold text-[var(--ink)] transition hover:bg-black/[0.09] active:scale-95 dark:bg-white/[0.09] dark:hover:bg-white/[0.14]"
              href="/cocina"
            >
              <ChefHat size={17} /> Cocina
            </Link>
            <Link
              className="focus-ring inline-flex min-h-12 items-center gap-2 rounded-full bg-black/[0.055] px-5 text-sm font-semibold text-[var(--ink)] transition hover:bg-black/[0.09] active:scale-95 dark:bg-white/[0.09] dark:hover:bg-white/[0.14]"
              href="/meseros"
            >
              <HandPlatter size={17} /> Meseros
            </Link>
          </div>
        </div>
      </section>

      {/* ── Quick actions ── */}
      <div className="mx-auto max-w-5xl px-4 pb-12 sm:px-6">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <QuickCard
            href="/mesa/A1"
            icon={Smartphone}
            title="Mesa A1"
            subtitle="Menú digital"
          />
          <QuickCard
            href="/cocina"
            icon={ChefHat}
            title="Cocina"
            subtitle="Tablero en vivo"
          />
          <QuickCard
            href="/meseros"
            icon={HandPlatter}
            title="Meseros"
            subtitle="Sala y cuentas"
          />
          <QuickCard
            href="/llevar"
            icon={ShoppingBag}
            title="Para llevar"
            subtitle="Pedidos externos"
          />
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Link
            className="focus-ring flex items-center justify-between rounded-[1.5rem] bg-[var(--paper)] px-5 py-4 shadow-[0_1px_2px_rgba(0,0,0,0.03)] ring-1 ring-black/[0.06] transition hover:ring-black/15 active:scale-[0.99] dark:bg-neutral-900 dark:ring-white/10 dark:hover:ring-white/20"
            href="/qr"
          >
            <span className="flex items-center gap-3.5">
              <span className="grid h-10 w-10 place-items-center rounded-2xl bg-black/[0.05] text-[var(--ink)] dark:bg-white/[0.08]">
                <QrCode size={19} />
              </span>
              <span>
                <span className="block text-sm font-semibold">Códigos QR de mesa</span>
                <span className="text-xs text-neutral-500 dark:text-neutral-400">
                  Imprimir hoja A1–B3
                </span>
              </span>
            </span>
            <ArrowRight size={17} className="text-neutral-400" />
          </Link>

          <Link
            className="focus-ring flex items-center justify-between rounded-[1.5rem] bg-[var(--paper)] px-5 py-4 shadow-[0_1px_2px_rgba(0,0,0,0.03)] ring-1 ring-black/[0.06] transition hover:ring-black/15 active:scale-[0.99] dark:bg-neutral-900 dark:ring-white/10 dark:hover:ring-white/20"
            href="/admin"
          >
            <span className="flex items-center gap-3.5">
              <span className="grid h-10 w-10 place-items-center rounded-2xl bg-black/[0.05] text-[var(--ink)] dark:bg-white/[0.08]">
                <ShieldCheck size={19} />
              </span>
              <span>
                <span className="block text-sm font-semibold">Administración</span>
                <span className="text-xs text-neutral-500 dark:text-neutral-400">
                  Menú del día, extras y reportes
                </span>
              </span>
            </span>
            <ArrowRight size={17} className="text-neutral-400" />
          </Link>
        </div>
      </div>
    </main>
  );
}

function QuickCard({
  href,
  icon: Icon,
  title,
  subtitle,
}: {
  href: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  title: string;
  subtitle: string;
}) {
  return (
    <Link
      className="focus-ring card-hover group flex flex-col gap-3 rounded-[1.6rem] bg-[var(--paper)] p-4.5 shadow-[0_1px_2px_rgba(0,0,0,0.03)] ring-1 ring-black/[0.06] transition active:scale-[0.98] dark:bg-neutral-900 dark:ring-white/10 sm:p-5"
      href={href}
    >
      <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-black/[0.05] text-[var(--ink)] transition-colors duration-200 group-hover:bg-neutral-950 group-hover:text-white dark:bg-white/[0.08] dark:group-hover:bg-white dark:group-hover:text-neutral-950">
        <Icon size={20} />
      </span>
      <div>
        <p className="font-display text-[15px] font-semibold tracking-[-0.01em]">{title}</p>
        <p className="text-xs text-neutral-500 dark:text-neutral-400">{subtitle}</p>
      </div>
    </Link>
  );
}
