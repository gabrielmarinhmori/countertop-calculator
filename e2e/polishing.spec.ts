import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
test.beforeEach(async ({ page }) => {
  await page.route("**/access-gate.json", (r) =>
    r.fulfill({ json: { version: 1, enabled: false } }),
  );
});
test("green CAD edges import as polishing, can toggle, persist and export directly", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New project", exact: true }).click();
  await page
    .locator("input[type=file]")
    .first()
    .setInputFiles("public/examples/polished-countertop-inches.dxf");
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Select all", exact: true }).click();
  await dialog.getByLabel(/I verified the drawing units/).check();
  await dialog.getByRole("button", { name: "Import measured pieces" }).click();
  await expect(page.locator('.polished-edge[stroke="#159447"]')).toHaveCount(4);
  await expect(
    page.locator(".bottom-summary > div").filter({ hasText: "Polished edges" }),
  ).toContainText("20.25 ft / 243.00 in");
  await page
    .getByRole("button", { name: "Polished edge tool", exact: true })
    .click();
  const first = page.locator(".polished-edge").first();
  await first.focus();
  await first.press("Enter");
  await expect(
    page.locator(".bottom-summary > div").filter({ hasText: "Polished edges" }),
  ).toContainText("12.25 ft / 147.00 in");
  await expect(
    page.getByRole("region", { name: "Polished edge tool controls" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "OK", exact: true }).click();
  await expect(page.locator('.polished-edge[stroke="#159447"]')).toHaveCount(3);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export PDF" }).click();
  const pdf = await download;
  expect(pdf.suggestedFilename()).toBe("countertop-report.pdf");
  const content = (await readFile((await pdf.path())!)).toString("latin1");
  expect(content).toContain("Polished edges: 12.25 ft / 147.00 in");
  await page.reload();
  await page
    .getByRole("button", { name: /Untitled kitchen/ })
    .first()
    .click();
  await expect(page.locator('.polished-edge[stroke="#159447"]')).toHaveCount(3);
  await expect(
    page.getByRole("button", { name: "Review & approve", exact: true }),
  ).toHaveCount(0);
});
test("polishing tool marks different pieces continuously until Escape", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Explore a sample/ }).click();
  await page
    .getByRole("button", { name: "Polished edge tool", exact: true })
    .click();
  const edges = page.locator(".polished-edge");
  await edges.nth(0).focus();
  await edges.nth(0).press("Enter");
  await edges.nth(6).focus();
  await edges.nth(6).press("Enter");
  await expect(page.locator('.polished-edge[stroke="#159447"]')).toHaveCount(2);
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("region", { name: "Polished edge tool controls" }),
  ).toHaveCount(0);
  await expect(page.locator(".polished-edge")).toHaveCount(2);
});
