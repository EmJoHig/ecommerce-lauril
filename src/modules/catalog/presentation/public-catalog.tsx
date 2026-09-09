import Image from "next/image";
import Link from "next/link";
import type { CatalogCategory, CatalogFragrance, CatalogProductPage } from "../application/product-catalog-repository";
import { ProductCard } from "./product-card";

export function PublicCatalog({ page, categories, fragrances, currentCategory, currentFragrance, search, sort, storeName, heading = "Piezas para hacer hogar" }: Readonly<{
  page: CatalogProductPage;
  categories: CatalogCategory[];
  fragrances: CatalogFragrance[];
  currentCategory?: string | undefined;
  currentFragrance?: string | undefined;
  search: string;
  sort: string;
  storeName: string;
  heading?: string;
}>) {
  return <section className="catalog-page">
    <div className="catalog-hero">
      <div className="catalog-intro"><nav aria-label="Breadcrumb"><Link href="/">Inicio</Link><span>›</span><span>Tienda</span></nav><p className="eyebrow">Catálogo {storeName}</p><h1>{heading === "Piezas para hacer hogar" ? `Tienda ${storeName}` : heading}</h1><p>Descubrí una selección pensada para transformar tus espacios y acompañar cada momento.</p></div>
      <div className="catalog-hero__image"><Image alt="" fill priority sizes="(max-width: 720px) 100vw, 42vw" src="/home/lauril-perfuminas.png" /></div>
    </div>
    <div className="catalog-content section">
      <details className="catalog-filters-mobile">
        <summary><FilterIcon /> Filtros <span aria-hidden="true">+</span></summary>
        <div><FilterPanel categories={categories} currentCategory={currentCategory} currentFragrance={currentFragrance} fragrances={fragrances} search={search} sort={sort} /></div>
      </details>
      <div className="catalog-layout">
        <aside className="catalog-sidebar">
          <FilterPanel categories={categories} currentCategory={currentCategory} currentFragrance={currentFragrance} fragrances={fragrances} search={search} sort={sort} />
        </aside>
        <div className="catalog-results">
          <div className="catalog-toolbar"><p>Mostrando {page.items.length} de {page.total} productos</p><form><input name="buscar" type="hidden" value={search} />{currentCategory ? <input name="categoria" type="hidden" value={currentCategory} /> : null}{currentFragrance ? <input name="fragancia" type="hidden" value={currentFragrance} /> : null}<label>Ordenar por <select defaultValue={sort || "featured"} name="orden"><option value="featured">Más relevantes</option><option value="newest">Más recientes</option><option value="name-asc">Nombre A–Z</option><option value="name-desc">Nombre Z–A</option></select></label><button className="sr-only" type="submit">Ordenar</button></form></div>
          <div className="product-grid">{page.items.map((product) => <ProductCard key={product.id} product={product} storeName={storeName} />)}</div>
          {page.items.length === 0 ? <div className="empty-state"><h2>No encontramos productos</h2><p>Probá con otra búsqueda o categoría.</p></div> : null}
          <nav className="pagination pagination--store" aria-label="Paginación"><Link aria-disabled={page.page <= 1} href={publicPageHref({ page: page.page - 1, search, sort, category: currentCategory, fragrance: currentFragrance })}>← Anterior</Link><span>Página {page.page} de {page.pageCount}</span><Link aria-disabled={page.page >= page.pageCount} href={publicPageHref({ page: page.page + 1, search, sort, category: currentCategory, fragrance: currentFragrance })}>Siguiente →</Link></nav>
        </div>
      </div>
    </div>
  </section>;
}

function FilterPanel({ categories, fragrances, currentCategory, currentFragrance, search, sort }: Readonly<{
  categories: CatalogCategory[];
  fragrances: CatalogFragrance[];
  currentCategory?: string | undefined;
  currentFragrance?: string | undefined;
  search: string;
  sort: string;
}>) {
  return <>
    <form className="public-filters">
      <label>Buscar<input aria-label="Buscar productos o SKU" defaultValue={search} name="buscar" placeholder="Producto o SKU" type="search" /></label>
      {currentCategory ? <input name="categoria" type="hidden" value={currentCategory} /> : null}
      <label>Fragancias<select defaultValue={currentFragrance ?? ""} name="fragancia"><option value="">Todas las fragancias</option>{fragrances.map((fragrance) => <option key={fragrance.key} value={fragrance.key}>{fragrance.name}</option>)}</select></label>
      <label className="catalog-sidebar__sort">Ordenar<select defaultValue={sort || "featured"} name="orden"><option value="featured">Más relevantes</option><option value="newest">Más recientes</option><option value="name-asc">Nombre A–Z</option><option value="name-desc">Nombre Z–A</option></select></label>
      <button className="button button--primary" type="submit">Aplicar filtros</button>
    </form>
    <nav aria-label="Categorías" className="catalog-sidebar__categories"><strong>Categorías</strong><Link className={!currentCategory ? "is-active" : ""} href={catalogHref({ fragrance: currentFragrance, search, sort })}>Todas <span>→</span></Link>{categories.map((category) => <Link className={currentCategory === category.slug ? "is-active" : ""} href={catalogHref({ category: category.slug, fragrance: currentFragrance, search, sort })} key={category.id}>{category.name}<span>→</span></Link>)}</nav>
  </>;
}

function FilterIcon() {
  return <svg aria-hidden="true" fill="none" height="18" viewBox="0 0 24 24" width="18"><path d="M4 7h16M7 12h10M10 17h4" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" /></svg>;
}

function publicPageHref(input: { page: number; search: string; sort: string; category?: string | undefined; fragrance?: string | undefined }): string {
  const query = new URLSearchParams();
  if (input.search) query.set("buscar", input.search);
  if (input.sort && input.sort !== "featured") query.set("orden", input.sort);
  if (input.category) query.set("categoria", input.category);
  if (input.fragrance) query.set("fragancia", input.fragrance);
  if (input.page > 1) query.set("pagina", String(input.page));
  const base = input.category ? `/categorias/${input.category}` : "/productos";
  return query.size > 0 ? `${base}?${query}` : base;
}

function catalogHref(input: { category?: string | undefined; fragrance?: string | undefined; search?: string | undefined; sort?: string | undefined }): string {
  return publicPageHref({ page: 1, search: input.search ?? "", sort: input.sort ?? "featured", category: input.category, fragrance: input.fragrance });
}
