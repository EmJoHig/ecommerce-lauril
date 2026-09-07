"use client";

export default function AdminError({ reset }: Readonly<{ error: Error & { digest?: string }; reset: () => void }>) {
  return <section className="admin-panel empty-state"><h1>No pudimos cargar esta sección</h1><p>Reintentá. Si el problema continúa, revisá los logs estructurados del servidor.</p><button className="button button--dark" onClick={reset} type="button">Reintentar</button></section>;
}
