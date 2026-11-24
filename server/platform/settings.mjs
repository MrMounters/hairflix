export const LOCATIONS = [
  { id: "university", name: "University · Tempe" },
  { id: "scottsdale", name: "Scottsdale" },
];
export const DEFAULTS = {
  business: {
    name: "Hairflix",
    phone: "",
    email: "",
    description: "",
    address: "",
    supportUrl: "",
    publicBookingUrl:
      "https://getsquire.com/booking/brands/hairflix-barbershop",
    timezone: "America/Phoenix",
  },
  booking: {
    enabled: false,
    slotMinutes: 15,
    leadMinutes: 60,
    windowDays: 90,
    bufferMinutes: 0,
    cancellationHours: 12,
    rescheduleHours: 12,
    allowReschedule: true,
    prepay: false,
    depositMode: "fixed",
    depositValue: 10,
    allowBarberPrices: true,
    allowContactAccess: false,
    notifyOwner: true,
  },
  availability: {
    week: [
      [540, 1080],
      [540, 1080],
      [540, 1080],
      [540, 1080],
      [540, 1080],
      [540, 1080],
      [540, 1080],
    ],
    closedDates: [],
  },
  money: {
    tipPercents: [15, 18, 20],
    taxBps: 0,
    barberPercent: 60,
    rentalMode: "split",
    rentCents: 0,
    rentPeriod: "week",
    collectionDay: 1,
    receiptFooter: "Thank you for choosing Hairflix.",
    paymentMethods: ["cash", "card", "apple", "google", "cashapp"],
    tipsToBarber: true,
    feeMode: "business",
  },
  retention: {
    enabled: false,
    reminderDays: 21,
    winbackDays: 45,
    winbackPercent: 0,
    minDaysBetween: 14,
    quietStart: 20,
    quietEnd: 9,
    loyaltyEnabled: false,
    loyaltyVisits: 5,
    loyaltyRewardCents: 1000,
    rewardFunding: "shop",
  },
  notifications: {
    push: true,
    email: false,
    sms: false,
    marketing: false,
    newMessage: true,
    booking: true,
    payments: true,
  },
  profile: {
    name: "",
    phone: "",
    bio: "",
    specialty: "",
    employment: "full-time",
    locationIds: ["scottsdale"],
    language: "en",
  },
};
export class PlatformError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
export const check = (ok, message, status = 400) => {
  if (!ok) throw new PlatformError(status, message);
};
const number = (v, min, max, name, integer = true) => {
  check(
    typeof v === "number" &&
      Number.isFinite(v) &&
      v >= min &&
      v <= max &&
      (!integer || Number.isInteger(v)),
    `${name}: enter ${integer ? "a whole number" : "a number"} from ${min} to ${max}.`,
  );
  return v;
};
const text = (v, max = 500) => {
  check(
    typeof v === "string" && v.length <= max,
    "Text is missing or too long.",
  );
  return v.trim();
};
export function validateSettings(group, input) {
  check(
    DEFAULTS[group] &&
      input &&
      typeof input === "object" &&
      !Array.isArray(input),
    "Unknown settings group.",
  );
  check(
    Object.keys(input).every((k) => Object.hasOwn(DEFAULTS[group], k)),
    "Unknown setting.",
  );
  const v = { ...structuredClone(DEFAULTS[group]), ...input };
  for (const [k, x] of Object.entries(DEFAULTS[group]))
    if (typeof x === "boolean")
      check(typeof v[k] === "boolean", `Invalid ${k}.`);
  if (group === "business") {
    for (const k of [
      "name",
      "phone",
      "email",
      "description",
      "address",
      "supportUrl",
      "publicBookingUrl",
    ])
      v[k] = text(v[k], k === "description" ? 1000 : 250);
    check(v.name.length > 0, "Business name is required.");
    for (const k of ["supportUrl", "publicBookingUrl"])
      if (v[k]) check(/^https:\/\//.test(v[k]), "Links must use HTTPS.");
    check(v.timezone === "America/Phoenix", "Use the shop’s Arizona timezone.");
  }
  if (group === "booking") {
    for (const [k, min, max] of [
      ["slotMinutes", 5, 60],
      ["leadMinutes", 0, 10080],
      ["windowDays", 1, 365],
      ["bufferMinutes", 0, 120],
      ["cancellationHours", 0, 720],
      ["rescheduleHours", 0, 720],
    ])
      number(v[k], min, max, k);
    check(
      ["full", "fixed", "percent"].includes(v.depositMode),
      "Choose a deposit type.",
    );
    number(
      v.depositValue,
      0,
      v.depositMode === "percent" ? 100 : 10000,
      "Deposit",
      false,
    );
  }
  if (group === "availability") {
    check(Array.isArray(v.week) && v.week.length === 7, "Set all seven days.");
    for (const h of v.week) {
      if (h === null) continue;
      check(Array.isArray(h) && h.length === 2, "Invalid working hours.");
      number(h[0], 0, 1439, "Opens");
      number(h[1], 1, 1440, "Closes");
      check(h[1] > h[0], "Closing time must follow opening time.");
    }
    check(
      Array.isArray(v.closedDates) &&
        v.closedDates.length <= 366 &&
        v.closedDates.every(validDate),
      "Invalid closed dates.",
    );
  }
  if (group === "money") {
    check(
      Array.isArray(v.tipPercents) && v.tipPercents.length <= 8,
      "Choose up to eight tip suggestions.",
    );
    v.tipPercents.forEach((n) => number(n, 0, 100, "Tip"));
    number(v.taxBps, 0, 2500, "Tax basis points");
    number(v.barberPercent, 0, 100, "Barber percent");
    number(v.rentCents, 0, 10000000, "Rent cents");
    check(
      ["split", "rent"].includes(v.rentalMode) &&
        ["day", "week", "month"].includes(v.rentPeriod),
      "Choose a valid chair agreement.",
    );
    number(
      v.collectionDay,
      1,
      v.rentPeriod === "month" ? 31 : v.rentPeriod === "week" ? 7 : 1,
      "Collection day",
    );
    check(
      Array.isArray(v.paymentMethods) &&
        v.paymentMethods.length &&
        v.paymentMethods.every((x) =>
          ["cash", "card", "apple", "google", "cashapp"].includes(x),
        ),
      "Choose supported payment methods.",
    );
    check(
      v.tipsToBarber === true,
      "Tips remain assigned to the performing barber.",
    );
    check(
      v.feeMode === "business",
      "Customer fee collection requires a separately supported processor configuration.",
    );
    v.receiptFooter = text(v.receiptFooter, 300);
  }
  if (group === "retention") {
    for (const [k, min, max] of [
      ["reminderDays", 1, 365],
      ["winbackDays", 1, 730],
      ["winbackPercent", 0, 100],
      ["minDaysBetween", 1, 365],
      ["quietStart", 0, 23],
      ["quietEnd", 0, 23],
      ["loyaltyVisits", 2, 30],
      ["loyaltyRewardCents", 100, 100000],
    ])
      number(v[k], min, max, k);
    check(
      v.winbackPercent === 0,
      "Automatic percentage coupons need a connected checkout; use 0 for now.",
    );
    check(
      v.rewardFunding === "shop",
      "This release supports shop-funded rewards.",
    );
  }
  if (group === "profile") {
    for (const k of ["name", "phone", "bio", "specialty", "language"])
      v[k] = text(v[k], k === "bio" ? 1000 : 150);
    check(
      ["full-time", "part-time"].includes(v.employment),
      "Choose employment type.",
    );
    check(
      Array.isArray(v.locationIds) &&
        v.locationIds.length &&
        v.locationIds.every((id) => LOCATIONS.some((l) => l.id === id)),
      "Choose a current location.",
    );
  }
  return v;
}
export const key = (type, id) => type + ":" + id;
export const rows = (records, type) =>
  Object.entries(records)
    .filter(([k]) => k.startsWith(type + ":"))
    .map(([, v]) => v);
export function resolveSettings(records, group, locationId, barberId) {
  let v = structuredClone(DEFAULTS[group]);
  for (const scope of [
    "organization",
    locationId && "location/" + locationId,
    barberId && "barber/" + barberId,
  ].filter(Boolean)) {
    const r = records[key("settings", scope + "/" + group)];
    if (r) v = { ...v, ...r.value };
  }
  return v;
}
export function permission(user, role, barberId) {
  return (
    user.role === "owner" ||
    (user.role === role && (!barberId || barberId === user.id))
  );
}
export const dayNow = (now = Date.now()) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Phoenix",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(now));
export const dateTime = (date, start) =>
  Date.parse(
    date +
      "T" +
      String(Math.floor(start / 60)).padStart(2, "0") +
      ":" +
      String(start % 60).padStart(2, "0") +
      ":00-07:00",
  );
export const validDate = (d) =>
  typeof d === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(d) &&
  Number.isFinite(Date.parse(d + "T12:00:00Z")) &&
  new Date(d + "T12:00:00Z").toISOString().slice(0, 10) === d;
export const overlap = (a, b, c, d) => a < d && c < b;
