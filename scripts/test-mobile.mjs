import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import { chromium } from "playwright-core";

function resolveChromeExecutable() {
  const candidates = [
    process.env.CHROME_PATH,
    "/opt/ms-playwright/chromium-1255/chrome-linux64/chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser"
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return undefined;
}

async function waitForServer(url, server, timeoutMs = 60000) {
  let exitError = null;
  if (server) {
    let stderrBuf = "";
    server.stderr?.on("data", (chunk) => {
      stderrBuf += String(chunk);
    });
    server.once("exit", (code) => {
      exitError = new Error(
        `El servidor Next.js terminó con código ${code}.${stderrBuf ? `\n${stderrBuf.trim()}` : ""}`
      );
    });
  }
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (exitError) throw exitError;
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // keep waiting
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error(`El servidor no respondió a tiempo en ${url}`);
}

async function run() {
  const port = Number(process.env.TEST_MOBILE_PORT || 3015);
  const baseUrl = process.env.BASE_URL || `http://127.0.0.1:${port}`;
  let server = null;

  if (!process.env.BASE_URL) {
    server = spawn("./node_modules/.bin/next", ["dev", "-H", "127.0.0.1", "-p", String(port)], {
      env: {
        ...process.env,
        NEXT_PUBLIC_SUPABASE_URL:
          process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co",
        NEXT_PUBLIC_SUPABASE_ANON_KEY:
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder"
      },
      stdio: ["ignore", "ignore", "pipe"]
    });
  }

  try {
    await waitForServer(`${baseUrl}/mesa/A1`, server);
    const executablePath = resolveChromeExecutable();
    const browser = await chromium.launch({
      ...(executablePath ? { executablePath } : {}),
      args: ["--no-sandbox"]
    });

    try {
      const viewports = [
        { name: "mobile-360", width: 360, height: 800, isMobile: true },
        { name: "mobile-390", width: 390, height: 844, isMobile: true },
        { name: "desktop-1280", width: 1280, height: 800, isMobile: false }
      ];

      for (const vp of viewports) {
        const context = await browser.newContext({
          viewport: { width: vp.width, height: vp.height },
          deviceScaleFactor: 2,
          isMobile: vp.isMobile,
          hasTouch: vp.isMobile,
          timezoneId: "America/Mexico_City"
        });
        const page = await context.newPage();
        const pageErrors = [];
        page.on("pageerror", (err) => pageErrors.push(String(err)));
        // 10:09 AM CDMX (horario activo de comida corrida y desayunos)
        await page.clock.setFixedTime(new Date("2026-11-26T16:09:00Z"));
        // Playwright evalúa rutas en orden inverso (LIFO): genérica primero, específica después
        await page.route("**/api/**", (route) =>
          route.fulfill({ status: 200, contentType: "application/json", body: "[]" })
        );
        await page.route("**/api/sessions**", (route) =>
          route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              id: "sess-test-001",
              tableCode: "A1",
              status: "active",
              orders: [
                {
                  id: "ord-prev-1",
                  folio: "IMP-101",
                  tableCode: "A1",
                  status: "delivered",
                  items: [{ productId: "molletes", name: "Molletes tradicionales", unitPrice: 65, quantity: 1, notes: "", image: "" }],
                  notes: "",
                  subtotal: 65,
                  total: 65,
                  createdAt: "2026-11-26T16:00:00Z",
                  updatedAt: "2026-11-26T16:00:00Z"
                }
              ]
            })
          })
        );
        await page.route("**/placeholder.supabase.co/**", (route) => route.abort());

        await page.goto(`${baseUrl}/mesa/A1`, { waitUntil: "load" });
        await page.waitForSelector("h1", { timeout: 15000 });
        await page.waitForTimeout(500);

        // 1. Cero desbordamiento horizontal, escala 1:1 e imágenes WebP responsivas
        const menuCheck = await page.evaluate(() => {
          const firstImg = document.querySelector(".menu-photo img");
          return {
            innerWidth: window.innerWidth,
            scrollWidth: document.documentElement.scrollWidth,
            vvWidth: Math.round(window.visualViewport?.width || window.innerWidth),
            vvScale: window.visualViewport?.scale || 1,
            vvOffsetLeft: Math.round(window.visualViewport?.offsetLeft || 0),
            firstImgSrc: firstImg ? firstImg.currentSrc || firstImg.getAttribute("src") || "" : "",
            firstImgPriority: firstImg ? firstImg.getAttribute("fetchpriority") : null
          };
        });
        assert.equal(menuCheck.scrollWidth, vp.width, `${vp.name}: scrollWidth (${menuCheck.scrollWidth}) != ${vp.width}`);
        assert.equal(menuCheck.innerWidth, vp.width, `${vp.name}: innerWidth (${menuCheck.innerWidth}) != ${vp.width}`);
        assert.equal(menuCheck.vvScale, 1, `${vp.name}: escala inicial alterada (${menuCheck.vvScale})`);
        assert.equal(menuCheck.vvOffsetLeft, 0, `${vp.name}: offsetLeft inicial != 0`);
        assert.ok(menuCheck.firstImgSrc.endsWith(".webp"), `${vp.name}: imagen no usó WebP (${menuCheck.firstImgSrc})`);
        assert.equal(menuCheck.firstImgPriority, "high", `${vp.name}: primera imagen sin fetchpriority=high`);
        assert.equal(pageErrors.length, 0, `${vp.name}: errores JS en página: ${pageErrors.join("; ")}`);

        // 2. Búsqueda global entre categorías (buscar "malteada" estando en Desayunos)
        const searchInput = page.locator("input[placeholder*='Busca']").first();
        await searchInput.fill("malteada");
        await page.waitForTimeout(350);
        const searchResultsCount = await page.locator("button", { hasText: "Malteada" }).count();
        assert.ok(searchResultsCount > 0, `${vp.name}: la búsqueda global no encontró 'Malteada'`);
        await page.locator("button[aria-label='Limpiar búsqueda']").click();
        await page.waitForTimeout(300);

        // 3. Abrir modal de platillo sin salto de zoom ni recorte lateral
        const card = page.locator("button", { hasText: "Chilaquiles con 1 huevo" }).first();
        await card.scrollIntoViewIfNeeded();
        if (vp.isMobile) await card.tap();
        else await card.click();
        await page.waitForTimeout(450);

        const dialogCheck = await page.evaluate(() => {
          const popup = document.querySelector("[data-slot='dialog-content']");
          const rect = popup?.getBoundingClientRect();
          return {
            exists: Boolean(rect),
            left: rect ? Math.round(rect.left) : -1,
            right: rect ? Math.round(rect.right) : -1,
            width: rect ? Math.round(rect.width) : 0,
            scrollWidth: document.documentElement.scrollWidth,
            vvScale: window.visualViewport?.scale || 1,
            vvOffsetLeft: Math.round(window.visualViewport?.offsetLeft || 0)
          };
        });
        assert.ok(dialogCheck.exists, `${vp.name}: no se abrió el modal de platillo`);
        assert.ok(dialogCheck.left >= 0 && dialogCheck.right <= vp.width, `${vp.name}: modal se sale del viewport (${dialogCheck.left}..${dialogCheck.right})`);
        assert.equal(dialogCheck.scrollWidth, vp.width, `${vp.name}: el modal causó desbordamiento horizontal`);
        assert.equal(dialogCheck.vvScale, 1, `${vp.name}: el modal disparó zoom (${dialogCheck.vvScale})`);
        assert.equal(dialogCheck.vvOffsetLeft, 0, `${vp.name}: el modal desplazó visualViewport (${dialogCheck.vvOffsetLeft})`);

        // 4. Agregar al carrito y validar que botones flotantes no se empalmen + persistencia localStorage
        const addBtn = page.locator("[data-slot='dialog-content'] button", { hasText: "Agregar" }).first();
        if (vp.isMobile) await addBtn.tap();
        else await addBtn.click();
        await page.waitForTimeout(350);

        const overlapCheck = await page.evaluate(() => {
          const waiterBtn = document.querySelector("button[aria-label='Mesero y cuenta']")?.getBoundingClientRect();
          const cartBtn = [...document.querySelectorAll("button")].find(
            (b) => b.textContent?.includes("Ver mi pedido") || b.textContent?.includes("Agregar al grupo")
          )?.getBoundingClientRect();
          if (!waiterBtn || !cartBtn) return { missing: true, overlap: false };
          const overlap = !(
            waiterBtn.bottom <= cartBtn.top ||
            waiterBtn.top >= cartBtn.bottom ||
            waiterBtn.right <= cartBtn.left ||
            waiterBtn.left >= cartBtn.right
          );
          return { missing: false, overlap };
        });
        assert.equal(overlapCheck.missing, false, `${vp.name}: faltó botón flotante de carrito o mesero`);
        assert.equal(overlapCheck.overlap, false, `${vp.name}: los botones flotantes se empalman`);

        // Verificar persistencia al recargar
        await page.reload({ waitUntil: "load" });
        await page.locator("button", { hasText: /Ver mi pedido|Agregar al grupo/ }).first().waitFor({ timeout: 10000 });

        // 5. Cambiar a Comida corrida y abrir Carrito sin zoom ni desbordamiento
        const corridaTab = page.locator("button", { hasText: "Comida corrida" }).first();
        if (vp.isMobile) await corridaTab.tap();
        else await corridaTab.click();
        await page.waitForTimeout(300);
        const corridaCheck = await page.evaluate(() => ({
          scrollWidth: document.documentElement.scrollWidth,
          vvScale: window.visualViewport?.scale || 1
        }));
        assert.equal(corridaCheck.scrollWidth, vp.width, `${vp.name}: Comida corrida desbordó horizontalmente`);
        assert.equal(corridaCheck.vvScale, 1, `${vp.name}: Comida corrida alteró la escala`);

        // 6. Abrir hoja de Mesero / Cuenta y verificar sin desbordamiento
        const serviceBtn = page.locator("button[aria-label='Mesero y cuenta']");
        if (vp.isMobile) await serviceBtn.tap();
        else await serviceBtn.click();
        await page.waitForTimeout(350);
        const serviceCheck = await page.evaluate(() => ({
          hasBillSection: document.body.textContent?.includes("Pedir la cuenta"),
          hasAccountSummary: document.body.textContent?.includes("Consumo de tu mesa"),
          scrollWidth: document.documentElement.scrollWidth
        }));
        assert.ok(serviceCheck.hasBillSection, `${vp.name}: falta sección Pedir la cuenta`);
        assert.ok(serviceCheck.hasAccountSummary, `${vp.name}: falta resumen Consumo de tu mesa`);
        assert.equal(serviceCheck.scrollWidth, vp.width, `${vp.name}: hoja Mesero/Cuenta desbordó horizontalmente`);

        console.log(`✓ ${vp.name} (${vp.width}×${vp.height}): sin zoom, sin overflow, búsqueda global, comida corrida, carrito persistente y hoja de cuenta OK`);
        await context.close();
      }

      // 6. Verificar que /llevar oculta botón flotante de mesero
      const llevarCtx = await browser.newContext({
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true
      });
      const llevarPage = await llevarCtx.newPage();
      await llevarPage.route("**/api/**", (route) =>
        route.fulfill({ status: 200, contentType: "application/json", body: "[]" })
      );
      await llevarPage.route("**/placeholder.supabase.co/**", (route) => route.abort());
      await llevarPage.goto(`${baseUrl}/llevar`, { waitUntil: "load" });
      await llevarPage.waitForTimeout(400);
      await llevarPage.locator("input[placeholder*='Juan']").fill("Ana");
      await llevarPage.locator("button", { hasText: "Ver menú completo" }).tap();
      await llevarPage.waitForSelector("h1", { timeout: 15000 });
      await llevarPage.waitForTimeout(400);
      const waiterOnLlevar = await llevarPage.locator("button[aria-label='Mesero y cuenta']").count();
      assert.equal(waiterOnLlevar, 0, "/llevar no debe mostrar botón flotante de Mesero");
      console.log("✓ /llevar (390×844): oculta botón de mesero correctamente");
      await llevarCtx.close();
    } finally {
      await browser.close();
    }
  } finally {
    if (server) {
      server.kill("SIGTERM");
    }
  }
}

run().catch((err) => {
  console.error("✗ Falló verificación móvil:", err);
  process.exit(1);
});
