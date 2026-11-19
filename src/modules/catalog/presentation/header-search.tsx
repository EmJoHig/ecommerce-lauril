"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ProductImage } from "@/shared/presentation/product-image";

export type HeaderSearchItem = Readonly<{
  name: string;
  slug: string;
  imageUrl: string | null;
  imageAlt: string;
}>;

export function HeaderSearch({ products }: { products: readonly HeaderSearchItem[] }) {
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const formId = useId();
  const resultsId = useId();
  useEffect(() => { if (mobileOpen) inputRef.current?.focus(); }, [mobileOpen]);
  const normalizedQuery = normalize(query.trim());
  const results = useMemo(
    () => normalizedQuery.length < 2
      ? []
      : products.filter((product) => normalize(product.name).includes(normalizedQuery)).slice(0, 5),
    [normalizedQuery, products],
  );
  const expanded = focused && normalizedQuery.length >= 2;

  return <div className="header-search-wrap" onKeyDown={(event) => { if (event.key === "Escape") setMobileOpen(false); }}>
    <button aria-controls={formId} aria-expanded={mobileOpen} aria-label={mobileOpen ? "Cerrar búsqueda" : "Abrir búsqueda"} className="header-search__toggle" onClick={() => setMobileOpen((open) => !open)} type="button"><SearchIcon /></button>
    <form action="/productos" className={mobileOpen ? "header-search header-search--open" : "header-search"} id={formId} role="search">
      <label className="sr-only" htmlFor="header-search">Buscar productos</label>
      <input
        aria-autocomplete="list"
        aria-controls={resultsId}
        aria-expanded={expanded}
        autoComplete="off"
        id="header-search"
        name="buscar"
        onBlur={() => window.setTimeout(() => setFocused(false), 120)}
        onChange={(event) => setQuery(event.target.value)}
        onFocus={() => setFocused(true)}
        placeholder="Buscar productos"
        ref={inputRef}
        role="combobox"
        type="search"
        value={query}
      />
      <button aria-label="Buscar" type="submit"><SearchIcon /></button>
    </form>
    {expanded ? <div className="header-search-results" id={resultsId} role="listbox">
      {results.length > 0 ? results.map((product) => <Link href={`/producto/${product.slug}`} key={product.slug} role="option">
        <span className="header-search-results__image"><ProductImage alt={product.imageAlt} sizes="52px" src={product.imageUrl} /></span>
        <strong>{product.name}</strong>
        <span aria-hidden="true">→</span>
      </Link>) : <p>No encontramos productos.</p>}
    </div> : null}
  </div>;
}

function normalize(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function SearchIcon() {
  return <svg aria-hidden="true" fill="none" height="19" viewBox="0 0 24 24" width="19"><circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="1.8"/><path d="m16 16 4 4" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8"/></svg>;
}
