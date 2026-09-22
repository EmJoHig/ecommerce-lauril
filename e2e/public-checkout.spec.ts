import { expect, test, type Locator } from "@playwright/test";
import { addProduct, checkCart, clearGuestCart, expectUsable, openAvailableProduct } from "./storefront-helpers";

function cents(displayed: string): bigint {
  const normalized = displayed.replace(/\s/g, "");
  expect(normalized).toMatch(/^\$\d[\d.]*,\d{2}$/);
  return BigInt(normalized.replace(/[$.,]/g, ""));
}

async function expectEmptyRequired(field: Locator) {
  await expect(field).toBeVisible();
  await expect(field).toBeEditable();
  await expect(field).toHaveValue("");
  await expect(field).toHaveAttribute("required", "");
  expect(await field.evaluate((element: HTMLInputElement) => element.validity.valueMissing)).toBe(true);
}

for (const mobile of [false, true]) {
  test.describe(mobile ? "checkout mobile" : "checkout desktop", () => {
    if (mobile) test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

    test.afterEach(async ({ page }) => {
      await clearGuestCart(page);
    });

    test("catálogo → producto → carrito → checkout sin confirmar pedido", async ({ page }) => {
      await page.goto("/productos");
      const product = await openAvailableProduct(page);
      await addProduct(page, product);
      await checkCart(page, product);

      // Block any accidental checkout submission before it reaches the server.
      // Normal cart additions/removals remain available for setup and cleanup.
      const blockedSubmissions: string[] = [];
      await page.route("**/checkout", async (route) => {
        if (route.request().method() === "POST") {
          blockedSubmissions.push(route.request().method());
          await route.abort();
        } else {
          await route.continue();
        }
      });

      const start = page.getByRole("main").getByRole("link", { name: "Iniciar compra", exact: true });
      await expectUsable(start, page);
      await start.click();
      await expect(page).toHaveURL(/\/checkout$/);
      const main = page.getByRole("main");
      await expect(main.getByRole("heading", { level: 1, name: "Checkout", exact: true })).toBeVisible();
      const contact = main.locator(".checkout-card").filter({ has: page.getByRole("heading", { name: "Datos de contacto", exact: true }) });
      for (const label of ["Nombre", "Apellido", "Email", "Teléfono"]) {
        const field = contact.getByLabel(label, { exact: true });
        await expectEmptyRequired(field);
        if (mobile) await expectUsable(field, page);
      }
      await expect(contact.getByLabel("Email", { exact: true })).toHaveAttribute("type", "email");

      const summary = main.getByRole("complementary");
      const item = summary.locator(".checkout-summary__item");
      await expect(item).toHaveCount(1);
      await expect(item.getByText(product.name, { exact: true })).toBeVisible();
      await expect(item.locator("small")).toContainText(`1 × ${product.price}`);
      await expect(item.locator(":scope > strong")).toHaveText(product.price);
      const amount = (label: string) => summary.locator(":scope > div")
        .filter({ has: page.getByText(label, { exact: true }) }).locator(":scope > strong");
      await expect(amount("Subtotal")).toHaveText(product.price);

      const methods = main.locator(".checkout-option");
      await expect(methods.first(), "Se necesita al menos un método de entrega disponible").toBeVisible();
      const address = main.locator(".checkout-card").filter({ has: page.getByRole("heading", { name: "Datos de entrega", exact: true }) });
      const withAddress: number[] = [];
      const withoutAddress: number[] = [];
      for (let index = 0; index < await methods.count(); index++) {
        const method = methods.nth(index);
        const radio = method.getByRole("radio");
        if (mobile) await expectUsable(radio, page);
        await radio.check();
        await expect(radio).toBeChecked();
        await expect(main.getByRole("radio", { checked: true })).toHaveCount(1);
        const shipping = (await method.locator(":scope > strong").innerText()).trim();
        await expect(amount("Entrega")).toHaveText(shipping);
        await expect(amount("Subtotal")).toHaveText(product.price);
        expect(cents(await amount("Total").innerText())).toBe(cents(product.price) + cents(shipping));

        if (await address.count()) {
          withAddress.push(index);
          for (const label of ["Nombre del receptor", "Apellido del receptor", "Teléfono", "Calle", "Número", "Piso / departamento", "Localidad", "Provincia", "Código postal", "Referencias"]) {
            const field = address.getByLabel(label, { exact: true });
            await expect(field).toBeVisible();
            await expect(field).toBeEditable();
            if (mobile) await expectUsable(field, page);
          }
        } else {
          withoutAddress.push(index);
          await expect(main.getByLabel("Calle", { exact: true })).toHaveCount(0);
        }
      }
      expect(withAddress.length, "El entorno debe ofrecer entrega con dirección para cubrir sus campos").toBeGreaterThan(0);
      expect(withoutAddress.length, "El entorno debe ofrecer entrega sin dirección para cubrir su ocultamiento").toBeGreaterThan(0);
      // Exercise both transitions regardless of the methods' configured order.
      await methods.nth(withAddress[0]!).getByRole("radio").check();
      await expect(address).toBeVisible();
      await methods.nth(withoutAddress[0]!).getByRole("radio").check();
      await expect(address).toHaveCount(0);
      await methods.nth(withAddress[0]!).getByRole("radio").check();
      await expect(address).toBeVisible();

      // trial checks actionability without dispatching a click or submitting.
      await expectUsable(summary.getByRole("button", { name: "Confirmar pedido", exact: true }), page);
      if (mobile) {
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);
      }
      await expect(page).toHaveURL(/\/checkout$/);
      expect(blockedSubmissions, "El recorrido no debe intentar confirmar el pedido").toEqual([]);
    });
  });
}
