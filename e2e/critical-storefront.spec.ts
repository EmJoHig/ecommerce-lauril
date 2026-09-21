import { expect, test, type Locator, type Page } from "@playwright/test";

// Each test gets an isolated guest session. Mutations are limited to cart lines.
test.afterEach(async ({ page }) => {
  await page.goto("/carrito");
  await expect(page.getByRole("main").getByRole("heading", { level: 1 }))
    .toHaveText(/^(Carrito|Tu carrito está vacío)$/);
  const remove = page.getByRole("main").getByRole("button", { name: "Eliminar", exact: true });
  if (await remove.count()) {
    await remove.click();
  }
  await expect(page.getByRole("heading", { level: 1, name: "Tu carrito está vacío" }))
    .toBeVisible();
});

async function openAvailableProduct(page: Page) {
  await expect(page).toHaveURL(/\/productos$/);
  const card = page.getByRole("main").getByRole("article")
    .filter({ has: page.getByRole("button", { name: "Agregar al carrito", exact: true }) }).first();
  await expect(card, "El entorno necesita al menos un producto público disponible").toBeVisible();
  await card.getByRole("heading").getByRole("link").click();
  await expect(page).toHaveURL(/\/producto\/[^/?]+$/);
  const heading = page.getByRole("main").getByRole("heading", { level: 1 });
  await expect(heading).toBeVisible();
  await expect(page.getByRole("button", { name: "Agregar al carrito", exact: true })).toBeEnabled();
  // The current storefront exposes the default variant, without a variant selector.
  // Read its displayed price (excluding any crossed-out regular price).
  const price = page.locator(".product-detail__price strong");
  await expect(price).toHaveText(/\$/);
  return { name: (await heading.innerText()).trim(), price: (await price.innerText()).trim() };
}

async function addProduct(page: Page, product: { name: string; price: string }) {
  await expect(page.getByRole("spinbutton", { name: "Cantidad", exact: true })).toHaveValue("1");
  await page.getByRole("button", { name: "Agregar al carrito", exact: true }).click();
  const drawer = page.getByRole("dialog", { name: /^Mi carrito/ });
  await expect(drawer).toBeVisible();
  await expect(page.getByRole("button", { name: "Abrir carrito con 1 artículos", exact: true }))
    .toBeVisible();
  await expect(drawer.getByRole("heading", { name: product.name, exact: true })).toBeVisible();
  await expect(drawer.getByRole("article")).toHaveCount(1);
  await expect(drawer.getByRole("article").getByRole("spinbutton", { name: "Cantidad" })).toHaveValue("1");
  await expect(drawer.locator("dl > div").filter({ has: page.getByRole("term").filter({ hasText: /^Total parcial$/ }) })
    .getByRole("definition")).toHaveText(product.price);
  await drawer.getByRole("button", { name: "Cerrar carrito", exact: true }).click();
  await expect(drawer).toBeHidden();
}

async function checkCart(page: Page, product: { name: string; price: string }) {
  // The drawer has no link to /carrito; visit the public cart route directly.
  await page.goto("/carrito");
  const main = page.getByRole("main");
  await expect(main.getByRole("heading", { level: 1, name: "Carrito", exact: true })).toBeVisible();
  await expect(main.getByRole("article")).toHaveCount(1);
  const line = main.getByRole("article").filter({ has: page.getByRole("heading", { name: product.name, exact: true }) });
  await expect(line).toBeVisible();
  await expect(line.getByRole("spinbutton", { name: "Cantidad", exact: true })).toHaveValue("1");
  await expect(line.getByText(product.price, { exact: true })).toHaveCount(2);
  await expect(main.getByRole("complementary").locator("div")
    .filter({ has: page.getByText("Total parcial", { exact: true }) }))
    .toHaveText(`Total parcial${product.price}`);
  return line;
}

async function expectUsable(control: Locator, page: Page) {
  await expect(control).toBeVisible();
  await control.scrollIntoViewIfNeeded();
  await expect(control).toBeInViewport();
  await expect(control).toBeEnabled();
  const box = await control.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  await control.click({ trial: true });
}

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
