"use client";

import { useFormStatus } from "react-dom";

export function PendingButton({ children, className = "button button--dark" }: Readonly<{
  children: React.ReactNode;
  className?: string;
}>) {
  const { pending } = useFormStatus();
  return <button className={className} disabled={pending} type="submit">{pending ? "Guardando…" : children}</button>;
}
