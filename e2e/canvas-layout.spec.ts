import { test, expect } from "@playwright/test";
test.beforeEach(async ({ page }) => {
  await page.route("**/access-gate.json", (r) =>
    r.fulfill({ json: { version: 1, enabled: false } }),
  );
});
test("default selection moves pieces, background clears selection, labels and rotation are independent", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Explore a sample/ }).click();
  const svg = page.locator('svg[aria-label="Interactive drawing annotations"]');
  await expect(svg.locator(".drawing-piece text")).toHaveCount(0);
  const polygon = svg.locator(".drawing-piece polygon").first(),
    original = await polygon.getAttribute("points");
  const point = await polygon.evaluate((element) => {
    const p = element as SVGPolygonElement,
      a = p.points.getItem(0),
      q = new DOMPoint(a.x + 20, a.y + 15).matrixTransform(p.getScreenCTM()!);
    return { x: q.x, y: q.y };
  });
  await page.mouse.move(point.x, point.y);
  await page.mouse.down();
  await page.mouse.move(point.x + 25, point.y + 15, { steps: 4 });
  await page.mouse.up();
  expect(await polygon.getAttribute("points")).not.toBe(original);
  await svg.click({ position: { x: 10, y: 10 } });
  await expect(svg.locator('.drawing-piece[data-selected="true"]')).toHaveCount(
    0,
  );
  await page
    .getByRole("button", { name: "Show piece labels", exact: true })
    .click();
  await expect(svg.locator(".drawing-piece text")).toHaveCount(6);
  await page.getByRole("button", { name: /Main kitchen run/ }).click();
  await page
    .getByRole("button", { name: "Rotation tool", exact: true })
    .click();
  await expect(page.getByLabel("Rotation (degrees)")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Move pieces", exact: true }),
  ).toHaveAttribute("aria-pressed", "false");
  await page.getByLabel("Rotation (degrees)").fill("20");
  await page
    .getByRole("button", { name: "Rotate selected", exact: true })
    .click();
  await expect(page.locator(".bottom-summary")).toContainText("56.65");
});
test("trackpad pinch zooms at the cursor and two-finger scroll pans without editing", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Explore a sample/ }).click();
  const svg = page.locator('svg[aria-label="Interactive drawing annotations"]');
  const original = await svg
    .locator(".drawing-piece polygon")
    .first()
    .getAttribute("points");
  await svg.dispatchEvent("wheel", {
    deltaY: -69.314718,
    deltaX: 0,
    ctrlKey: true,
    clientX: 500,
    clientY: 450,
    deltaMode: 0,
  });
  await expect(page.locator(".zoom span")).toHaveText("200%");
  const before = await svg.locator(":scope > g").getAttribute("transform");
  await svg.dispatchEvent("wheel", {
    deltaY: 40,
    deltaX: 20,
    ctrlKey: false,
    clientX: 500,
    clientY: 450,
    deltaMode: 0,
  });
  expect(await svg.locator(":scope > g").getAttribute("transform")).not.toBe(
    before,
  );
  await svg.evaluate((element) => {
    for (const [type, scale] of [
      ["gesturestart", 1],
      ["gesturechange", 1.5],
      ["gestureend", 1],
    ] as const) {
      const event = new Event(type, { bubbles: true, cancelable: true });
      Object.assign(event, { scale, clientX: 500, clientY: 450 });
      element.dispatchEvent(event);
    }
  });
  await expect(page.locator(".zoom span")).toHaveText("300%");
  await expect(svg.locator(".drawing-piece polygon").first()).toHaveAttribute(
    "points",
    original!,
  );
  await expect(page.getByRole("button", { name: /Undo \(/ })).toBeDisabled();
});
test("multiple editable drawing slabs stay behind pieces, save and undo", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Explore a sample/ }).click();
  await page
    .getByRole("button", { name: "Drawing slabs", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Add drawing slab", exact: true })
    .click();
  await page.getByLabel("Slab length (inches)", { exact: true }).fill("100");
  await page.getByLabel("Slab width (inches)", { exact: true }).fill("50");
  await page
    .getByRole("button", { name: "Add drawing slab", exact: true })
    .click();
  const svg = page.locator('svg[aria-label="Interactive drawing annotations"]');
  await expect(svg.locator(".drawing-slab")).toHaveCount(2);
  expect(
    await svg.evaluate((s) => {
      const slab = s.querySelector(".drawing-slab")!,
        piece = s.querySelector(".drawing-piece")!;
      return !!(
        slab.compareDocumentPosition(piece) & Node.DOCUMENT_POSITION_FOLLOWING
      );
    }),
  ).toBe(true);
  await expect(page.locator(".bottom-summary")).toContainText("56.65");
  await svg.scrollIntoViewIfNeeded();
  const point = await svg
    .locator(".drawing-slab")
    .first()
    .evaluate((e) => {
      const r = e as SVGRectElement,
        p = new DOMPoint(
          r.x.baseVal.value + 4,
          r.y.baseVal.value + 4,
        ).matrixTransform(r.getScreenCTM()!);
      return { x: p.x, y: p.y };
    });
  await page.mouse.move(point.x, point.y);
  await page.mouse.down();
  await page.mouse.move(point.x + 15, point.y + 10, { steps: 4 });
  await page.mouse.up();
  expect(await svg.locator(".drawing-slab").first().getAttribute("x")).not.toBe(
    "40",
  );
  await page.getByRole("button", { name: /Undo \(/ }).click();
  await expect(svg.locator(".drawing-slab").first()).toHaveAttribute("x", "40");
  await page.getByLabel("Slab 1 length", { exact: true }).fill("130");
  await page
    .getByRole("button", { name: "Update slab 1", exact: true })
    .click();
  await expect(svg.locator(".drawing-slab").first()).toHaveAttribute(
    "width",
    "260",
  );
  await page.getByRole("button", { name: /Undo \(/ }).click();
  await expect(svg.locator(".drawing-slab").first()).toHaveAttribute(
    "width",
    "252",
  );
  await page.reload();
  await page
    .getByRole("button", { name: /The Oakwood kitchen/ })
    .first()
    .click();
  await expect(svg.locator(".drawing-slab")).toHaveCount(2);
  await page
    .getByRole("button", { name: "Drawing slabs", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Delete slab 2", exact: true })
    .click();
  await expect(svg.locator(".drawing-slab")).toHaveCount(1);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("selection drags a CAD corner as a whole piece; vertex editing stays in the pen tool", async ({
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
  const polygon = page.locator(".drawing-piece polygon");
  await expect(page.locator(".drawing-piece circle")).toHaveCount(0);
  const initial = await polygon.getAttribute("points");
  const point = await polygon.evaluate((element) => {
    const p = element as SVGPolygonElement,
      q = p.points.getItem(0),
      r = new DOMPoint(q.x, q.y).matrixTransform(p.getScreenCTM()!);
    return { x: r.x, y: r.y };
  });
  await page.mouse.move(point.x, point.y);
  await page.mouse.down();
  await page.mouse.move(point.x + 20, point.y + 20, { steps: 4 });
  await page.mouse.up();
  expect(await polygon.getAttribute("points")).not.toBe(initial);
  await expect(page.locator(".piece-total")).toContainText("17.00");
  await page.getByRole("button", { name: /Undo \(/ }).click();
  await expect(polygon).toHaveAttribute("points", initial!);
});

test("a new project can start with a slab without an empty-canvas overlay", async ({
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
  await expect(page.locator(".drawing-slab")).toHaveCount(1);
  await expect(page.locator(".canvas-empty")).toHaveCount(0);
});
