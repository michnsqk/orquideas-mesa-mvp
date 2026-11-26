"use client";

import { useState } from "react";
import { Phone, User } from "lucide-react";
import { MenuClient } from "@/components/menu-client";

export default function LlevarPage() {
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [started, setStarted] = useState(false);

  if (!started) {
    return (
      <main className="grid min-h-dvh place-items-center bg-[var(--cream)] px-4 py-8">
        <div className="w-full max-w-md rounded-[2rem] bg-[var(--paper)] p-6 shadow-[0_8px_32px_rgba(0,0,0,0.07)] ring-1 ring-black/[0.06] dark:bg-neutral-900 dark:ring-white/10 sm:p-8">
          <div className="text-center">
            <span className="inline-grid h-14 w-14 place-items-center rounded-[1.15rem] bg-neutral-950 text-2xl shadow-sm dark:bg-white">
              🥡
            </span>
            <h1 className="mt-4 font-display text-2xl font-semibold tracking-[-0.03em] text-[var(--ink)] sm:text-3xl">
              Pedido para llevar
            </h1>
            <p className="mt-1.5 text-sm leading-relaxed text-neutral-500 dark:text-neutral-400">
              Arma tu pedido y pasa a recogerlo recién hecho.
            </p>
          </div>

          <div className="mt-6 space-y-3.5">
            <label className="block">
              <span className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-neutral-600 dark:text-neutral-300">
                <User size={14} /> Tu nombre
              </span>
              <input
                autoFocus
                className="w-full rounded-2xl bg-black/[0.045] px-4 py-3.5 text-base text-[var(--ink)] outline-none ring-1 ring-transparent transition focus:bg-white focus:ring-neutral-900/20 dark:bg-white/[0.08] dark:text-white dark:focus:bg-neutral-800 dark:focus:ring-white/25"
                placeholder="Ej. Juan Pérez"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
              />
            </label>
            <label className="block">
              <span className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-neutral-600 dark:text-neutral-300">
                <Phone size={14} /> Teléfono (opcional, para avisarte)
              </span>
              <input
                className="w-full rounded-2xl bg-black/[0.045] px-4 py-3.5 text-base text-[var(--ink)] outline-none ring-1 ring-transparent transition focus:bg-white focus:ring-neutral-900/20 dark:bg-white/[0.08] dark:text-white dark:focus:bg-neutral-800 dark:focus:ring-white/25"
                placeholder="55 1234 5678"
                inputMode="tel"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
              />
            </label>
          </div>

          <button
            type="button"
            className="focus-ring mt-6 flex min-h-13 w-full items-center justify-center gap-2 rounded-full bg-neutral-950 px-5 text-[15px] font-semibold text-white shadow-sm transition active:scale-[0.98] disabled:opacity-35 dark:bg-white dark:text-neutral-950"
            disabled={!customerName.trim()}
            onClick={() => setStarted(true)}
          >
            Ver menú completo
          </button>
        </div>
      </main>
    );
  }

  return <MenuClient tableCode="LLEVAR" customerName={customerName.trim()} customerPhone={customerPhone.trim()} />;
}
