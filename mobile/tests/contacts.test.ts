import test from "node:test";
import assert from "node:assert/strict";
import { parseCustomers, contactsCsv } from "../src/platform/contacts.ts";
test("Squire report headings, BOM, quoted commas and multiline notes map to contact fields", () => {
  const rows = parseCustomers(
    '\uFEFFCustomer Name,Email,Phone,Notes,Barber Name,Engage Msg. Opt Out (SMS)\r\n"Example, Customer",example@test.com,4805550100,"First line\nSecond line",Demo Barber,Yes',
  );
  assert.equal(rows[0].name, "Example, Customer");
  assert.equal(rows[0].notes, "First line\nSecond line");
  assert.equal(rows[0].lastBarber, "Demo Barber");
  assert.equal(rows[0].smsOptOut, "Yes");
});
test("CSV export quotes fields, prevents spreadsheet formulas and reimports metadata", () => {
  const csv = contactsCsv([
    {
      name: 'Example "Customer"',
      email: "example@test.com",
      phone: "+14805550100",
      notes: '=HYPERLINK("bad")',
      importedDetails: { lastBarber: "Barber", lastVisitDate: "2026-01-01" },
      contactOptOut: { sms: true },
    },
  ]);
  const [row] = parseCustomers(csv);
  assert.equal(row.name, 'Example "Customer"');
  assert.equal(row.phone, "'+14805550100");
  assert.equal(row.notes[0], "'");
  assert.equal(row.lastBarber, "Barber");
  assert.equal(row.smsOptOut, "true");
  assert.equal(row.lastVisitDate, "2026-01-01");
});
test("unclosed quoted cells and missing names give actionable errors", () => {
  assert.throws(() => parseCustomers("Email\na@test.com"), /Name/);
  assert.throws(() => parseCustomers('Name\n"unfinished'), /quoted/);
});
