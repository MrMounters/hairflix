export type ContactRow = Record<string, string>;
const aliases: Record<string, string> = {
  "customer name": "name",
  "full name": "name",
  "email address": "email",
  "phone number": "phone",
  mobile: "phone",
  "last visit date": "lastVisitDate",
  "location of last visit": "lastVisitLocation",
  locations: "locations",
  "last service/product": "lastService",
  "barber name": "lastBarber",
  "method of payment": "lastPaymentMethod",
  "tip amount": "lastTipAmount",
  notes: "notes",
  "acquisition channel": "acquisitionChannel",
  "engage msg. opt out (email)": "emailOptOut",
  "engage msg. opt out (sms)": "smsOptOut",
  "engage msg. opt out (push)": "pushOptOut",
};
export function parseCustomers(text: string): ContactRow[] {
  text = text.replace(/^\uFEFF/, "");
  if (text.trim().startsWith("[")) {
    const v = JSON.parse(text);
    if (!Array.isArray(v)) throw Error("Expected customer rows.");
    return v;
  }
  const rows: string[][] = [];
  let row: string[] = [],
    field = "",
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      if (quoted && text[i + 1] === '"') {
        field += '"';
        i++;
      } else quoted = !quoted;
    } else if (ch === "," && !quoted) {
      row.push(field);
      field = "";
    } else if ((ch === "\n" || ch === "\r") && !quoted) {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      if (row.some((x) => x.trim())) rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  if (quoted) throw Error("Close the quoted CSV field.");
  row.push(field);
  if (row.some((x) => x.trim())) rows.push(row);
  const header = rows.shift()?.map((x) => {
    const k = x.trim().toLowerCase();
    return (
      aliases[k] ||
      Object.keys(aliases)
        .map((a) => aliases[a])
        .find((v) => v.toLowerCase() === k) ||
      k
    );
  });
  if (!header?.includes("name"))
    throw Error("CSV needs a Name or Customer Name column.");
  return rows.map((r) =>
    Object.fromEntries(header.map((k, i) => [k, r[i]?.trim() || ""])),
  );
}
const fields = [
  "name",
  "email",
  "phone",
  "notes",
  "lastVisitDate",
  "lastVisitLocation",
  "locations",
  "lastService",
  "lastBarber",
  "lastPaymentMethod",
  "lastTipAmount",
  "acquisitionChannel",
  "emailOptOut",
  "smsOptOut",
  "pushOptOut",
];
export function contactsCsv(rows: Record<string, any>[]) {
  const cell = (v: unknown) => {
    let s = String(v ?? "");
    if (/^[\s]*[=+\-@\t\r]/.test(s)) s = "'" + s;
    return '"' + s.replaceAll('"', '""') + '"';
  };
  return (
    "\uFEFF" +
    [
      fields.map(cell).join(","),
      ...rows.map((r) =>
        fields
          .map((k) =>
            cell(
              ["emailOptOut", "smsOptOut", "pushOptOut"].includes(k) &&
                r.contactOptOut?.[k.replace("OptOut", "")]
                ? true
                : (r[k] ?? r.importedDetails?.[k]),
            ),
          )
          .join(","),
      ),
    ].join("\r\n")
  );
}
