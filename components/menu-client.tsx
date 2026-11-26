"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  Clock3,
  Hand,
  Minus,
  Plus,
  Receipt,
  RotateCcw,
  Search,
  ShoppingBag,
  Sparkles,
  Trash2,
  X
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { toastError, toastSuccess } from "@/components/ui/toast";
import { Brand } from "@/components/brand";
import { ProductImage } from "@/components/product-image";
import { StatusPill } from "@/components/status-pill";
import { ThemeToggle } from "@/components/theme-toggle";
import { dailyCourseOrder, getCourseOptions, isComidaCorridaAvailable, resolveDailyCourseGroups } from "@/lib/daily-menu";
import {
  categories,
  isProductAvailable,
  mexicoCityMinutes,
  money,
  products as seedProducts,
  timeToMinutes
} from "@/lib/menu";
import { connectOrderChannel, readDemoOrders } from "@/lib/order-store";
import { calculateCartTotal, cartItemTotal } from "@/lib/order-utils";
import type { CartItem, DailyMenuConfig, Order, Product, Promotion, TableSession } from "@/lib/types";

type MenuMode = "fixed" | "lunch";
type BillPaymentPreference = "efectivo" | "tarjeta" | "transferencia";
type ConfirmAction = {
  title: string;
  description: string;
  confirmLabel: string;
  tone?: "default" | "danger";
  onConfirm: () => void;
};

const LAST_ORDER_STORAGE_KEY = "imperio-last-order-v1";
const cartStorageKey = (tableCode: string) => `imperio-cart-v1:${tableCode}`;

/** Íconos opcionales de categoría (solo capa visual; si no existe, la píldora va sin ícono). */
const CATEGORY_ICONS: Record<string, string> = {
  Favoritos: "⭐️",
  Desayunos: "🍳",
  "A la carta": "🍽️",
  "Panes y más": "🥐",
  Bebidas: "☕",
  "Comidas a la carta": "🍛"
};

function normalizeProduct(raw: Record<string, unknown>): Product {
  const product = raw as unknown as Product;
  return {
    ...product,
    slug: (raw.slug as string) || (raw.id as string) || product.slug || product.id,
    image:
      (raw.image as string) ||
      (raw.image_url as string) ||
      (raw.imageUrl as string) ||
      product.image ||
      "/menu/imperio/chilaquiles-sencillos.jpg"
  };
}

export function MenuClient({
  tableCode,
  customerName,
  customerPhone
}: {
  tableCode: string;
  customerName?: string;
  customerPhone?: string;
}) {
  const [mode, setMode] = useState<MenuMode>("fixed");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("Desayunos");
  const [selected, setSelected] = useState<Product | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [order, setOrder] = useState<Order | null>(null);
  const [sending, setSending] = useState(false);
  const [generalNotes, setGeneralNotes] = useState("");
  const [waiterCalled, setWaiterCalled] = useState(false);
  const [billRequested, setBillRequested] = useState(false);
  const [serviceSheetOpen, setServiceSheetOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);
  const [lastOrderItems, setLastOrderItems] = useState<CartItem[]>([]);
  const [lastOrderDismissed, setLastOrderDismissed] = useState(false);
  const [dailyMenu, setDailyMenu] = useState<DailyMenuConfig | null>(null);
  const [dailyMenuLoading, setDailyMenuLoading] = useState(true);
  const [catalog, setCatalog] = useState<Product[]>(seedProducts);
  const [serviceMinutes, setServiceMinutes] = useState<number | null>(null);
  const [comidaCorridaOpen, setComidaCorridaOpen] = useState<boolean | null>(null);
  const [justAdded, setJustAdded] = useState(false);
  const toastTimerRef = useRef<number | null>(null);
  const [waiterNotice, setWaiterNotice] = useState<string | null>(null);
  const waiterToastTimerRef = useRef<number | null>(null);
  const cartHydratedRef = useRef(false);
  const [session, setSession] = useState<TableSession | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [sessionExisted, setSessionExisted] = useState(false);
  const [sendTogether, setSendTogether] = useState(false);
  const [pendingOrders, setPendingOrders] = useState<CartItem[][]>([]);
  const [drinkFlavors, setDrinkFlavors] = useState<Array<{drinkType: string; name: string; priceModifier: number}>>([]);
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const channelRef = useRef<ReturnType<typeof connectOrderChannel> | null>(null);
  const latestOrderRef = useRef<Order | null>(null);
  const dismissedOrderRef = useRef<string | null>(null);

  useEffect(() => {
    latestOrderRef.current = order;
  }, [order]);

  const promotionBySlug = useMemo(() => {
    const map = new Map<string, Promotion>();
    for (const promo of promotions) {
      if (promo.productSlug) map.set(promo.productSlug, promo);
    }
    return map;
  }, [promotions]);

  useEffect(() => {
    const updateClock = () => {
      setServiceMinutes(mexicoCityMinutes());
      setComidaCorridaOpen(isComidaCorridaAvailable());
    };
    updateClock();
    const timer = window.setInterval(updateClock, 60000);
    return () => window.clearInterval(timer);
  }, []);

  const loadDailyMenu = useCallback(async () => {
    const response = await fetch("/api/daily-menu", { cache: "no-store" });
    if (!response.ok) return null;
    const menu = (await response.json()) as DailyMenuConfig | null;
    setDailyMenu(menu);
    return menu;
  }, []);

  const loadCatalog = useCallback(async () => {
    const response = await fetch("/api/products", { cache: "no-store" });
    if (!response.ok) return;
    const raw = (await response.json()) as Array<Record<string, unknown>>;
    if (!raw.length) return;
    const next = raw.map(normalizeProduct);
    if (next.length) setCatalog(next);
  }, []);

  const loadPromotions = useCallback(async () => {
    const response = await fetch("/api/promotions", { cache: "no-store" });
    if (!response.ok) return;
    const rows = (await response.json()) as Promotion[];
    if (Array.isArray(rows)) setPromotions(rows);
  }, []);

  const loadSession = useCallback(async () => {
    if (!tableCode) return;
    // Para llevar: no hay mesa física ni sesión; no crear sesiones falsas.
    if (tableCode === "LLEVAR") {
      setSession(null);
      setSessionExisted(false);
      setSessionLoading(false);
      return;
    }
    const response = await fetch(`/api/sessions?tableCode=${encodeURIComponent(tableCode)}`, {
      cache: "no-store"
    });
    if (response.ok) {
      const data = (await response.json()) as TableSession | null;
      if (data) {
        setSession(data);
        setSessionExisted(true);
        // Auto-enable sendTogether when joining an existing session
        setSendTogether(true);
        const activeOrders = (data.orders || []).filter(
          (item) => !["delivered", "cancelled"].includes(item.status)
        );
        if (activeOrders.length) {
          const mostRecent = activeOrders.reduce((a, b) =>
            +new Date(a.updatedAt) >= +new Date(b.updatedAt) ? a : b
          );
          const isDismissed = dismissedOrderRef.current === mostRecent.id;
          setOrder((current) => {
            if (isDismissed) return current;
            if (!current) return mostRecent;
            if (current.id !== mostRecent.id) return mostRecent;
            return +new Date(mostRecent.updatedAt) >= +new Date(current.updatedAt)
              ? mostRecent
              : current;
          });
        }
      } else {
        setSessionExisted(false);
        const createResponse = await fetch("/api/sessions", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ tableCode })
        });
        if (createResponse.ok) {
          const created = (await createResponse.json()) as TableSession;
          setSession(created);
          setSessionExisted(false);
        }
      }
    }
    setSessionLoading(false);
  }, [tableCode]);

  useEffect(() => {
    let active = true;
    const initialTimer = window.setTimeout(() => {
      void loadDailyMenu().finally(() => {
        if (active) setDailyMenuLoading(false);
      });
      void loadCatalog();
      void loadPromotions();
      void loadSession();
      void fetch("/api/drink-flavors", { cache: "no-store" })
        .then((r) => r.json().catch(() => []))
        .then((data) => { if (active && Array.isArray(data)) setDrinkFlavors(data); })
        .catch(() => {});
    }, 0);
    const timer = window.setInterval(() => {
      void loadDailyMenu();
      void loadCatalog();
      void loadPromotions();
      void loadSession();
    }, 15000);
    return () => {
      active = false;
      window.clearTimeout(initialTimer);
      window.clearInterval(timer);
    };
  }, [loadCatalog, loadDailyMenu, loadPromotions, loadSession]);

  useEffect(() => {
    channelRef.current = connectOrderChannel(({ type, order: incoming, product, dailyMenu: menu }) => {
      if ((type === "status" || type === "edited") && incoming) {
        const nextOrder = incoming;
        setOrder((current) => {
          if (!current || current.id !== nextOrder.id) return current;
          if (nextOrder.status !== current.status) return nextOrder;
          return +new Date(nextOrder.updatedAt) >= +new Date(current.updatedAt)
            ? nextOrder
            : current;
        });
      }
      if (type === "menu" && product) {
        const normalized = normalizeProduct(product as unknown as Record<string, unknown>);
        setCatalog((current) => [
          normalized,
          ...current.filter((item) => item.id !== normalized.id)
        ]);
      }
      if (type === "menu-delete" && product) {
        setCatalog((current) => current.filter((item) => item.id !== product.id));
      }
      if (type === "daily-menu") {
        if (menu) setDailyMenu(menu);
        else void loadDailyMenu();
      }
      if (type === "database_change") {
        void loadCatalog();
        void loadDailyMenu();
        void loadSession();
        const current = latestOrderRef.current;
        if (current?.id) {
          const token = current.accessToken || "";
          void fetch(`/api/orders/${current.id}?token=${encodeURIComponent(token)}`)
            .then((r) => (r.ok ? r.json() : null))
            .then((data) => {
              if (data && data.id === current.id) setOrder(data);
            })
            .catch(() => undefined);
        }
      }
    });
    return () => channelRef.current?.close();
  }, [loadCatalog, loadDailyMenu, loadSession]);

  useEffect(() => {
    if (!order) return;
    if (order.source === "demo") {
      const demoTimer = window.setInterval(() => {
        const latest = readDemoOrders().find((item) => item.id === order.id);
        if (latest) {
          setOrder((current) =>
            !current || +new Date(latest.updatedAt) >= +new Date(current.updatedAt)
              ? latest
              : current
          );
        }
      }, 1500);
      return () => window.clearInterval(demoTimer);
    }
    if (!order.accessToken || !order.id) return;
    const orderId = order.id;
    const token = order.accessToken;
    const pollOrder = async () => {
      try {
        const response = await fetch(
          `/api/orders/${orderId}?token=${encodeURIComponent(token)}`
        );
        if (response.ok) {
          const updated = await response.json();
          if (updated && updated.id === orderId && updated.id !== dismissedOrderRef.current) {
            setOrder(updated);
          }
        }
      } catch {
        // ignore polling errors
      }
    };
    const timer = window.setInterval(pollOrder, 4000);
    void pollOrder();
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order?.id, order?.accessToken]);

  const [debouncedQuery, setDebouncedQuery] = useState("");
  const isSearching = debouncedQuery.trim().length > 0;

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query), 200);
    return () => window.clearTimeout(timer);
  }, [query]);

  // Restaurar carrito guardado por mesa y último pedido (solo cliente)
  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const rawCart = localStorage.getItem(cartStorageKey(tableCode));
        if (rawCart) {
          const parsed = JSON.parse(rawCart) as { items?: CartItem[]; notes?: string };
          if (Array.isArray(parsed.items) && parsed.items.length > 0) {
            setCart(parsed.items);
          }
          if (typeof parsed.notes === "string" && parsed.notes.length > 0) {
            setGeneralNotes(parsed.notes);
          }
        }
        const rawLast = localStorage.getItem(LAST_ORDER_STORAGE_KEY);
        if (rawLast) {
          const parsedLast = JSON.parse(rawLast) as CartItem[];
          if (Array.isArray(parsedLast) && parsedLast.length > 0) {
            setLastOrderItems(parsedLast);
          }
        }
      } catch {
        // localStorage no disponible o corrupto
      } finally {
        cartHydratedRef.current = true;
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [tableCode]);

  // Persistir carrito automáticamente para no perderlo si recargan o cambian de app
  useEffect(() => {
    if (!cartHydratedRef.current) return;
    try {
      if (cart.length === 0 && !generalNotes.trim()) {
        localStorage.removeItem(cartStorageKey(tableCode));
      } else {
        localStorage.setItem(
          cartStorageKey(tableCode),
          JSON.stringify({ items: cart, notes: generalNotes })
        );
      }
    } catch {
      // ignorar errores de cuota/privacidad
    }
  }, [cart, generalNotes, tableCode]);

  useEffect(() => {
    const pill = document.querySelector<HTMLElement>(`[data-category-pill="${category}"]`);
    pill?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, [category]);

  const visible = useMemo(() => {
    const normalized = debouncedQuery.trim().toLocaleLowerCase("es");
    return catalog.filter((product) => {
      if (normalized) {
        return `${product.name} ${product.description} ${product.category}`
          .toLocaleLowerCase("es")
          .includes(normalized);
      }
      return category === "Favoritos" ? product.popular : product.category === category;
    });
  }, [catalog, category, debouncedQuery]);

  const itemCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  const subtotal = calculateCartTotal(cart);

  const sessionOrders = useMemo(
    () => (session?.orders || []).filter((item) => item.status !== "cancelled"),
    [session?.orders]
  );
  const sessionTotal = useMemo(
    () => sessionOrders.reduce((sum, item) => sum + Number(item.total || 0), 0),
    [sessionOrders]
  );

  // Sugerencias rápidas de 1 toque para el carrito (bebidas y panes disponibles)
  const cartSuggestions = useMemo(() => {
    if (cart.length === 0) return [];
    const inCartIds = new Set(cart.map((item) => item.productId));
    return catalog
      .filter((product) => {
        if (product.soldOut) return false;
        if (!["Bebidas", "Panes y más"].includes(product.category)) return false;
        if (inCartIds.has(product.slug || product.id)) return false;
        if (!isProductAvailable(product, serviceMinutes)) return false;
        const hasRequiredGroups = Boolean(product.optionGroups?.length || product.options?.length);
        return !hasRequiredGroups;
      })
      .slice(0, 3);
  }, [cart, catalog, serviceMinutes]);

  function addItem(
    product: Product,
    quantity: number,
    notes: string,
    option?: string,
    extras?: Array<{ name: string; price: number }>,
    priceModifier?: number
  ) {
    setCart((current) => [
      ...current,
      {
        productId: product.slug || product.id,
        name: product.name,
        unitPrice: product.price + (priceModifier || 0),
        quantity,
        notes,
        option,
        priceModifier,
        extras: extras && extras.length > 0 ? extras : undefined,
        image: product.image
      }
    ]);
    setSelected(null);
    setJustAdded(true);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setJustAdded(false), 1500);
  }

  function addDailyMenu(
    menu: DailyMenuConfig,
    selections: Record<string, string>,
    quantity: number,
    extras: Array<{ name: string; price: number }>
  ) {
    const notes = Object.entries(selections)
      .sort(
        ([left], [right]) =>
          dailyCourseOrder.indexOf(left as (typeof dailyCourseOrder)[number]) -
          dailyCourseOrder.indexOf(right as (typeof dailyCourseOrder)[number])
      )
      .map(([course, choice]) => `${course}: ${choice}`)
      .join(" · ")
      .slice(0, 200);
    const extraTotal = extras.reduce((sum, extra) => sum + extra.price, 0);
    addItem(
      {
        id: "comida-corrida",
        slug: "comida-corrida",
        name: "Comida corrida",
        description: "Menú completo del día",
        price: menu.price + extraTotal,
        category: "Comida corrida",
        image: "/menu/imperio/pechuga-rellena.jpg"
      },
      quantity,
      notes,
      undefined,
      extras
    );
  }

  function saveLastOrder(items: CartItem[]) {
    if (!items.length) return;
    setLastOrderItems(items);
    setLastOrderDismissed(false);
    try {
      localStorage.setItem(LAST_ORDER_STORAGE_KEY, JSON.stringify(items));
    } catch {
      // ignorar
    }
  }

  async function executeSubmitOrder() {
    if (sending || cart.length === 0) return;
    const submittedItems = [...cart];
    setSending(true);
    try {
      const created = await sendOrderToApi(submittedItems, generalNotes);
      saveLastOrder(submittedItems);
      setCart([]);
      setCartOpen(false);
      setGeneralNotes("");
      if (created) {
        dismissedOrderRef.current = null;
        setOrder(created);
      }
    } catch {
      // Error already shown by sendOrderToApi
    } finally {
      setSending(false);
    }
  }

  function submitOrder() {
    if (sending || cart.length === 0) return;

    if (sendTogether) {
      // Queue mode: accumulate orders, send all at once later
      setPendingOrders((current) => [...current, [...cart]]);
      setCart([]);
      setCartOpen(false);
      setGeneralNotes("");
      return;
    }

    setConfirmAction({
      title: "¿Enviar pedido a cocina?",
      description: `Se enviarán ${itemCount} ${itemCount === 1 ? "platillo" : "platillos"} por ${money(subtotal)}.`,
      confirmLabel: `Enviar · ${money(subtotal)}`,
      onConfirm: () => {
        setConfirmAction(null);
        void executeSubmitOrder();
      }
    });
  }

  async function executeSendAllTogether() {
    if (sending || pendingOrders.length === 0) return;
    setSending(true);
    let successCount = 0;
    const allSubmitted: CartItem[] = [];
    for (const items of pendingOrders) {
      try {
        await sendOrderToApi(items, "");
        allSubmitted.push(...items);
        successCount++;
      } catch {
        // Continue with remaining orders
      }
    }
    if (allSubmitted.length > 0) saveLastOrder(allSubmitted);
    setPendingOrders([]);
    setSending(false);
    if (successCount > 0) {
      dismissedOrderRef.current = null;
      setOrder({ id: "batch", folio: `${successCount} pedidos`, tableCode, status: "accepted", items: [], notes: "", subtotal: 0, total: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), source: "supabase" });
    }
  }

  function sendAllTogether() {
    if (sending || pendingOrders.length === 0) return;
    const totalItems = pendingOrders.reduce((sum, items) => sum + items.reduce((s, i) => s + i.quantity, 0), 0);
    setConfirmAction({
      title: `¿Enviar ${pendingOrders.length} pedidos juntos?`,
      description: `Se enviarán ${totalItems} productos a cocina al mismo tiempo.`,
      confirmLabel: "Enviar todos",
      onConfirm: () => {
        setConfirmAction(null);
        void executeSendAllTogether();
      }
    });
  }

  async function sendOrderToApi(items: CartItem[], notes: string) {
    const idempotencyKey = crypto.randomUUID();
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          tableCode,
          items: items.map(({ productId, quantity, notes: n, option, extras, priceModifier }) => ({
            productId,
            quantity,
            notes: n,
            option,
            optionPriceModifier: priceModifier,
            extras: extras?.map((extra) => ({ name: extra.name }))
          })),
          notes,
          idempotencyKey,
          sessionId: session?.id ?? null,
          customerName: tableCode === "LLEVAR" ? (customerName?.trim() || undefined) : undefined
        })
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || "No fue posible registrar el pedido");
      }
      const created = payload as Order;
      void channelRef.current?.send({ type: "new", order: created });
      return created;
    } catch (error) {
      const message =
        error instanceof DOMException && error.name === "AbortError"
          ? "El sistema tardó demasiado en responder."
          : error instanceof Error
            ? error.message
            : "No fue posible enviar el pedido";
      toastError("No fue posible enviar el pedido", message);
      throw error;
    } finally {
      window.clearTimeout(timeout);
    }
  }

  function showWaiterNotice(message: string) {
    if (waiterToastTimerRef.current) window.clearTimeout(waiterToastTimerRef.current);
    setWaiterNotice(message);
    waiterToastTimerRef.current = window.setTimeout(() => setWaiterNotice(null), 2200);
  }

  function callWaiter() {
    if (waiterCalled) return;
    setWaiterCalled(true);
    setServiceSheetOpen(false);
    showWaiterNotice("Mesero notificado");
    const call = {
      id: crypto.randomUUID(),
      tableCode,
      timestamp: new Date().toISOString(),
      kind: "assist" as const
    };
    void channelRef.current?.send({ type: "waiter-call", waiterCall: call });
    window.setTimeout(() => setWaiterCalled(false), 30000);
  }

  function requestBill(paymentPreference: BillPaymentPreference) {
    if (billRequested) return;
    setBillRequested(true);
    setServiceSheetOpen(false);
    const label =
      paymentPreference === "tarjeta"
        ? "Tarjeta"
        : paymentPreference === "transferencia"
          ? "Transferencia"
          : "Efectivo";
    showWaiterNotice(`Cuenta solicitada · ${label}`);
    const call = {
      id: crypto.randomUUID(),
      tableCode,
      timestamp: new Date().toISOString(),
      kind: "bill" as const,
      paymentPreference
    };
    void channelRef.current?.send({ type: "waiter-call", waiterCall: call });
    window.setTimeout(() => setBillRequested(false), 30000);
  }

  function repeatLastOrder() {
    if (!lastOrderItems.length) return;
    setCart((current) => [...current, ...lastOrderItems]);
    setLastOrderDismissed(true);
    setCartOpen(true);
  }

  if (order) {
    return (
      <OrderTracking
        order={order}
        tableCode={tableCode}
        session={session}
        customerName={customerName}
        customerPhone={customerPhone}
        onOrderAgain={() => {
          dismissedOrderRef.current = order?.id ?? null;
          setOrder(null);
          setMode("fixed");
          setCategory("Desayunos");
          setCart([]);
          setGeneralNotes("");
        }}
      />
    );
  }

  return (
    <main className="min-h-screen pb-32">
      <header className="premium-header relative overflow-hidden text-white">
        <div className="pointer-events-none absolute -right-20 -top-36 h-80 w-80 rounded-full border-[64px] border-white/[0.035]" />
        <div className="pointer-events-none absolute bottom-0 left-1/3 h-px w-1/2 bg-gradient-to-r from-transparent via-[var(--gold)]/40 to-transparent" />
        <div className="relative mx-auto max-w-6xl px-4 pb-6 pt-4 sm:px-6 sm:pb-10 sm:pt-5">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <Brand compact inverse />
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <ThemeToggle />
              <div className="flex items-center gap-1.5 whitespace-nowrap rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-[11px] font-bold text-white shadow-sm backdrop-blur sm:px-3.5 sm:py-2 sm:text-xs">
                <span
                  className={`inline-block h-2 w-2 shrink-0 rounded-full ${
                    tableCode === "LLEVAR"
                      ? "bg-[#fbbf24] shadow-[0_0_0_4px_rgba(251,191,36,0.14)]"
                      : "bg-[#9acb8a] shadow-[0_0_0_4px_rgba(154,203,138,0.12)]"
                  }`}
                />
                {tableCode === "LLEVAR" ? (
                  <span>Para llevar 🥡</span>
                ) : (
                  <>
                    <span className="sm:hidden">Mesa {tableCode}</span>
                    <span className="hidden sm:inline">Servicio en mesa</span>
                  </>
                )}
              </div>
            </div>
          </div>
          <div className="mt-5 flex items-end justify-between gap-4 sm:mt-9">
            <div className="min-w-0">
              <p className="eyebrow text-[var(--gold)]">
                Cocina hecha al momento
              </p>
              <h1 className="mt-1.5 max-w-2xl font-display text-[1.9rem] font-bold leading-[1.04] sm:mt-2 sm:text-5xl sm:leading-[0.98]">
                ¿Qué se te antoja hoy?
              </h1>
              <p className="mt-2 text-[13px] leading-5 text-white/85 sm:mt-3 sm:text-sm">
                {tableCode === "LLEVAR"
                  ? customerName
                    ? `¡Hola, ${customerName}! Te llamamos en mostrador cuando esté listo.`
                    : "Arma tu pedido y te llamamos en mostrador cuando esté listo."
                  : `Ordena desde la mesa ${tableCode} y sigue tu pedido en tiempo real.`}
              </p>
              {tableCode !== "LLEVAR" && sessionOrders.length > 0 && (
                <button
                  type="button"
                  onClick={() => setServiceSheetOpen(true)}
                  className="focus-ring mt-3 inline-flex items-center gap-2 rounded-full border border-[var(--gold)]/35 bg-white/10 px-3.5 py-1.5 text-xs font-bold text-[var(--gold-light)] backdrop-blur transition hover:bg-white/15 active:scale-95"
                >
                  <Receipt size={14} />
                  <span>
                    Mi cuenta ({sessionOrders.length} {sessionOrders.length === 1 ? "pedido" : "pedidos"}) · {money(sessionTotal)}
                  </span>
                </button>
              )}
            </div>
            <div className="hidden min-w-24 rounded-3xl border border-white/15 bg-white/10 px-5 py-4 text-center text-white shadow-xl backdrop-blur sm:block">
              <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/75">
                {tableCode === "LLEVAR" ? "Llevar" : "Mesa"}
              </span>
              <strong className="mt-1 block font-display text-3xl">
                {tableCode === "LLEVAR" ? "🥡" : tableCode}
              </strong>
            </div>
            {session && session.status === "active" && (
              <div className="hidden min-w-32 rounded-3xl border border-white/15 bg-white/10 px-5 py-4 text-center text-white shadow-xl backdrop-blur sm:block">
                <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/75">
                  Sesión
                </span>
                <strong className="mt-1 block font-display text-3xl">{sessionExisted ? "compartida" : "activa"}</strong>
              </div>
            )}
            {!session && !sessionLoading && (
              <div className="hidden min-w-32 rounded-3xl border border-white/15 bg-white/10 px-5 py-4 text-center text-white shadow-xl backdrop-blur sm:block">
                <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/75">
                  Sin sesión
                </span>
                <strong className="mt-1 block font-display text-3xl">—</strong>
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        {sessionExisted && session && (
          <div className="animate-fade-in relative z-10 -mt-3 mb-2 flex flex-wrap items-center justify-between gap-2.5 rounded-2xl border border-neutral-200/60 bg-white/85 px-3.5 py-2.5 shadow-sm backdrop-blur-md dark:border-neutral-800 dark:bg-neutral-900/85 sm:flex-nowrap sm:p-3">
            <div className="flex min-w-0 items-center gap-2.5 text-xs sm:text-sm">
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[var(--gold-light)] text-xs font-bold text-[#5c3d2e]">
                👥
              </span>
              <div className="min-w-0 leading-snug">
                <span className="font-bold text-[var(--ink)] dark:text-neutral-100">Mesa compartida</span>
                <span className="text-neutral-600 dark:text-neutral-300"> · Se agrupa en cocina</span>
              </div>
            </div>
            <label className="flex shrink-0 cursor-pointer items-center gap-2">
              <span className="text-xs font-bold text-neutral-700 dark:text-neutral-300">Enviar juntos</span>
              <button
                type="button"
                role="switch"
                aria-checked={sendTogether}
                aria-label="Enviar pedidos juntos"
                className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${
                  sendTogether ? "bg-[var(--green)] dark:bg-[var(--gold)]" : "bg-[var(--line)] dark:bg-neutral-700"
                }`}
                onClick={() => setSendTogether((v) => !v)}
              >
                <span
                  className={`pointer-events-none absolute left-0.5 top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform duration-200 ${
                    sendTogether ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </label>
          </div>
        )}

        <section className="relative z-10 mt-3 sm:-mt-4" aria-label="Tipo de menú">
          <div className="mx-auto w-full max-w-md rounded-2xl bg-neutral-200/85 p-1 shadow-sm dark:bg-neutral-800/90 sm:my-4 sm:rounded-full sm:p-1.5">
            <div className="grid grid-cols-2 gap-1">
              {[
                {
                  value: "fixed" as const,
                  label: "Paquetes y carta",
                  schedule: "9 a.m.–5 p.m."
                },
                {
                  value: "lunch" as const,
                  label: "Comida corrida",
                  schedule:
                    comidaCorridaOpen === false
                      ? "Cerrado"
                      : "L–V 9–6 · Sáb 9–3"
                }
              ].map(({ value, label, schedule }) => (
                <button
                  type="button"
                  key={value}
                  className={`focus-ring flex min-w-0 flex-col items-center justify-center rounded-xl px-2.5 py-2 text-center transition-all duration-200 sm:rounded-full sm:px-4 sm:py-2.5 ${
                    mode === value
                      ? "bg-neutral-900 text-white shadow-sm dark:bg-white dark:text-neutral-900"
                      : "text-neutral-700 hover:text-neutral-900 dark:text-neutral-300 dark:hover:text-white"
                  }`}
                  onClick={() => setMode(value)}
                >
                  <span className="max-w-full truncate text-xs font-bold leading-tight sm:text-[13px]">
                    {label}
                  </span>
                  <span className="mt-0.5 max-w-full truncate text-[10px] font-medium leading-tight opacity-80 sm:text-[11px]">
                    {schedule}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </section>

        {cart.length === 0 && lastOrderItems.length > 0 && !lastOrderDismissed && (
          <div className="animate-fade-in mt-3 flex items-center justify-between gap-2.5 rounded-2xl border border-[var(--gold)]/40 bg-[#fbf5ea] px-3.5 py-2.5 dark:border-neutral-700 dark:bg-neutral-900">
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[var(--gold-light)] text-[var(--brown-dark)]">
                <RotateCcw size={15} />
              </span>
              <div className="min-w-0">
                <p className="truncate text-xs font-bold text-[var(--ink)] dark:text-neutral-100">
                  ¿Repetir tu último pedido?
                </p>
                <p className="truncate text-[11px] text-neutral-600 dark:text-neutral-400">
                  {lastOrderItems.map((i) => i.name).slice(0, 2).join(", ")}
                  {lastOrderItems.length > 2 ? ` +${lastOrderItems.length - 2}` : ""}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <button
                type="button"
                onClick={repeatLastOrder}
                className="focus-ring rounded-full bg-neutral-900 px-3.5 py-1.5 text-xs font-bold text-white transition active:scale-95 dark:bg-white dark:text-neutral-900"
              >
                Repetir
              </button>
              <button
                type="button"
                aria-label="Ocultar sugerencia de último pedido"
                onClick={() => setLastOrderDismissed(true)}
                className="focus-ring grid h-7 w-7 place-items-center rounded-full text-neutral-500 transition hover:bg-black/5 dark:hover:bg-white/10"
              >
                <X size={14} />
              </button>
            </div>
          </div>
        )}

        {mode === "lunch" ? (
          <LunchMenu
            menu={dailyMenu}
            loading={dailyMenuLoading}
            serviceMinutes={serviceMinutes}
            onAdd={addDailyMenu}
            onShowFixed={() => setMode("fixed")}
          />
        ) : (
          <>
            <div className="mt-3 flex flex-wrap items-center justify-center gap-1.5 sm:mt-4 sm:gap-2">
              <Badge
                variant="outline"
                className="h-auto max-w-full whitespace-normal rounded-full border-[var(--line)] bg-white px-3 py-1 text-center text-[11px] font-medium leading-snug text-neutral-800 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
              >
                🥣 Desayunos con fruta y café · 9:00 a.m.–1:00 p.m.
              </Badge>
              <Badge
                variant="outline"
                className="h-auto max-w-full whitespace-normal rounded-full border-[var(--line)] bg-white px-3 py-1 text-center text-[11px] font-medium leading-snug text-neutral-800 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
              >
                🍽️ Comidas a la carta · 1:00–5:00 p.m.
              </Badge>
            </div>

            <div className="sticky top-0 z-20 -mx-4 mt-3 border-b border-[var(--line)]/50 bg-[var(--cream)]/92 px-4 pb-3 pt-2.5 backdrop-blur-xl dark:border-neutral-800/80 dark:bg-neutral-950/90 sm:-mx-6 sm:mt-4 sm:px-6 sm:pb-4 sm:pt-3">
              <label className="flex items-center gap-2.5 rounded-2xl border border-neutral-200/70 bg-white/90 px-3.5 py-2.5 backdrop-blur-md transition-shadow focus-within:shadow-md dark:border-neutral-800 dark:bg-neutral-900/90 sm:gap-3 sm:px-4 sm:py-3">
                <Search size={18} aria-hidden="true" className="shrink-0 text-neutral-600 dark:text-neutral-300" />
                <span className="sr-only">Buscar platillos</span>
                <input
                  className="min-w-0 flex-1 bg-transparent text-base text-neutral-900 outline-none placeholder:text-neutral-500 dark:text-neutral-100 dark:placeholder:text-neutral-400"
                  placeholder="Busca en todo el menú: chilaquiles, café…"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
                {query && (
                  <button
                    type="button"
                    aria-label="Limpiar búsqueda"
                    className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-neutral-200/70 text-neutral-700 transition active:scale-90 dark:bg-neutral-700 dark:text-neutral-300"
                    onClick={() => setQuery("")}
                  >
                    <X size={15} />
                  </button>
                )}
              </label>
              <div className="no-scrollbar -mx-4 mt-2.5 flex gap-2 overflow-x-auto px-4 py-0.5 sm:-mx-1 sm:mt-3 sm:px-1 sm:py-1">
                {categories.map((item) => (
                  <button
                    type="button"
                    key={item}
                    data-category-pill={item}
                    className={`focus-ring shrink-0 rounded-full px-4 py-2.5 text-[13px] font-semibold whitespace-nowrap transition-all duration-200 active:scale-95 sm:px-5 sm:py-2.5 sm:text-sm ${
                      !isSearching && category === item
                        ? "bg-neutral-900 text-white shadow-sm dark:bg-white dark:text-neutral-900 dark:shadow-none"
                        : "border border-neutral-200/80 bg-white text-neutral-800 hover:bg-neutral-100 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:bg-neutral-800"
                    }`}
                    onClick={() => {
                      if (query) setQuery("");
                      setCategory(item);
                    }}
                  >
                    {CATEGORY_ICONS[item] ? `${CATEGORY_ICONS[item]} ` : ""}
                    {item}
                  </button>
                ))}
              </div>
            </div>

            <div className="mb-3 mt-4 flex items-end justify-between gap-2 sm:mb-4">
              <div className="min-w-0">
                <p className="eyebrow text-[var(--brown)] dark:text-[var(--gold)]">
                  {isSearching ? "Buscando en todo el menú" : "Hecho al momento"}
                </p>
                <h2 className="truncate font-display text-2xl font-bold sm:text-3xl">
                  {isSearching ? `“${debouncedQuery.trim()}”` : category}
                </h2>
              </div>
              <span className="shrink-0 text-xs font-medium text-neutral-600 dark:text-neutral-400 sm:text-sm">
                {visible.length} {visible.length === 1 ? "opción" : "opciones"}
              </span>
            </div>

            {visible.length ? (
              <div className="grid gap-3.5 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
                {visible.map((product) => (
                   <ProductCard
                     key={product.id}
                     product={product}
                     promotion={promotionBySlug.get(product.id)}
                     currentMinutes={serviceMinutes}
                     onOpen={setSelected}
                     dailyMenu={dailyMenu}
                   />
                ))}
              </div>
            ) : (
              <div className="animate-fade-in paper mt-4 rounded-3xl px-6 py-14 text-center">
                <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-neutral-100 dark:bg-neutral-800">
                  <Search className="text-neutral-400" size={26} />
                </div>
                <h3 className="mt-5 font-display text-2xl font-bold">
                  No encontramos platillos que coincidan
                </h3>
                <p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">
                  Intenta con otro nombre o cambia de categoría.
                </p>
                <button
                  type="button"
                  className="focus-ring mt-5 rounded-full bg-neutral-900 px-6 py-2.5 text-sm font-semibold text-white transition active:scale-95 dark:bg-white dark:text-neutral-900"
                  onClick={() => { setQuery(""); setCategory("Favoritos"); }}
                >
                  Limpiar filtros y ver destacados
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {justAdded && (
        <div className="pointer-events-none fixed inset-x-0 top-4 z-50 flex justify-center px-4">
          <div className="toast-slide-in flex items-center gap-2.5 rounded-full bg-neutral-900/90 px-5 py-3.5 text-sm font-bold text-white shadow-2xl ring-1 ring-white/15 backdrop-blur-md dark:bg-white/90 dark:text-neutral-900">
            <span className="grid h-6 w-6 place-items-center rounded-full bg-[var(--gold)]">
              <Check size={14} strokeWidth={3} className="text-[var(--charcoal)]" />
            </span>
            Platillo agregado
          </div>
        </div>
      )}

      {waiterNotice && (
        <div className="pointer-events-none fixed inset-x-0 top-4 z-50 flex justify-center px-4">
          <div className="toast-slide-in flex items-center gap-2.5 rounded-full bg-neutral-900/90 px-5 py-3.5 text-sm font-bold text-white shadow-2xl ring-1 ring-white/15 backdrop-blur-md dark:bg-white/90 dark:text-neutral-900">
            <span className="grid h-6 w-6 place-items-center rounded-full bg-[var(--gold)]">
              <Check size={14} strokeWidth={3} className="text-[var(--charcoal)]" />
            </span>
            {waiterNotice}
          </div>
        </div>
      )}

      {itemCount > 0 && (
        <div className="fixed bottom-4 left-1/2 z-40 w-[calc(100%-1.5rem)] max-w-md -translate-x-1/2 pb-[env(safe-area-inset-bottom)] sm:bottom-6 sm:w-[calc(100%-2rem)]">
          <button
            type="button"
            className="focus-ring flex w-full items-center justify-between gap-3 rounded-full border border-white/20 bg-white/90 p-2 pl-4 text-left shadow-2xl backdrop-blur-xl transition-all hover:bg-white active:scale-[0.98] dark:border-white/10 dark:bg-neutral-900/90 dark:hover:bg-neutral-900 sm:pl-5"
            onClick={() => setCartOpen(true)}
          >
            <span className="flex min-w-0 items-center gap-3">
              <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[var(--brown)] font-bold text-white ${justAdded ? "animate-bounce-in" : ""}`}>
                {itemCount}
              </span>
              <span className="truncate text-sm font-bold text-[var(--ink)] dark:text-neutral-100">
                {sendTogether ? "Agregar al grupo" : "Ver mi pedido"}
              </span>
            </span>
            <span className="shrink-0 rounded-full bg-[var(--charcoal)] px-4 py-2.5 text-sm font-extrabold text-white dark:bg-white dark:text-neutral-900">
              {money(subtotal)}
            </span>
          </button>
        </div>
      )}

      {/* Pending orders queue + Send all button */}
      {pendingOrders.length > 0 && (
        <div className="fixed inset-x-0 bottom-24 z-30 mx-auto max-w-xl space-y-2 px-3 sm:bottom-28">
          {pendingOrders.map((items, index) => {
            const orderTotal = calculateCartTotal(items);
            return (
              <div key={index} className="animate-fade-in glass-card flex items-center justify-between rounded-xl px-4 py-2.5 text-sm">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[var(--gold-light)] text-xs font-bold">{index + 1}</span>
                  <span className="truncate font-bold">{items.length} productos</span>
                </div>
                <div className="flex items-center gap-2">
                  <strong className="text-sm">{money(orderTotal)}</strong>
                  <button
                    type="button"
                    className="focus-ring grid h-6 w-6 place-items-center rounded-full bg-[#f1d0ca] text-[#7a2c22]"
                    aria-label="Quitar pedido"
                    onClick={() => setPendingOrders((current) => current.filter((_, i) => i !== index))}
                  >
                    <X size={12} />
                  </button>
                </div>
              </div>
            );
          })}
          <button
            type="button"
            className="focus-ring btn-press flex w-full items-center justify-center gap-2 rounded-2xl bg-[var(--green)] px-5 py-3.5 font-bold text-white shadow-xl transition hover:opacity-90 disabled:opacity-50"
            disabled={sending}
            onClick={sendAllTogether}
          >
            <ShoppingBag size={18} />
            {sending ? "Enviando…" : `Enviar todos (${pendingOrders.length}) a cocina`}
          </button>
        </div>
      )}

      {selected && (
        <ProductDialog
          product={selected}
          onClose={() => setSelected(null)}
          onAdd={addItem}
          dailyMenu={dailyMenu}
          drinkFlavors={drinkFlavors}
        />
      )}

      {/* Botón flotante Mesero / Cuenta (solo servicio en mesa, oculto en Para llevar) */}
      {tableCode !== "LLEVAR" && (
        <div
          className={`fixed right-4 z-40 transition-all duration-200 ${
            itemCount > 0 ? "bottom-[5.25rem] sm:bottom-24" : "bottom-5 sm:bottom-6"
          }`}
        >
          <button
            type="button"
            aria-label="Mesero y cuenta"
            className={`focus-ring flex items-center gap-2 rounded-full px-4 py-2.5 text-xs font-semibold transition-all active:scale-95 ${
              waiterCalled || billRequested
                ? "bg-[var(--green)] text-white shadow-lg dark:shadow-none"
                : "bg-neutral-900/90 text-white shadow-lg backdrop-blur-md hover:bg-neutral-800 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200 dark:shadow-none"
            }`}
            onClick={() => setServiceSheetOpen(true)}
          >
            {waiterCalled || billRequested ? (
              <>
                <Check size={16} strokeWidth={3} />
                <span>{billRequested ? "Cuenta pedida" : "Mesero avisado"}</span>
              </>
            ) : (
              <>
                <Hand size={16} />
                <span>Mesero · Cuenta</span>
              </>
            )}
          </button>
        </div>
      )}

      {/* Hoja de atención en mesa: Llamar mesero, Pedir cuenta y Resumen de consumo */}
      <Dialog open={serviceSheetOpen} onOpenChange={setServiceSheetOpen}>
        <DialogContent
          variant="sheet"
          initialFocus={false}
          showCloseButton={false}
          overlayClassName="bg-[#171411]/60 backdrop-blur-[3px]"
          className="gap-0 bg-[var(--paper)] p-0 text-[var(--ink)] dark:bg-neutral-900 dark:text-neutral-100"
        >
          <div className="flex items-center justify-between border-b border-[var(--line)] px-4 py-3.5 dark:border-neutral-800 sm:px-5">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--terracotta)] dark:text-[var(--gold)]">
                Servicio en mesa {tableCode}
              </p>
              <DialogTitle className="font-display text-2xl font-bold text-[var(--ink)] dark:text-neutral-100">
                ¿En qué te ayudamos?
              </DialogTitle>
            </div>
            <button
              type="button"
              aria-label="Cerrar atención en mesa"
              onClick={() => setServiceSheetOpen(false)}
              className="focus-ring grid h-10 w-10 place-items-center rounded-full bg-[#eee8dc] text-[var(--ink)] transition active:scale-90 dark:bg-neutral-800 dark:text-neutral-100"
            >
              <X size={18} />
            </button>
          </div>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:px-5 sm:py-5">
            <button
              type="button"
              disabled={waiterCalled}
              onClick={callWaiter}
              className="focus-ring flex w-full items-center justify-between gap-3 rounded-2xl border border-[var(--line)] bg-white p-4 text-left shadow-xs transition active:scale-[0.98] disabled:opacity-60 dark:border-neutral-800 dark:bg-neutral-800/80"
            >
              <span className="flex items-center gap-3">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-neutral-900 text-white dark:bg-white dark:text-neutral-900">
                  {waiterCalled ? <Check size={19} strokeWidth={3} /> : <Hand size={19} />}
                </span>
                <span>
                  <strong className="block text-sm font-bold">
                    {waiterCalled ? "Mesero en camino" : "Llamar al mesero"}
                  </strong>
                  <span className="block text-xs text-neutral-600 dark:text-neutral-400">
                    {waiterCalled
                      ? "Ya avisamos a tu mesa. Espera un momento."
                      : "Servilletas, salsa, dudas o cualquier apoyo"}
                  </span>
                </span>
              </span>
            </button>

            <div className="rounded-2xl border border-[var(--line)] bg-[#fbf7f1] p-4 dark:border-neutral-800 dark:bg-neutral-800/60">
              <div className="flex items-center gap-2">
                <Receipt size={18} className="text-[var(--brown)] dark:text-[var(--gold)]" />
                <strong className="text-sm font-bold">
                  {billRequested ? "Cuenta solicitada" : "Pedir la cuenta"}
                </strong>
              </div>
              <p className="mt-1 text-xs text-neutral-600 dark:text-neutral-400">
                {billRequested
                  ? "Avisamos al mesero con tu preferencia de pago."
                  : "Elige cómo prefieres pagar para que el mesero llegue preparado."}
              </p>
              <div className="mt-3 grid grid-cols-3 gap-2">
                {[
                  { value: "efectivo" as const, icon: "💵", label: "Efectivo" },
                  { value: "tarjeta" as const, icon: "💳", label: "Tarjeta" },
                  { value: "transferencia" as const, icon: "📲", label: "Transf." }
                ].map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    disabled={billRequested}
                    onClick={() => requestBill(opt.value)}
                    className="focus-ring flex flex-col items-center justify-center gap-1 rounded-xl border border-[var(--line)] bg-white px-2 py-3 text-xs font-bold text-[var(--ink)] transition hover:border-[var(--brown)] active:scale-95 disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
                  >
                    <span className="text-lg" aria-hidden="true">{opt.icon}</span>
                    <span>{opt.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {sessionOrders.length > 0 && (
              <div className="rounded-2xl border border-[var(--line)] bg-white p-4 dark:border-neutral-800 dark:bg-neutral-800/50">
                <div className="flex items-center justify-between">
                  <strong className="text-sm font-bold">Consumo de tu mesa</strong>
                  <strong className="text-base font-extrabold text-[var(--brown-dark)] dark:text-[var(--gold-light)]">
                    {money(sessionTotal)}
                  </strong>
                </div>
                <ul className="mt-3 divide-y divide-[var(--line)]/60 dark:divide-neutral-700/60">
                  {sessionOrders.map((ord) => (
                    <li key={ord.id} className="flex items-center justify-between gap-2 py-2.5 text-xs">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-bold">Folio {ord.folio}</span>
                          <StatusPill status={ord.status} />
                        </div>
                        <p className="mt-1 truncate text-neutral-600 dark:text-neutral-400">
                          {ord.items.map((i) => `${i.quantity}× ${i.name}`).join(" · ") || "Pedido registrado"}
                        </p>
                      </div>
                      <strong className="shrink-0 text-sm">{money(ord.total)}</strong>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Diálogo de confirmación propio (reemplaza window.confirm para WebViews móviles) */}
      <Dialog
        open={Boolean(confirmAction)}
        onOpenChange={(open) => {
          if (!open) setConfirmAction(null);
        }}
      >
        <DialogContent
          initialFocus={false}
          showCloseButton={false}
          overlayClassName="bg-[#171411]/60 backdrop-blur-[3px]"
          className="rounded-3xl bg-[var(--paper)] p-5 text-[var(--ink)] dark:bg-neutral-900 dark:text-neutral-100"
        >
          <DialogTitle className="font-display text-2xl font-bold leading-tight">
            {confirmAction?.title}
          </DialogTitle>
          <p className="text-sm leading-6 text-neutral-600 dark:text-neutral-300">
            {confirmAction?.description}
          </p>
          <div className="mt-2 grid grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={() => setConfirmAction(null)}
              className="focus-ring min-h-11 rounded-full border border-[var(--line)] bg-white px-4 py-2.5 text-sm font-semibold text-[var(--ink)] transition active:scale-95 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => confirmAction?.onConfirm()}
              className={`focus-ring min-h-11 rounded-full px-4 py-2.5 text-sm font-bold text-white transition active:scale-95 ${
                confirmAction?.tone === "danger"
                  ? "bg-[#9e3326] hover:bg-[#82281d]"
                  : "bg-neutral-900 hover:opacity-90 dark:bg-white dark:text-neutral-900"
              }`}
            >
              {confirmAction?.confirmLabel}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      <Drawer open={cartOpen} onOpenChange={setCartOpen} showSwipeHandle>
        <DrawerContent className="max-h-[90dvh] rounded-t-[2rem] border-[var(--line)] bg-[var(--paper)] text-[var(--ink)] dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-100">
          <CartDrawer
            cart={cart}
            notes={generalNotes}
            sending={sending}
            suggestions={cartSuggestions}
            onQuickAdd={(product) => addItem(product, 1, "")}
            onRequestClear={() =>
              setConfirmAction({
                title: "¿Vaciar todo el pedido?",
                description: "Se quitarán los platillos que agregaste a tu carrito.",
                confirmLabel: "Sí, vaciar",
                tone: "danger",
                onConfirm: () => {
                  setConfirmAction(null);
                  setCart([]);
                  setGeneralNotes("");
                  setCartOpen(false);
                }
              })
            }
            onNotes={setGeneralNotes}
            onClose={() => setCartOpen(false)}
            onChange={setCart}
            onSubmit={submitOrder}
          />
        </DrawerContent>
      </Drawer>
    </main>
  );
}

function ProductCard({
  product,
  promotion,
  currentMinutes,
  onOpen,
  dailyMenu
}: {
  product: Product;
  promotion?: Promotion;
  currentMinutes: number | null;
  onOpen: (product: Product) => void;
  dailyMenu: DailyMenuConfig | null;
}) {
  const isComidaALaCarta = product.category === "Comidas a la carta";
  const available = isProductAvailable(
    product,
    currentMinutes,
    isComidaALaCarta ? dailyMenu?.availableFrom : undefined,
    isComidaALaCarta ? dailyMenu?.availableUntil : undefined
  );
  const effectiveFrom = isComidaALaCarta ? dailyMenu?.availableFrom : product.availableFrom;
  const effectiveUntil = isComidaALaCarta ? dailyMenu?.availableUntil : product.availableUntil;
  const promoPrice = promotion
    ? promotion.discountType === "percent"
      ? Math.max(0, Math.round(product.price * (1 - promotion.discountValue / 100)))
      : Math.max(0, product.price - promotion.discountValue)
    : null;
  const recommended =
    !product.popular && product.category === "Comidas a la carta" && !product.soldOut && available;
  return (
    <Card className="menu-card group relative gap-0 overflow-hidden rounded-3xl border-neutral-100 bg-white py-0 dark:border-neutral-800 dark:bg-neutral-900">
      <button
        type="button"
        className="focus-ring block w-full text-left disabled:opacity-65"
        onClick={() => onOpen(product)}
        disabled={product.soldOut || !available}
      >
        <div className="relative">
          <ProductImage
            src={product.image}
            alt={product.name}
            category={product.category}
            className="aspect-[16/10] w-full transition-transform duration-500 ease-out sm:aspect-[4/3] sm:group-hover:scale-105"
          />
          <span className="absolute left-3 top-3 rounded-full border border-white/40 bg-[#24211f]/70 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-white shadow-lg backdrop-blur-md">
            {product.category}
          </span>
          {promotion && (
            <Badge className="animate-pulse absolute right-3 top-3 h-auto border border-white/40 bg-gradient-to-r from-[#f59e0b] to-[#fbbf24] px-3 py-1 text-[10px] font-extrabold uppercase tracking-[0.12em] text-[#7c2d00] shadow-[0_0_16px_rgba(245,158,11,0.5)]">
              ¡PROMO!
            </Badge>
          )}
          <div className="absolute bottom-2 left-3 flex flex-wrap gap-1.5">
            {product.popular && (
              <Badge variant="outline" className="h-auto border-none bg-black/60 px-2.5 py-1 text-[11px] font-medium text-white backdrop-blur-md">
                🔥 Popular
              </Badge>
            )}
            {recommended && (
              <Badge variant="outline" className="h-auto border-none bg-black/60 px-2.5 py-1 text-[11px] font-medium text-white backdrop-blur-md">
                ⭐ Recomendado
              </Badge>
            )}
          </div>
          <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/25 to-transparent" />
        </div>
        <div className="p-4 sm:p-5">
          <div className="mb-2 flex min-h-6 flex-wrap gap-1.5 sm:gap-2">
            {product.isNew && (
              <Badge className="h-auto bg-[#d9ebe1] px-2 py-1 text-[10px] font-bold uppercase text-[var(--green)]">
                Nuevo
              </Badge>
            )}
            {Boolean(product.packageIncludes?.length) && (
              <Badge className="h-auto bg-[#e4ece6] px-2 py-1 text-[10px] font-bold uppercase text-[var(--green)]">
                Paquete completo
              </Badge>
            )}
            {Boolean(product.optionGroups?.length || product.options?.length) && (
              <Badge className="h-auto bg-[#efe3d7] px-2 py-1 text-[10px] font-bold uppercase text-[var(--brown)]">
                Personalizable
              </Badge>
            )}
            {product.soldOut && (
              <Badge className="h-auto bg-[#f1d0ca] px-2 py-1 text-[10px] font-bold uppercase text-[#7a2c22]">
                Agotado
              </Badge>
            )}
            {!product.soldOut && !available && (
              <Badge className="h-auto bg-[var(--mist)] px-2 py-1 text-[10px] font-bold uppercase text-[var(--brown)]">
                Fuera de horario
              </Badge>
            )}
          </div>
          <h3 className="font-display text-[1.28rem] font-bold leading-[1.08] sm:text-[1.35rem]">
            {product.name}
          </h3>
          <p className="mt-1.5 line-clamp-2 min-h-10 text-sm font-medium leading-5 text-neutral-600 dark:text-neutral-300">
            {product.description}
          </p>
          {product.packageIncludes && product.packageIncludes.length > 0 && (
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {product.packageIncludes.map((item) => (
                <span
                  className="rounded-full border border-[var(--line)] bg-[var(--cream)] px-2.5 py-1 text-[11px] font-bold text-[var(--brown)] dark:border-neutral-700 dark:bg-neutral-800 dark:text-[var(--gold-light)]"
                  key={item}
                >
                  ✓ {item}
                </span>
              ))}
            </div>
          )}
          <div className="mt-4 flex items-center justify-between border-t border-[var(--line)]/65 pt-3.5 dark:border-neutral-800 sm:mt-5 sm:pt-4">
            <p className="text-lg font-extrabold text-[var(--brown-dark)] dark:text-[var(--gold-light)]">
              {promoPrice !== null ? money(promoPrice) : money(product.price)}
              {(promoPrice !== null || product.compareAt) && (
                <span className="ml-2 text-xs font-normal text-[#929a96] line-through">
                  {money(promoPrice !== null ? product.price : (product.compareAt ?? 0))}
                </span>
              )}
            </p>
            {product.soldOut ? (
              <span className="rounded-full bg-[#e0ddd6] px-3 py-2 text-xs font-bold text-[#555]">
                Agotado
              </span>
            ) : !available ? (
              <span className="rounded-full bg-[var(--mist)] px-3 py-2 text-xs font-bold text-[var(--brown)]">
                {effectiveFrom}–{effectiveUntil}
              </span>
            ) : (
              <span className="grid h-10 w-10 place-items-center rounded-full bg-neutral-900 text-white shadow-md transition active:scale-90 sm:h-11 sm:w-11 sm:group-hover:scale-110 dark:bg-white dark:text-neutral-900">
                <Plus size={19} />
              </span>
            )}
          </div>
        </div>
      </button>
    </Card>
  );
}

function optionPrompt(product: Product) {
  if (product.id === "malteada" || product.id === "licuado") return "Elige tu sabor";
  if (product.id === "desayuno-combinado") return "¿Cómo quieres tus huevos?";
  if (product.id === "chilaquiles-pechuga") return "Elige cómo prefieres la pechuga";
  if (product.id === "taco-bistec-longaniza") return "Elige la preparación";
  if (product.id === "ensalada-fresca") return "Elige la proteína";
  if (product.id === "huevos-al-gusto") return "¿Cómo quieres tus huevos?";
  return "Elige salsa de tu preferencia";
}

function ProductDialog({
  product,
  onClose,
  onAdd,
  dailyMenu,
  drinkFlavors
}: {
  product: Product;
  onClose: () => void;
   onAdd: (
    product: Product,
    quantity: number,
    notes: string,
    option?: string,
    extras?: Array<{ name: string; price: number }>,
    priceModifier?: number
  ) => void;
  dailyMenu: DailyMenuConfig | null;
  drinkFlavors: Array<{drinkType: string; name: string; priceModifier: number}>;
}) {
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState("");
  const [selectedExtras, setSelectedExtras] = useState<string[]>([]);
  const [breakfastExtras, setBreakfastExtras] = useState<Array<{name: string; price: number; active: boolean}>>([]);
  const isBreakfast = product.category === "Desayunos";
  const isComidaALaCarta = product.category === "Comidas a la carta";

  // Load global breakfast extras for Desayunos products
  useEffect(() => {
    if (!isBreakfast) return;
    fetch("/api/breakfast-extras", { cache: "no-store" })
      .then((r) => r.json().catch(() => []))
      .then((data) => {
        if (Array.isArray(data)) setBreakfastExtras(data.filter((e: Record<string, unknown>) => e.active !== false));
      })
      .catch(() => setBreakfastExtras([]));
  }, [isBreakfast]);

  // Merge product extras + global breakfast extras
  const allExtras = useMemo(() => {
    if (isBreakfast && breakfastExtras.length > 0) {
      // Global breakfast extras take priority
      const globalNames = new Set(breakfastExtras.map((e) => e.name));
      const productExtras = (product.extrasConfig || []).filter((e) => e.active !== false && !globalNames.has(e.name));
      return [...breakfastExtras.map((e) => ({ name: e.name, price: e.price, active: true })), ...productExtras];
    }
    return (product.extrasConfig || []).filter((e) => e.active !== false);
  }, [isBreakfast, breakfastExtras, product.extrasConfig]);
  // Map product IDs to drink flavor types
  const drinkTypeMap: Record<string, string> = {
    cafe: "cafe",
    malteada: "malteada",
    licuado: "licuado",
    "agua-fruta": "agua-fruta"
  };
  const drinkType = drinkTypeMap[product.id];
  const dynamicFlavors = useMemo(() => {
    if (!drinkType || !drinkFlavors.length) return null;
    const flavors = drinkFlavors.filter((f) => f.drinkType === drinkType);
    if (!flavors.length) return null;
    return flavors;
  }, [drinkType, drinkFlavors]);

  const groups = useMemo(() => {
    // If this is a drink with dynamic flavors, use those instead of hardcoded options
    if (dynamicFlavors) {
      const flavorChoices = dynamicFlavors.map((f) => f.name);
      const flavorPrices = dynamicFlavors.map((f) => f.priceModifier);
      return [{
        id: "sabor",
        label: "Elige tu sabor",
        choices: flavorChoices,
        choicePrices: flavorPrices.some((p) => p > 0) ? flavorPrices : undefined,
        required: true
      }];
    }
    const baseGroups = product.optionGroups || (
      product.options?.length
        ? [{ id: "opcion", label: optionPrompt(product), choices: product.options, required: true }]
        : []
    );
    return isComidaALaCarta
      ? resolveDailyCourseGroups(baseGroups, dailyMenu?.courses)
      : baseGroups;
  }, [dynamicFlavors, isComidaALaCarta, product, dailyMenu?.courses]);
  const [selections, setSelections] = useState<Record<string, string>>(() =>
    Object.fromEntries(groups.map((group) => [group.id, group.choices[0] || ""]))
  );
  const selectionsSynced = useRef(false);
  useEffect(() => {
    if (!selectionsSynced.current) {
      selectionsSynced.current = true;
      return;
    }
    setSelections((prev) =>
      Object.fromEntries(
        groups.map((group) => [
          group.id,
          prev[group.id] && group.choices.includes(prev[group.id])
            ? prev[group.id]
            : group.choices[0] || ""
        ])
      )
    );
  }, [groups]);
  const hasCompleteSelection = groups.every(
    (group) => group.choices.length > 0 && Boolean(selections[group.id])
  );
  const priceModifier = useMemo(() => {
    // Check both product.optionGroups and dynamic groups (drink flavors)
    const allGroups = groups;
    const pricedGroup = allGroups.find((g) => g.choicePrices && g.choicePrices.length > 0);
    if (!pricedGroup) return 0;
    const selectedIdx = pricedGroup.choices.indexOf(selections[pricedGroup.id]);
    if (selectedIdx < 0) return 0;
    return pricedGroup.choicePrices?.[selectedIdx] ?? 0;
  }, [groups, selections]);
  const selectionSummary = groups
    .map((group) => {
      const shortLabel =
        group.id === "salsa"
          ? "Salsa"
          : group.id === "queso"
            ? "Queso"
            : group.id === "huevos"
              ? "Huevos"
              : group.id === "plato"
                ? "Plato"
                : group.id === "bebida"
                  ? "Bebida"
                  : group.id === "pechuga"
                    ? "Pechuga"
                    : group.id === "opcion"
                      ? "Sabor"
                      : group.id === "primer-tiempo"
                        ? "Primer tiempo"
                        : group.id === "acompanamiento"
                          ? "Acompañamiento"
                          : group.id === "agua"
                            ? "Agua"
                            : group.id === "cafe-tipo"
                              ? "Tipo"
                              : "Opción";
      return `${shortLabel}: ${selections[group.id]}`;
    })
    .join(" · ")
    .slice(0, 80);
  const totalPrice =
    (product.price +
      priceModifier +
      allExtras
        .filter((extra) => selectedExtras.includes(extra.name))
        .reduce((sum, extra) => sum + extra.price, 0)) *
    quantity;
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent
        variant="sheet"
        initialFocus={false}
        showCloseButton={false}
        overlayClassName="bg-[#171411]/60 backdrop-blur-[3px]"
        className="gap-0 bg-[var(--paper)] p-0 text-[var(--ink)] dark:bg-neutral-900 dark:text-neutral-100"
      >
        <DialogTitle className="sr-only">{product.name}</DialogTitle>
        <div className="relative shrink-0">
          <ProductImage
            src={product.image}
            alt={product.name}
            category={product.category}
            className="h-48 w-full sm:h-60"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute left-1/2 top-2.5 z-10 h-1 w-10 -translate-x-1/2 rounded-full bg-white/75 shadow-sm sm:hidden"
          />
          <div className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-black/35 to-transparent" />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-black/70 via-black/30 to-transparent" />
          <button
            type="button"
            className="focus-ring absolute right-3.5 top-3.5 z-10 grid h-10 w-10 place-items-center rounded-full bg-black/50 text-white backdrop-blur-md transition active:scale-90"
            aria-label="Cerrar"
            onClick={onClose}
          >
            <X size={18} />
          </button>
          <div className="absolute bottom-3 left-4 right-4">
            <p className="eyebrow text-[var(--gold-light)]">{product.category}</p>
            <h2 className="mt-1 font-display text-2xl font-bold leading-[1.08] text-white drop-shadow-md sm:text-3xl sm:leading-none">
              {product.name}
            </h2>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5 sm:py-5">
          <p className="text-sm leading-6 text-neutral-600 dark:text-neutral-300 sm:text-base">
            {product.description}
          </p>
          {product.packageIncludes && product.packageIncludes.length > 0 && (
            <div className="mt-4 rounded-2xl border border-[#c9d7ca] bg-[#edf3ec] p-3.5 dark:border-emerald-900/60 dark:bg-emerald-950/40 sm:mt-5 sm:p-4">
              <p className="text-[11px] font-extrabold uppercase tracking-wider text-[var(--green)] dark:text-emerald-300 sm:text-xs">
                Tu paquete ya incluye
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5 sm:gap-2">
                {product.packageIncludes.map((item) => (
                  <span
                    className="rounded-full bg-white px-3 py-1 text-xs font-bold text-[var(--ink)] dark:bg-neutral-800 dark:text-neutral-100 sm:py-1.5"
                    key={item}
                  >
                    ✓ {item}
                  </span>
                ))}
              </div>
            </div>
          )}
          {groups.map((group, groupIndex) => (
            <fieldset className="mt-4 sm:mt-5" key={group.id}>
              <legend className="flex items-center gap-2 text-sm font-bold sm:text-base">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[var(--brown)] text-xs text-white">
                  {groupIndex + 1}
                </span>
                {group.label}
              </legend>
              <p className="mb-2.5 ml-8 text-xs text-[var(--muted-foreground)] sm:mb-3">
                Selecciona 1 {group.required !== false && "· Obligatorio"}
              </p>
              <div className="flex flex-wrap gap-2">
                {group.choices.map((item) => {
                  const unavailable = item.trim() === "";
                  const selected = selections[group.id] === item;
                  return (
                    <button
                      type="button"
                      key={item}
                      disabled={unavailable}
                      aria-pressed={selected}
                      className={`focus-ring min-h-10 rounded-full px-4 py-2 text-xs font-semibold transition-all sm:py-2.5 ${
                        unavailable
                          ? "cursor-not-allowed opacity-40"
                          : selected
                            ? "bg-neutral-900 text-white shadow-md dark:bg-white dark:text-neutral-900"
                            : "border border-[var(--line)] bg-white text-[var(--ink)] hover:border-[var(--brown)] hover:bg-[var(--cream)] active:scale-95 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100 dark:hover:border-neutral-500"
                      }`}
                      onClick={() =>
                        setSelections((current) => ({ ...current, [group.id]: item }))
                      }
                    >
                      {unavailable ? "No disponible" : item}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          ))}
          <label className="mt-4 block text-sm font-bold sm:mt-5">
            Observaciones
            <textarea
              className="mt-2 min-h-20 w-full resize-none rounded-xl border border-[var(--line)] bg-white p-3 text-base font-normal outline-none transition focus:border-[var(--green)] dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
              maxLength={180}
              placeholder="Ej. Sin cebolla, salsa aparte…"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </label>
          {allExtras.length > 0 && (
            <fieldset className="mt-4 rounded-2xl border border-[var(--line)] bg-[#fbf7f1] p-3.5 dark:border-neutral-800 dark:bg-neutral-800/60 sm:mt-5 sm:p-4">
              <legend className="font-display text-lg font-bold sm:text-xl">
                {isBreakfast ? "Extras de desayuno" : "Extras con costo"}
              </legend>
              <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                Puedes sumar extras y el precio se actualizará al momento.
              </p>
              <div className="mt-3 grid gap-2">
                {allExtras.map((extra) => {
                  const selected = selectedExtras.includes(extra.name);
                  return (
                    <label
                      className={`flex cursor-pointer items-center justify-between gap-2 rounded-xl border p-3 transition ${
                        selected
                          ? "border-[var(--brown)] bg-[#f4e6d8] shadow-sm dark:border-[var(--gold)] dark:bg-neutral-800"
                          : "border-[var(--line)] bg-white hover:bg-[var(--cream)] dark:border-neutral-700 dark:bg-neutral-900 dark:hover:bg-neutral-800"
                      }`}
                      key={extra.name}
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <span
                          className={`grid h-5 w-5 shrink-0 place-items-center rounded border-2 ${
                            selected
                              ? "border-[var(--brown)] bg-[var(--brown)] text-white"
                              : "border-[var(--line)] dark:border-neutral-600"
                          }`}
                        >
                          {selected && <Check size={12} strokeWidth={3} />}
                        </span>
                        <span className="truncate font-medium">{extra.name}</span>
                      </span>
                      <strong className="shrink-0 text-sm text-[var(--brown)] dark:text-[var(--gold-light)]">
                        +{money(extra.price)}
                      </strong>
                      <input
                        checked={selected}
                        type="checkbox"
                        className="sr-only"
                        onChange={() =>
                          setSelectedExtras((current) =>
                            selected
                              ? current.filter((item) => item !== extra.name)
                              : [...current, extra.name]
                          )
                        }
                      />
                    </label>
                  );
                })}
              </div>
            </fieldset>
          )}
        </div>

        <div className="shrink-0 border-t border-[var(--line)] bg-[var(--paper)] px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] dark:border-neutral-800 dark:bg-neutral-900 sm:p-4 sm:pb-5">
          <div className="flex items-center gap-2.5 sm:gap-3">
            <div className="flex shrink-0 items-center rounded-full border border-[var(--line)] bg-white p-1 dark:border-neutral-700 dark:bg-neutral-800">
              <button
                type="button"
                className="focus-ring grid h-10 w-10 place-items-center rounded-full transition active:scale-90 sm:h-11 sm:w-11"
                aria-label="Restar"
                onClick={() => setQuantity((value) => Math.max(1, value - 1))}
              >
                <Minus size={17} />
              </button>
              <strong className="w-7 text-center text-sm sm:w-9 sm:text-base">{quantity}</strong>
              <button
                type="button"
                className="focus-ring grid h-10 w-10 place-items-center rounded-full text-[var(--terracotta)] transition active:scale-90 sm:h-11 sm:w-11 dark:text-[var(--gold-light)]"
                aria-label="Sumar"
                onClick={() => setQuantity((value) => Math.min(10, value + 1))}
              >
                <Plus size={17} />
              </button>
            </div>
            <button
              type="button"
              className="focus-ring flex min-h-12 min-w-0 flex-1 items-center justify-center gap-2 rounded-full bg-neutral-900 px-4 py-3 text-sm font-semibold text-white transition-transform hover:opacity-90 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45 dark:bg-white dark:text-neutral-900 sm:min-h-14 sm:py-4 sm:text-base"
              disabled={isComidaALaCarta && !hasCompleteSelection}
              onClick={() => {
                const chosenExtras = allExtras
                  .filter((extra) => selectedExtras.includes(extra.name))
                  .map((extra) => ({ name: extra.name, price: extra.price }));
                onAdd(
                  product,
                  quantity,
                  notes.trim(),
                  selectionSummary || undefined,
                  chosenExtras.length > 0 ? chosenExtras : undefined,
                  priceModifier
                );
                setSelectedExtras([]);
              }}
            >
              <ShoppingBag size={18} className="shrink-0" />
              <span className="truncate">
                Agregar<span className="hidden min-[380px]:inline"> al pedido</span>
              </span>
              <span className="shrink-0 font-bold">· {money(totalPrice)}</span>
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CartDrawer({
  cart,
  notes,
  sending,
  suggestions,
  onQuickAdd,
  onRequestClear,
  onNotes,
  onClose,
  onChange,
  onSubmit
}: {
  cart: CartItem[];
  notes: string;
  sending: boolean;
  suggestions: Product[];
  onQuickAdd: (product: Product) => void;
  onRequestClear: () => void;
  onNotes: (notes: string) => void;
  onClose: () => void;
  onChange: (items: CartItem[]) => void;
  onSubmit: () => void;
}) {
  const subtotal = calculateCartTotal(cart);
  return (
    <>
      <div className="flex items-center justify-between gap-3 border-b border-[var(--line)] px-4 pb-3.5 pt-2 dark:border-neutral-800 sm:px-5 sm:pb-4 sm:pt-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-[var(--terracotta)] dark:text-[var(--gold)]">
            Revisa antes de enviar
          </p>
          <DrawerTitle className="font-display text-2xl font-bold text-[var(--ink)] dark:text-neutral-100">
            Mi pedido
          </DrawerTitle>
        </div>
        <div className="flex items-center gap-2">
          {cart.length > 0 && (
            <button
              type="button"
              className="focus-ring flex min-h-10 items-center gap-1.5 rounded-full px-3.5 text-xs font-bold text-[#8a3b30] transition hover:bg-[#f8e8e2] active:scale-95 dark:text-red-300 dark:hover:bg-red-950/40"
              onClick={onRequestClear}
            >
              <Trash2 size={14} /> Limpiar
            </button>
          )}
          <button
            type="button"
            className="focus-ring grid h-10 w-10 place-items-center rounded-full bg-[#eee8dc] text-[var(--ink)] transition active:scale-90 dark:bg-neutral-800 dark:text-neutral-100"
            aria-label="Cerrar pedido"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5">
        <ul className="divide-y divide-[var(--line)]/70 dark:divide-neutral-800">
          {cart.map((item, index) => (
            <li key={`${item.productId}-${index}`} className="flex gap-3 py-4 first:pt-1 last:pb-1">
              <ProductImage
                src={item.image}
                alt={item.name}
                className="h-20 w-20 shrink-0 rounded-2xl"
              />
              <div className="min-w-0 flex-1">
                <div className="flex justify-between gap-3">
                  <h3 className="font-bold leading-tight">{item.name}</h3>
                  <strong className="shrink-0">{money(cartItemTotal(item))}</strong>
                </div>
                {item.option && (
                  <p className="mt-1 text-xs font-medium text-[var(--brown)] dark:text-[var(--gold-light)]">{item.option}</p>
                )}
                {item.extras && item.extras.length > 0 && (
                  <div className="mt-1 space-y-0.5">
                    {item.extras.map((extra, extraIndex) => (
                      <p key={extraIndex} className="text-xs text-[var(--terracotta)] dark:text-[var(--gold)]">
                        + {extra.name} ({money(extra.price)})
                      </p>
                    ))}
                  </div>
                )}
                <input
                  className="mt-2 w-full rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-base outline-none transition focus:border-[var(--green)] dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
                  placeholder="Nota para este platillo…"
                  maxLength={250}
                  value={item.notes || ""}
                  onChange={(event) => {
                    const next = [...cart];
                    next[index] = { ...item, notes: event.target.value };
                    onChange(next);
                  }}
                />
                <div className="mt-3 flex items-center gap-3">
                  <button
                    type="button"
                    className="focus-ring grid h-10 w-10 place-items-center rounded-full border border-[var(--line)] bg-white text-[var(--ink)] transition active:scale-90 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
                    aria-label={`Restar ${item.name}`}
                    onClick={() => {
                      const next = [...cart];
                      if (item.quantity === 1) next.splice(index, 1);
                      else next[index] = { ...item, quantity: item.quantity - 1 };
                      onChange(next);
                    }}
                  >
                    <Minus size={16} />
                  </button>
                  <strong className="min-w-6 text-center">{item.quantity}</strong>
                  <button
                    type="button"
                    className="focus-ring grid h-10 w-10 place-items-center rounded-full border border-[var(--line)] bg-white text-[var(--ink)] transition active:scale-90 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
                    aria-label={`Sumar ${item.name}`}
                    onClick={() => {
                      const next = [...cart];
                      next[index] = { ...item, quantity: Math.min(10, item.quantity + 1) };
                      onChange(next);
                    }}
                  >
                    <Plus size={16} />
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>

        {suggestions.length > 0 && (
          <div className="mt-4 rounded-2xl border border-[var(--line)]/80 bg-[#fbf7f1] p-3.5 dark:border-neutral-800 dark:bg-neutral-800/50">
            <p className="text-xs font-bold uppercase tracking-wider text-[var(--brown)] dark:text-[var(--gold)]">
              ¿Algo para acompañar?
            </p>
            <div className="no-scrollbar -mx-1 mt-2.5 flex gap-2.5 overflow-x-auto px-1 pb-0.5">
              {suggestions.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onQuickAdd(item)}
                  className="focus-ring flex w-40 shrink-0 items-center gap-2.5 rounded-xl border border-[var(--line)] bg-white p-2 text-left transition active:scale-95 dark:border-neutral-700 dark:bg-neutral-900"
                >
                  <ProductImage
                    src={item.image}
                    alt={item.name}
                    category={item.category}
                    className="h-11 w-11 shrink-0 rounded-lg"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-bold text-[var(--ink)] dark:text-neutral-100">
                      {item.name}
                    </span>
                    <span className="mt-0.5 block text-[11px] font-bold text-[var(--brown)] dark:text-[var(--gold-light)]">
                      + {money(item.price)}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        <label className="mt-4 block text-sm font-bold">
          Observaciones generales
          <textarea
            className="mt-2 min-h-20 w-full resize-none rounded-2xl border border-[var(--line)] bg-white p-3 text-base font-normal outline-none transition focus:border-[var(--green)] dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
            maxLength={250}
            placeholder="Algo que debamos saber…"
            value={notes}
            onChange={(event) => onNotes(event.target.value)}
          />
        </label>
      </div>
      <div className="border-t border-[var(--line)] px-4 pt-3.5 pb-[max(1.25rem,env(safe-area-inset-bottom))] dark:border-neutral-800 sm:p-4 sm:pb-6">
        <div className="mb-3.5 flex items-center justify-between text-base sm:mb-4 sm:text-lg">
          <span className="text-[var(--muted-foreground)]">Total estimado</span>
          <strong className="text-xl">{money(subtotal)}</strong>
        </div>
        <button
          type="button"
          className="focus-ring flex min-h-14 w-full items-center justify-center gap-2 rounded-full bg-neutral-900 py-4 font-semibold text-white transition-all hover:opacity-90 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-neutral-900"
          disabled={sending || cart.length === 0}
          onClick={onSubmit}
        >
          {sending ? (
            "Enviando…"
          ) : (
            <>
              <ShoppingBag size={20} />
              Enviar pedido
            </>
          )}
        </button>
      </div>
    </>
  );
}

function OrderTracking({
  order,
  tableCode,
  session,
  customerName,
  customerPhone,
  onOrderAgain
}: {
  order: Order;
  tableCode: string;
  session: TableSession | null;
  customerName?: string;
  customerPhone?: string;
  onOrderAgain: () => void;
}) {
  const steps = ["accepted", "preparing", "ready", "delivered"] as const;
  const current = steps.indexOf(
    order.status === "cancelled" || order.status === "sent"
      ? "accepted"
      : order.status
  );
  const trackingTitle =
    order.status === "accepted" || order.status === "preparing"
      ? "Tu pedido ya está en cocina"
      : order.status === "ready"
        ? "Tu pedido está listo para servir"
        : order.status === "delivered"
          ? "Tu pedido fue entregado"
          : "Este pedido fue cancelado";
  return (
    <main className="mx-auto min-h-screen max-w-xl px-5 py-6">
      <Brand />
      <section className="paper mt-8 overflow-hidden rounded-[2rem]">
        <div className="bg-[var(--green)] px-6 py-8 text-white">
          <div className="grid h-14 w-14 place-items-center rounded-full bg-[#d9b65d] text-[var(--green)]">
            <Check size={30} strokeWidth={3} />
          </div>
          <p className="mt-6 text-xs font-bold uppercase tracking-[0.2em] text-[#e5cd90]">
            Pedido enviado
          </p>
          <h1 className="mt-1 font-display text-4xl font-bold">{trackingTitle}</h1>
          <div className="mt-5 flex items-center gap-4">
            <StatusPill status={order.status} />
            <span className="text-sm">Folio {order.folio}</span>
          </div>
          {tableCode === "LLEVAR" && (customerName || order.customerName) && (
            <p className="mt-4 font-display text-2xl font-bold text-[#ffd166]">
              👤 {customerName || order.customerName}
              {customerPhone ? ` · 📞 ${customerPhone}` : ""}
            </p>
          )}
          {tableCode === "LLEVAR" && (
            <div className="mt-4 rounded-xl bg-white/10 p-3 backdrop-blur">
              <p className="text-xs text-white/70">
                📱 Guarda esta página o compártela para seguir tu pedido.
              </p>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  className="focus-ring rounded-lg bg-white/20 px-3 py-1.5 text-xs font-bold text-white hover:bg-white/30"
                  onClick={() => {
                    const url = `${window.location.origin}/seguimiento/${order.folio}`;
                    void navigator.clipboard.writeText(url);
                    toastSuccess("Link copiado", "Pégalo en WhatsApp o donde quieras.");
                  }}
                >
                  📋 Copiar link
                </button>
                <a
                  href={`https://wa.me/?text=${encodeURIComponent(`🍽️ Mi pedido en Imperio · ${order.folio}\n${typeof window !== "undefined" ? window.location.origin : ""}/seguimiento/${order.folio}`)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="focus-ring rounded-lg bg-[#25D366] px-3 py-1.5 text-xs font-bold text-white hover:opacity-90"
                >
                  📱 WhatsApp
                </a>
              </div>
            </div>
          )}
        </div>
        <div className="p-6">
          <div className="flex items-center justify-between rounded-2xl bg-[#eee8dc] p-4">
            <span>
              <span className="block text-xs uppercase text-[var(--muted-foreground)]">
                {tableCode === "LLEVAR" ? "Para llevar" : "Mesa"}
              </span>
              <strong className="text-2xl">{tableCode === "LLEVAR" ? "🥡" : tableCode}</strong>
            </span>
            <span className="text-right">
              <span className="block text-xs uppercase text-[var(--muted-foreground)]">Total</span>
              <strong className="text-xl">{money(order.total)}</strong>
            </span>
          </div>
          {order.status === "cancelled" ? (
            <div className="mt-6 rounded-2xl bg-[#f1d0ca] p-4 text-[#7a2c22]">
              Este pedido fue cancelado. Solicita ayuda al personal.
            </div>
          ) : (
            <ol className="mt-7 space-y-0">
              {steps.map((step, index) => (
                <li className={`flex gap-4 ${index === current ? "step-active" : ""}`} key={step}>
                  <div className="flex flex-col items-center">
                    <span
                      className={`step-circle grid h-8 w-8 place-items-center rounded-full ${
                        index <= current
                          ? "bg-[var(--green)] text-white"
                          : "border-2 border-[var(--line)] bg-white"
                      }`}
                    >
                      {index < current ? <Check size={16} /> : index + 1}
                    </span>
                    {index < steps.length - 1 && (
                      <span
                        className={`h-9 w-0.5 ${
                          index < current ? "bg-[var(--green)]" : "bg-[var(--line)]"
                        }`}
                      />
                    )}
                  </div>
                  <div className="pt-1">
                    <strong className="capitalize">
                      {
{
                           accepted: "Confirmado y enviado a cocina",
                          preparing: "Preparando",
                          ready: "Listo para servir",
                          delivered: "Entregado"
                        }[step]
                      }
                    </strong>
                    {index === current && (
                      <p className="text-xs text-[var(--muted-foreground)]">Estado actual</p>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          )}
          <div className="mt-7 flex items-center gap-2 rounded-xl bg-[#f4dfb4]/60 p-3 text-sm">
            <Clock3 size={18} />
            El estado se actualiza automáticamente.
          </div>
          {session && session.status === "active" && (
            <div className="mt-4 rounded-2xl bg-[#eee8dc] p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs uppercase text-[var(--muted-foreground)]">Mesa en sesión</span>
                <span className="text-xs font-bold text-[var(--brown)]">#{session.id?.slice(0, 8)}</span>
              </div>
              <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                Puedes seguir ordenando y acumularemos todo en una sola cuenta.
              </p>
            </div>
          )}
          <button
            className="focus-ring mt-4 flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-[var(--terracotta)] px-5 font-bold text-white"
            onClick={onOrderAgain}
          >
            <Plus size={20} />
            {order.status === "cancelled"
              ? "Volver al menú"
              : order.status === "delivered"
                ? "Pedir algo más"
                : "Seguir pidiendo"}
          </button>
        </div>
      </section>
    </main>
  );
}

function LunchMenu({
  menu,
  loading,
  serviceMinutes,
  onAdd,
  onShowFixed
}: {
  menu: DailyMenuConfig | null;
  loading: boolean;
  serviceMinutes: number | null;
  onAdd: (
    menu: DailyMenuConfig,
    selections: Record<string, string>,
    quantity: number,
    extras: Array<{ name: string; price: number }>
  ) => void;
  onShowFixed: () => void;
}) {
  if (loading) {
    return (
      <section className="paper mt-5 overflow-hidden rounded-[2rem] sm:mt-6">
        <div className="bg-[var(--brown)]/10 px-5 py-6 sm:px-6 sm:py-7">
          <div className="skeleton mb-4 h-6 w-36 max-w-full" />
          <div className="skeleton mb-2 h-10 w-full max-w-xs" />
          <div className="skeleton h-5 w-44 max-w-full" />
        </div>
        <div className="space-y-4 p-5 sm:p-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="space-y-3 border-b border-[var(--line)] py-4 last:border-0">
              <div className="skeleton h-6 w-32" />
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="skeleton h-12 rounded-xl" />
                <div className="skeleton h-12 rounded-xl" />
              </div>
            </div>
          ))}
          <div className="skeleton mt-4 h-14 w-full rounded-xl" />
        </div>
      </section>
    );
  }

  if (!menu || !menu.availableToday) {
    return (
      <section className="animate-fade-in paper mt-5 rounded-[2rem] p-6 text-center sm:mt-6 sm:p-7">
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-[#f4dfb4]/60">
          <Clock3 className="text-[var(--terracotta)]" size={30} />
        </div>
        <h2 className="mt-5 font-display text-2xl font-bold sm:text-3xl">Hoy no hay comida corrida</h2>
        <p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">
          Puedes ordenar cualquiera de los productos del menú fijo.
        </p>
        <button
          type="button"
          className="focus-ring btn-press mt-5 rounded-2xl bg-[var(--green)] px-6 py-3 font-bold text-white shadow-md transition hover:opacity-90"
          onClick={onShowFixed}
        >
          Ver menú fijo
        </button>
      </section>
    );
  }

  return (
    <ConfiguredLunchMenu
      key={`${menu.serviceDate}-${menu.updatedAt || ""}`}
      menu={menu}
      serviceMinutes={serviceMinutes}
      onAdd={onAdd}
    />
  );
}

function ConfiguredLunchMenu({
  menu,
  serviceMinutes,
  onAdd
}: {
  menu: DailyMenuConfig;
  serviceMinutes: number | null;
  onAdd: (
    menu: DailyMenuConfig,
    selections: Record<string, string>,
    quantity: number,
    extras: Array<{ name: string; price: number }>
  ) => void;
}) {
  const courses = dailyCourseOrder.map(
    (course) => [course, getCourseOptions(course, menu.courses[course])] as const
  );
  const [quantity, setQuantity] = useState(1);
  const [selections, setSelections] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      dailyCourseOrder.map((course) => {
        const options = getCourseOptions(course, menu.courses[course]);
        return [course, options.length === 1 ? options[0] : ""];
      })
    )
  );
  const [selectedExtras, setSelectedExtras] = useState<string[]>([]);
  const hasCompleteSelection = courses.every(
    ([course, options]) => options.length > 0 && Boolean(selections[course])
  );
  const isOpen =
    serviceMinutes === null ||
    (serviceMinutes >= timeToMinutes(menu.availableFrom) &&
      serviceMinutes < timeToMinutes(menu.availableUntil));
  const extras = menu.extras || [];
  const chosenExtras = extras.filter((extra) => selectedExtras.includes(extra.name));
  const extraTotal = chosenExtras.reduce((sum, extra) => sum + extra.price, 0);
  const finalUnitPrice = menu.price + extraTotal;

  return (
    <section className="mt-5 sm:mt-6">
      <div className="paper overflow-hidden rounded-[2rem]">
        <div className="bg-[var(--brown)] px-5 py-6 text-white sm:px-6 sm:py-7">
          <span className="inline-block rounded-full bg-white/20 px-3 py-1 text-xs font-bold">
            {isOpen ? "Disponible ahora" : "Disponible hoy de 1:00 a 5:00 p.m."}
          </span>
          <h2 className="mt-3.5 font-display text-3xl font-bold sm:mt-4 sm:text-4xl">Comida corrida del día</h2>
          <p className="mt-2 flex items-center gap-2 text-sm">
            <Clock3 size={16} /> {menu.availableFrom}–{menu.availableUntil}
          </p>
          <p className="mt-4 text-3xl font-bold sm:mt-5">{money(menu.price)}</p>
        </div>
        <div className="p-4 sm:p-6">
          <div className="mb-5 flex items-start gap-3 rounded-2xl bg-[#f4dfb4]/60 p-3.5 text-sm sm:p-4">
            <Sparkles className="shrink-0 text-[var(--brown)]" size={20} />
            Elige una opción de cada tiempo. Cocina y el mesero recibirán tus elecciones.
          </div>
          {courses.map(([course, options]) => (
            <fieldset className="border-b border-[var(--line)] py-4 last:border-0" key={course}>
              <legend className="font-display text-xl font-bold">
                {course}
                <span className="ml-2 font-sans text-xs font-bold text-[var(--muted-foreground)]">
                  Elige 1 de {options.length}
                </span>
              </legend>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {options.map((option) => (
                  <label
                    className={`flex cursor-pointer items-center justify-between gap-2 rounded-xl border p-3 transition ${
                      selections[course] === option
                        ? "border-[var(--green)] bg-[#e7efe9] shadow-sm"
                        : "border-[var(--line)] hover:bg-[var(--cream)]"
                    }`}
                    key={option}
                  >
                    <span className="min-w-0">{option}</span>
                    <input
                      checked={selections[course] === option}
                      name={`daily-${course}`}
                      type="radio"
                      value={option}
                      onChange={() =>
                        setSelections((current) => ({ ...current, [course]: option }))
                      }
                    />
                  </label>
                ))}
              </div>
            </fieldset>
          ))}
          {extras.length > 0 && (
            <fieldset className="mt-5 rounded-2xl border border-[var(--line)] bg-[#fbf7f1] p-4">
              <legend className="font-display text-xl font-bold">Extras con costo</legend>
              <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                Puedes sumar extras y el precio se actualizará al momento.
              </p>
              <div className="mt-3 grid gap-2">
                {extras.map((extra) => {
                  const selected = selectedExtras.includes(extra.name);
                  return (
                    <label
                      className={`flex cursor-pointer items-center justify-between gap-2 rounded-xl border p-3 transition ${
                        selected
                          ? "border-[var(--brown)] bg-[#f4e6d8] shadow-sm"
                          : "border-[var(--line)] bg-white hover:bg-[var(--cream)]"
                      }`}
                      key={extra.name}
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <span
                          className={`grid h-5 w-5 shrink-0 place-items-center rounded border-2 ${
                            selected
                              ? "border-[var(--brown)] bg-[var(--brown)] text-white"
                              : "border-[var(--line)]"
                          }`}
                        >
                          {selected && <Check size={12} strokeWidth={3} />}
                        </span>
                        <span className="truncate font-medium">{extra.name}</span>
                      </span>
                      <strong className="shrink-0 text-sm text-[var(--brown)]">+{money(extra.price)}</strong>
                      <input
                        checked={selected}
                        type="checkbox"
                        className="sr-only"
                        onChange={() =>
                          setSelectedExtras((current) =>
                            selected
                              ? current.filter((item) => item !== extra.name)
                              : [...current, extra.name]
                          )
                        }
                      />
                    </label>
                  );
                })}
              </div>
              {extraTotal > 0 && (
                <div className="mt-3 flex items-center justify-between rounded-xl bg-[#f4e6d8] px-4 py-2.5 text-sm">
                  <span className="font-bold text-[var(--brown)]">Total de extras</span>
                  <strong className="text-[var(--brown)]">+{money(extraTotal)}</strong>
                </div>
              )}
            </fieldset>
          )}
          <div className="mt-6 grid gap-3 sm:grid-cols-[auto_1fr]">
            <div className="flex items-center justify-center rounded-xl border border-[var(--line)]">
              <button
                type="button"
                className="focus-ring grid h-14 w-12 place-items-center"
                aria-label="Restar comida corrida"
                onClick={() => setQuantity((value) => Math.max(1, value - 1))}
              >
                <Minus size={18} />
              </button>
              <strong className="w-10 text-center">{quantity}</strong>
              <button
                type="button"
                className="focus-ring grid h-14 w-12 place-items-center text-[var(--brown)]"
                aria-label="Sumar comida corrida"
                onClick={() => setQuantity((value) => Math.min(10, value + 1))}
              >
                <Plus size={18} />
              </button>
            </div>
            <button
              type="button"
              className="focus-ring flex min-h-14 flex-wrap items-center justify-between gap-2 rounded-xl bg-[var(--brown)] px-4 py-3 text-left text-sm font-bold text-white transition hover:bg-[var(--brown-dark)] disabled:cursor-not-allowed disabled:opacity-45 sm:flex-nowrap sm:px-5 sm:text-base"
              disabled={!isOpen || !hasCompleteSelection}
              onClick={() => onAdd(menu, selections, quantity, chosenExtras)}
            >
              <span className="min-w-0">
                {!isOpen
                  ? "Comida corrida · L–V 9:00 a.m.–6:00 p.m. · Sáb 9:00 a.m.–3:00 p.m. · Dom cerrado"
                  : hasCompleteSelection
                    ? "Agregar al pedido"
                    : "Elige una opción de cada tiempo"}
              </span>
              <span className="shrink-0">{money(finalUnitPrice * quantity)}</span>
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}