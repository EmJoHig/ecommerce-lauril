"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import { normalizeSlug } from "../domain/product";
import { initialCatalogActionState } from "./catalog-action-state";
import { saveCategoryAction } from "./catalog-actions";
import { PendingButton } from "./pending-button";

type CategoryModel = {
  id?: string;
  parentId: string | null;
  name: string;
  slug: string;
  description: string;
  isActive: boolean;
  sortOrder: number;
};

export function CategoryForm({ initial, categories }: Readonly<{
  initial: CategoryModel;
  categories: Array<{ id: string; name: string; parentId: string | null }>;
}>) {
  const [state, action] = useActionState(saveCategoryAction, initialCatalogActionState);
  const [model, setModel] = useState(initial);
  const [slugTouched, setSlugTouched] = useState(Boolean(initial.id));
  const payload = useMemo(() => JSON.stringify(model), [model]);

  return (
    <form action={action} className="admin-form">
      <input name="payload" readOnly type="hidden" value={payload} />
      {state.status === "error" ? <div className="form-error" role="alert">{state.message}</div> : null}
      <section className="admin-panel form-section">
        <div className="form-grid form-grid--two">
          <label className="form-field">Nombre<input maxLength={160} onChange={(event) => { const name = event.target.value; setModel((current) => ({ ...current, name, ...(!slugTouched ? { slug: safeSlug(name) } : {}) })); }} required value={model.name} /></label>
          <label className="form-field">Slug<input maxLength={180} onChange={(event) => { setSlugTouched(true); setModel({ ...model, slug: event.target.value }); }} required value={model.slug} /></label>
          <label className="form-field form-field--wide">Descripción<textarea maxLength={10000} onChange={(event) => setModel({ ...model, description: event.target.value })} rows={5} value={model.description} /></label>
          <label className="form-field">Categoría padre<select onChange={(event) => setModel({ ...model, parentId: event.target.value || null })} value={model.parentId ?? ""}><option value="">Sin categoría padre</option>{categories.filter((category) => category.id !== model.id).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
          <label className="form-field">Orden<input min={0} onChange={(event) => setModel({ ...model, sortOrder: Number(event.target.value) })} type="number" value={model.sortOrder} /></label>
          <label className="check-field"><input checked={model.isActive} onChange={(event) => setModel({ ...model, isActive: event.target.checked })} type="checkbox" /> Categoría activa</label>
        </div>
      </section>
      <div className="sticky-actions"><Link className="button button--secondary" href="/admin/categorias">Cancelar</Link><PendingButton>{model.id ? "Guardar categoría" : "Crear categoría"}</PendingButton></div>
    </form>
  );
}

function safeSlug(value: string): string {
  try { return normalizeSlug(value); } catch { return ""; }
}
