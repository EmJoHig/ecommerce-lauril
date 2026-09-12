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

  return (
    <>
      <section className="hero">
        <div className="hero__copy">
          <p className="eyebrow">Aromas para disfrutar tu hogar</p>
          <h1>Transformá tus espacios. <span>Aromas que acompañan cada momento.</span></h1>
          <p>
            Descubrí la colección Lauril y elegí la fragancia ideal para renovar
            cada rincón de tu casa.
          </p>
          <Link className="button button--primary" href="/productos">
            Ver productos <span aria-hidden="true">→</span>
          </Link>
          {/* <div className="hero__assurances"><span>Calidad Lauril</span><span>Compra segura</span><span>Stock actualizado</span></div> */}
        </div>
        <div className="hero__visual">
          <Image alt="Brumas aromáticas textiles Lauril en un espacio luminoso" fill priority sizes="(max-width: 960px) 100vw, 54vw" src="/home/plx1.png" />
          <div className="hero__glow" aria-hidden="true" />
          <div className="hero__visual-copy"><span>PERFUMINAS - DIFUSORES - DESODORANTES</span><Link href="/productos">Elegí tu favorito →</Link></div>
        </div>
      </section>

      <section className="section home-categories" id="colecciones">
        <div className="section-heading">
          <div><p className="eyebrow">Explorá por categoría</p><h2>Aromas para cada rincón de tu hogar</h2></div>
          <Link className="text-link" href="/productos">Ver todo →</Link>
        </div>
        <div className="category-grid">
          {categories.slice(0, 3).map((category, index) => {
            const product = products.find((item) => item.categories.some((itemCategory) => itemCategory.slug === category.slug));
            const categoryKey = `${category.slug} ${category.name}`;
            let image = product?.imageUrl ?? "/product-placeholder.svg";

            if (/perfum|bruma/i.test(categoryKey)) {
              image = "/home/lauril-category-perfuminas.png";
            } else if (/desodor|piso/i.test(categoryKey)) {
              image = "/home/lauril-category-pisos.png";
            } else if (/difus/i.test(categoryKey)) {
              image = "/home/lauril-category-difusores.png";
            }
            return (
            <Link className={`category-tile category-tile--${index + 1}`} href={`/categorias/${category.slug}`} key={category.id}>
              <Image alt="" fill sizes="(max-width: 720px) 100vw, 33vw" src={image} />
              <span className="category-tile__veil" />
              <div><h3>{category.name}</h3><p>{category.description ?? "Fragancias para disfrutar todos los días."}</p><strong>Descubrir <span aria-hidden="true">→</span></strong></div>
            </Link>
          );})}
        </div>
        {categories.length === 0 ? <div className="empty-state"><h2>Las categorías estarán disponibles pronto</h2><p>Mientras tanto, podés recorrer todos los productos publicados.</p><Link className="button button--secondary" href="/productos">Ver catálogo</Link></div> : null}
      </section>

      <section className="home-featured">
        <div className="section-heading">
          <div><p className="eyebrow">Selección destacada</p><h2>Los más elegidos</h2></div>
          <Link className="button button--light" href="/productos">Ver todos →</Link>
        </div>
        <div className="product-grid">
          {featured.slice(0, 4).map((product) => <ProductCard key={product.id} product={product} storeName={settings.storeName} />)}
        </div>
        {featured.length === 0 ? <div className="empty-state"><h2>La selección estará disponible pronto</h2><p>Mientras tanto, podés recorrer el catálogo completo.</p></div> : null}
      </section>

      <section className="home-promo" id="historia">
        <div><p className="eyebrow">El universo {settings.storeName}</p><h2>Transformá tus espacios</h2><p>{settings.publicDescription ?? "Una selección que suma calidez, identidad y bienestar a cada momento."}</p><Link className="button button--primary" href="/productos">Descubrir la colección →</Link></div>
        <div className="home-promo__image"><Image alt="Bruma aromática textil Lauril Coco Vai" fill sizes="(max-width: 720px) 100vw, 48vw" src="/home/lauril-coco-vai.png" /></div>
      </section>
    </>
  );
}
