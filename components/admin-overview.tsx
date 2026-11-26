"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  Activity,
  ChefHat,
  ExternalLink,
  HandPlatter,
  QrCode,
  Receipt,
  RefreshCw,
  RotateCcw,
  ShoppingBag,
  TrendingUp,
  Users
} from "lucide-react";
import { money } from "@/lib/menu";
import type { RestaurantTable, SalesReport, TableSession } from "@/lib/types";

function todayIsoMexicoCity(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Mexico_City",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

export function AdminOverview({
  pin,
  productCount,
  soldOutCount,
  onNavigateTab
}: {
  pin: string;
  productCount: number;
  soldOutCount: number;
  onNavigateTab: (tab: string) => void;
}) {
  const [sales, setSales] = useState<SalesReport | null>(null);
  const [tables, setTables] = useState<RestaurantTable[]>([]);
  const [sessions, setSessions] = useState<TableSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [resettingTable, setResettingTable] = useState<string | null>(null);
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const today = todayIsoMexicoCity();
    try {
      const [salesRes, tablesRes, sessionsRes] = await Promise.all([
        fetch(
          `/api/admin/sales?pin=${encodeURIComponent(pin)}&from=${today}&to=${today}`,
          { cache: "no-store" }
        ),
        fetch(`/api/admin/tables?pin=${encodeURIComponent(pin)}`, { cache: "no-store" }),
        fetch(`/api/sessions?list=active&pin=${encodeURIComponent(pin)}`, { cache: "no-store" })
      ]);

      if (salesRes.ok) {
        const s = (await salesRes.json().catch(() => null)) as SalesReport | null;
        if (s?.summary) setSales(s);
      }
      if (tablesRes.ok) {
        const t = (await tablesRes.json().catch(() => [])) as RestaurantTable[];
        if (Array.isArray(t)) setTables(t);
      }
      if (sessionsRes.ok) {
        const sess = (await sessionsRes.json().catch(() => [])) as TableSession[];
        if (Array.isArray(sess)) setSessions(sess);
      }
    } finally {
      setLoading(false);
    }
  }, [pin]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    const interval = window.setInterval(() => {
      if (!document.hidden) void load();
    }, 20000);
    return () => {
      window.clearTimeout(timer);
      window.clearInterval(interval);
    };
  }, [load]);

  async function resetTableAccount(tableCode: string) {
    if (
      !window.confirm(
        `¿Cerrar y reiniciar a $0 la cuenta abierta de la Mesa ${tableCode}? Los nuevos escaneos QR comenzarán en cuenta nueva.`
      )
    ) {
      return;
    }
    setResettingTable(tableCode);
    setNotice("");
    try {
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tableCode, forceNew: true, pin })
      });
      if (res.ok) {
        setNotice(`Cuenta de Mesa ${tableCode} reiniciada a $0.`);
        await load();
      } else {
        setNotice(`No fue posible reiniciar la Mesa ${tableCode}.`);
      }
    } finally {
      setResettingTable(null);
    }
  }

  const activeTablesList = tables.filter((t) => t.active);
  const occupiedCount = activeTablesList.filter(
    (t) => (t.orderCount ?? 0) > 0 || (t.tableTotal ?? 0) > 0
  ).length;
  const topProducts = (sales?.topProducts ?? []).slice(0, 5);
  const maxQty = Math.max(...topProducts.map((p) => p.quantity), 1);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow text-[var(--terracotta)] dark:text-[var(--gold)]">
            Operación en vivo · Hoy
          </p>
          <h1 className="font-display text-3xl font-semibold tracking-[-0.03em] sm:text-4xl">
            Resumen ejecutivo
          </h1>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
            Ventas del día, mesas con cuenta abierta y platillos líderes en tiempo real.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="focus-ring inline-flex items-center gap-2 rounded-full bg-[var(--paper)] px-4 py-2.5 text-xs font-semibold text-[var(--ink)] shadow-xs ring-1 ring-black/[0.07] transition active:opacity-80 dark:bg-neutral-900 dark:text-neutral-100 dark:ring-white/10"
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          Actualizar
        </button>
      </div>

      {notice && (
        <div className="rounded-2xl bg-emerald-500/12 px-4 py-3 text-sm font-semibold text-emerald-800 ring-1 ring-emerald-500/25 dark:text-emerald-200">
          {notice}
        </div>
      )}

      {/* 4 KPI Cards (Apple Health / Material You) */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-[1.6rem] bg-[var(--paper)] p-5 shadow-[0_1px_2px_rgba(0,0,0,0.03)] ring-1 ring-black/[0.06] dark:bg-neutral-900 dark:ring-white/10">
          <div className="flex items-center justify-between text-neutral-500 dark:text-neutral-400">
            <span className="text-xs font-semibold">Ventas de hoy</span>
            <TrendingUp size={16} />
          </div>
          <p className="mt-3 font-display text-2xl font-bold tabular-nums sm:text-3xl">
            {money(sales?.summary.grossSales ?? 0)}
          </p>
          <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
            {sales?.summary.orderCount ?? 0} pedidos entregados
          </p>
        </div>

        <div className="rounded-[1.6rem] bg-[var(--paper)] p-5 shadow-[0_1px_2px_rgba(0,0,0,0.03)] ring-1 ring-black/[0.06] dark:bg-neutral-900 dark:ring-white/10">
          <div className="flex items-center justify-between text-neutral-500 dark:text-neutral-400">
            <span className="text-xs font-semibold">Ticket promedio</span>
            <Receipt size={16} />
          </div>
          <p className="mt-3 font-display text-2xl font-bold tabular-nums sm:text-3xl">
            {money(sales?.summary.averageTicket ?? 0)}
          </p>
          <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
            {sales?.summary.itemsSold ?? 0} platillos vendidos
          </p>
        </div>

        <div className="rounded-[1.6rem] bg-[var(--paper)] p-5 shadow-[0_1px_2px_rgba(0,0,0,0.03)] ring-1 ring-black/[0.06] dark:bg-neutral-900 dark:ring-white/10">
          <div className="flex items-center justify-between text-neutral-500 dark:text-neutral-400">
            <span className="text-xs font-semibold">Mesas ocupadas</span>
            <Users size={16} />
          </div>
          <p className="mt-3 font-display text-2xl font-bold tabular-nums sm:text-3xl">
            {occupiedCount} / {activeTablesList.length || tables.length}
          </p>
          <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
            {sales?.summary.pendingOrders ?? 0} pedido(s) en cocina
          </p>
        </div>

        <div className="rounded-[1.6rem] bg-[var(--paper)] p-5 shadow-[0_1px_2px_rgba(0,0,0,0.03)] ring-1 ring-black/[0.06] dark:bg-neutral-900 dark:ring-white/10">
          <div className="flex items-center justify-between text-neutral-500 dark:text-neutral-400">
            <span className="text-xs font-semibold">Catálogo activo</span>
            <Activity size={16} />
          </div>
          <p className="mt-3 font-display text-2xl font-bold tabular-nums sm:text-3xl">
            {productCount - soldOutCount} / {productCount}
          </p>
          <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
            {soldOutCount > 0 ? `${soldOutCount} agotado(s)` : "Todo disponible"}
          </p>
        </div>
      </div>

      {/* Cuentas abiertas en mesas + Top platillos */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Cuentas abiertas con botón de reinicio 1-clic */}
        <section className="rounded-[1.75rem] bg-[var(--paper)] p-5 shadow-[0_1px_2px_rgba(0,0,0,0.03)] ring-1 ring-black/[0.06] dark:bg-neutral-900 dark:ring-white/10">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="font-display text-xl font-semibold tracking-[-0.02em]">
                Cuentas abiertas en mesa
              </h2>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                Reinicia una mesa a $0 si quedó una cuenta anterior sin cerrar.
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigateTab("tables")}
              className="text-xs font-semibold text-neutral-500 underline-offset-4 hover:underline dark:text-neutral-400"
            >
              Ver mesas
            </button>
          </div>

          {sessions.length === 0 ? (
            <p className="mt-5 rounded-2xl bg-black/[0.03] px-4 py-6 text-center text-sm text-neutral-500 dark:bg-white/[0.04] dark:text-neutral-400">
              No hay cuentas abiertas en este momento. Todas las mesas inician en $0.
            </p>
          ) : (
            <ul className="mt-4 space-y-2.5">
              {sessions.map((sess) => {
                const validOrders = (sess.orders || []).filter((o) => o.status !== "cancelled");
                const total = validOrders.reduce((s, o) => s + Number(o.total || 0), 0);
                const people = new Set(
                  validOrders.map((o) => o.customerName?.trim()).filter(Boolean)
                );
                return (
                  <li
                    key={sess.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-black/[0.035] px-4 py-3 dark:bg-white/[0.05]"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <strong className="font-display text-base">Mesa {sess.tableCode}</strong>
                        <span className="rounded-full bg-black/[0.06] px-2 py-0.5 text-[11px] font-semibold tabular-nums dark:bg-white/10">
                          {validOrders.length} ped.
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
                        {people.size > 0
                          ? `Comensales: ${[...people].join(", ")}`
                          : `Sesión #${sess.id.slice(0, 8)}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-2.5">
                      <strong className="text-base font-bold tabular-nums">{money(total)}</strong>
                      <button
                        type="button"
                        disabled={resettingTable === sess.tableCode}
                        onClick={() => void resetTableAccount(sess.tableCode)}
                        className="focus-ring inline-flex items-center gap-1.5 rounded-full bg-neutral-950 px-3 py-1.5 text-xs font-semibold text-white transition active:opacity-80 disabled:opacity-50 dark:bg-white dark:text-neutral-950"
                      >
                        <RotateCcw size={12} />
                        {resettingTable === sess.tableCode ? "Limpiando…" : "Reiniciar $0"}
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Top 5 platillos hoy */}
        <section className="rounded-[1.75rem] bg-[var(--paper)] p-5 shadow-[0_1px_2px_rgba(0,0,0,0.03)] ring-1 ring-black/[0.06] dark:bg-neutral-900 dark:ring-white/10">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="font-display text-xl font-semibold tracking-[-0.02em]">
                Más vendidos hoy
              </h2>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                Top 5 platillos por volumen de venta.
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigateTab("sales")}
              className="text-xs font-semibold text-neutral-500 underline-offset-4 hover:underline dark:text-neutral-400"
            >
              Corte de caja
            </button>
          </div>

          {topProducts.length === 0 ? (
            <p className="mt-5 rounded-2xl bg-black/[0.03] px-4 py-6 text-center text-sm text-neutral-500 dark:bg-white/[0.04] dark:text-neutral-400">
              Aún no hay pedidos entregados hoy.
            </p>
          ) : (
            <ul className="mt-4 space-y-3">
              {topProducts.map((item) => {
                const pct = Math.max(8, Math.round((item.quantity / maxQty) * 100));
                return (
                  <li key={item.name} className="space-y-1.5">
                    <div className="flex items-baseline justify-between gap-2 text-sm">
                      <span className="truncate font-medium">{item.name}</span>
                      <span className="shrink-0 text-xs tabular-nums text-neutral-500 dark:text-neutral-400">
                        <strong className="text-[var(--ink)]">{item.quantity}×</strong> · {money(item.revenue)}
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-black/[0.06] dark:bg-white/[0.08]">
                      <div
                        className="h-full rounded-full bg-neutral-950 dark:bg-white"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      {/* Accesos rápidos operativos */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { href: "/cocina", label: "Cocina en vivo", icon: ChefHat },
          { href: "/meseros", label: "Tablero meseros", icon: HandPlatter },
          { href: "/llevar", label: "Para llevar", icon: ShoppingBag },
          { href: "/qr", label: "Imprimir QRs", icon: QrCode }
        ].map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="focus-ring flex items-center justify-between gap-2 rounded-2xl bg-[var(--paper)] px-4 py-3.5 text-sm font-semibold text-[var(--ink)] shadow-[0_1px_2px_rgba(0,0,0,0.03)] ring-1 ring-black/[0.06] transition hover:ring-black/15 active:opacity-80 dark:bg-neutral-900 dark:ring-white/10"
          >
            <span className="flex items-center gap-2.5 truncate">
              <Icon size={17} />
              <span className="truncate">{label}</span>
            </span>
            <ExternalLink size={14} className="shrink-0 text-neutral-400" />
          </Link>
        ))}
      </div>
    </div>
  );
}
