"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

export function NavigationLoading() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const routeKey = `${pathname}?${searchParams.toString()}`;

  return <NavigationLoadingState key={routeKey} />;
}

function NavigationLoadingState() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const start = () => setVisible(true);
    const end = () => setVisible(false);
    const handleClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const element = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
      if (!element || element.target === "_blank" || element.hasAttribute("download")) return;
      const destination = new URL(element.href, window.location.href);
      if (destination.origin !== window.location.origin || destination.href === window.location.href) return;
      if (destination.pathname === window.location.pathname && destination.search === window.location.search && destination.hash) return;
      start();
    };

    document.addEventListener("click", handleClick);
    window.addEventListener("lauril:navigation-start", start);
    window.addEventListener("lauril:navigation-end", end);
    return () => {
      document.removeEventListener("click", handleClick);
      window.removeEventListener("lauril:navigation-start", start);
      window.removeEventListener("lauril:navigation-end", end);
    };
  }, []);

  return visible ? <div aria-live="polite" className="navigation-loading"><span className="navigation-loading__spinner" /><strong>Cargando…</strong></div> : null;
}
