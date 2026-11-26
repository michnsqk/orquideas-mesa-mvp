"use client";

import { useState } from "react";

const categoryIcons: Record<string, { emoji: string; bg: string }> = {
  Desayunos: { emoji: "🍳", bg: "#f4dfb4" },
  "A la carta": { emoji: "🌮", bg: "#dce8c8" },
  "Panes y más": { emoji: "🥐", bg: "#e4ece6" },
  Bebidas: { emoji: "🥤", bg: "#d9ebe1" },
  "Comidas a la carta": { emoji: "🍖", bg: "#f4dfb4" },
  Extras: { emoji: "➕", bg: "#e8e4db" },
  "Comida corrida": { emoji: "🍲", bg: "#eee2d8" }
};

const OPTIMIZED_LOCAL_IMAGES = new Set([
  "/menu/alitas.png",
  "/menu/boneless.png",
  "/menu/burro.png",
  "/menu/club.png",
  "/menu/ensalada.png",
  "/menu/imperio/agua-fruta.jpg",
  "/menu/imperio/arrachera-actual.jpg",
  "/menu/imperio/arrachera.jpg",
  "/menu/imperio/bebidas.jpg",
  "/menu/imperio/bisquet-nuevo.jpg",
  "/menu/imperio/bisquet.jpg",
  "/menu/imperio/cafe-leche.jpg",
  "/menu/imperio/chilaquiles-carne.jpg",
  "/menu/imperio/chilaquiles-divorciados.jpg",
  "/menu/imperio/chilaquiles-huevo.jpg",
  "/menu/imperio/chilaquiles-pechuga.jpg",
  "/menu/imperio/chilaquiles-sencillos.jpg",
  "/menu/imperio/chilaquiles-suizos.jpg",
  "/menu/imperio/club-sandwich.jpg",
  "/menu/imperio/cuernito.jpg",
  "/menu/imperio/desayuno-combinado.jpg",
  "/menu/imperio/desayuno-infantil.jpg",
  "/menu/imperio/enchiladas-suizas.jpg",
  "/menu/imperio/enchiladas-verdes-nuevas.jpg",
  "/menu/imperio/enchiladas-verdes.jpg",
  "/menu/imperio/enfrijoladas.jpg",
  "/menu/imperio/enmoladas.jpg",
  "/menu/imperio/ensalada.jpg",
  "/menu/imperio/hot-cakes-nuevos.jpg",
  "/menu/imperio/hotcakes-waffles.jpg",
  "/menu/imperio/huevos-al-gusto-nuevos.jpg",
  "/menu/imperio/huevos-al-gusto.jpg",
  "/menu/imperio/jugo-verde.jpg",
  "/menu/imperio/licuado.jpg",
  "/menu/imperio/malteada-fresa.jpg",
  "/menu/imperio/milanesa-res.jpg",
  "/menu/imperio/molletes.jpg",
  "/menu/imperio/omelette-champinones.jpg",
  "/menu/imperio/pan-frances.jpg",
  "/menu/imperio/papas-francesas.jpg",
  "/menu/imperio/pechuga-empanizada-desayuno.jpg",
  "/menu/imperio/pechuga-empanizada.jpg",
  "/menu/imperio/pechuga-plancha.jpg",
  "/menu/imperio/pechuga-rellena-desayuno.jpg",
  "/menu/imperio/pechuga-rellena.jpg",
  "/menu/imperio/pescado-empanizado.jpg",
  "/menu/imperio/pollo-empanizado.jpg",
  "/menu/imperio/pollo-plancha.jpg",
  "/menu/imperio/refresco-cola.jpg",
  "/menu/imperio/salchipulpos-papas.jpg",
  "/menu/imperio/taco-bistec.jpg",
  "/menu/imperio/tacos-dorados.png",
  "/menu/imperio/waffles-nuevos.jpg",
  "/menu/nachos.png",
  "/menu/texas.png"
]);

export function ProductImage({
  src,
  alt,
  category,
  className = "",
  priority = false,
  sizes = "(max-width: 639px) 112px, (max-width: 1023px) 46vw, 380px"
}: {
  src: string;
  alt: string;
  category?: string;
  className?: string;
  priority?: boolean;
  sizes?: string;
}) {
  const [error, setError] = useState(false);

  if (error || !src || src.trim() === "") {
    const icon = category ? categoryIcons[category] : null;
    return (
      <div
        className={`flex flex-col items-center justify-center gap-2 ${className}`}
        style={{ backgroundColor: icon?.bg || "#f4f1ea" }}
        role="img"
        aria-label={alt}
      >
        <span className="text-4xl sm:text-5xl" aria-hidden="true">
          {icon?.emoji || "🍽️"}
        </span>
        <span className="px-3 text-center text-xs font-bold text-[#5c5348] line-clamp-2">
          {alt}
        </span>
      </div>
    );
  }

  const normalizedSrc = src.trim();
  const hasResponsiveWebp = OPTIMIZED_LOCAL_IMAGES.has(normalizedSrc);
  const webpBase = hasResponsiveWebp
    ? normalizedSrc.replace(/\.(jpe?g|png)$/i, "")
    : null;

  return (
    <div className={`menu-photo ${className}`}>
      {webpBase ? (
        <picture>
          <source
            type="image/webp"
            srcSet={`${webpBase}-256.webp 256w, ${webpBase}-640.webp 640w`}
            sizes={sizes}
          />
          <img
            src={normalizedSrc}
            alt={alt}
            width={320}
            height={240}
            loading={priority ? "eager" : "lazy"}
            fetchPriority={priority ? "high" : "auto"}
            decoding={priority ? "sync" : "async"}
            onError={() => setError(true)}
          />
        </picture>
      ) : (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={normalizedSrc}
          alt={alt}
          width={320}
          height={240}
          loading={priority ? "eager" : "lazy"}
          fetchPriority={priority ? "high" : "auto"}
          decoding={priority ? "sync" : "async"}
          onError={() => setError(true)}
        />
      )}
    </div>
  );
}
