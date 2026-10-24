import { useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, Search, Compass } from "lucide-react";
import { Button } from "@/components/ui/button";
import { inputCls } from "@/components/bits";

export function SearchField({
  label,
  value,
  onChange,
  placeholder = "Search businesses, founders, launches…",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="relative block min-w-0">
      <Search aria-hidden className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
      <span className="sr-only">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`${inputCls} pl-9`}
      />
    </label>
  );
}
export function EmptyState({
  title,
  children,
  action,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div role="status" className="py-12 text-center">
      <Compass aria-hidden className="mx-auto mb-3 h-8 w-8 text-primary" />
      <h2 className="text-lg font-semibold">{title}</h2>
      {children && (
        <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">{children}</p>
      )}
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}
export function DetailTabs({
  items,
  value,
  onChange,
}: {
  items: string[];
  value: string;
  onChange: (tab: string) => void;
}) {
  return (
    <div aria-label="Page sections" className="mb-6 flex flex-wrap gap-1 border-b border-border">
      {items.map((tab) => (
        <Button
          key={tab}
          variant="ghost"
          aria-pressed={value === tab}
          onClick={() => onChange(tab)}
          className={`rounded-none border-b-2 px-3 text-xs sm:text-sm ${value === tab ? "border-primary text-primary" : "border-transparent text-muted-foreground"}`}
        >
          {tab}
        </Button>
      ))}
    </div>
  );
}
export function Gallery({
  images,
  label,
  aspect = "aspect-[16/9]",
}: {
  images: { url: string; alt: string }[];
  label: string;
  aspect?: string;
}) {
  const [index, setIndex] = useState(0);
  const [failed, setFailed] = useState<string[]>([]);
  const media = images.filter((i) => !failed.includes(i.url));
  const current = media[index % Math.max(media.length, 1)];
  return (
    <div
      className={`relative overflow-hidden rounded-lg bg-secondary ${aspect}`}
      aria-label={label}
    >
      {current ? (
        <img
          src={current.url}
          alt={current.alt}
          width={1280}
          height={720}
          onError={() => setFailed((f) => [...f, current.url])}
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
          Image unavailable
        </div>
      )}
      {media.length > 1 && (
        <>
          <span className="absolute right-3 top-3 rounded-full bg-overlay/70 px-2 py-1 text-xs text-image-foreground">
            {(index % media.length) + 1}/{media.length}
          </span>
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Previous image of ${label}`}
            title="Previous image"
            onClick={() => setIndex((i) => (i + media.length - 1) % media.length)}
            className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-card/90"
          >
            <ChevronLeft />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Next image of ${label}`}
            title="Next image"
            onClick={() => setIndex((i) => (i + 1) % media.length)}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-card/90"
          >
            <ChevronRight />
          </Button>
          <div className="absolute bottom-3 left-0 flex w-full justify-center gap-1.5">
            {media.map((m, i) => (
              <Button
                variant="ghost"
                key={m.url}
                size="icon"
                aria-label={`Image ${i + 1} of ${label}`}
                aria-pressed={index % media.length === i}
                onClick={() => setIndex(i)}
                className="h-6 w-6 rounded-full"
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${index % media.length === i ? "bg-image-foreground" : "bg-image-foreground/50"}`}
                />
              </Button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
