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
  return <section className="catalog-page section">
    <div className="catalog-intro"><p className="eyebrow">Catálogo {storeName}</p><h1>{heading}</h1><p>Materiales nobles, formas simples y una selección pensada para durar.</p></div>
    <form className="public-filters" id="buscar"><input aria-label="Buscar productos o SKU" defaultValue={search} name="buscar" placeholder="Buscar productos o SKU" type="search" />{currentCategory ? <input name="categoria" type="hidden" value={currentCategory} /> : <select defaultValue={currentCategory ?? ""} name="categoria"><option value="">Todas las categorías</option>{categories.map((category) => <option key={category.id} value={category.slug}>{category.name}</option>)}</select>}<select defaultValue={currentFragrance ?? ""} name="fragancia"><option value="">Todas las fragancias</option>{fragrances.map((fragrance) => <option key={fragrance.key} value={fragrance.key}>{fragrance.name}</option>)}</select><select defaultValue={sort || "featured"} name="orden"><option value="featured">Destacados</option><option value="newest">Más recientes</option><option value="name-asc">Nombre A–Z</option><option value="name-desc">Nombre Z–A</option></select><button className="button button--dark" type="submit">Buscar</button></form>
    <div className="filter-row" aria-label="Filtros por categoría"><Link className={!currentCategory ? "filter-chip filter-chip--active" : "filter-chip"} href={catalogHref({ fragrance: currentFragrance, search, sort })}>Todo</Link>{categories.map((category) => <Link className={currentCategory === category.slug ? "filter-chip filter-chip--active" : "filter-chip"} href={catalogHref({ category: category.slug, fragrance: currentFragrance, search, sort })} key={category.id}>{category.name}</Link>)}</div>
    <p className="results-count">{page.total} productos</p><div className="product-grid">{page.items.map((product) => <ProductCard key={product.id} product={product} storeName={storeName} />)}</div>
    {page.items.length === 0 ? <div className="empty-state"><h2>No encontramos productos</h2><p>Probá con otra búsqueda o categoría.</p></div> : null}
    <nav className="pagination pagination--store" aria-label="Paginación"><Link aria-disabled={page.page <= 1} href={publicPageHref({ page: page.page - 1, search, sort, category: currentCategory, fragrance: currentFragrance })}>← Anterior</Link><span>Página {page.page} de {page.pageCount}</span><Link aria-disabled={page.page >= page.pageCount} href={publicPageHref({ page: page.page + 1, search, sort, category: currentCategory, fragrance: currentFragrance })}>Siguiente →</Link></nav>
  </section>;
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
