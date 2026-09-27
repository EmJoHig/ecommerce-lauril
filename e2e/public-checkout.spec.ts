import { expect, test } from "@playwright/test";
import { addProduct, checkCart, clearGuestCart, expectUsable, openAvailableProduct } from "./storefront-helpers";

for (const mobile of [false, true]) {
  test.describe(mobile ? "checkout mobile" : "checkout desktop", () => {
    if (mobile) test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

    test.afterEach(async ({ page }) => { await clearGuestCart(page); });

    test("carrito → autenticación requerida conserva carrito y retorno a checkout", async ({ page }) => {
      await page.goto("/productos");
      const product = await openAvailableProduct(page);
      await addProduct(page, product);
      await checkCart(page, product);
      const start = page.getByRole("main").getByRole("link", { name: "Iniciar compra", exact: true });
      await expectUsable(start, page);
      await start.click();
      await expect(page).toHaveURL(/\/login\?returnTo=\/checkout$/);
      await expect(page.getByRole("button", { name: "Ingresar", exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: "Confirmar pedido", exact: true })).toHaveCount(0);
      await expect(page.locator('input[name="returnTo"]')).toHaveValue("/checkout");
      await page.getByRole("link", { name: "Creala ahora", exact: true }).click();
      await expect(page).toHaveURL(/\/registro\?returnTo=\/checkout$/);
      await expect(page.locator('input[name="returnTo"]')).toHaveValue("/checkout");
      await expectUsable(page.getByRole("button", { name: "Crear cuenta", exact: true }), page);
      await checkCart(page, product);
      await page.reload();
      await checkCart(page, product);
      // Never submit authentication, checkout, or payment in the public suite.
    });
  });
}
