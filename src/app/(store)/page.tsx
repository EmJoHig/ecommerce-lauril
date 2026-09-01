import Link from "next/link";
import { ProductCard } from "@/modules/catalog/presentation/product-card";
import { getCatalogService } from "@/modules/catalog/infrastructure/catalog-composition";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const catalog = getCatalogService();
  const [products, categories] = await Promise.all([
    catalog.listProducts({ featured: true, limit: 4 }),
    catalog.listCategories(),
  ]);

  return (
    <>
      <section className="hero">
        <div className="hero__copy">
          <p className="eyebrow">Objetos para el día a día</p>
          <h1>Lo cotidiano también puede sentirse especial.</h1>
          <p>
            Una selección de piezas nobles, simples y funcionales para acompañar
            tus rituales con belleza serena.
          </p>
          <Link className="button button--primary" href="/productos">
            Descubrir la colección
          </Link>
        </div>
        <div className="hero__visual" aria-hidden="true">
          <div className="hero__sun" />
          <div className="hero__vessel hero__vessel--one" />
          <div className="hero__vessel hero__vessel--two" />
          <span>hecho para quedarse</span>
        </div>
      </section>

      <section className="section" id="colecciones">
        <div className="section-heading">
          <div><p className="eyebrow">Explorá por universo</p><h2>Colecciones</h2></div>
          <Link className="text-link" href="/productos">Ver todo →</Link>
        </div>
        <div className="category-grid">
          {categories.slice(0, 3).map((category, index) => (
            <Link
              className={`category-tile category-tile--${index + 1}`}
              href={`/categorias/${category.slug}`}
              key={category.id}
            >
              <span>0{index + 1}</span>
              <h3>{category.name}</h3>
              <p>{category.description ?? "Piezas esenciales para todos los días."}</p>
            </Link>
          ))}
        </div>
      </section>

      <section className="section section--tint">
        <div className="section-heading">
          <div><p className="eyebrow">Nuestros elegidos</p><h2>Favoritos de la casa</h2></div>
          <Link className="text-link" href="/productos">Ver catálogo →</Link>
        </div>
        <div className="product-grid">
          {products.map((product) => <ProductCard key={product.id} product={product} />)}
        </div>
      </section>

      <section className="story" id="historia">
        <div className="story__number">01</div>
        <div>
          <p className="eyebrow">Nuestra forma de elegir</p>
          <h2>Menos cosas.<br />Mejores historias.</h2>
        </div>
        <p>
          Lauril nace de una idea simple: rodearnos de objetos honestos, útiles y
          bellos. Cada pieza se elige por su material, su oficio y la manera en que
          mejora un pequeño momento del día.
        </p>
      </section>
    </>
  );
}
