export default function CartLoading() {
  return (
    <section aria-busy="true" className="cart-page section">
      <div className="cart-heading">
        <p className="eyebrow">Tu selección</p>
        <h1>Cargando carrito…</h1>
      </div>
      <div className="cart-loading" />
    </section>
  );
}
