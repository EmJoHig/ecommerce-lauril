"use client";

export default function AdminOrdersError({ reset }: Readonly<{ error: Error & { digest?: string }; reset: () => void }>) {
  return <div className="empty-state"><h2>No pudimos cargar los pedidos</h2><p>Revisá la conexión y volvé a intentar.</p><button className="button button--dark" onClick={reset} type="button">Reintentar</button></div>;
}
