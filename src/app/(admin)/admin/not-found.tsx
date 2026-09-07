import Link from "next/link";

export default function AdminNotFound() {
  return <section className="admin-panel empty-state"><h1>No encontramos este recurso</h1><p>Puede haber sido desactivado o el identificador no ser válido.</p><Link className="button button--dark" href="/admin">Volver al inicio</Link></section>;
}
