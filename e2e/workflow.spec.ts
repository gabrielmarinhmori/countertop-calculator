import { test, expect } from "@playwright/test";
import { jsPDF } from "jspdf";
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
