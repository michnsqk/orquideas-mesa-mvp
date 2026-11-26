"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Brand } from "@/components/brand";
import { StatusPill } from "@/components/status-pill";
import { ThemeToggle } from "@/components/theme-toggle";
import { money } from "@/lib/menu";
import type { Order } from "@/lib/types";
import { ArrowLeft, Check, Copy, Share2 } from "lucide-react";

export default function TrackingPage() {
  const params = useParams<{ folio: string }>();
  const folio = params?.folio || "";
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const channelRef = useRef<{ close: () => void } | null>(null);
  const prevStatusRef = useRef<string | null>(null);
  const orderId = order?.id ?? null;

  useEffect(() => {
    if (!folio) return;
    const load = async () => {
      try {
        const res = await fetch(`/api/orders/track?folio=${encodeURIComponent(folio)}`);
        const payload = (await res.json().catch(() => null)) as
          | { error?: string }
          | Order
          | Order[]
          | null;
        if (!res.ok) {
          const message =
            payload && typeof payload === "object" && "error" in payload && payload.error
              ? payload.error
              : "No pudimos consultar tu pedido. Intenta de nuevo.";
          setError(message);
          return;
        }
        const found = Array.isArray(payload) ? payload[0] : payload;
        if (found && typeof found === "object" && "id" in found) {
          setOrder(found as Order);
        } else {
          setError("No encontramos ese pedido. Revisa el número de folio.");
        }
      } catch {
        setError("No pudimos consultar tu pedido. Intenta de nuevo.");
      } finally {
        setLoading(false);
      }
    };
    void load();

    const timer = setInterval(() => {
      if (!document.hidden) void load();
    }, 8000);
    return () => clearInterval(timer);
  }, [folio]);

  useEffect(() => {
    if (!orderId) return;
    let disposed = false;
    const connect = () => {
      if (disposed || channelRef.current) return;
      void import("@/lib/order-store")
        .then(({ connectOrderChannel }) => {
          if (disposed || channelRef.current) return;
          channelRef.current = connectOrderChannel(({ order: incoming }) => {
            if (incoming && incoming.id === orderId) {
              setOrder(incoming);
            }
          });
        })
        .catch(() => undefined);
    };
    connect();
    const onPageHide = () => {
      channelRef.current?.close();
      channelRef.current = null;
    };
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) connect();
    };
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      disposed = true;
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("pageshow", onPageShow);
      channelRef.current?.close();
      channelRef.current = null;
    };
  }, [orderId]);

  useEffect(() => {
    if (!order?.status) return;
    if (prevStatusRef.current && prevStatusRef.current !== "ready" && order.status === "ready") {
      try {
        navigator.vibrate?.([220, 100, 220, 100, 360]);
      } catch {
        // vibrate not supported
      }
    }
    prevStatusRef.current = order.status;
  }, [order?.status]);

  const steps = ["accepted", "preparing", "ready", "delivered"] as const;
  const current = order
    ? steps.indexOf(
        order.status === "cancelled" || order.status === "sent"
          ? "accepted"
          : order.status
      )
    : 0;

  const shareLink = typeof window !== "undefined" ? `${window.location.origin}/seguimiento/${folio}` : "";
  const shareText = `🍽️ Mi pedido en Imperio · ${order?.folio || folio}`;
  const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(`${shareText}\n${shareLink}`)}`;

  if (loading) {
    return (
      <main className="mx-auto min-h-dvh max-w-xl bg-[var(--cream)] px-4 py-6 text-[var(--ink)] sm:px-6">
        <div className="flex items-center justify-between">
          <Brand compact />
          <ThemeToggle />
        </div>
        <div className="mt-6 rounded-[2rem] bg-[var(--paper)] p-6 ring-1 ring-black/[0.06] dark:bg-neutral-900 dark:ring-white/10">
          <div className="skeleton h-6 w-28 rounded-full" />
          <div className="skeleton mt-4 h-9 w-3/4 rounded-xl" />
          <div className="skeleton mt-5 h-2 w-full rounded-full" />
          <div className="skeleton mt-6 h-24 w-full rounded-2xl" />
        </div>
      </main>
    );
  }

  if (error || !order) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-xl flex-col bg-[var(--cream)] px-4 py-6 text-[var(--ink)] sm:px-6">
        <div className="flex items-center justify-between">
          <Brand compact />
          <ThemeToggle />
        </div>
        <div className="my-auto rounded-[2rem] bg-[var(--paper)] p-7 text-center shadow-[0_8px_30px_rgba(0,0,0,0.05)] ring-1 ring-black/[0.06] dark:bg-neutral-900 dark:ring-white/10">
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-red-500/10 text-2xl">
            😕
          </span>
          <h1 className="mt-4 font-display text-2xl font-semibold tracking-[-0.025em]">
            No encontramos el pedido
          </h1>
          <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">
            {error || "Verifica tu número de folio e intenta de nuevo."}
          </p>
          <Link
            href="/llevar"
            className="focus-ring mt-6 inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-neutral-950 px-5 text-sm font-semibold text-white transition active:scale-95 dark:bg-white dark:text-neutral-950"
          >
            <ArrowLeft size={16} /> Ir a pedidos para llevar
          </Link>
        </div>
      </main>
    );
  }

  const isReady = order.status === "ready";
  const isCancelled = order.status === "cancelled";
  const isTakeaway = order.tableCode === "LLEVAR";

  const trackingTitle =
    order.status === "accepted" || order.status === "sent"
      ? "Pedido confirmado"
      : order.status === "preparing"
        ? "Estamos preparando tu pedido"
        : isReady
          ? isTakeaway
            ? "¡Pasa a recoger tu pedido!"
            : "¡Listo para servir!"
          : order.status === "delivered"
            ? "Pedido entregado"
            : "Pedido cancelado";

  return (
    <main className="mx-auto min-h-dvh max-w-xl bg-[var(--cream)] px-4 py-5 text-[var(--ink)] sm:px-6 sm:py-8">
      <div className="flex items-center justify-between">
        <Brand compact />
        <ThemeToggle />
      </div>

      {/* ── Apple Live Activity Status Card ── */}
      <section className="mt-5 overflow-hidden rounded-[2rem] bg-[var(--paper)] shadow-[0_8px_30px_rgba(0,0,0,0.06)] ring-1 ring-black/[0.06] dark:bg-neutral-900 dark:ring-white/10">
        <div className="p-5 sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <StatusPill status={order.status} />
            <span className="text-xs font-semibold tabular-nums text-neutral-500 dark:text-neutral-400">
              Folio {order.folio}
            </span>
          </div>

          <h1 className="mt-4 font-display text-[1.7rem] font-semibold leading-[1.1] tracking-[-0.03em] sm:text-3xl">
            {trackingTitle}
          </h1>
          <p className="mt-1.5 text-sm text-neutral-500 dark:text-neutral-400">
            {isCancelled
              ? "Solicita apoyo al personal si tienes alguna duda."
              : "Esta pantalla se actualiza sola en tiempo real."}
          </p>

          {isCancelled ? (
            <div className="mt-5 rounded-2xl bg-red-500/10 p-4 text-sm font-semibold text-red-700 ring-1 ring-red-500/20 dark:text-red-300">
              Este pedido fue cancelado.
            </div>
          ) : (
            <div className="mt-5">
              <div className="grid grid-cols-4 gap-1.5" aria-hidden="true">
                {steps.map((step, index) => (
                  <div
                    key={step}
                    className={`h-1.5 rounded-full transition-all duration-500 ${
                      index <= current
                        ? isReady
                          ? "bg-emerald-500"
                          : "bg-neutral-950 dark:bg-white"
                        : "bg-black/[0.08] dark:bg-white/[0.12]"
                    }`}
                  />
                ))}
              </div>

              <ol className="mt-4 space-y-2.5">
                {steps.map((step, index) => {
                  const done = index < current;
                  const active = index === current;
                  return (
                    <li
                      key={step}
                      className={`flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm transition ${
                        active
                          ? "bg-black/[0.04] font-semibold text-[var(--ink)] dark:bg-white/[0.08]"
                          : done
                            ? "text-neutral-600 dark:text-neutral-300"
                            : "text-neutral-400 dark:text-neutral-500"
                      }`}
                    >
                      <span
                        className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-bold ${
                          done || active
                            ? isReady && active
                              ? "bg-emerald-500 text-white"
                              : "bg-neutral-950 text-white dark:bg-white dark:text-neutral-950"
                            : "bg-black/[0.06] text-neutral-400 dark:bg-white/[0.08]"
                        }`}
                      >
                        {done ? <Check size={13} strokeWidth={3} /> : index + 1}
                      </span>
                      <span className="flex-1">
                        {
                          {
                            accepted: "Confirmado en cocina",
                            preparing: "Preparando tus alimentos",
                            ready: isTakeaway ? "Listo para recoger" : "Listo para servir",
                            delivered: "Entregado"
                          }[step]
                        }
                      </span>
                      {active && (
                        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                          <span className="h-1.5 w-1.5 rounded-full bg-current pulse-dot" />
                          Ahora
                        </span>
                      )}
                    </li>
                  );
                })}
              </ol>
            </div>
          )}

          {isReady && (
            <div className="mt-5 animate-pop rounded-2xl bg-emerald-500/12 p-4 text-center ring-1 ring-emerald-500/25">
              <p className="font-display text-lg font-semibold text-emerald-900 dark:text-emerald-200">
                ¡Tu pedido ya está listo! 🎉
              </p>
              <p className="mt-1 text-xs text-emerald-800/80 dark:text-emerald-300/80">
                {isTakeaway
                  ? "Pasa a recogerlo al mostrador · Av. Orquídeas, Hacienda Coacalco."
                  : "En breve llega a tu mesa."}
              </p>
            </div>
          )}

          {/* Meta summary card */}
          <div className="mt-5 flex items-center justify-between rounded-2xl bg-black/[0.035] px-4 py-3.5 dark:bg-white/[0.05]">
            <div>
              <span className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-500 dark:text-neutral-400">
                {isTakeaway ? "Cliente" : "Ubicación"}
              </span>
              <strong className="text-base font-semibold">
                {isTakeaway ? order.customerName || "Para llevar" : `Mesa ${order.tableCode}`}
              </strong>
            </div>
            <div className="text-right">
              <span className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-500 dark:text-neutral-400">
                Total ({order.items.reduce((sum, item) => sum + item.quantity, 0)} art.)
              </span>
              <strong className="text-xl font-bold tabular-nums">{money(order.total)}</strong>
            </div>
          </div>

          {/* Items breakdown */}
          {order.items.length > 0 && (
            <div className="mt-4 rounded-2xl bg-black/[0.025] p-3.5 dark:bg-white/[0.04]">
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-500 dark:text-neutral-400">
                Detalle de tu orden
              </p>
              <ul className="mt-2 space-y-1.5 text-sm">
                {order.items.map((item, idx) => {
                  const extrasSum = (item.extras ?? []).reduce((s, e) => s + e.price, 0);
                  const lineTotal = (item.unitPrice + extrasSum + (item.priceModifier ?? 0)) * item.quantity;
                  return (
                    <li key={`${item.productId}-${idx}`} className="flex items-baseline justify-between gap-2">
                      <span className="truncate">
                        <strong className="font-semibold tabular-nums">{item.quantity}×</strong> {item.name}
                      </span>
                      <span className="shrink-0 text-xs font-medium tabular-nums text-neutral-500 dark:text-neutral-400">
                        {money(lineTotal)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {/* Share actions */}
          <div className="mt-5 grid grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard.writeText(shareLink);
                setCopied(true);
                window.setTimeout(() => setCopied(false), 2200);
              }}
              className="focus-ring flex min-h-12 items-center justify-center gap-2 rounded-full bg-black/[0.06] px-4 text-xs font-semibold text-[var(--ink)] transition active:scale-95 dark:bg-white/[0.1] dark:text-white"
            >
              {copied ? <Check size={16} /> : <Copy size={16} />}
              {copied ? "Copiado" : "Copiar link"}
            </button>
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="focus-ring flex min-h-12 items-center justify-center gap-2 rounded-full bg-[#25D366] px-4 text-xs font-semibold text-white shadow-sm transition active:scale-95"
            >
              <Share2 size={16} /> WhatsApp
            </a>
          </div>
          <p className="mt-3 text-center text-xs text-neutral-500 dark:text-neutral-400">
            Guarda o comparte este enlace para consultar el avance de tu pedido.
          </p>
        </div>
      </section>
    </main>
  );
}
