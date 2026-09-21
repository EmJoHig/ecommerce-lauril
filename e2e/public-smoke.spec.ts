import { expect, test } from "@playwright/test";

test("visitante navega desde home al catálogo público", async ({ page }) => {
  const response = await page.goto("/");
  expect(response?.ok()).toBe(true);

  await expect(page.getByRole("heading", {
    level: 1,
    name: "Transformá tus espacios. Aromas que acompañan cada momento.",
  })).toBeVisible();

  await page.getByRole("navigation", { name: "Navegación principal", exact: true })
    .getByRole("link", { name: "Productos", exact: true }).click();

  await expect(page).toHaveURL(/\/productos$/);
  await expect(page.getByRole("heading", { level: 1, name: "Todos los productos", exact: true }))
    .toBeVisible();
  await expect(page.getByRole("main").getByText(/^Mostrando \d+ de \d+ productos$/))
    .toBeVisible();
  await expect(page.getByRole("combobox", { name: "Ordenar por", exact: true }))
    .toBeVisible();
});
