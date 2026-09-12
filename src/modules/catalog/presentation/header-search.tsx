"use client";

import Image from "next/image";
import Link from "next/link";
import { useId, useMemo, useState } from "react";

export type HeaderSearchItem = Readonly<{
  name: string;
  slug: string;
  imageUrl: string | null;
  imageAlt: string;
}>;

export function HeaderSearch({ products }: { products: readonly HeaderSearchItem[] }) {
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const resultsId = useId();
  const normalizedQuery = normalize(query.trim());
  const results = useMemo(
    () => normalizedQuery.length < 2
      ? []
      : products.filter((product) => normalize(product.name).includes(normalizedQuery)).slice(0, 5),
    [normalizedQuery, products],
  );
  const expanded = focused && normalizedQuery.length >= 2;

  return <div className="header-search-wrap">
    <form action="/productos" className="header-search" role="search">
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
        role="combobox"
        type="search"
        value={query}
      />
      <button aria-label="Buscar" type="submit"><SearchIcon /></button>
    </form>
    {expanded ? <div className="header-search-results" id={resultsId} role="listbox">
      {results.length > 0 ? results.map((product) => <Link href={`/producto/${product.slug}`} key={product.slug} role="option">
        <span className="header-search-results__image"><Image alt={product.imageAlt} fill sizes="52px" src={product.imageUrl ?? "/product-placeholder.svg"} /></span>
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
