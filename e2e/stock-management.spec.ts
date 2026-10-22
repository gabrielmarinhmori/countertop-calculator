import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
test.beforeEach(async ({ page }) => {
  await page.route("**/access-gate.json", (r) =>
    r.fulfill({ json: { version: 1, enabled: false } }),
  );
});
test("gray DXF stock imports separately, reports usage, renames and locks across reload", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New project", exact: true }).click();
  await page
    .locator("input[type=file]")
    .first()
    .setInputFiles("public/examples/gray-slab-countertop-inches.dxf");
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("Surface category 2")).toHaveValue("slab");
  await dialog.getByRole("button", { name: "Select all", exact: true }).click();
  await dialog.getByLabel(/I verified the drawing units/).check();
  await dialog.getByRole("button", { name: "Import measured pieces" }).click();
  await expect(page.locator(".piece-row")).toHaveCount(1);
  await expect(page.locator(".drawing-slab")).toHaveCount(1);
  const usage = page.getByRole("region", { name: "Slab usage" });
  await expect(usage).toContainText("Total: 55.13 sq ft");
  await expect(usage).toContainText("Used: 17.00 sq ft (30.8%)");
  await expect(usage).toContainText("Remaining: 38.13 sq ft (69.2%)");
  await page
    .getByRole("button", { name: "Drawing slabs", exact: true })
    .click();
  await page.getByLabel("Slab 1 name", { exact: true }).fill("Quartz kitchen");
  await page.getByLabel("Slab 1 name", { exact: true }).press("Tab");
  await page.getByRole("button", { name: "Lock slab 1", exact: true }).click();
  const stock = page.locator(".drawing-slab");
  await expect(stock).toHaveAttribute("data-locked", "true");
  const initial = await stock.getAttribute("x");
  await stock.scrollIntoViewIfNeeded();
  const p = await stock.evaluate((e) => {
    const r = e as SVGRectElement,
      p = new DOMPoint(
        r.x.baseVal.value + 8,
        r.y.baseVal.value + 8,
      ).matrixTransform(r.getScreenCTM()!);
    return { x: p.x, y: p.y };
  });
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await page.mouse.move(p.x + 25, p.y + 10, { steps: 4 });
  await page.mouse.up();
  await expect(stock).toHaveAttribute("x", initial!);
  await page.reload();
  await page
    .getByRole("button", { name: /Untitled kitchen/ })
    .first()
    .click();
  await expect(stock).toHaveAttribute("data-locked", "true");
  await expect(usage).toContainText("Quartz kitchen");
});
test("Delete removes a selected group and undo restores it; input editing stays native", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Explore a sample/ }).click();
  await page
    .getByRole("button", { name: /Kitchen island/ })
    .click({ modifiers: ["Shift"] });
  await page.keyboard.press("Delete");
  await expect(page.locator(".piece-row")).toHaveCount(1);
  await page.keyboard.press("Control+z");
  await expect(page.locator(".piece-row")).toHaveCount(3);
  await page.getByRole("button", { name: /Main kitchen run/ }).click();
  await page.getByLabel("Length / overall X").focus();
  await page.keyboard.press("Delete");
  await expect(page.locator(".piece-row")).toHaveCount(3);
});
test("moving overlapping counters updates total and PDF without double-counting", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New project", exact: true }).click();
  for (let i = 0; i < 2; i++) {
    await page
      .getByRole("button", {
        name: i === 0 ? "Add a piece" : "Add piece",
        exact: true,
      })
      .click();
    await page.getByRole("button", { name: "Island", exact: true }).click();
    await page.getByLabel("Length / overall X").fill("100");
    await page.getByLabel("Depth / width").fill("50");
  }
  // New manual pieces are 260 drawing pixels apart (130 inches); move the second to a 50-inch offset.
  await page.keyboard.press("Tab");
  for (let i = 0; i < 40; i++) await page.keyboard.press("Shift+ArrowLeft");
  await expect(page.locator(".bottom-summary")).toContainText("52.08");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export PDF", exact: true }).click();
  const pdf = await download;
  const text = (await readFile((await pdf.path())!)).toString("latin1");
  expect(text).toContain("Total surface area: 52.08 sq ft");
  await page.keyboard.press("Control+z");
  await expect(page.locator(".bottom-summary")).toContainText("52.78");
});
