import { test, expect } from "@playwright/test";
import { pbkdf2Sync } from "node:crypto";
const password = "only-a-test-password";
const salt = Buffer.alloc(24, 17),
  iterations = 100000;
const config = {
  version: 1,
  enabled: true,
  iterations,
  salt: salt.toString("base64"),
  digest: pbkdf2Sync(password, salt, iterations, 32, "sha256").toString(
    "base64",
  ),
};
test("basic screen rejects an incorrect password, opens after a match, and can relock", async ({
  page,
}) => {
  await page.route("**/access-gate.json", (r) => r.fulfill({ json: config }));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /Welcome back/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "New project", exact: true }),
  ).toHaveCount(0);
  await page.getByLabel("Access password").fill("incorrect");
  await page.getByRole("button", { name: "Enter workspace" }).click();
  await expect(page.getByRole("alert")).toContainText("Incorrect password");
  await page.getByLabel("Access password").fill(password);
  await page.getByRole("button", { name: "Enter workspace" }).click();
  await expect(
    page.getByRole("button", { name: "New project", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "New project", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Lock workspace" }).click();
  await expect(page.getByLabel("Access password")).toBeVisible();
});
test("fails closed if public settings cannot load and rejects an expired tab entry", async ({
  page,
}) => {
  await page.route("**/access-gate.json", (r) => r.fulfill({ status: 500 }));
  await page.goto("/");
  await expect(page.getByRole("alert")).toContainText("could not be loaded");
  await expect(
    page.getByRole("button", { name: "New project", exact: true }),
  ).toHaveCount(0);
  await page.unroute("**/access-gate.json");
  await page.route("**/access-gate.json", (r) => r.fulfill({ json: config }));
  await page.evaluate(
    (digest) =>
      sessionStorage.setItem(
        "countertop-basic-gate",
        JSON.stringify({ digest, at: Date.now() - 5 * 60 * 60 * 1000 }),
      ),
    config.digest,
  );
  await page.reload();
  await expect(page.getByLabel("Access password")).toBeVisible();
});
test("browser-only settings tool exports a matching verifier without the password", async ({
  page,
}) => {
  await page.goto("/gate-settings.html");
  await page.getByLabel("New shared password").fill(password);
  await page.getByLabel("Confirm password").fill(password);
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download new access settings" })
    .click();
  const file = await download;
  const fs = await import("node:fs/promises");
  const text = await fs.readFile((await file.path())!, "utf8");
  expect(text).not.toContain(password);
  const settings = JSON.parse(text);
  expect(
    pbkdf2Sync(
      password,
      Buffer.from(settings.salt, "base64"),
      settings.iterations,
      32,
      "sha256",
    ).toString("base64"),
  ).toBe(settings.digest);
});
