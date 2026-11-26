import { Leaf, UtensilsCrossed } from "lucide-react";
import { restaurant } from "@/lib/menu";

export function Brand({
  compact = false,
  inverse = false
}: {
  compact?: boolean;
  inverse?: boolean;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <div
        className={`relative grid shrink-0 place-items-center bg-neutral-950 text-[var(--gold-light)] shadow-sm ring-1 ring-black/10 dark:bg-white dark:text-neutral-950 dark:ring-white/15 ${
          compact ? "h-9 w-9 rounded-[0.8rem]" : "h-11 w-11 rounded-[0.95rem]"
        }`}
        aria-hidden="true"
      >
        <div className="relative">
          <UtensilsCrossed size={compact ? 17 : 20} strokeWidth={2} />
          <Leaf className="absolute -right-1.5 -top-1.5" size={10} fill="currentColor" />
        </div>
      </div>
      <div className="min-w-0">
        <p
          className={`${compact ? "text-[17px]" : "text-xl"} font-display truncate font-semibold leading-none tracking-[-0.03em] ${
            inverse ? "text-white" : "text-[var(--ink)] dark:text-neutral-50"
          }`}
        >
          {restaurant.name}
        </p>
        <p
          className={`mt-0.5 truncate text-[10px] font-medium tracking-[0.04em] ${
            inverse ? "text-white/65" : "text-neutral-500 dark:text-neutral-400"
          }`}
        >
          {restaurant.descriptor}
        </p>
      </div>
    </div>
  );
}
