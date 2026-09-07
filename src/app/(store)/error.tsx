"use client";

import Link from "next/link";

export default function StoreError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <section className="section store-error" role="alert">
    <p className="eyebrow">Algo salió mal</p>
    <h1>No pudimos cargar esta parte de la tienda.</h1>
    <p>Podés volver a intentarlo o regresar al catálogo.</p>
    <div className="order-navigation"><button className="button button--primary" onClick={reset} type="button">Reintentar</button><Link className="button button--secondary" href="/productos">Ir al catálogo</Link></div>
  </section>;
}
