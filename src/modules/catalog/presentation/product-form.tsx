"use client";

import Image from "next/image";
import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import { normalizeSlug } from "../domain/product";
import { initialCatalogActionState } from "./catalog-action-state";
import { saveProductAction } from "./catalog-actions";
import { PendingButton } from "./pending-button";

export type ProductFormVariant = {
  clientId: string;
  id?: string;
  sku: string;
  name: string;
  price: string;
  promotionalPrice: string;
  cost: string;
  isDefault: boolean;
  isActive: boolean;
  initialStock: number;
  stockOnHand: number;
  stockReserved: number;
  minimumStock: number;
};

export type ProductFormImage = {
  id: string;
  url: string;
  altText: string;
  sortOrder: number;
};

export type ProductFormModel = {
  id?: string;
  name: string;
  slug: string;
  shortDescription: string;
  description: string;
  status: "DRAFT" | "ACTIVE" | "INACTIVE";
  featured: boolean;
  categoryIds: string[];
  variants: ProductFormVariant[];
  images: ProductFormImage[];
};

type CategoryOption = { id: string; name: string; isActive: boolean };

export function ProductForm({
  initial,
  categories,
}: Readonly<{ initial: ProductFormModel; categories: CategoryOption[] }>) {
  const [state, action] = useActionState(saveProductAction, initialCatalogActionState);
  const [model, setModel] = useState(initial);
  const [slugTouched, setSlugTouched] = useState(Boolean(initial.id));
  const payload = useMemo(
    () =>
      JSON.stringify({
        id: model.id,
        name: model.name,
        slug: model.slug,
        shortDescription: model.shortDescription,
        description: model.description,
        status: model.status,
        featured: model.featured,
        categoryIds: model.categoryIds,
        variants: model.variants.map((variant) => ({
          ...(variant.id ? { id: variant.id } : {}),
          sku: variant.sku,
          name: variant.name,
          price: variant.price,
          promotionalPrice: variant.promotionalPrice,
          cost: variant.cost,
          isDefault: variant.isDefault,
          isActive: variant.isActive,
          initialStock: variant.initialStock,
          minimumStock: variant.minimumStock,
        })),
        existingImages: model.images.map((image, sortOrder) => ({
          id: image.id,
          altText: image.altText,
          sortOrder,
        })),
      }),
    [model],
  );

  function setName(name: string) {
    setModel((current) => ({
      ...current,
      name,
      ...(!slugTouched ? { slug: safeSlug(name) } : {}),
    }));
  }

  function updateVariant(clientId: string, patch: Partial<ProductFormVariant>) {
    setModel((current) => ({
      ...current,
      variants: current.variants.map((variant) =>
        variant.clientId === clientId ? { ...variant, ...patch } : variant,
      ),
    }));
  }

  function selectDefault(clientId: string) {
    setModel((current) => ({
      ...current,
      variants: current.variants.map((variant) => ({
        ...variant,
        isDefault: variant.clientId === clientId,
        ...(variant.clientId === clientId ? { isActive: true } : {}),
      })),
    }));
  }

  function addVariant() {
    setModel((current) => ({
      ...current,
      variants: [
        ...current.variants,
        {
          clientId: crypto.randomUUID(),
          sku: "",
          name: "",
          price: "",
          promotionalPrice: "",
          cost: "",
          isDefault: false,
          isActive: true,
          initialStock: 0,
          stockOnHand: 0,
          stockReserved: 0,
          minimumStock: 0,
        },
      ],
    }));
  }

  function removeVariant(clientId: string) {
    setModel((current) => {
      const target = current.variants.find((variant) => variant.clientId === clientId);
      if (!target || target.id || current.variants.length === 1) return current;
      const variants = current.variants.filter((variant) => variant.clientId !== clientId);
      if (target.isDefault && variants[0]) variants[0] = { ...variants[0], isDefault: true, isActive: true };
      return { ...current, variants };
    });
  }

  function moveImage(index: number, direction: -1 | 1) {
    setModel((current) => {
      const target = index + direction;
      if (target < 0 || target >= current.images.length) return current;
      const images = [...current.images];
      [images[index], images[target]] = [images[target]!, images[index]!];
      return { ...current, images };
    });
  }

  return (
    <form action={action} className="admin-form" encType="multipart/form-data">
      <input name="payload" readOnly type="hidden" value={payload} />
      {state.status === "error" ? <div className="form-error" role="alert">{state.message}</div> : null}

      <section className="admin-panel form-section">
        <div className="panel-heading"><div><p className="eyebrow">Información</p><h2>Datos principales</h2></div></div>
        <div className="form-grid form-grid--two">
          <label className="form-field form-field--wide">Nombre<input maxLength={200} onChange={(event) => setName(event.target.value)} required value={model.name} /></label>
          <label className="form-field form-field--wide">Slug<input maxLength={180} onChange={(event) => { setSlugTouched(true); setModel({ ...model, slug: event.target.value }); }} required value={model.slug} /></label>
          <label className="form-field form-field--wide">Descripción corta<textarea maxLength={500} onChange={(event) => setModel({ ...model, shortDescription: event.target.value })} rows={3} value={model.shortDescription} /></label>
          <label className="form-field form-field--wide">Descripción completa<textarea maxLength={20000} onChange={(event) => setModel({ ...model, description: event.target.value })} rows={7} value={model.description} /></label>
          <label className="form-field">Estado<select onChange={(event) => setModel({ ...model, status: event.target.value as ProductFormModel["status"] })} value={model.status}><option value="DRAFT">Borrador</option><option value="ACTIVE">Activo</option><option value="INACTIVE">Inactivo</option></select></label>
          <label className="check-field"><input checked={model.featured} onChange={(event) => setModel({ ...model, featured: event.target.checked })} type="checkbox" /> Producto destacado</label>
        </div>
      </section>

      <section className="admin-panel form-section">
        <div className="panel-heading"><div><p className="eyebrow">Organización</p><h2>Categorías</h2></div><Link className="text-link" href="/admin/categorias/nueva">Nueva categoría</Link></div>
        <div className="check-grid">
          {categories.map((category) => (
            <label className="check-field" key={category.id}><input checked={model.categoryIds.includes(category.id)} onChange={(event) => setModel((current) => ({ ...current, categoryIds: event.target.checked ? [...current.categoryIds, category.id] : current.categoryIds.filter((id) => id !== category.id) }))} type="checkbox" />{category.name}{category.isActive ? "" : " (inactiva)"}</label>
          ))}
          {categories.length === 0 ? <p className="form-help">Creá una categoría para organizar el catálogo.</p> : null}
        </div>
      </section>

      <section className="admin-panel form-section">
        <div className="panel-heading"><div><p className="eyebrow">Unidades vendibles</p><h2>Variantes</h2></div><button className="button button--secondary" onClick={addVariant} type="button">Agregar variante</button></div>
        <div className="variant-editor-list">
          {model.variants.map((variant, index) => (
            <article className="variant-editor" key={variant.clientId}>
              <div className="variant-editor__heading"><strong>Variante {index + 1}</strong>{!variant.id && model.variants.length > 1 ? <button onClick={() => removeVariant(variant.clientId)} type="button">Quitar</button> : null}</div>
              <div className="form-grid form-grid--four">
                <label className="form-field">SKU<input maxLength={100} onChange={(event) => updateVariant(variant.clientId, { sku: event.target.value.toUpperCase() })} required value={variant.sku} /></label>
                <label className="form-field">Título<input maxLength={160} onChange={(event) => updateVariant(variant.clientId, { name: event.target.value })} required value={variant.name} /></label>
                <label className="form-field">Precio ARS<input inputMode="decimal" onChange={(event) => updateVariant(variant.clientId, { price: event.target.value })} placeholder="4100" required value={variant.price} /></label>
                <label className="form-field">Precio promocional<input inputMode="decimal" onChange={(event) => updateVariant(variant.clientId, { promotionalPrice: event.target.value })} placeholder="Opcional" value={variant.promotionalPrice} /></label>
                <label className="form-field">Costo<input inputMode="decimal" onChange={(event) => updateVariant(variant.clientId, { cost: event.target.value })} placeholder="Opcional" value={variant.cost} /></label>
                <label className="form-field">Stock mínimo<input min={0} onChange={(event) => updateVariant(variant.clientId, { minimumStock: Number(event.target.value) })} type="number" value={variant.minimumStock} /></label>
                {variant.id ? (
                  <div className="stock-readonly"><span>Físico <strong>{variant.stockOnHand}</strong></span><span>Reservado <strong>{variant.stockReserved}</strong></span><Link href="/admin/stock">Ajustar en inventario</Link></div>
                ) : (
                  <label className="form-field">Stock inicial<input min={0} onChange={(event) => updateVariant(variant.clientId, { initialStock: Number(event.target.value) })} type="number" value={variant.initialStock} /></label>
                )}
                <div className="variant-checks"><label className="check-field"><input checked={variant.isDefault} name="defaultVariant" onChange={() => selectDefault(variant.clientId)} type="radio" /> Predeterminada</label><label className="check-field"><input checked={variant.isActive} disabled={variant.isDefault} onChange={(event) => updateVariant(variant.clientId, { isActive: event.target.checked })} type="checkbox" /> Activa</label></div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="admin-panel form-section">
        <div className="panel-heading"><div><p className="eyebrow">Galería</p><h2>Imágenes</h2></div></div>
        <p className="form-help">La primera imagen es la principal. Formatos: JPG, PNG, WebP, AVIF o GIF; máximo 5 MB cada una.</p>
        <div className="image-editor-grid">
          {model.images.map((image, index) => (
            <article className="image-editor" key={image.id}>
              <div className="image-editor__preview"><Image alt={image.altText} fill sizes="180px" src={image.url} /></div>
              <span>{index === 0 ? "Principal" : `Posición ${index + 1}`}</span>
              <input aria-label="Texto alternativo" maxLength={250} onChange={(event) => setModel((current) => ({ ...current, images: current.images.map((item) => item.id === image.id ? { ...item, altText: event.target.value } : item) }))} value={image.altText} />
              <div><button disabled={index === 0} onClick={() => moveImage(index, -1)} type="button">←</button><button disabled={index === model.images.length - 1} onClick={() => moveImage(index, 1)} type="button">→</button><button onClick={() => setModel((current) => ({ ...current, images: current.images.filter((item) => item.id !== image.id) }))} type="button">Quitar</button></div>
            </article>
          ))}
        </div>
        <label className="form-field upload-field">Agregar imágenes<input accept="image/jpeg,image/png,image/webp,image/avif,image/gif" multiple name="images" type="file" /></label>
      </section>

      <div className="sticky-actions"><Link className="button button--secondary" href="/admin/productos">Cancelar</Link><PendingButton>{model.id ? "Guardar cambios" : "Crear producto"}</PendingButton></div>
    </form>
  );
}

function safeSlug(value: string): string {
  try {
    return normalizeSlug(value);
  } catch {
    return "";
  }
}
