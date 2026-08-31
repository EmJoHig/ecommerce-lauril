import Link from "next/link";

export default function NotFoundPage() {
  return <main className="not-found"><p className="eyebrow">404</p><h1>Esta página no está en la colección.</h1><Link className="button button--primary" href="/">Volver al inicio</Link></main>;
}
