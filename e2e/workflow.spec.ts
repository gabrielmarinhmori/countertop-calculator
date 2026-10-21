import { test, expect } from "@playwright/test";
import { jsPDF } from "jspdf";
test.beforeEach(async ({ page }) => {
  await page.route("**/access-gate.json", (route) =>
    route.fulfill({ json: { version: 1, enabled: false } }),
  );
});
test("sample approval, PDF, backup, persistence, and invalidation", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.getByRole("button", { name: /Explore a sample/ }).click();
  await expect(
    page.getByRole("button", { name: /Main kitchen run/ }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Review & approve", exact: true })
    .click();
  await page.getByRole("button", { name: "Approve project snapshot" }).click();
  await expect(
    page.getByText("Project approved", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Continue to reports/ }).click();
  const pdf = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download approved PDF" }).click();
  expect((await pdf).suggestedFilename()).toBe(
    "countertop-approved-report.pdf",
  );
  const backup = page.waitForEvent("download");
  await page.getByRole("button", { name: "Backup", exact: true }).click();
  expect((await backup).suggestedFilename()).toBe("countertop-project.json");
  await page.reload();
  await page
    .getByRole("button", { name: /The Oakwood kitchen/ })
    .first()
    .click();
  await expect(page.getByText("Approved snapshot")).toBeVisible();
  await page.getByLabel("Length / overall X").fill("121");
  await expect(page.getByText("Unapproved draft")).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: "/tmp/countertop-workspace.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});
test("upload multi-page PDF, annotate, and export PNG", async ({ page }) => {
  const pdf = new jsPDF();
  pdf.text("Kitchen drawing page one", 20, 20);
  pdf.addPage();
  pdf.text("Kitchen drawing page two", 20, 20);
  await page.goto("/");
  await page.getByRole("button", { name: "New project", exact: true }).click();
  await page
    .locator("input[type=file]")
    .first()
    .setInputFiles({
      name: "kitchen.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from(pdf.output("arraybuffer")),
    });
  await expect(page.getByLabel("Active drawing").locator("option")).toHaveCount(
    3,
    { timeout: 30000 },
  );
  await expect(page.locator("svg image")).toBeVisible();
  await page.getByRole("button", { name: "Add a piece", exact: true }).click();
  await page.getByRole("button", { name: "Island", exact: true }).click();
  await page.getByLabel("Length / overall X").fill("96");
  await page.getByLabel("Depth / width").fill("36");
  await expect(page.locator(".piece-total")).toContainText("24.00");
  await page.getByRole("button", { name: "Reports", exact: true }).click();
  const png = page.waitForEvent("download");
  await page.getByRole("button", { name: "Annotated PNG" }).click();
  expect((await png).suggestedFilename()).toBe("annotated-drawing.png");
  await expect(
    page.getByRole("button", { name: "Download approved PDF" }),
  ).toBeDisabled();
});
test("mobile dashboard and invalid geometry", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.screenshot({ path: "/tmp/countertop-mobile.png", fullPage: true });
  await page.getByRole("button", { name: "New project", exact: true }).click();
  await page.getByRole("button", { name: "Add a piece", exact: true }).click();
  await page.getByRole("button", { name: "Island", exact: true }).click();
  await page.getByLabel("Length / overall X").fill("0");
  await page.getByLabel("Depth / width").fill("36");
  await page
    .getByRole("button", { name: "Review & approve", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Approve project snapshot" }),
  ).toBeDisabled();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("DXF imports measured geometry only after unit and boundary confirmation", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New project", exact: true }).click();
  await page
    .locator("input[type=file]")
    .first()
    .setInputFiles("public/examples/sample-countertop-inches.dxf");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(/17.00 sq ft/)).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Import measured pieces" }),
  ).toBeDisabled();
  await dialog.getByLabel(/COUNTERTOP.*4 vertices/).check();
  await expect(dialog.getByLabel("Selected DXF contours")).toBeVisible();
  await dialog.getByLabel(/I verified the drawing units/).check();
  await dialog.getByRole("button", { name: "Import measured pieces" }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.locator(".piece-total")).toContainText("17.00");
  await expect(page.getByLabel(/I verified this scale/)).toBeChecked();
  await page
    .getByRole("button", { name: "Review & approve", exact: true })
    .click();
  await page.getByRole("button", { name: "Approve project snapshot" }).click();
  await expect(
    page.getByText("Project approved", { exact: true }),
  ).toBeVisible();
});

test("curved CAD counter and shared red splash keep analytical areas and categories", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New project", exact: true }).click();
  await page
    .locator("input[type=file]")
    .first()
    .setInputFiles("public/examples/shared-border-curved-counter.dxf");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  const categories = await dialog
    .locator(".cad-contour-row select")
    .evaluateAll((els) => els.map((el) => (el as HTMLSelectElement).value));
  expect(categories.sort()).toEqual(["backsplash", "horizontal"]);
  for (const checkbox of await dialog
    .locator(".dxf-contours input[type=checkbox]")
    .all())
    await checkbox.check();
  await dialog.getByLabel(/I verified the drawing units/).check();
  await dialog.getByRole("button", { name: "Import measured pieces" }).click();
  await expect(dialog).not.toBeVisible();
  await expect(
    page.locator(
      'svg[aria-label="Interactive drawing annotations"] path[d*="A"]',
    ),
  ).toHaveCount(1);
  await page
    .getByRole("button", { name: "Review & approve", exact: true })
    .click();
  await page.getByRole("button", { name: "Approve project snapshot" }).click();
  await page.getByRole("button", { name: /Continue to reports/ }).click();
  await expect(page.locator(".report-table")).toContainText("16.65");
  await expect(page.locator(".report-table")).toContainText("2.58");
  const file = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download approved PDF" }).click();
  expect((await file).suggestedFilename()).toBe(
    "countertop-approved-report.pdf",
  );
  await page.reload();
  await page
    .getByRole("button", { name: /Untitled kitchen/ })
    .first()
    .click();
  await expect(
    page.locator(
      'svg[aria-label="Interactive drawing annotations"] path[d*="A"]',
    ),
  ).toHaveCount(1);
});

test("bulk DXF selection can be refined and piece names can be changed before and after import", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New project", exact: true }).click();
  await page
    .locator("input[type=file]")
    .first()
    .setInputFiles("public/examples/shared-border-curved-counter.dxf");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Select all", exact: true }).click();
  await expect(dialog.locator(".dxf-contours input:checked")).toHaveCount(2);
  await dialog.locator(".dxf-contours input[type=checkbox]").last().uncheck();
  await expect(dialog.locator(".dxf-contours input:checked")).toHaveCount(1);
  await dialog.getByRole("button", { name: "Select all", exact: true }).click();
  page.once("dialog", (d) => d.accept("Range run"));
  await dialog.locator('[title="Double-click to rename"]').first().dblclick();
  await expect(dialog.getByText("Range run", { exact: true })).toBeVisible();
  await dialog.getByLabel(/I verified the drawing units/).check();
  await dialog.getByRole("button", { name: "Import measured pieces" }).click();
  const name = page
    .locator(".piece-row strong")
    .filter({ hasText: "Range run" });
  await expect(name).toBeVisible();
  page.once("dialog", (d) => d.accept("Range renamed"));
  await name.dblclick();
  await expect(
    page.locator(".piece-row strong").filter({ hasText: "Range renamed" }),
  ).toBeVisible();
  await page.reload();
  await page
    .getByRole("button", { name: /Untitled kitchen/ })
    .first()
    .click();
  await expect(
    page.locator(".piece-row strong").filter({ hasText: "Range renamed" }),
  ).toBeVisible();
});
test("a clicked measured edge creates a separate backsplash that follows dimension changes", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New project", exact: true }).click();
  await page.getByRole("button", { name: "Add a piece", exact: true }).click();
  await page.getByRole("button", { name: "Island", exact: true }).click();
  await page.getByLabel("Length / overall X").fill("96");
  await page.getByLabel("Depth / width").fill("25 1/2");
  await page.getByLabel("Backsplash height (inches)").fill("4");
  await page.getByRole("button", { name: "Choose backsplash edge" }).click();
  const edge = page.getByRole("button", {
    name: "Add backsplash to Island, edge 1",
    exact: true,
  });
  await page
    .locator('svg[aria-label="Interactive drawing annotations"]')
    .scrollIntoViewIfNeeded();
  const box = await edge.boundingBox();
  if (!box) throw Error("Missing edge annotation");
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page.locator(".piece-row")).toHaveCount(2);
  await expect(page.locator(".bottom-summary")).toContainText("2.67");
  await page.getByLabel("Length / overall X").fill("120");
  await expect(page.locator(".bottom-summary")).toContainText("3.33");
  await page.getByRole("button", { name: /Island backsplash 1/ }).click();
  await expect(page.getByLabel("Length / overall X")).not.toBeEditable();
  await page.getByLabel("Height / face Y").fill("5 1/2");
  await expect(page.locator(".piece-total")).toContainText("4.58");
  await page
    .getByRole("button", { name: "Review & approve", exact: true })
    .click();
  await page.getByRole("button", { name: "Approve project snapshot" }).click();
  await expect(
    page.getByText("Project approved", { exact: true }),
  ).toBeVisible();
});
test("curved CAD attachment uses arc length for the new backsplash", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New project", exact: true }).click();
  await page
    .locator("input[type=file]")
    .first()
    .setInputFiles("public/examples/shared-border-curved-counter.dxf");
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Select all", exact: true }).click();
  await dialog.getByLabel(/I verified the drawing units/).check();
  await dialog.getByRole("button", { name: "Import measured pieces" }).click();
  await page.getByLabel("Backsplash height (inches)").fill("4");
  await page.getByRole("button", { name: "Choose backsplash edge" }).click();
  const arc = page.locator('.backsplash-edge-hit[d*="A"]');
  await expect(arc).toHaveCount(1);
  await arc.focus();
  await arc.press("Enter");
  await expect(page.locator(".piece-row")).toHaveCount(3);
  await expect(page.locator(".bottom-summary")).toContainText("2.71");
});
