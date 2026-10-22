import { test, expect } from "@playwright/test";
test.beforeEach(async ({ page }) => {
  await page.route("**/access-gate.json", (r) =>
    r.fulfill({ json: { version: 1, enabled: false } }),
  );
});
test("keyboard nudge, group rotation, drag undo and redo preserve measurements", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Explore a sample/ }).click();
  const first = page.locator(".drawing-piece").nth(0).locator("polygon");
  const initial = await first.getAttribute("points");
  await page.getByRole("button", { name: "Move pieces", exact: true }).click();
  await page.keyboard.press("ArrowRight");
  const nudged = await first.getAttribute("points");
  expect(nudged).not.toBe(initial);
  const x = (p: string | null) => Number(p!.split(/[ ,]/)[0]);
  expect(x(nudged) - x(initial)).toBeCloseTo(2);
  await page.keyboard.press("Shift+ArrowDown");
  expect(
    Number((await first.getAttribute("points"))!.split(/[ ,]/)[1]) -
      Number(initial!.split(/[ ,]/)[1]),
  ).toBeCloseTo(4);
  await page.keyboard.press("Control+z");
  await expect(first).toHaveAttribute("points", nudged!);
  await page.keyboard.press("Meta+z");
  await expect(first).toHaveAttribute("points", initial!);
  await page.keyboard.press("Control+Shift+z");
  await expect(first).toHaveAttribute("points", nudged!);
  await page
    .getByRole("button", { name: /Kitchen island/ })
    .click({ modifiers: ["Shift"] });
  await expect(page.getByText("2 selected", { exact: true })).toBeVisible();
  await page.getByLabel("Rotation (degrees)").fill("37");
  await page
    .getByRole("button", { name: "Rotate selected", exact: true })
    .click();
  await expect(page.locator(".bottom-summary")).toContainText("56.65");
  const rotated = await first.getAttribute("points");
  await page.getByRole("button", { name: /Undo \(/ }).click();
  await expect(first).toHaveAttribute("points", nudged!);
  await page.getByRole("button", { name: /Redo \(/ }).click();
  await expect(first).toHaveAttribute("points", rotated!);
  await page.getByRole("button", { name: "Snap magnet", exact: true }).click();
  const point = await first.evaluate((element) => {
    const polygon = element as SVGPolygonElement;
    const a = polygon.points.getItem(0),
      b = polygon.points.getItem(1),
      c = polygon.points.getItem(2);
    const p = new DOMPoint(
      a.x * 0.75 + b.x * 0.2 + c.x * 0.05,
      a.y * 0.75 + b.y * 0.2 + c.y * 0.05,
    ).matrixTransform(polygon.getScreenCTM()!);
    return { x: p.x, y: p.y };
  });
  await page.mouse.move(point.x, point.y);
  await page.mouse.down();
  await page.mouse.move(point.x + 25, point.y + 25, { steps: 6 });
  await page.mouse.up();
  const dragged = await first.getAttribute("points");
  expect(dragged).not.toBe(rotated);
  await page.keyboard.press("Control+z");
  await expect(first).toHaveAttribute("points", rotated!);
  await page.reload();
  await page
    .getByRole("button", { name: /The Oakwood kitchen/ })
    .first()
    .click();
  await expect(first).toHaveAttribute("points", rotated!);
});
test("manual polygon vertex additions can be undone without losing earlier vertices", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New project", exact: true }).click();
  await page.getByRole("button", { name: "Add a piece", exact: true }).click();
  await page.getByRole("button", { name: "Polygon", exact: true }).click();
  const svg = page.locator('svg[aria-label="Interactive drawing annotations"]');
  await svg.click({ position: { x: 40, y: 60 } });
  await svg.click({ position: { x: 160, y: 60 } });
  await svg.click({ position: { x: 160, y: 160 } });
  const polygon = page.locator(".drawing-piece polygon");
  const before = await polygon.getAttribute("points");
  await svg.click({ position: { x: 80, y: 100 } });
  expect(await polygon.getAttribute("points")).not.toBe(before);
  await page.keyboard.press("Control+z");
  await expect(polygon).toHaveAttribute("points", before!);
});
test("two-finger pinch zooms and pans on mobile without modifying pieces", async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: /Explore a sample/ }).click();
  await page.getByRole("button", { name: "Move pieces", exact: true }).click();
  const svg = page.locator('svg[aria-label="Interactive drawing annotations"]');
  await svg.scrollIntoViewIfNeeded();
  const initial = await page
    .locator(".drawing-piece polygon")
    .first()
    .getAttribute("points");
  const box = await svg.boundingBox();
  if (!box) throw Error("No canvas");
  const client = await context.newCDPSession(page);
  const x = box.x + box.width / 2,
    y = Math.max(70, box.y + 100);
  const points = (gap: number) => [
    { x: x - gap, y, id: 1 },
    { x: x + gap, y, id: 2 },
  ];
  await client.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: points(30),
  });
  await client.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: points(60),
  });
  await client.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await expect(page.locator(".zoom span")).toHaveText("200%");
  await expect(page.locator(".drawing-piece polygon").first()).toHaveAttribute(
    "points",
    initial!,
  );
  await expect(page.getByRole("button", { name: /Undo \(/ })).toBeDisabled();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
