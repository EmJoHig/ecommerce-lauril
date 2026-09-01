import Link from "next/link";
import type { CatalogCategory, CatalogProductPage } from "../application/product-catalog-repository";
import { ProductCard } from "./product-card";

export function PublicCatalog({ page, categories, currentCategory, search, sort, heading = "Piezas para hacer hogar" }: Readonly<{
  page: CatalogProductPage;
  categories: CatalogCategory[];
  currentCategory?: string | undefined;
  search: string;
  sort: string;
  heading?: string;
}>) {
  return <section className="catalog-page section">
    <div className="catalog-intro"><p className="eyebrow">Catálogo Lauril</p><h1>{heading}</h1><p>Materiales nobles, formas simples y una selección pensada para durar.</p></div>
    <form className="public-filters"><input defaultValue={search} name="buscar" placeholder="Buscar productos o SKU" type="search" />{currentCategory ? <input name="categoria" type="hidden" value={currentCategory} /> : <select defaultValue={currentCategory ?? ""} name="categoria"><option value="">Todas las categorías</option>{categories.map((category) => <option key={category.id} value={category.slug}>{category.name}</option>)}</select>}<select defaultValue={sort || "featured"} name="orden"><option value="featured">Destacados</option><option value="newest">Más recientes</option><option value="name-asc">Nombre A–Z</option><option value="name-desc">Nombre Z–A</option></select><button className="button button--dark" type="submit">Buscar</button></form>
    <div className="filter-row" aria-label="Filtros por categoría"><Link className={!currentCategory ? "filter-chip filter-chip--active" : "filter-chip"} href="/productos">Todo</Link>{categories.map((category) => <Link className={currentCategory === category.slug ? "filter-chip filter-chip--active" : "filter-chip"} href={`/categorias/${category.slug}`} key={category.id}>{category.name}</Link>)}</div>
    <p className="results-count">{page.total} productos</p><div className="product-grid">{page.items.map((product) => <ProductCard key={product.id} product={product} />)}</div>
    {page.items.length === 0 ? <div className="empty-state"><h2>No encontramos productos</h2><p>Probá con otra búsqueda o categoría.</p></div> : null}
    <nav className="pagination pagination--store" aria-label="Paginación"><Link aria-disabled={page.page <= 1} href={publicPageHref({ page: page.page - 1, search, sort, category: currentCategory })}>← Anterior</Link><span>Página {page.page} de {page.pageCount}</span><Link aria-disabled={page.page >= page.pageCount} href={publicPageHref({ page: page.page + 1, search, sort, category: currentCategory })}>Siguiente →</Link></nav>
  </section>;
}

function publicPageHref(input: { page: number; search: string; sort: string; category?: string | undefined }): string {
  const query = new URLSearchParams();
  if (input.search) query.set("buscar", input.search);
  if (input.sort && input.sort !== "featured") query.set("orden", input.sort);
  if (input.category) query.set("categoria", input.category);
  if (input.page > 1) query.set("pagina", String(input.page));
  const base = input.category ? `/categorias/${input.category}` : "/productos";
  return query.size > 0 ? `${base}?${query}` : base;
}
