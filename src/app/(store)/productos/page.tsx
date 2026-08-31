import type { Metadata } from "next";
import Link from "next/link";
import { ProductCard } from "@/modules/catalog/presentation/product-card";
import { getCatalogService } from "@/modules/catalog/infrastructure/catalog-composition";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Tienda",
  description: "Explorá todos los productos y colecciones de Lauril.",
};

type ProductsPageProps = {
  searchParams: Promise<{ categoria?: string }>;
};

export default async function ProductsPage({ searchParams }: ProductsPageProps) {
  const { categoria } = await searchParams;
  const catalog = getCatalogService();
  const [products, categories] = await Promise.all([
    catalog.listProducts({ ...(categoria ? { categorySlug: categoria } : {}), limit: 48 }),
    catalog.listCategories(),
  ]);

  return (
    <section className="catalog-page section">
      <div className="catalog-intro">
        <p className="eyebrow">Catálogo Lauril</p>
        <h1>Piezas para hacer hogar</h1>
        <p>Materiales nobles, formas simples y una selección pensada para durar.</p>
      </div>
      <div className="filter-row" aria-label="Filtros por categoría">
        <Link className={!categoria ? "filter-chip filter-chip--active" : "filter-chip"} href="/productos">Todo</Link>
        {categories.map((category) => (
          <Link
            className={categoria === category.slug ? "filter-chip filter-chip--active" : "filter-chip"}
            href={`/productos?categoria=${category.slug}`}
            key={category.id}
          >
            {category.name}
          </Link>
        ))}
      </div>
      <p className="results-count">{products.length} productos</p>
      <div className="product-grid">
        {products.map((product) => <ProductCard key={product.id} product={product} />)}
      </div>
      {products.length === 0 ? (
        <div className="empty-state"><h2>No encontramos productos</h2><p>Probá con otra colección.</p></div>
      ) : null}
    </section>
  );
}
