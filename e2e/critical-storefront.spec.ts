import { expect, test } from "@playwright/test";
import { addProduct, checkCart, clearGuestCart, expectUsable, openAvailableProduct } from "./storefront-helpers";

// Each test gets an isolated guest session. Mutations are limited to cart lines.
test.afterEach(async ({ page }) => {
  await clearGuestCart(page);
});

test("catálogo → ficha → carrito conserva producto, cantidad y total", async ({ page }) => {
  await page.goto("/productos");
  const product = await openAvailableProduct(page);
  await addProduct(page, product);
  await checkCart(page, product);
});

test("carrito persiste al navegar y recargar; eliminar deja el carrito vacío", async ({ page }) => {
  await page.goto("/productos");
  const product = await openAvailableProduct(page);
  await addProduct(page, product);
  await page.getByRole("link", { name: "← Volver al catálogo", exact: true }).click();
  await expect(page).toHaveURL(/\/productos$/);
  await page.reload();
  const line = await checkCart(page, product);
  await line.getByRole("button", { name: "Eliminar", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Tu carrito está vacío" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Abrir carrito con 0 artículos", exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name: "Tu carrito está vacío" })).toBeVisible();
});

test.describe("responsive público", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test("home → catálogo → producto → carrito mantiene navegación y CTA utilizables", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("main").getByRole("heading", { level: 1 })).toBeVisible();
    const menu = page.getByLabel("Abrir menú", { exact: true });
    await expectUsable(menu, page);
    await menu.click();
    const products = page.getByRole("navigation", { name: "Navegación mobile", exact: true })
      .getByRole("link", { name: "Productos", exact: true });
    await expectUsable(products, page);
    await products.click();
    await expect(page).toHaveURL(/\/productos$/);
    // The shared layout can keep the native details menu open across navigation.
    if (await products.isVisible()) await menu.click();
    await expect(page.getByRole("heading", { level: 1, name: "Todos los productos", exact: true })).toBeVisible();
    const product = await openAvailableProduct(page);
    await expectUsable(page.getByRole("button", { name: "Agregar al carrito", exact: true }), page);
    await addProduct(page, product);
    const cart = page.getByRole("button", { name: "Abrir carrito con 1 artículos", exact: true });
    await expectUsable(cart, page);
    await cart.click();
    await expect(page.getByRole("dialog", { name: /^Mi carrito/ })).toBeVisible();
    await page.getByRole("dialog").getByRole("button", { name: "Cerrar carrito", exact: true }).click();
    const line = await checkCart(page, product);
    // Check actionability without entering checkout or creating an order.
    await expectUsable(page.getByRole("main").getByRole("link", { name: "Iniciar compra", exact: true }), page);
    const remove = line.getByRole("button", { name: "Eliminar", exact: true });
    await expectUsable(remove, page);
    await remove.click();
    await expect(page.getByRole("heading", { level: 1, name: "Tu carrito está vacío" })).toBeVisible();
    await expectUsable(page.getByRole("main").getByRole("link", { name: "Ver productos", exact: true }), page);
  });
});
