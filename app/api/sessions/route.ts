import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient, createServerClient } from "@/lib/supabase/server";
import type { Order, TableSession } from "@/lib/types";

const STALE_SESSION_MS = 6 * 60 * 60 * 1000; // 6 horas sin actividad -> cuenta nueva automática
const ACTIVE_KITCHEN_WINDOW_MS = 3 * 60 * 60 * 1000; // 3 horas para proteger pedidos en cocina

const sessionSchema = z.object({
  tableCode: z.string().trim().regex(/^[A-Z]\d{1,2}$|^LLEVAR$/),
  forceNew: z.boolean().optional(),
  pin: z.string().max(20).optional()
});

function isSessionStale(session: TableSession | null): boolean {
  if (!session || session.status !== "active") return false;
  const now = Date.now();
  const orders = (session.orders || []).filter((o) => o.status !== "cancelled");
  if (orders.length === 0) {
    const createdAt = +new Date(session.createdAt || 0);
    return createdAt > 0 && now - createdAt > STALE_SESSION_MS;
  }
  const latestOrderTs = Math.max(
    ...orders.map((o) => +new Date(o.updatedAt || o.createdAt || 0))
  );
  return latestOrderTs > 0 && now - latestOrderTs > STALE_SESSION_MS;
}

function hasRecentKitchenOrders(session: TableSession | null): boolean {
  if (!session) return false;
  const now = Date.now();
  return (session.orders || []).some((o: Order) => {
    if (["delivered", "cancelled"].includes(o.status)) return false;
    const ts = +new Date(o.updatedAt || o.createdAt || 0);
    return ts > 0 && now - ts < ACTIVE_KITCHEN_WINDOW_MS;
  });
}

async function closeSessionById(sessionId: string): Promise<boolean> {
  try {
    const admin = createAdminClient();
    const { error } = await admin
      .from("table_sessions")
      .update({ status: "closed", updated_at: new Date().toISOString() })
      .eq("id", sessionId);
    if (error) {
      console.error("closeSessionById failed", error.code, error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error("closeSessionById exception", err);
    return false;
  }
}

export async function GET(request: NextRequest) {
  const tableCode = request.nextUrl.searchParams.get("tableCode");
  const listActive = request.nextUrl.searchParams.get("list");
  const supabase = createServerClient();

  if (listActive === "active") {
    const pin = request.nextUrl.searchParams.get("pin") || "";
    if (pin !== process.env.STAFF_DEMO_PIN) {
      return NextResponse.json({ error: "Acceso no autorizado" }, { status: 401 });
    }
    const { data, error } = await supabase.rpc("get_active_sessions");
    if (error) {
      console.error("get_active_sessions failed", error);
      return NextResponse.json(
        { error: "No fue posible consultar las sesiones" },
        { status: 503 }
      );
    }
    return NextResponse.json(data || []);
  }

  if (!tableCode) {
    return NextResponse.json(
      { error: "tableCode o list=active es requerido" },
      { status: 400 }
    );
  }

  const { data, error } = await supabase.rpc("get_table_session", {
    p_table_code: tableCode.toUpperCase()
  });
  if (error) {
    console.error("get_table_session failed", error);
    return NextResponse.json(
      { error: "No fue posible consultar la sesión" },
      { status: 503 }
    );
  }

  const session = data as TableSession | null;
  if (session && isSessionStale(session)) {
    const closed = await closeSessionById(session.id);
    if (closed) {
      return NextResponse.json(null);
    }
  }

  return NextResponse.json(session);
}

export async function POST(request: NextRequest) {
  const parsed = sessionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const upperCode = parsed.data.tableCode.toUpperCase();
  const supabase = createServerClient();

  if (parsed.data.forceNew) {
    const { data: existingRaw } = await supabase.rpc("get_table_session", {
      p_table_code: upperCode
    });
    const existing = existingRaw as TableSession | null;
    if (existing?.id) {
      const isStaff =
        Boolean(process.env.STAFF_DEMO_PIN) && parsed.data.pin === process.env.STAFF_DEMO_PIN;
      if (isStaff || !hasRecentKitchenOrders(existing)) {
        await closeSessionById(existing.id);
      } else {
        // Hay pedidos activos recientes en cocina: devolvemos la sesión actual para que el
        // comensal use cuenta individual separada por nombre sin interrumpir a los demás.
        return NextResponse.json(
          { ...existing, separatedOnly: true },
          { status: 200 }
        );
      }
    }
  }

  const { data, error } = await supabase.rpc("get_or_create_table_session", {
    p_table_code: upperCode
  });

  if (error) {
    console.error("get_or_create_table_session failed", {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint
    });
    return NextResponse.json(
      { error: "No fue posible crear la sesión" },
      { status: 500 }
    );
  }
  return NextResponse.json(data, { status: 201 });
}
