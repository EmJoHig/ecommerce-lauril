"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition, type ChangeEvent, type FormEvent, type MouseEvent, type ReactNode } from "react";
import { flushSync } from "react-dom";

const catalogNavigationStart = "lauril:catalog-navigation-start";

export function CatalogAutoForm({ children, className }: Readonly<{ children: ReactNode; className?: string }>) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const frame = useRef<number | null>(null);
  const navigationTarget = useRef<string | null>(null);
  const [isNavigating, setIsNavigating] = useState(false);
  const [, startTransition] = useTransition();

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
    if (frame.current !== null) cancelAnimationFrame(frame.current);
  }, []);

  useEffect(() => {
    if (!isNavigating || navigationTarget.current !== routeKey(pathname, searchParams.toString())) return;
    navigationTarget.current = null;
    setIsNavigating(false);
  }, [isNavigating, pathname, searchParams]);

  function navigateTo(destination: string) {
    const url = new URL(destination, window.location.origin);
    const target = routeKey(url.pathname, url.search);
    flushSync(() => {
      navigationTarget.current = target;
      setIsNavigating(true);
      window.dispatchEvent(new CustomEvent(catalogNavigationStart, { detail: target }));
    });
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      frame.current = requestAnimationFrame(() => {
        frame.current = null;
        startTransition(() => router.replace(destination, { scroll: false }));
      });
    });
  }

  function navigate(form: HTMLFormElement) {
    const query = new URLSearchParams();
    new FormData(form).forEach((value, key) => {
      if (typeof value === "string" && value) query.set(key, value);
    });
    query.delete("pagina");
    navigateTo(query.size ? `${pathname}?${query}` : pathname);
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
    const filterLink = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>(".catalog-sidebar__categories a[href], .fragrance-filter__selected a[href], .catalog-filter-panel__reset[href]") : null;
    if (!filterLink || filterLink.href === window.location.href) return;
    event.preventDefault();
    const destination = new URL(filterLink.href);
    navigateTo(`${destination.pathname}${destination.search}`);
  }

  return <form aria-busy={isNavigating} className={className} onChange={handleChange} onClickCapture={handleClick} onSubmit={handleSubmit}>{children}</form>;
}

export function CatalogProductArea({ children }: Readonly<{ children: ReactNode }>) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const navigationTarget = useRef<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    function handleNavigationStart(event: Event) {
      if (!(event instanceof CustomEvent) || typeof event.detail !== "string") return;
      navigationTarget.current = event.detail;
      setBusy(true);
    }

    window.addEventListener(catalogNavigationStart, handleNavigationStart);
    return () => window.removeEventListener(catalogNavigationStart, handleNavigationStart);
  }, []);

  useEffect(() => {
    if (!busy || navigationTarget.current !== routeKey(pathname, searchParams.toString())) return;
    navigationTarget.current = null;
    setBusy(false);
  }, [busy, pathname, searchParams]);

  return <div aria-busy={busy} className={`catalog-product-area${busy ? " is-loading" : ""}`}>
    {busy ? <div className="catalog-results-loading"><span aria-live="polite" className="catalog-inline-loading">Cargando...</span></div> : null}
    <div aria-hidden={busy || undefined} className="catalog-product-area__content">{children}</div>
  </div>;
}

function routeKey(pathname: string, search: string) {
  const query = new URLSearchParams(search);
  query.sort();
  return query.size ? `${pathname}?${query}` : pathname;
}
