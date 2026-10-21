import { test, expect } from "@playwright/test";
test.beforeEach(async ({ page }) => {
  await page.route("**/access-gate.json", (r) =>
    r.fulfill({ json: { version: 1, enabled: false } }),
  );
});
test("separate slab workspace packs with rotation and persists settings without invalidating approval", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New project", exact: true }).click();
  await page
    .locator("input[type=file]")
    .first()
    .setInputFiles("public/examples/sample-countertop-inches.dxf");
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Select all", exact: true }).click();
  await dialog.getByLabel(/I verified the drawing units/).check();
  await dialog.getByRole("button", { name: "Import measured pieces" }).click();
  await page
    .getByRole("button", { name: "Review & approve", exact: true })
    .click();
  await page.getByRole("button", { name: "Approve project snapshot" }).click();
  await page
    .getByRole("button", { name: "Slab planning", exact: true })
    .click();
  await page.getByLabel("Slab length (inches)").fill("30");
  await page.getByLabel("Slab width (inches)").fill("100");
  await page.getByRole("button", { name: "Calculate slab layout" }).click();
  await expect(page.locator(".slab-summary")).toContainText(
    "1 slab in this layout",
  );
  await expect(page.locator(".slab-legend")).toContainText("90°");
  await expect(
    page.getByText("Approved snapshot", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("Lock rotation", { exact: true }).check();
  await expect(page.getByRole("status")).toContainText("Recalculate");
  await page.getByRole("button", { name: "Calculate slab layout" }).click();
  await expect(page.getByRole("alert")).toContainText("Incomplete plan");
  await page.getByLabel("Lock rotation", { exact: true }).uncheck();
  await page.getByRole("button", { name: "Calculate slab layout" }).click();
  await expect(page.getByRole("img", { name: "Slab 1 layout" })).toBeVisible();
  await page.reload();
  await page
    .getByRole("button", { name: /Untitled kitchen/ })
    .first()
    .click();
  await page
    .getByRole("button", { name: "Slab planning", exact: true })
    .click();
  await expect(page.getByLabel("Slab length (inches)")).toHaveValue("30");
  await expect(page.getByLabel("Slab width (inches)")).toHaveValue("100");
});
test("empty slab selection does not produce a false zero-slab estimate", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Explore a sample/ }).click();
  await page
    .getByRole("button", { name: "Slab planning", exact: true })
    .click();
  await page.getByLabel("Slab length (inches)").fill("140");
  await page.getByLabel("Slab width (inches)").fill("90");
  await page.getByRole("button", { name: "Clear pieces" }).click();
  await page.getByRole("button", { name: "Calculate slab layout" }).click();
  await expect(page.getByRole("alert")).toContainText("Select at least");
  await expect(page.locator(".slab-summary")).toHaveCount(0);
  await page.getByRole("button", { name: "Select all pieces" }).click();
  await page.getByRole("button", { name: "Calculate slab layout" }).click();
  await expect(page.locator(".slab-sheet")).toHaveCount(2);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "/tmp/countertop-slab-plan-mobile.png",
    fullPage: true,
  });
});
