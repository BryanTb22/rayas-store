"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const inv = require("./inventario");

test("fechaCooldown lee los textos de Steam", () => {
  assert.equal(inv.fechaCooldown("\nOn Trade Cooldown Until: Nov 14, 2026 (22:00:00)"), Date.UTC(2026, 10, 14, 22, 0, 0));
  assert.equal(inv.fechaCooldown("Tradable After Nov 12, 2026 (7:00:00) GMT"), Date.UTC(2026, 10, 12, 7, 0, 0));
  assert.equal(inv.fechaCooldown("On Trade Cooldown Until: Thu Nov 12 12:00:00 2026"), Date.UTC(2026, 10, 12, 12, 0, 0));
  assert.equal(inv.fechaCooldown("( Not Tradable )"), null);
});

test("tradableYa: bloqueo vencido cuenta, el que sigue o el permanente no", () => {
  const ahora = Date.UTC(2026, 10, 15, 0, 30);
  const d = (txt, t) => ({ tradable: t || 0, descriptions: [{ value: txt }] });
  assert.equal(inv.tradableYa(d("x", 1), ahora), true);
  assert.equal(inv.tradableYa(d("\nOn Trade Cooldown Until: Nov 14, 2026 (22:00:00)"), ahora), true);
  assert.equal(inv.tradableYa(d("\nOn Trade Cooldown Until: Nov 16, 2026 (22:00:00)"), ahora), false);
  assert.equal(inv.tradableYa(d("( Not Tradable )"), ahora), false);
});
