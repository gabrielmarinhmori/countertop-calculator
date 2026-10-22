import { test, expect } from "@playwright/test";
test.beforeEach(async ({ page }) => {
  await page.route("**/access-gate.json", (r) =>
    r.fulfill({ json: { version: 1, enabled: false } }),
  );
});
test("manual pieces share imported slab scale and advanced panels stay collapsed", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New project", exact: true }).click();
  await page
    .locator("input[type=file]")
    .first()
    .setInputFiles("public/examples/gray-slab-countertop-inches.dxf");
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Select all", exact: true }).click();
  await dialog.getByLabel(/I verified the drawing units/).check();
  await dialog.getByRole("button", { name: "Import measured pieces" }).click();
  await expect(
    page.getByLabel("Surface category", { exact: true }),
  ).not.toBeVisible();
  await expect(
    page.getByLabel("Verified scale (inches per image pixel)", { exact: true }),
  ).not.toBeVisible();
  await page.getByText("Geometry and scale", { exact: true }).click();
  await expect(
    page.getByLabel("Verified scale (inches per image pixel)", { exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Delete");
  await expect(page.locator(".piece-row")).toHaveCount(0);
  await page.getByRole("button", { name: "Add piece", exact: true }).click();
  await page.getByRole("button", { name: "Island", exact: true }).click();
  await page.getByLabel("Length / overall X").fill("126");
  await page.getByLabel("Depth / width").fill("63");
  const size = await page.locator(".drawing-piece polygon").evaluate((e) => {
    const b = (e as SVGPolygonElement).getBBox();
    return { width: b.width, height: b.height };
  });
  const stock = page.locator(".drawing-slab");
  expect(size.width).toBeCloseTo(Number(await stock.getAttribute("width")), 6);
  expect(size.height).toBeCloseTo(
    Number(await stock.getAttribute("height")),
    6,
  );
  await expect(
    page.getByRole("region", { name: "Slab usage" }),
  ).not.toContainText("scales differ");
  await page.reload();
  await page
    .getByRole("button", { name: /Untitled kitchen/ })
    .first()
    .click();
  const restored = await page
    .locator(".drawing-piece polygon")
    .evaluate((e) => (e as SVGPolygonElement).getBBox().width);
  expect(restored).toBeCloseTo(size.width, 6);
});
test("Command/Ctrl copy and paste duplicate the selection as an undoable edit and keep text copying native", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Explore a sample/ }).click();
  await page.keyboard.press("Meta+c");
  await page.keyboard.press("Meta+v");
  await expect(page.locator(".piece-row")).toHaveCount(4);
  await expect(
    page.getByRole("button", { name: /Main kitchen run copy/ }),
  ).toBeVisible();
  await page.keyboard.press("Control+z");
  await expect(page.locator(".piece-row")).toHaveCount(3);
  await page.getByRole("button", { name: /Main kitchen run/ }).click();
  await page
    .getByRole("button", { name: /Kitchen island/ })
    .click({ modifiers: ["Shift"] });
  await page.keyboard.press("Control+c");
  await page.keyboard.press("Control+v");
  await expect(page.locator(".piece-row")).toHaveCount(5);
  await expect(
    page.locator('.drawing-piece[data-selected="true"]'),
  ).toHaveCount(2);
  await page.getByText("Piece settings", { exact: true }).click();
  await page.getByLabel("Piece name", { exact: true }).focus();
  await page.keyboard.press("Control+v");
  await expect(page.locator(".piece-row")).toHaveCount(5);
});

test("copy/paste supports a selected slab and undo restores the stock count", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New project", exact: true }).click();
  await page
    .getByRole("button", { name: "Drawing slabs", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Add drawing slab", exact: true })
    .click();
  await page.getByRole("button", { name: "Slab 1", exact: true }).click();
  await page.keyboard.press("Meta+c");
  await page.keyboard.press("Meta+v");
  await expect(page.locator(".drawing-slab")).toHaveCount(2);
  await expect(
    page.getByRole("button", { name: "Slab 1 copy", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Control+z");
  await expect(page.locator(".drawing-slab")).toHaveCount(1);
});
