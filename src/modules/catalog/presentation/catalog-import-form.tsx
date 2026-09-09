"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { catalogImportAction } from "./catalog-import-actions";
import {
  initialCatalogImportState,
  type CatalogImportActionState,
} from "./catalog-import-state";

export function CatalogImportForm() {
  const [file, setFile] = useState<File | null>(null);
  const [state, setState] = useState<CatalogImportActionState>(initialCatalogImportState);
  const [pending, startTransition] = useTransition();

  function submit(mode: "preview" | "confirm") {
    if (!file) {
      setState({ status: "error", message: "Seleccioná un archivo .xlsx." });
      return;
    }
    const formData = new FormData();
    formData.set("mode", mode);
    formData.set("file", file);
    startTransition(async () => setState(await catalogImportAction(formData)));
  }

  return <div className="admin-detail-grid">
    <section className="admin-panel">
      <div className="panel-heading"><div><p className="eyebrow">Archivo</p><h2>Seleccionar Excel</h2></div></div>
      <div className="form-grid">
        <label className="form-field form-field--wide">Archivo .xlsx
          <input accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" disabled={pending} onChange={(event) => { setFile(event.target.files?.[0] ?? null); setState(initialCatalogImportState); }} type="file" />
        </label>
      </div>
      <div className="form-actions">
        <button className="button button--dark" disabled={pending || !file} onClick={() => submit("preview")} type="button">{pending ? "Procesando…" : "Validar Excel"}</button>
        <Link className="button button--secondary" href="/admin/productos/importar/plantilla">Descargar Excel de ejemplo</Link>
      </div>
      {state.message ? <div className={state.status === "error" ? "form-error" : "action-success action-banner"} role="status">{state.message}</div> : null}
    </section>

    <section className="admin-panel">
      <div className="panel-heading"><div><p className="eyebrow">Validación</p><h2>Resumen</h2></div></div>
      {state.summary ? <dl className="detail-list"><dt>Productos válidos</dt><dd>{state.summary.products}</dd><dt>Categorías detectadas</dt><dd>{state.summary.categories.join(" · ") || "—"}</dd><dt>Fragancias detectadas</dt><dd>{state.summary.fragrances.length}</dd></dl> : <p>Validá un archivo para ver el resumen antes de confirmar.</p>}
      {state.errors?.length ? <div className="import-errors"><h3>Errores</h3><ul>{state.errors.map((error, index) => <li key={`${error.row}-${index}`}><strong>Fila {error.row}:</strong> {error.reason}</li>)}</ul></div> : null}
      {state.status === "preview" ? <div className="form-actions"><button className="button button--primary" disabled={pending} onClick={() => submit("confirm")} type="button">{pending ? "Importando…" : "Confirmar importación"}</button></div> : null}
      {state.result ? <dl className="detail-list"><dt>Creados</dt><dd>{state.result.created}</dd><dt>Actualizados</dt><dd>{state.result.updated}</dd><dt>Total procesado</dt><dd>{state.result.products}</dd><dt>Categorías con productos</dt><dd>{state.result.categories}</dd><dt>Fragancias</dt><dd>{state.result.fragrances}</dd></dl> : null}
    </section>
  </div>;
}
