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
import type { AppChannelPayload } from "@/lib/order-store";
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
type ChannelHandle = {
  send: (payload: AppChannelPayload) => unknown;
  close: () => void;
};

const LAST_ORDER_STORAGE_KEY = "imperio-last-order-v1";
const cartStorageKey = (tableCode: string) => `imperio-cart-v1:${tableCode}`;

function scheduleWhenIdle(task: () => void, timeout = 1200): () => void {
  if (typeof window === "undefined") return () => undefined;
  const win = window as Window & {
    requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
    cancelIdleCallback?: (id: number) => void;
  };
  if (typeof win.requestIdleCallback === "function") {
    const id = win.requestIdleCallback(task, { timeout });
    return () => win.cancelIdleCallback?.(id);
  }
  const timer = window.setTimeout(task, Math.min(timeout, 450));
  return () => window.clearTimeout(timer);
}

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
  const hasMountedCategoryRef = useRef(false);
  const [session, setSession] = useState<TableSession | null>(null);
  const [sessionExisted, setSessionExisted] = useState(false);
  const [sendTogether, setSendTogether] = useState(false);
  const [pendingOrders, setPendingOrders] = useState<CartItem[][]>([]);
  const [drinkFlavors, setDrinkFlavors] = useState<Array<{drinkType: string; name: string; priceModifier: number}>>([]);
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const channelRef = useRef<ChannelHandle | null>(null);
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
    try {
      const response = await fetch("/api/daily-menu", { cache: "no-store" });
      if (!response.ok) return null;
      const menu = (await response.json()) as DailyMenuConfig | null;
      setDailyMenu(menu);
      return menu;
    } catch {
      return null;
    } finally {
      setDailyMenuLoading(false);
    }
  }, []);

  const loadCatalog = useCallback(async () => {
    try {
      const response = await fetch("/api/products", { cache: "no-store" });
      if (!response.ok) return;
      const raw = (await response.json()) as Array<Record<string, unknown>>;
      if (!Array.isArray(raw) || !raw.length) return;
      const next = raw.map(normalizeProduct);
      if (next.length) setCatalog(next);
    } catch {
      // keep seed catalog silently
    }
  }, []);

  const loadPromotions = useCallback(async () => {
    try {
      const response = await fetch("/api/promotions", { cache: "no-store" });
      if (!response.ok) return;
      const rows = (await response.json()) as Promotion[];
      if (Array.isArray(rows) && rows.length > 0) setPromotions(rows);
    } catch {
      // ignore offline/aborted fetch
    }
  }, []);

  const loadSession = useCallback(async () => {
    if (!tableCode) return;
    if (tableCode === "LLEVAR") {
      setSession(null);
      setSessionExisted(false);
      return;
    }
    try {
      const response = await fetch(`/api/sessions?tableCode=${encodeURIComponent(tableCode)}`, {
        cache: "no-store"
      });
      if (!response.ok) return;
      const data = (await response.json()) as TableSession | null;
      if (data && typeof data === "object" && "id" in data) {
        setSession(data);
        setSessionExisted(true);
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
          const created = (await createResponse.json()) as TableSession | null;
          if (created && typeof created === "object" && "id" in created) {
            setSession(created);
            setSessionExisted(false);
          }
        }
      }
    } catch {
      // ignore session fetch errors silently
    }
  }, [tableCode]);

  useEffect(() => {
    let active = true;
    const primaryTimer = window.setTimeout(() => {
      void loadCatalog();
      void loadSession();
    }, 40);
    const cancelSecondary = scheduleWhenIdle(() => {
      if (!active) return;
      void loadDailyMenu();
      void loadPromotions();
      void fetch("/api/drink-flavors", { cache: "no-store" })
        .then((r) => r.json().catch(() => []))
        .then((data) => {
          if (active && Array.isArray(data) && data.length > 0) setDrinkFlavors(data);
        })
        .catch(() => {});
    }, 900);
    const timer = window.setInterval(() => {
      if (document.hidden) return;
      void loadDailyMenu();
      void loadCatalog();
      void loadPromotions();
      void loadSession();
    }, 45000);
    return () => {
      active = false;
      window.clearTimeout(primaryTimer);
      cancelSecondary();
      window.clearInterval(timer);
    };
  }, [loadCatalog, loadDailyMenu, loadPromotions, loadSession]);

  const sendChannelPayload = useCallback((payload: AppChannelPayload) => {
    if (channelRef.current) {
      void channelRef.current.send(payload);
      return;
    }
    void import("@/lib/order-store")
      .then(({ connectOrderChannel }) => {
        const temp = connectOrderChannel(() => undefined);
        void Promise.resolve(temp.send(payload)).finally(() => temp.close());
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    let disposed = false;
    const handleMessage = ({ type, order: incoming, product, dailyMenu: menu }: AppChannelPayload) => {
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
    };

    const connect = () => {
      if (disposed || channelRef.current) return;
      void import("@/lib/order-store")
        .then(({ connectOrderChannel }) => {
          if (disposed || channelRef.current) return;
          channelRef.current = connectOrderChannel(handleMessage);
        })
        .catch(() => undefined);
    };

    const cancelIdle = scheduleWhenIdle(connect, 1800);

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
      cancelIdle();
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("pageshow", onPageShow);
      channelRef.current?.close();
      channelRef.current = null;
    };
  }, [loadCatalog, loadDailyMenu, loadSession]);

  useEffect(() => {
    if (!order) return;
    if (order.source === "demo") {
      const demoTimer = window.setInterval(() => {
        void import("@/lib/order-store")
          .then(({ readDemoOrders }) => {
            const latest = readDemoOrders().find((item) => item.id === order.id);
            if (latest) {
              setOrder((current) =>
                !current || +new Date(latest.updatedAt) >= +new Date(current.updatedAt)
                  ? latest
                  : current
              );
            }
          })
          .catch(() => undefined);
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
    if (!hasMountedCategoryRef.current) {
      hasMountedCategoryRef.current = true;
      return;
    }
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
      sendChannelPayload({ type: "new", order: created });
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
    sendChannelPayload({ type: "waiter-call", waiterCall: call });
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
    sendChannelPayload({ type: "waiter-call", waiterCall: call });
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
    <main className="min-h-screen bg-[var(--cream)] pb-36 text-[var(--ink)]">
      {/* ── Apple + Pixel minimal light/dark mobile header ── */}
      <header className="relative">
        <div className="mx-auto max-w-6xl px-4 pb-2 pt-3.5 sm:px-6 sm:pb-4 sm:pt-6">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <Brand compact />
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <ThemeToggle />
              <div className="flex items-center gap-1.5 whitespace-nowrap rounded-full bg-[var(--paper)] px-3 py-1.5 text-[11px] font-semibold text-[var(--ink)] shadow-[0_1px_2px_rgba(0,0,0,0.04)] ring-1 ring-black/[0.06] dark:bg-neutral-900 dark:text-neutral-100 dark:ring-white/10 sm:px-3.5 sm:py-2 sm:text-xs">
                <span
                  className={`inline-block h-2 w-2 shrink-0 rounded-full ${
                    tableCode === "LLEVAR"
                      ? "bg-amber-500"
                      : "bg-emerald-500"
                  }`}
                />
                {tableCode === "LLEVAR" ? (
                  <span>Para llevar</span>
                ) : (
                  <>
                    <span className="sm:hidden">Mesa {tableCode}</span>
                    <span className="hidden sm:inline">Mesa {tableCode} · Activa</span>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="mt-4 flex items-end justify-between gap-4 sm:mt-7">
            <div className="min-w-0">
              <h1 className="font-display text-[1.68rem] font-semibold leading-[1.1] tracking-[-0.035em] text-[var(--ink)] sm:text-[2.6rem] sm:leading-[1.04]">
                ¿Qué se te antoja hoy?
              </h1>
              <p className="mt-1 text-[13px] leading-5 text-neutral-500 dark:text-neutral-400 sm:mt-1.5 sm:text-sm">
                {tableCode === "LLEVAR"
                  ? customerName
                    ? `Hola, ${customerName} · Desayunos 9–1 · Comidas 1–5`
                    : "Desayunos 9–1 · Comidas 1–5 · Pasa a recoger"
                  : "Desayunos con fruta y café 9–1 · Comidas a la carta 1–5"}
              </p>
              {tableCode !== "LLEVAR" && sessionOrders.length > 0 && (
                <button
                  type="button"
                  onClick={() => setServiceSheetOpen(true)}
                  className="focus-ring mt-2.5 inline-flex items-center gap-1.5 rounded-full bg-[var(--paper)] px-3.5 py-1.5 text-xs font-semibold text-[var(--ink)] shadow-[0_1px_2px_rgba(0,0,0,0.04)] ring-1 ring-black/[0.07] transition active:opacity-80 dark:bg-neutral-900 dark:text-neutral-100 dark:ring-white/10"
                >
                  <Receipt size={13} className="text-[var(--terracotta)] dark:text-[var(--gold)]" />
                  <span className="tabular-nums">
                    Mi cuenta ({sessionOrders.length}) · {money(sessionTotal)}
                  </span>
                </button>
              )}
            </div>
            {session && session.status === "active" && (
              <div className="hidden shrink-0 items-center gap-2 rounded-2xl bg-[var(--paper)] px-4 py-2.5 text-right shadow-[0_1px_2px_rgba(0,0,0,0.04)] ring-1 ring-black/[0.06] dark:bg-neutral-900 dark:ring-white/10 sm:flex">
                <div>
                  <span className="block text-[10px] font-semibold uppercase tracking-[0.08em] text-neutral-400">
                    Sesión
                  </span>
                  <strong className="text-sm font-semibold text-[var(--ink)]">
                    {sessionExisted ? "Compartida" : "Activa"}
                  </strong>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        {sessionExisted && session && (
          <div className="animate-fade-in mt-2 flex flex-wrap items-center justify-between gap-2.5 rounded-2xl bg-[var(--paper)] px-3.5 py-2.5 shadow-[0_1px_2px_rgba(0,0,0,0.03)] ring-1 ring-black/[0.05] dark:bg-neutral-900 dark:ring-white/10 sm:flex-nowrap">
            <div className="flex min-w-0 items-center gap-2.5 text-xs sm:text-sm">
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-amber-100/90 text-xs dark:bg-amber-500/20">
                👥
              </span>
              <div className="min-w-0 leading-snug">
                <span className="font-semibold text-[var(--ink)]">Mesa compartida</span>
                <span className="text-neutral-500 dark:text-neutral-400"> · Se agrupa en cocina</span>
              </div>
            </div>
            <label className="flex shrink-0 cursor-pointer items-center gap-2">
              <span className="text-xs font-medium text-neutral-600 dark:text-neutral-300">Enviar juntos</span>
              <button
                type="button"
                role="switch"
                aria-checked={sendTogether}
                aria-label="Enviar pedidos juntos"
                className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${
                  sendTogether ? "bg-emerald-600 dark:bg-emerald-500" : "bg-black/15 dark:bg-white/20"
                }`}
                onClick={() => setSendTogether((v) => !v)}
              >
                <span
                  className={`pointer-events-none absolute left-0.5 top-0.5 h-6 w-6 rounded-full bg-white shadow-sm transition-transform duration-200 ${
                    sendTogether ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </label>
          </div>
        )}

        {/* ── iOS Segmented Control ── */}
        <section className="relative z-10 mt-3 sm:mt-4" aria-label="Tipo de menú">
          <div className="mx-auto w-full max-w-md rounded-[1.15rem] bg-black/[0.055] p-1 dark:bg-white/[0.08] sm:rounded-full">
            <div className="grid grid-cols-2 gap-1">
              {[
                {
                  value: "fixed" as const,
                  label: "Paquetes y carta",
                  schedule: "9 a.m.–5 p.m.",
                  open: true
                },
                {
                  value: "lunch" as const,
                  label: "Comida corrida",
                  schedule:
                    comidaCorridaOpen === false
                      ? "Cerrado"
                      : "L–V 9–6 · Sáb 9–3",
                  open: comidaCorridaOpen !== false
                }
              ].map(({ value, label, schedule, open }) => (
                <button
                  type="button"
                  key={value}
                  className={`focus-ring flex min-w-0 flex-col items-center justify-center rounded-[0.9rem] px-2.5 py-2 text-center transition-all duration-200 active:opacity-85 sm:rounded-full sm:px-4 sm:py-2 ${
                    mode === value
                      ? "bg-[var(--paper)] text-[var(--ink)] shadow-[0_1px_3px_rgba(0,0,0,0.08),0_4px_12px_rgba(0,0,0,0.05)] ring-1 ring-black/[0.04] dark:bg-neutral-800 dark:text-white dark:ring-white/10"
                      : "text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white"
                  }`}
                  onClick={() => {
                    setMode(value);
                    if (value === "lunch" && dailyMenu === null && dailyMenuLoading) {
                      void loadDailyMenu();
                    }
                  }}
                >
                  <span className="flex max-w-full items-center gap-1.5 truncate text-[13px] font-semibold leading-tight">
                    <span className="truncate">{label}</span>
                  </span>
                  <span className="mt-0.5 flex max-w-full items-center gap-1 truncate text-[10px] font-medium leading-tight text-neutral-500 dark:text-neutral-400">
                    {value === "lunch" && (
                      <span
                        className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${
                          open ? "bg-emerald-500" : "bg-neutral-400"
                        }`}
                      />
                    )}
                    <span className="truncate">{schedule}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        </section>

        {cart.length === 0 && lastOrderItems.length > 0 && !lastOrderDismissed && (
          <div className="animate-fade-in mt-3 flex items-center justify-between gap-2.5 rounded-2xl bg-[var(--paper)] px-3.5 py-2.5 shadow-[0_1px_2px_rgba(0,0,0,0.03)] ring-1 ring-black/[0.06] dark:bg-neutral-900 dark:ring-white/10">
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-black/[0.05] text-[var(--ink)] dark:bg-white/10 dark:text-white">
                <RotateCcw size={14} />
              </span>
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold text-[var(--ink)]">
                  ¿Repetir tu último pedido?
                </p>
                <p className="truncate text-[11px] text-neutral-500 dark:text-neutral-400">
                  {lastOrderItems.map((i) => i.name).slice(0, 2).join(", ")}
                  {lastOrderItems.length > 2 ? ` +${lastOrderItems.length - 2}` : ""}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <button
                type="button"
                onClick={repeatLastOrder}
                className="focus-ring rounded-full bg-neutral-950 px-3.5 py-1.5 text-xs font-semibold text-white transition active:opacity-80 dark:bg-white dark:text-neutral-950"
              >
                Repetir
              </button>
              <button
                type="button"
                aria-label="Ocultar sugerencia de último pedido"
                onClick={() => setLastOrderDismissed(true)}
                className="focus-ring grid h-7 w-7 place-items-center rounded-full text-neutral-400 transition hover:bg-black/5 dark:hover:bg-white/10"
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
            {/* ── Frosted Pixel/iOS Spotlight Search + Chips ── */}
            <div className="sticky top-0 z-20 -mx-4 mt-3 border-b border-black/[0.05] bg-[var(--cream)]/85 px-4 pb-2.5 pt-2 backdrop-blur-2xl dark:border-white/[0.07] sm:-mx-6 sm:mt-4 sm:px-6 sm:pb-3.5 sm:pt-3">
              <label className="flex items-center gap-2.5 rounded-full bg-black/[0.05] px-3.5 py-2.5 transition-all focus-within:bg-[var(--paper)] focus-within:shadow-[0_2px_12px_rgba(0,0,0,0.06)] focus-within:ring-1 focus-within:ring-black/10 dark:bg-white/[0.09] dark:focus-within:bg-neutral-900 dark:focus-within:ring-white/15 sm:px-4">
                <Search size={17} aria-hidden="true" className="shrink-0 text-neutral-500 dark:text-neutral-400" />
                <span className="sr-only">Buscar platillos</span>
                <input
                  className="min-w-0 flex-1 bg-transparent text-base text-[var(--ink)] outline-none placeholder:text-neutral-500 dark:text-neutral-100 dark:placeholder:text-neutral-400"
                  placeholder="Buscar chilaquiles, café, molletes…"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
                {query && (
                  <button
                    type="button"
                    aria-label="Limpiar búsqueda"
                    className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-black/10 text-neutral-700 transition active:opacity-75 dark:bg-white/15 dark:text-neutral-200"
                    onClick={() => setQuery("")}
                  >
                    <X size={13} />
                  </button>
                )}
              </label>
              <div className="no-scrollbar -mx-4 mt-2.5 flex gap-1.5 overflow-x-auto px-4 py-0.5 sm:-mx-1 sm:gap-2 sm:px-1">
                {categories.map((item) => (
                  <button
                    type="button"
                    key={item}
                    data-category-pill={item}
                    className={`focus-ring shrink-0 rounded-full px-3.5 py-2 text-[13px] font-medium whitespace-nowrap transition-colors duration-150 active:opacity-80 sm:px-4 sm:py-2 ${
                      !isSearching && category === item
                        ? "bg-neutral-950 font-semibold text-white shadow-xs dark:bg-white dark:text-neutral-950"
                        : "bg-[var(--paper)] text-neutral-700 ring-1 ring-black/[0.06] hover:bg-white dark:bg-neutral-900 dark:text-neutral-200 dark:ring-white/[0.08] dark:hover:bg-neutral-800"
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

            <div className="mb-2.5 mt-4 flex items-baseline justify-between gap-2 sm:mb-4 sm:mt-5">
              <div className="min-w-0">
                {isSearching && (
                  <p className="eyebrow text-neutral-500 dark:text-neutral-400">
                    Resultados en todo el menú
                  </p>
                )}
                <h2 className="truncate font-display text-[1.35rem] font-semibold tracking-[-0.025em] text-[var(--ink)] sm:text-2xl">
                  {isSearching ? `“${debouncedQuery.trim()}”` : category}
                </h2>
              </div>
              <span className="shrink-0 text-xs font-medium tabular-nums text-neutral-500 dark:text-neutral-400">
                {visible.length} {visible.length === 1 ? "platillo" : "platillos"}
              </span>
            </div>

            {visible.length ? (
              <div className="grid gap-2.5 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
                {visible.map((product, index) => (
                   <ProductCard
                     key={product.id}
                     product={product}
                     priority={index < 3}
                     promotion={promotionBySlug.get(product.id)}
                     currentMinutes={serviceMinutes}
                     onOpen={setSelected}
                     dailyMenu={dailyMenu}
                   />
                ))}
              </div>
            ) : (
              <div className="animate-fade-in mt-4 rounded-[1.75rem] bg-[var(--paper)] px-6 py-12 text-center shadow-[0_1px_3px_rgba(0,0,0,0.04)] ring-1 ring-black/[0.05] dark:ring-white/10">
                <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-black/[0.05] dark:bg-white/[0.08]">
                  <Search className="text-neutral-400" size={24} />
                </div>
                <h3 className="mt-4 font-display text-xl font-semibold">
                  Sin resultados
                </h3>
                <p className="mt-1.5 text-sm text-neutral-500 dark:text-neutral-400">
                  Prueba con otro platillo o revisa nuestros favoritos.
                </p>
                <button
                  type="button"
                  className="focus-ring mt-5 rounded-full bg-neutral-950 px-5 py-2.5 text-sm font-semibold text-white transition active:opacity-80 dark:bg-white dark:text-neutral-950"
                  onClick={() => { setQuery(""); setCategory("Favoritos"); }}
                >
                  Ver destacados
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Apple Dynamic Island-style top toasts ── */}
      {justAdded && (
        <div className="pointer-events-none fixed inset-x-0 top-3.5 z-50 flex justify-center px-4">
          <div className="toast-slide-in flex items-center gap-2 rounded-full bg-neutral-950/92 px-4 py-2.5 text-[13px] font-semibold text-white shadow-[0_10px_28px_rgba(0,0,0,0.22)] ring-1 ring-white/12 backdrop-blur-2xl dark:bg-white/95 dark:text-neutral-950">
            <span className="grid h-5 w-5 place-items-center rounded-full bg-emerald-500 text-white">
              <Check size={12} strokeWidth={3} />
            </span>
            Platillo agregado
          </div>
        </div>
      )}

      {waiterNotice && (
        <div className="pointer-events-none fixed inset-x-0 top-3.5 z-50 flex justify-center px-4">
          <div className="toast-slide-in flex items-center gap-2 rounded-full bg-neutral-950/92 px-4 py-2.5 text-[13px] font-semibold text-white shadow-[0_10px_28px_rgba(0,0,0,0.22)] ring-1 ring-white/12 backdrop-blur-2xl dark:bg-white/95 dark:text-neutral-950">
            <span className="grid h-5 w-5 place-items-center rounded-full bg-emerald-500 text-white">
              <Check size={12} strokeWidth={3} />
            </span>
            {waiterNotice}
          </div>
        </div>
      )}

      {/* ── Floating Cart Dock (Primary Apple Pill) ── */}
      {itemCount > 0 && (
        <div className="fixed bottom-4 left-1/2 z-40 w-[calc(100%-1.5rem)] max-w-md -translate-x-1/2 pb-[env(safe-area-inset-bottom)] sm:bottom-6 sm:w-[calc(100%-2rem)]">
          <button
            type="button"
            className="focus-ring flex w-full items-center justify-between gap-3 rounded-full bg-neutral-950/95 p-2 pl-3 pr-2.5 text-left text-white shadow-[0_12px_32px_rgba(0,0,0,0.24)] ring-1 ring-white/12 backdrop-blur-2xl transition-opacity active:opacity-85 dark:bg-white/95 dark:text-neutral-950 dark:ring-black/10"
            onClick={() => setCartOpen(true)}
          >
            <span className="flex min-w-0 items-center gap-3">
              <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/15 text-sm font-bold tabular-nums text-white dark:bg-black/10 dark:text-neutral-950 ${justAdded ? "animate-bounce-in" : ""}`}>
                {itemCount}
              </span>
              <span className="truncate text-[15px] font-semibold">
                {sendTogether ? "Agregar al grupo" : "Ver mi pedido"}
              </span>
            </span>
            <span className="shrink-0 rounded-full bg-white/15 px-3.5 py-2 text-sm font-bold tabular-nums text-white dark:bg-neutral-950 dark:text-white">
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
              <div key={index} className="animate-fade-in flex items-center justify-between rounded-2xl bg-[var(--paper)]/95 px-4 py-2.5 text-sm shadow-lg ring-1 ring-black/[0.06] backdrop-blur-xl dark:ring-white/10">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-black/[0.06] text-xs font-bold dark:bg-white/10">{index + 1}</span>
                  <span className="truncate font-semibold">{items.length} productos</span>
                </div>
                <div className="flex items-center gap-2">
                  <strong className="text-sm tabular-nums">{money(orderTotal)}</strong>
                  <button
                    type="button"
                    className="focus-ring grid h-6 w-6 place-items-center rounded-full bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300"
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
            className="focus-ring flex w-full items-center justify-center gap-2 rounded-full bg-emerald-600 px-5 py-3.5 text-sm font-semibold text-white shadow-xl transition active:opacity-85 disabled:opacity-50"
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

      {/* ── Tonal Floating FAB: Mesero · Cuenta (secondary to Cart pill) ── */}
      {tableCode !== "LLEVAR" && (
        <div
          className={`fixed right-4 z-40 transition-all duration-200 ${
            itemCount > 0 ? "bottom-[5.25rem] sm:bottom-24" : "bottom-5 sm:bottom-6"
          }`}
        >
          <button
            type="button"
            aria-label="Mesero y cuenta"
            className={`focus-ring flex items-center gap-2 rounded-full px-3.5 py-2.5 text-xs font-semibold backdrop-blur-2xl transition-all active:opacity-80 ${
              waiterCalled || billRequested
                ? "bg-emerald-600 text-white shadow-[0_6px_20px_rgba(16,185,129,0.3)]"
                : "bg-[var(--paper)]/92 text-[var(--ink)] shadow-[0_6px_22px_rgba(0,0,0,0.10)] ring-1 ring-black/[0.08] hover:bg-white dark:bg-neutral-900/92 dark:text-white dark:ring-white/12"
            }`}
            onClick={() => setServiceSheetOpen(true)}
          >
            {waiterCalled || billRequested ? (
              <>
                <Check size={15} strokeWidth={3} />
                <span>{billRequested ? "Cuenta pedida" : "Mesero avisado"}</span>
              </>
            ) : (
              <>
                <Hand size={15} />
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
              className="focus-ring grid h-10 w-10 place-items-center rounded-full bg-[#eee8dc] text-[var(--ink)] transition active:opacity-75 dark:bg-neutral-800 dark:text-neutral-100"
            >
              <X size={18} />
            </button>
          </div>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:px-5 sm:py-5">
            <button
              type="button"
              disabled={waiterCalled}
              onClick={callWaiter}
              className="focus-ring flex w-full items-center justify-between gap-3 rounded-2xl border border-[var(--line)] bg-white p-4 text-left shadow-xs transition active:opacity-85 disabled:opacity-60 dark:border-neutral-800 dark:bg-neutral-800/80"
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
                    className="focus-ring flex flex-col items-center justify-center gap-1 rounded-xl border border-[var(--line)] bg-white px-2 py-3 text-xs font-bold text-[var(--ink)] transition hover:border-[var(--brown)] active:opacity-80 disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
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
              className="focus-ring min-h-11 rounded-full border border-[var(--line)] bg-white px-4 py-2.5 text-sm font-semibold text-[var(--ink)] transition active:opacity-80 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => confirmAction?.onConfirm()}
              className={`focus-ring min-h-11 rounded-full px-4 py-2.5 text-sm font-bold text-white transition active:opacity-80 ${
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
  priority = false,
  promotion,
  currentMinutes,
  onOpen,
  dailyMenu
}: {
  product: Product;
  priority?: boolean;
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
    <Card className="menu-card group relative gap-0 overflow-hidden rounded-[1.45rem] border-0 bg-[var(--paper)] py-0 shadow-[0_1px_2px_rgba(0,0,0,0.03),0_4px_14px_rgba(0,0,0,0.03)] ring-1 ring-black/[0.055] dark:bg-neutral-900 dark:ring-white/[0.08] sm:rounded-[1.75rem]">
      <button
        type="button"
        className="focus-ring flex w-full flex-row-reverse items-center gap-3.5 p-3.5 text-left transition-opacity active:opacity-80 disabled:opacity-60 sm:block sm:p-0"
        onClick={() => onOpen(product)}
        disabled={product.soldOut || !available}
      >
        {/* ── Photo: rounded square on mobile, edge-to-edge 4:3 on tablet/desktop ── */}
        <div className="relative shrink-0 sm:w-full">
          <ProductImage
            src={product.image}
            alt={product.name}
            category={product.category}
            priority={priority}
            sizes="(max-width: 639px) 112px, (max-width: 1023px) 46vw, 380px"
            className="h-[6.5rem] w-[6.5rem] rounded-[1.1rem] sm:aspect-[4/3] sm:h-auto sm:w-full sm:rounded-none"
          />
          {promotion && (
            <Badge className="absolute left-1.5 top-1.5 h-auto border-0 bg-amber-400 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-950 shadow-sm sm:left-auto sm:right-3 sm:top-3 sm:px-2.5 sm:py-1 sm:text-[10px]">
              Promo
            </Badge>
          )}
          <div className="pointer-events-none hidden sm:block">
            <span className="absolute left-3 top-3 rounded-full bg-black/55 px-2.5 py-1 text-[10px] font-semibold tracking-wide text-white backdrop-blur-md">
              {product.category}
            </span>
            {(product.popular || recommended) && (
              <div className="absolute bottom-2.5 left-3 flex flex-wrap gap-1.5">
                {product.popular && (
                  <span className="rounded-full bg-black/55 px-2.5 py-1 text-[11px] font-medium text-white backdrop-blur-md">
                    Popular
                  </span>
                )}
                {recommended && (
                  <span className="rounded-full bg-black/55 px-2.5 py-1 text-[11px] font-medium text-white backdrop-blur-md">
                    Recomendado
                  </span>
                )}
              </div>
            )}
            <div className="absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-black/25 to-transparent" />
          </div>

          {/* Mobile floating + button tucked cleanly onto photo corner */}
          {!product.soldOut && available && (
            <span
              aria-hidden="true"
              className="absolute -bottom-1.5 -right-1.5 grid h-8 w-8 place-items-center rounded-full bg-neutral-950 text-white shadow-[0_3px_10px_rgba(0,0,0,0.22)] ring-2 ring-[var(--paper)] dark:bg-white dark:text-neutral-950 dark:ring-neutral-900 sm:hidden"
            >
              <Plus size={16} strokeWidth={2.5} />
            </span>
          )}
        </div>

        {/* ── Content column ── */}
        <div className="flex min-w-0 flex-1 flex-col justify-between self-stretch py-0.5 sm:p-5">
          <div>
            {/* Subtle single-line metadata tag on mobile & desktop */}
            {(product.popular || product.isNew || product.soldOut || !available || Boolean(product.packageIncludes?.length)) && (
              <div className="mb-1 flex flex-wrap items-center gap-1.5 sm:mb-2">
                {product.soldOut ? (
                  <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-700 dark:bg-red-950/70 dark:text-red-300">
                    Agotado
                  </span>
                ) : !available ? (
                  <span className="rounded-full bg-black/[0.06] px-2 py-0.5 text-[10px] font-semibold text-neutral-600 dark:bg-white/10 dark:text-neutral-300">
                    {effectiveFrom}–{effectiveUntil}
                  </span>
                ) : (
                  <>
                    {product.popular && (
                      <span className="rounded-full bg-amber-100/90 px-2 py-0.5 text-[10px] font-semibold text-amber-900 dark:bg-amber-500/20 dark:text-amber-200 sm:hidden">
                        Popular
                      </span>
                    )}
                    {product.isNew && (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-200">
                        Nuevo
                      </span>
                    )}
                    {Boolean(product.packageIncludes?.length) && (
                      <span className="rounded-full bg-black/[0.05] px-2 py-0.5 text-[10px] font-semibold text-neutral-700 dark:bg-white/[0.08] dark:text-neutral-200">
                        Paquete
                      </span>
                    )}
                  </>
                )}
              </div>
            )}

            <h3 className="font-display text-[15.5px] font-semibold leading-[1.2] tracking-[-0.015em] text-[var(--ink)] sm:text-[1.2rem]">
              {product.name}
            </h3>
            <p className="mt-1 line-clamp-2 text-[12.5px] leading-[1.38] text-neutral-500 dark:text-neutral-400 sm:mt-1.5 sm:min-h-10 sm:text-sm sm:leading-5">
              {product.description}
            </p>
          </div>

          {product.packageIncludes && product.packageIncludes.length > 0 && (
            <div className="mt-2.5 hidden flex-wrap gap-1.5 sm:flex">
              {product.packageIncludes.map((item) => (
                <span
                  className="rounded-full bg-black/[0.045] px-2.5 py-1 text-[11px] font-medium text-neutral-700 dark:bg-white/[0.08] dark:text-neutral-200"
                  key={item}
                >
                  ✓ {item}
                </span>
              ))}
            </div>
          )}

          <div className="mt-2.5 flex items-center justify-between gap-2 sm:mt-4 sm:border-t sm:border-black/[0.06] sm:pt-3.5 dark:sm:border-white/[0.08]">
            <p className="flex items-baseline gap-1.5 text-[15px] font-bold tabular-nums text-[var(--ink)] sm:text-lg">
              <span>{promoPrice !== null ? money(promoPrice) : money(product.price)}</span>
              {(promoPrice !== null || product.compareAt) && (
                <span className="text-xs font-normal text-neutral-400 line-through">
                  {money(promoPrice !== null ? product.price : (product.compareAt ?? 0))}
                </span>
              )}
              {Boolean(product.packageIncludes?.length) && (
                <span className="truncate text-[11px] font-medium text-neutral-400 sm:hidden">
                  · Fruta y café
                </span>
              )}
            </p>

            {/* Desktop CTA button */}
            <div className="hidden sm:block">
              {product.soldOut ? (
                <span className="rounded-full bg-black/[0.06] px-3 py-1.5 text-xs font-semibold text-neutral-500 dark:bg-white/10">
                  Agotado
                </span>
              ) : !available ? (
                <span className="rounded-full bg-black/[0.06] px-3 py-1.5 text-xs font-semibold text-neutral-600 dark:bg-white/10 dark:text-neutral-300">
                  {effectiveFrom}–{effectiveUntil}
                </span>
              ) : (
                <span className="grid h-10 w-10 place-items-center rounded-full bg-neutral-950 text-white shadow-sm transition active:opacity-80 dark:bg-white dark:text-neutral-950">
                  <Plus size={18} strokeWidth={2.3} />
                </span>
              )}
            </div>
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

  // Asegurar que al abrir un platillo nunca quede desplazamiento horizontal residual
  useEffect(() => {
    if (typeof window !== "undefined" && window.scrollX !== 0) {
      window.scrollTo(0, window.scrollY);
    }
  }, []);

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
        overlayClassName="bg-black/45 backdrop-blur-[4px]"
        className="gap-0 rounded-t-[2rem] bg-[var(--paper)] p-0 text-[var(--ink)] dark:bg-neutral-900 dark:text-neutral-100"
      >
        <DialogTitle className="sr-only">{product.name}</DialogTitle>
        <div className="relative shrink-0">
          <ProductImage
            src={product.image}
            alt={product.name}
            category={product.category}
            sizes="(max-width: 639px) 100vw, 512px"
            className="h-52 w-full sm:h-64"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute left-1/2 top-2.5 z-10 h-1 w-10 -translate-x-1/2 rounded-full bg-white/80 shadow-sm sm:hidden"
          />
          <div className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-black/30 to-transparent" />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-black/75 via-black/30 to-transparent" />
          <button
            type="button"
            className="focus-ring absolute right-3.5 top-3.5 z-10 grid h-9 w-9 place-items-center rounded-full bg-black/40 text-white ring-1 ring-white/20 backdrop-blur-xl transition active:opacity-80"
            aria-label="Cerrar"
            onClick={onClose}
          >
            <X size={17} />
          </button>
          <div className="absolute bottom-3.5 left-4 right-4 sm:left-5 sm:right-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-white/80">
              {product.category}
            </p>
            <h2 className="mt-0.5 font-display text-[1.5rem] font-semibold leading-[1.1] tracking-[-0.03em] text-white drop-shadow-sm sm:text-[1.85rem]">
              {product.name}
            </h2>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5 sm:py-5">
          <p className="text-[14px] leading-relaxed text-neutral-600 dark:text-neutral-300 sm:text-[15px]">
            {product.description}
          </p>
          {product.packageIncludes && product.packageIncludes.length > 0 && (
            <div className="mt-4 rounded-2xl bg-black/[0.035] p-3.5 dark:bg-white/[0.06] sm:mt-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-500 dark:text-neutral-400">
                Tu paquete incluye
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {product.packageIncludes.map((item) => (
                  <span
                    className="inline-flex items-center gap-1 rounded-full bg-[var(--paper)] px-3 py-1 text-xs font-semibold text-[var(--ink)] shadow-[0_1px_2px_rgba(0,0,0,0.04)] ring-1 ring-black/[0.05] dark:bg-neutral-800 dark:text-neutral-100 dark:ring-white/10"
                    key={item}
                  >
                    <Check size={12} strokeWidth={2.5} className="text-emerald-600 dark:text-emerald-400" />
                    {item}
                  </span>
                ))}
              </div>
            </div>
          )}
          {groups.map((group, groupIndex) => (
            <fieldset className="mt-5" key={group.id}>
              <legend className="flex items-center justify-between gap-2 text-[15px] font-semibold tracking-[-0.015em] text-[var(--ink)]">
                <span className="flex items-center gap-2">
                  <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-neutral-950 text-[11px] font-bold text-white dark:bg-white dark:text-neutral-950">
                    {groupIndex + 1}
                  </span>
                  {group.label}
                </span>
              </legend>
              <p className="mb-2.5 ml-7 text-xs text-neutral-500 dark:text-neutral-400">
                Elige 1 {group.required !== false && "· Obligatorio"}
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
                      className={`focus-ring inline-flex min-h-11 items-center gap-1.5 rounded-2xl px-4 py-2 text-[13px] font-semibold transition-colors active:opacity-80 ${
                        unavailable
                          ? "cursor-not-allowed opacity-40"
                          : selected
                            ? "bg-neutral-950 text-white shadow-sm dark:bg-white dark:text-neutral-950"
                            : "bg-black/[0.045] text-[var(--ink)] hover:bg-black/[0.08] dark:bg-white/[0.08] dark:text-neutral-100 dark:hover:bg-white/[0.12]"
                      }`}
                      onClick={() =>
                        setSelections((current) => ({ ...current, [group.id]: item }))
                      }
                    >
                      {selected && !unavailable && <Check size={14} strokeWidth={2.8} />}
                      <span>{unavailable ? "No disponible" : item}</span>
                    </button>
                  );
                })}
              </div>
            </fieldset>
          ))}
          <label className="mt-5 block text-[13px] font-semibold text-neutral-700 dark:text-neutral-300">
            Observaciones
            <textarea
              className="mt-2 min-h-20 w-full resize-none rounded-2xl bg-black/[0.04] p-3.5 text-base font-normal text-[var(--ink)] outline-none ring-1 ring-transparent transition focus:bg-[var(--paper)] focus:ring-black/15 dark:bg-white/[0.07] dark:text-neutral-100 dark:focus:bg-neutral-800 dark:focus:ring-white/20"
              maxLength={180}
              placeholder="Ej. Sin cebolla, salsa aparte…"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </label>
          {allExtras.length > 0 && (
            <fieldset className="mt-5 rounded-2xl bg-black/[0.03] p-3.5 dark:bg-white/[0.05] sm:p-4">
              <legend className="font-display text-base font-semibold tracking-[-0.02em]">
                {isBreakfast ? "Extras de desayuno" : "Extras con costo"}
              </legend>
              <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
                El precio se actualiza al momento.
              </p>
              <div className="mt-3 grid gap-2">
                {allExtras.map((extra) => {
                  const selected = selectedExtras.includes(extra.name);
                  return (
                    <label
                      className={`relative flex cursor-pointer items-center justify-between gap-2 rounded-2xl p-3 transition-colors active:opacity-85 ${
                        selected
                          ? "bg-neutral-950 text-white shadow-xs dark:bg-white dark:text-neutral-950"
                          : "bg-[var(--paper)] text-[var(--ink)] ring-1 ring-black/[0.05] dark:bg-neutral-900 dark:text-neutral-100 dark:ring-white/[0.08]"
                      }`}
                      key={extra.name}
                    >
                      <span className="flex min-w-0 items-center gap-2.5">
                        <span
                          className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border ${
                            selected
                              ? "border-transparent bg-white text-neutral-950 dark:bg-neutral-950 dark:text-white"
                              : "border-black/20 dark:border-white/25"
                          }`}
                        >
                          {selected && <Check size={12} strokeWidth={3} />}
                        </span>
                        <span className="truncate text-sm font-medium">{extra.name}</span>
                      </span>
                      <strong
                        className={`shrink-0 text-sm font-semibold tabular-nums ${
                          selected
                            ? "text-white/90 dark:text-neutral-900"
                            : "text-neutral-600 dark:text-neutral-300"
                        }`}
                      >
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

        <div className="shrink-0 border-t border-black/[0.06] bg-[var(--paper)]/92 px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur-xl dark:border-white/[0.08] dark:bg-neutral-900/95 sm:p-4 sm:pb-5">
          <div className="flex items-center gap-2.5 sm:gap-3">
            <div className="flex shrink-0 items-center rounded-full bg-black/[0.05] p-1 dark:bg-white/[0.09]">
              <button
                type="button"
                className="focus-ring grid h-10 w-10 place-items-center rounded-full text-[var(--ink)] transition active:opacity-75 sm:h-11 sm:w-11"
                aria-label="Restar"
                onClick={() => setQuantity((value) => Math.max(1, value - 1))}
              >
                <Minus size={17} />
              </button>
              <strong className="w-7 text-center text-sm font-semibold tabular-nums sm:w-9 sm:text-base">{quantity}</strong>
              <button
                type="button"
                className="focus-ring grid h-10 w-10 place-items-center rounded-full text-[var(--ink)] transition active:opacity-75 sm:h-11 sm:w-11"
                aria-label="Sumar"
                onClick={() => setQuantity((value) => Math.min(10, value + 1))}
              >
                <Plus size={17} />
              </button>
            </div>
            <button
              type="button"
              className="focus-ring flex min-h-12 min-w-0 flex-1 items-center justify-center gap-2 rounded-full bg-neutral-950 px-4 py-3 text-sm font-semibold text-white shadow-sm transition-opacity active:opacity-85 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-white dark:text-neutral-950 sm:min-h-13 sm:py-3.5 sm:text-[15px]"
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
              <ShoppingBag size={17} className="shrink-0" />
              <span className="truncate">
                Agregar<span className="hidden min-[380px]:inline"> al pedido</span>
              </span>
              <span className="shrink-0 font-bold tabular-nums">· {money(totalPrice)}</span>
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
      <div className="flex items-center justify-between gap-3 border-b border-black/[0.06] px-4 pb-3.5 pt-2 dark:border-white/[0.08] sm:px-5 sm:pb-4 sm:pt-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-500 dark:text-neutral-400">
            Revisa antes de enviar
          </p>
          <DrawerTitle className="font-display text-2xl font-semibold tracking-[-0.03em] text-[var(--ink)]">
            Mi pedido
          </DrawerTitle>
        </div>
        <div className="flex items-center gap-2">
          {cart.length > 0 && (
            <button
              type="button"
              className="focus-ring flex min-h-9 items-center gap-1.5 rounded-full bg-red-500/10 px-3 text-xs font-semibold text-red-700 transition active:opacity-80 dark:bg-red-500/15 dark:text-red-300"
              onClick={onRequestClear}
            >
              <Trash2 size={13} /> Vaciar
            </button>
          )}
          <button
            type="button"
            className="focus-ring grid h-9 w-9 place-items-center rounded-full bg-black/[0.06] text-[var(--ink)] transition active:opacity-75 dark:bg-white/[0.1] dark:text-neutral-100"
            aria-label="Cerrar pedido"
            onClick={onClose}
          >
            <X size={17} />
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-3.5 sm:px-5">
        <ul className="divide-y divide-black/[0.06] dark:divide-white/[0.08]">
          {cart.map((item, index) => (
            <li key={`${item.productId}-${index}`} className="flex gap-3.5 py-4 first:pt-1 last:pb-1">
              <ProductImage
                src={item.image}
                alt={item.name}
                className="h-[4.75rem] w-[4.75rem] shrink-0 rounded-[1rem]"
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="text-[15px] font-semibold leading-snug tracking-[-0.015em] text-[var(--ink)]">
                    {item.name}
                  </h3>
                  <strong className="shrink-0 text-[15px] font-bold tabular-nums text-[var(--ink)]">
                    {money(cartItemTotal(item))}
                  </strong>
                </div>
                {item.option && (
                  <p className="mt-0.5 text-xs font-medium text-neutral-500 dark:text-neutral-400">
                    {item.option}
                  </p>
                )}
                {item.extras && item.extras.length > 0 && (
                  <div className="mt-1 space-y-0.5">
                    {item.extras.map((extra, extraIndex) => (
                      <p key={extraIndex} className="text-xs font-medium text-neutral-600 dark:text-neutral-300">
                        + {extra.name} ({money(extra.price)})
                      </p>
                    ))}
                  </div>
                )}
                <input
                  className="mt-2.5 w-full rounded-xl bg-black/[0.04] px-3 py-2 text-base text-[var(--ink)] outline-none ring-1 ring-transparent transition focus:bg-[var(--paper)] focus:ring-black/15 dark:bg-white/[0.07] dark:text-neutral-100 dark:focus:bg-neutral-800 dark:focus:ring-white/20"
                  placeholder="Nota para este platillo…"
                  maxLength={250}
                  value={item.notes || ""}
                  onChange={(event) => {
                    const next = [...cart];
                    next[index] = { ...item, notes: event.target.value };
                    onChange(next);
                  }}
                />
                <div className="mt-2.5 flex items-center justify-between">
                  <div className="inline-flex items-center rounded-full bg-black/[0.05] p-0.5 dark:bg-white/[0.09]">
                    <button
                      type="button"
                      className="focus-ring grid h-8 w-8 place-items-center rounded-full text-[var(--ink)] transition active:opacity-75"
                      aria-label={`Restar ${item.name}`}
                      onClick={() => {
                        const next = [...cart];
                        if (item.quantity === 1) next.splice(index, 1);
                        else next[index] = { ...item, quantity: item.quantity - 1 };
                        onChange(next);
                      }}
                    >
                      {item.quantity === 1 ? <Trash2 size={14} className="text-red-600 dark:text-red-400" /> : <Minus size={15} />}
                    </button>
                    <strong className="min-w-7 text-center text-sm font-semibold tabular-nums">
                      {item.quantity}
                    </strong>
                    <button
                      type="button"
                      className="focus-ring grid h-8 w-8 place-items-center rounded-full text-[var(--ink)] transition active:opacity-75"
                      aria-label={`Sumar ${item.name}`}
                      onClick={() => {
                        const next = [...cart];
                        next[index] = { ...item, quantity: Math.min(10, item.quantity + 1) };
                        onChange(next);
                      }}
                    >
                      <Plus size={15} />
                    </button>
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ul>

        {suggestions.length > 0 && (
          <div className="mt-4 rounded-2xl bg-black/[0.035] p-3.5 dark:bg-white/[0.05]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-500 dark:text-neutral-400">
              ¿Algo para acompañar?
            </p>
            <div className="no-scrollbar -mx-1 mt-2.5 flex gap-2 overflow-x-auto px-1 pb-0.5">
              {suggestions.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onQuickAdd(item)}
                  className="focus-ring flex w-44 shrink-0 items-center gap-2.5 rounded-2xl bg-[var(--paper)] p-2 text-left shadow-[0_1px_2px_rgba(0,0,0,0.04)] ring-1 ring-black/[0.05] transition active:opacity-80 dark:bg-neutral-900 dark:ring-white/[0.08]"
                >
                  <ProductImage
                    src={item.image}
                    alt={item.name}
                    category={item.category}
                    className="h-11 w-11 shrink-0 rounded-xl"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-semibold text-[var(--ink)]">
                      {item.name}
                    </span>
                    <span className="mt-0.5 block text-[11px] font-bold tabular-nums text-neutral-500 dark:text-neutral-400">
                      + {money(item.price)}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        <label className="mt-4 block text-[13px] font-semibold text-neutral-700 dark:text-neutral-300">
          Observaciones generales
          <textarea
            className="mt-2 min-h-20 w-full resize-none rounded-2xl bg-black/[0.04] p-3.5 text-base font-normal text-[var(--ink)] outline-none ring-1 ring-transparent transition focus:bg-[var(--paper)] focus:ring-black/15 dark:bg-white/[0.07] dark:text-neutral-100 dark:focus:bg-neutral-800 dark:focus:ring-white/20"
            maxLength={250}
            placeholder="Algo que debamos saber…"
            value={notes}
            onChange={(event) => onNotes(event.target.value)}
          />
        </label>
      </div>
      <div className="border-t border-black/[0.06] bg-[var(--paper)]/95 px-4 pt-3.5 pb-[max(1.25rem,env(safe-area-inset-bottom))] backdrop-blur-xl dark:border-white/[0.08] dark:bg-neutral-900/95 sm:p-4 sm:pb-6">
        <div className="mb-3.5 flex items-center justify-between text-base sm:mb-4">
          <span className="text-sm font-medium text-neutral-500 dark:text-neutral-400">Total estimado</span>
          <strong className="text-xl font-bold tabular-nums text-[var(--ink)]">{money(subtotal)}</strong>
        </div>
        <button
          type="button"
          className="focus-ring flex min-h-13 w-full items-center justify-center gap-2 rounded-full bg-neutral-950 py-3.5 text-[15px] font-semibold text-white shadow-sm transition-opacity active:opacity-85 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-white dark:text-neutral-950"
          disabled={sending || cart.length === 0}
          onClick={onSubmit}
        >
          {sending ? (
            "Enviando…"
          ) : (
            <>
              <ShoppingBag size={18} />
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
  const isReady = order.status === "ready";
  const isCancelled = order.status === "cancelled";
  const trackingTitle =
    order.status === "accepted" || order.status === "sent"
      ? "Pedido confirmado"
      : order.status === "preparing"
        ? "Preparando tus platillos"
        : isReady
          ? tableCode === "LLEVAR"
            ? "¡Listo para recoger!"
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
              : "Esta pantalla se actualiza en vivo automáticamente."}
          </p>

          {/* Horizontal Apple Live Activity Progress Bar */}
          {!isCancelled && (
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
                            accepted: "Recibido en cocina",
                            preparing: "En preparación",
                            ready: tableCode === "LLEVAR" ? "Listo en mostrador" : "Listo para servir",
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

          {/* Meta summary card */}
          <div className="mt-5 flex items-center justify-between rounded-2xl bg-black/[0.035] px-4 py-3.5 dark:bg-white/[0.05]">
            <div>
              <span className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-500 dark:text-neutral-400">
                {tableCode === "LLEVAR" ? "Modalidad" : "Mesa"}
              </span>
              <strong className="text-lg font-semibold">
                {tableCode === "LLEVAR"
                  ? customerName || order.customerName || "Para llevar"
                  : `Mesa ${tableCode}`}
              </strong>
              {tableCode === "LLEVAR" && customerPhone && (
                <span className="block text-xs text-neutral-500 dark:text-neutral-400">
                  {customerPhone}
                </span>
              )}
            </div>
            <div className="text-right">
              <span className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-500 dark:text-neutral-400">
                Total
              </span>
              <strong className="text-xl font-bold tabular-nums">{money(order.total)}</strong>
            </div>
          </div>

          {/* Order items breakdown if available */}
          {order.items && order.items.length > 0 && (
            <div className="mt-4 rounded-2xl bg-black/[0.025] p-3.5 dark:bg-white/[0.04]">
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-500 dark:text-neutral-400">
                Tu orden
              </p>
              <ul className="mt-2 space-y-1.5 text-sm">
                {order.items.map((item, idx) => (
                  <li key={`${item.productId}-${idx}`} className="flex items-baseline justify-between gap-2">
                    <span className="truncate">
                      <strong className="font-semibold tabular-nums">{item.quantity}×</strong> {item.name}
                    </span>
                    <span className="shrink-0 text-xs font-medium tabular-nums text-neutral-500 dark:text-neutral-400">
                      {money(cartItemTotal(item))}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Share tracking pills for takeaway */}
          {tableCode === "LLEVAR" && (
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                className="focus-ring flex min-h-11 items-center justify-center gap-1.5 rounded-full bg-black/[0.06] px-4 text-xs font-semibold text-[var(--ink)] transition active:opacity-80 dark:bg-white/[0.1] dark:text-white"
                onClick={() => {
                  const url = `${window.location.origin}/seguimiento/${order.folio}`;
                  void navigator.clipboard.writeText(url);
                  toastSuccess("Link copiado", "Pégalo en WhatsApp o donde quieras.");
                }}
              >
                Copiar link
              </button>
              <a
                href={`https://wa.me/?text=${encodeURIComponent(`🍽️ Mi pedido en Imperio · ${order.folio}\n${typeof window !== "undefined" ? window.location.origin : ""}/seguimiento/${order.folio}`)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="focus-ring flex min-h-11 items-center justify-center gap-1.5 rounded-full bg-[#25D366] px-4 text-xs font-semibold text-white transition active:opacity-80"
              >
                WhatsApp
              </a>
            </div>
          )}

          {session && session.status === "active" && (
            <p className="mt-4 text-center text-xs text-neutral-500 dark:text-neutral-400">
              Sesión #{session.id?.slice(0, 8)} · Puedes pedir algo más y se suma a tu cuenta.
            </p>
          )}

          <button
            type="button"
            className="focus-ring mt-5 flex min-h-13 w-full items-center justify-center gap-2 rounded-full bg-neutral-950 px-5 text-[15px] font-semibold text-white shadow-sm transition active:opacity-85 dark:bg-white dark:text-neutral-950"
            onClick={onOrderAgain}
          >
            <Plus size={18} />
            {isCancelled
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
      <section className="mt-4 overflow-hidden rounded-[1.75rem] bg-[var(--paper)] p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] ring-1 ring-black/[0.05] dark:bg-neutral-900 dark:ring-white/10 sm:mt-5 sm:p-6">
        <div className="skeleton mb-3 h-5 w-32 max-w-full rounded-full" />
        <div className="skeleton mb-2 h-8 w-full max-w-xs rounded-xl" />
        <div className="skeleton h-4 w-40 max-w-full rounded-lg" />
        <div className="mt-6 space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="space-y-2.5 pt-3">
              <div className="skeleton h-5 w-28 rounded-lg" />
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="skeleton h-12 rounded-2xl" />
                <div className="skeleton h-12 rounded-2xl" />
              </div>
            </div>
          ))}
          <div className="skeleton mt-4 h-13 w-full rounded-full" />
        </div>
      </section>
    );
  }

  if (!menu || !menu.availableToday) {
    return (
      <section className="animate-fade-in mt-4 rounded-[1.75rem] bg-[var(--paper)] p-7 text-center shadow-[0_1px_3px_rgba(0,0,0,0.04)] ring-1 ring-black/[0.05] dark:bg-neutral-900 dark:ring-white/10 sm:mt-5">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-black/[0.05] dark:bg-white/[0.08]">
          <Clock3 className="text-neutral-500 dark:text-neutral-300" size={24} />
        </div>
        <h2 className="mt-4 font-display text-xl font-semibold sm:text-2xl">
          Hoy no hay comida corrida
        </h2>
        <p className="mt-1.5 text-sm leading-relaxed text-neutral-500 dark:text-neutral-400">
          Puedes ordenar cualquiera de los platillos de paquetes y carta.
        </p>
        <button
          type="button"
          className="focus-ring mt-5 rounded-full bg-neutral-950 px-6 py-2.5 text-sm font-semibold text-white transition active:opacity-80 dark:bg-white dark:text-neutral-950"
          onClick={onShowFixed}
        >
          Ver paquetes y carta
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
  const completedCount = courses.filter(([, options]) => options.length === 0).length +
    courses.filter(([course, options]) => options.length > 0 && Boolean(selections[course])).length;
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
    <section className="mt-4 sm:mt-5">
      <div className="overflow-hidden rounded-[1.75rem] bg-[var(--paper)] shadow-[0_1px_3px_rgba(0,0,0,0.04)] ring-1 ring-black/[0.055] dark:bg-neutral-900 dark:ring-white/[0.08]">
        {/* Clean Apple/Pixel Editorial Header */}
        <div className="border-b border-black/[0.06] p-5 dark:border-white/[0.08] sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${
                isOpen
                  ? "bg-emerald-500/12 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300"
                  : "bg-black/[0.06] text-neutral-600 dark:bg-white/10 dark:text-neutral-300"
              }`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  isOpen ? "bg-emerald-500" : "bg-neutral-400"
                }`}
              />
              {isOpen ? "Disponible ahora" : `Horario ${menu.availableFrom}–${menu.availableUntil}`}
            </span>
            <span className="text-xs font-medium tabular-nums text-neutral-500 dark:text-neutral-400">
              {completedCount} de {courses.length} tiempos listos
            </span>
          </div>

          <div className="mt-3.5 flex items-baseline justify-between gap-3">
            <div>
              <h2 className="font-display text-2xl font-semibold tracking-[-0.03em] sm:text-3xl">
                Comida corrida
              </h2>
              <p className="mt-1 flex items-center gap-1.5 text-xs text-neutral-500 dark:text-neutral-400">
                <Sparkles size={14} /> Elige 1 opción por cada tiempo
              </p>
            </div>
            <strong className="font-display text-2xl font-bold tabular-nums sm:text-3xl">
              {money(menu.price)}
            </strong>
          </div>
        </div>

        <div className="p-4 sm:p-6">
          <div className="divide-y divide-black/[0.06] dark:divide-white/[0.08]">
            {courses.map(([course, options], courseIdx) => (
              <fieldset className="py-4 first:pt-1 last:pb-1" key={course}>
                <legend className="flex items-center gap-2 text-[15px] font-semibold tracking-[-0.015em]">
                  <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-neutral-950 text-[11px] font-bold text-white dark:bg-white dark:text-neutral-950">
                    {courseIdx + 1}
                  </span>
                  <span>{course}</span>
                  <span className="text-xs font-normal text-neutral-500 dark:text-neutral-400">
                    · {options.length} {options.length === 1 ? "opción" : "opciones"}
                  </span>
                </legend>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {options.map((option) => {
                    const selected = selections[course] === option;
                    return (
                      <label
                        className={`relative flex cursor-pointer items-center justify-between gap-2.5 rounded-2xl p-3.5 text-sm font-medium transition-colors active:opacity-85 ${
                          selected
                            ? "bg-neutral-950 font-semibold text-white shadow-xs dark:bg-white dark:text-neutral-950"
                            : "bg-black/[0.04] text-[var(--ink)] hover:bg-black/[0.07] dark:bg-white/[0.06] dark:text-neutral-100 dark:hover:bg-white/[0.1]"
                        }`}
                        key={option}
                      >
                        <span className="min-w-0">{option}</span>
                        <span
                          className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border ${
                            selected
                              ? "border-transparent bg-white text-neutral-950 dark:bg-neutral-950 dark:text-white"
                              : "border-black/20 dark:border-white/25"
                          }`}
                        >
                          {selected && <Check size={12} strokeWidth={3} />}
                        </span>
                        <input
                          checked={selected}
                          name={`daily-${course}`}
                          type="radio"
                          value={option}
                          className="sr-only"
                          onChange={() =>
                            setSelections((current) => ({ ...current, [course]: option }))
                          }
                        />
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            ))}
          </div>

          {extras.length > 0 && (
            <fieldset className="mt-5 rounded-2xl bg-black/[0.03] p-3.5 dark:bg-white/[0.05] sm:p-4">
              <legend className="font-display text-base font-semibold tracking-[-0.02em]">
                Extras con costo
              </legend>
              <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
                El precio se actualiza al momento.
              </p>
              <div className="mt-3 grid gap-2">
                {extras.map((extra) => {
                  const selected = selectedExtras.includes(extra.name);
                  return (
                    <label
                      className={`relative flex cursor-pointer items-center justify-between gap-2 rounded-2xl p-3 transition-colors active:opacity-85 ${
                        selected
                          ? "bg-neutral-950 text-white shadow-xs dark:bg-white dark:text-neutral-950"
                          : "bg-[var(--paper)] text-[var(--ink)] ring-1 ring-black/[0.05] dark:bg-neutral-900 dark:text-neutral-100 dark:ring-white/[0.08]"
                      }`}
                      key={extra.name}
                    >
                      <span className="flex min-w-0 items-center gap-2.5">
                        <span
                          className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border ${
                            selected
                              ? "border-transparent bg-white text-neutral-950 dark:bg-neutral-950 dark:text-white"
                              : "border-black/20 dark:border-white/25"
                          }`}
                        >
                          {selected && <Check size={12} strokeWidth={3} />}
                        </span>
                        <span className="truncate text-sm font-medium">{extra.name}</span>
                      </span>
                      <strong
                        className={`shrink-0 text-sm font-semibold tabular-nums ${
                          selected
                            ? "text-white/90 dark:text-neutral-900"
                            : "text-neutral-600 dark:text-neutral-300"
                        }`}
                      >
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

          <div className="mt-5 flex items-center gap-2.5 sm:gap-3">
            <div className="flex shrink-0 items-center rounded-full bg-black/[0.05] p-1 dark:bg-white/[0.09]">
              <button
                type="button"
                className="focus-ring grid h-10 w-10 place-items-center rounded-full text-[var(--ink)] transition active:opacity-75 sm:h-11 sm:w-11"
                aria-label="Restar comida corrida"
                onClick={() => setQuantity((value) => Math.max(1, value - 1))}
              >
                <Minus size={17} />
              </button>
              <strong className="w-7 text-center text-sm font-semibold tabular-nums sm:w-9 sm:text-base">
                {quantity}
              </strong>
              <button
                type="button"
                className="focus-ring grid h-10 w-10 place-items-center rounded-full text-[var(--ink)] transition active:opacity-75 sm:h-11 sm:w-11"
                aria-label="Sumar comida corrida"
                onClick={() => setQuantity((value) => Math.min(10, value + 1))}
              >
                <Plus size={17} />
              </button>
            </div>
            <button
              type="button"
              className="focus-ring flex min-h-12 min-w-0 flex-1 items-center justify-center gap-2 rounded-full bg-neutral-950 px-4 py-3 text-sm font-semibold text-white shadow-sm transition active:opacity-85 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-white dark:text-neutral-950 sm:min-h-13 sm:py-3.5 sm:text-[15px]"
              disabled={!isOpen || !hasCompleteSelection}
              onClick={() => onAdd(menu, selections, quantity, chosenExtras)}
            >
              <span className="truncate">
                {!isOpen
                  ? "Fuera de horario"
                  : hasCompleteSelection
                    ? "Agregar corrida"
                    : "Completa tus tiempos"}
              </span>
              <span className="shrink-0 font-bold tabular-nums">
                · {money(finalUnitPrice * quantity)}
              </span>
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}