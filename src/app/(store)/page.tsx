import Image from "next/image";
import Link from "next/link";
import { ProductCard } from "@/modules/catalog/presentation/product-card";
import { getCatalogService } from "@/modules/catalog/infrastructure/catalog-composition";
import { getPublicStoreSettings } from "@/modules/store-settings/infrastructure/store-settings-composition";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const catalog = getCatalogService();
  const [featuredProducts, products, categories, settings] = await Promise.all([
    catalog.listProducts({ featured: true, limit: 5 }),
    catalog.listProducts({ limit: 12 }),
    catalog.listCategories(),
    getPublicStoreSettings(),
  ]);
  const featured = featuredProducts.length > 0 ? featuredProducts : products.slice(0, 5);
  const heroProduct = featured.find((product) => product.imageUrl && product.imageUrl !== "/product-placeholder.svg") ?? featured[0];

  return (
    <>
      <section className="hero">
        <div className="hero__copy">
          <p className="eyebrow">{settings.storeName}</p>
          <h1>Pequeños detalles, grandes sensaciones.</h1>
          <p>
            Descubrí productos elegidos para transformar tus espacios y acompañar
            tus rituales de todos los días.
          </p>
          <Link className="button button--primary" href="/productos">
            Ver productos <span aria-hidden="true">→</span>
          </Link>
          <div className="hero__assurances"><span>Calidad Lauril</span><span>Compra segura</span><span>Entrega flexible</span></div>
        </div>
        <div className="hero__visual">
          {heroProduct ? <Image alt={heroProduct.imageAlt ?? heroProduct.name} fill priority sizes="(max-width: 960px) 100vw, 50vw" src={heroProduct.imageUrl ?? "/product-placeholder.svg"} /> : <div className="hero__fallback" aria-hidden="true"><span>L</span></div>}
          <div className="hero__visual-copy"><span>Selección destacada</span>{heroProduct ? <Link href={`/producto/${heroProduct.slug}`}>{heroProduct.name} →</Link> : null}</div>
        </div>
      </section>

      <section aria-label={`Beneficios de comprar en ${settings.storeName}`} className="store-benefits">
        <div><strong>Compra simple</strong><span>Elegí tus productos y confirmá en pocos pasos.</span></div>
        <div><strong>Stock actualizado</strong><span>Validamos disponibilidad antes de confirmar.</span></div>
        <div><strong>Entrega flexible</strong><span>Seleccioná entre los métodos disponibles.</span></div>
      </section>

      <section className="section home-categories" id="colecciones">
        <div className="section-heading">
          <div><p className="eyebrow">Explorá por universo</p><h2>Colecciones</h2></div>
          <Link className="text-link" href="/productos">Ver todo →</Link>
        </div>
        <div className="category-grid">
          {categories.slice(0, 3).map((category, index) => {
            const product = products.find((item) => item.categories.some((itemCategory) => itemCategory.slug === category.slug));
            return (
            <Link
              className={`category-tile category-tile--${index + 1}`}
              href={`/categorias/${category.slug}`}
              key={category.id}
            >
              {product ? <Image alt="" fill sizes="(max-width: 720px) 100vw, 33vw" src={product.imageUrl ?? "/product-placeholder.svg"} /> : null}
              <span className="category-tile__veil" />
              <div><span>0{index + 1}</span><h3>{category.name}</h3><p>{category.description ?? "Elegidos para todos los días."}</p><strong>Descubrir →</strong></div>
            </Link>
          );})}
        </div>
        {categories.length === 0 ? <div className="empty-state"><h2>Las colecciones estarán disponibles pronto</h2><p>Mientras tanto, podés recorrer todos los productos publicados.</p><Link className="button button--secondary" href="/productos">Ver catálogo</Link></div> : null}
      </section>

      <section className="section section--tint">
        <div className="section-heading">
          <div><p className="eyebrow">Nuestros elegidos</p><h2>Favoritos de la casa</h2></div>
          <Link className="text-link" href="/productos">Ver catálogo →</Link>
        </div>
        <div className="product-grid">
          {featured.map((product) => <ProductCard key={product.id} product={product} storeName={settings.storeName} />)}
        </div>
        {featured.length === 0 ? <div className="empty-state"><h2>Todavía no hay favoritos publicados</h2><p>Explorá el catálogo completo para descubrir la colección.</p><Link className="button button--secondary" href="/productos">Ver productos</Link></div> : null}
      </section>

      <section className="home-promo" id="historia">
        <div><p className="eyebrow">El universo {settings.storeName}</p><h2>Transformá tus espacios</h2><p>{settings.publicDescription ?? "Una selección que suma calidez, identidad y bienestar a cada momento."}</p><Link className="button button--primary" href="/productos">Descubrir la colección →</Link></div>
        {heroProduct ? <div className="home-promo__image"><Image alt="" fill sizes="(max-width: 720px) 100vw, 48vw" src={heroProduct.imageUrl ?? "/product-placeholder.svg"} /></div> : null}
      </section>
    </>
  );
}
