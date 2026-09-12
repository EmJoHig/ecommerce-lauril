"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition, type ChangeEvent, type FormEvent, type MouseEvent, type ReactNode } from "react";

export function CatalogAutoForm({ children, className }: Readonly<{ children: ReactNode; className?: string }>) {
  const pathname = usePathname();
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [categoryPending, setCategoryPending] = useState(false);
  const [pending, startTransition] = useTransition();
  const busy = pending || categoryPending;

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  useEffect(() => {
    if (!pending) window.dispatchEvent(new Event("lauril:navigation-end"));
  }, [pending]);

  function navigate(form: HTMLFormElement) {
    const query = new URLSearchParams();
    new FormData(form).forEach((value, key) => {
      if (typeof value === "string" && value) query.set(key, value);
    });
    query.delete("pagina");
    window.dispatchEvent(new Event("lauril:navigation-start"));
    startTransition(() => router.replace(query.size ? `${pathname}?${query}` : pathname, { scroll: false }));
  }

  function handleChange(event: ChangeEvent<HTMLFormElement>) {
    const form = event.currentTarget;
    if (timer.current) clearTimeout(timer.current);
    if (event.target instanceof HTMLInputElement && event.target.type === "search") {
      timer.current = setTimeout(() => navigate(form), 450);
      return;
    }
    navigate(form);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (timer.current) clearTimeout(timer.current);
    navigate(event.currentTarget);
  }

  function handleClick(event: MouseEvent<HTMLFormElement>) {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const categoryLink = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>(".catalog-sidebar__categories a[href]") : null;
    if (!categoryLink || categoryLink.href === window.location.href) return;
    setCategoryPending(true);
    window.dispatchEvent(new Event("lauril:navigation-start"));
  }

  return <form aria-busy={busy} className={className} onChange={handleChange} onClick={handleClick} onSubmit={handleSubmit}>{children}{busy ? <span aria-live="polite" className="catalog-inline-loading">Actualizando productos…</span> : null}</form>;
}
