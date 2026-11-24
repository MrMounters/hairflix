import { deliverNotifications } from "./delivery.mjs";
import {
  randomBytes,
  randomUUID,
  createHash,
  timingSafeEqual,
} from "node:crypto";
import { passwordHash, verifyPassword } from "../connect.mjs";
import { platformRepository } from "./repository.mjs";
import {
  DEFAULTS,
  LOCATIONS,
  PlatformError,
  check,
  key,
  rows,
  resolveSettings,
  validateSettings,
  permission,
  dayNow,
  dateTime,
  validDate,
  overlap,
} from "./settings.mjs";
const sha = (s) => createHash("sha256").update(String(s)).digest("hex");
const equal = (a, b) =>
  timingSafeEqual(Buffer.from(sha(a)), Buffer.from(sha(b)));
const sanitizeUser = (u) => ({
  id: u.id,
  email: u.email,
  name: u.name,
  phone: u.phone || "",
  role: u.role,
  locations: u.locations,
  active: u.active,
  availabilityLocked: !!u.availabilityLocked,
});
const allowed = (u, v) =>
  u.role === "owner" ||
  (u.role === "barber" && v.barberId === u.id) ||
  (u.role === "customer" && v.customerId === u.id);
const safeText = (s, max = 1000) => {
  check(
    typeof s === "string" && s.trim().length && s.length <= max,
    "Enter valid text.",
  );
  return s.trim();
};
const id = () => randomUUID();
export function createPlatformApp(env = {}, deps = {}) {
  const clock = deps.clock || Date.now,
    fetcher = deps.fetcher || fetch;
  let repository = deps.repository ? Promise.resolve(deps.repository) : null;
  async function repo() {
    repository = repository || platformRepository(env);
    return repository;
  }
  const ready = () =>
    !!(
      deps.repository ||
      env.APP_DATABASE_FILE ||
      (env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN)
    );
  const response = (status, value, extra = {}) => ({
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...extra,
    },
    body: JSON.stringify(value),
  });
  async function transaction(fn) {
    const r = await repo();
    check(r, "Configure durable app storage.", 503);
    for (let n = 0; n < 8; n++) {
      const snapshot = await r.read(),
        records = structuredClone(snapshot.records),
        result = await fn(records),
        changes = {};
      for (const k of new Set([
        ...Object.keys(snapshot.records),
        ...Object.keys(records),
      ]))
        if (JSON.stringify(snapshot.records[k]) !== JSON.stringify(records[k]))
          changes[k] = records[k] ?? null;
      if (
        !Object.keys(changes).length ||
        (await r.commit(snapshot.revision, changes))
      )
        return result;
    }
    throw new PlatformError(
      409,
      "Another person changed these records. Refresh and try again.",
    );
  }
  function capabilities() {
    return {
      storage: ready(),
      push: true,
      email: !!(env.APP_EMAIL_API_KEY && env.APP_EMAIL_FROM),
      sms: !!(
        env.APP_SMS_ACCOUNT_ID &&
        env.APP_SMS_AUTH_TOKEN &&
        env.APP_SMS_FROM
      ),
      payments: false,
      liveBooking: env.APP_LIVE_BOOKING === "true",
      wallet: false,
      tapToPay: false,
      instagram: false,
      whatsapp: false,
    };
  }
  function preferences(r, uid) {
    return {
      ...DEFAULTS.notifications,
      ...r[key("settings", "user/" + uid + "/notifications")]?.value,
    };
  }
  function notify(
    records,
    userIds,
    type,
    title,
    body,
    link = {},
    marketing = false,
    channels = ["push", "email", "sms"],
  ) {
    for (const userId of new Set(userIds.filter(Boolean))) {
      const user = records[key("users", userId)];
      if (!user?.active) continue;
      const prefs = preferences(records, userId);
      if (marketing && !prefs.marketing) continue;
      const notification = {
        id: id(),
        userId,
        type,
        title,
        body,
        link,
        at: clock(),
        readAt: null,
        marketing,
      };
      records[key("notifications", notification.id)] = notification;
      for (const channel of channels) {
        if (
          !prefs[channel] ||
          (type === "message" && !prefs.newMessage) ||
          (type === "booking" && !prefs.booking) ||
          (type === "payment" && !prefs.payments)
        )
          continue;
        const event = {
          id: id(),
          notificationId: notification.id,
          userId,
          channel,
          status: "queued",
          attempts: 0,
          nextAttempt: clock(),
          at: clock(),
        };
        records[key("outbox", event.id)] = event;
      }
    }
  }
  function owners(r) {
    return rows(r, "users")
      .filter((u) => u.role === "owner" && u.active)
      .map((u) => u.id);
  }
  function audit(r, u, type, recordId, oldValue, newValue) {
    if (type.startsWith("visit.")) {
      oldValue = oldValue
        ? { ...oldValue, customerNotes: undefined }
        : oldValue;
      newValue = newValue
        ? { ...newValue, customerNotes: undefined }
        : newValue;
    }
    const a = {
      id: id(),
      actorId: u.id,
      type,
      recordId,
      at: clock(),
      oldValue,
      newValue,
    };
    r[key("audit", a.id)] = a;
  }
  function requireOwner(u) {
    check(u.role === "owner", "Owner access required.", 403);
  }
  function requireStaff(u) {
    check(
      u.role === "owner" || u.role === "barber",
      "Staff access required.",
      403,
    );
  }
  function checkAppointment(r, u, v) {
    check(v, "Appointment not found.", 404);
    check(allowed(u, v), "You cannot access this appointment.", 403);
  }
  function checkLocation(u, locationId) {
    check(
      LOCATIONS.some((l) => l.id === locationId),
      "Choose a current location.",
    );
    check(
      u.role !== "barber" || u.locations.includes(locationId),
      "You are not assigned to this location.",
      403,
    );
  }
  function checkSlot(
    r,
    barberId,
    locationId,
    date,
    start,
    length,
    ignoreId,
    walkIn = false,
  ) {
    const b = r[key("users", barberId)];
    check(
      b?.active && b.role === "barber" && b.locations.includes(locationId),
      "Choose an assigned barber.",
    );
    check(
      validDate(date) &&
        Number.isInteger(start) &&
        Number.isInteger(length) &&
        length > 0 &&
        start >= 0 &&
        start + length <= 1440,
      "Choose a valid date and time.",
    );
    const policy = resolveSettings(r, "booking", locationId, barberId),
      at = dateTime(date, start),
      now = clock();
    if (walkIn === "existing") {
    } else if (walkIn)
      check(Math.abs(at - now) < 120000, "A walk-in must start now.");
    else {
      check(
        start % policy.slotMinutes === 0 &&
          at >= now + policy.leadMinutes * 60000,
        "Choose a future available time.",
      );
      check(
        at <= now + policy.windowDays * 86400000,
        "Outside the booking window.",
      );
    }
    const weekday = new Date(date + "T12:00Z").getUTCDay(),
      locationHours = resolveSettings(r, "availability", locationId),
      staffHours = resolveSettings(r, "availability", locationId, barberId);
    for (const h of [locationHours, staffHours]) {
      check(
        !h.closedDates.includes(date),
        "The shop or barber is closed that day.",
      );
      const range = h.week[weekday];
      check(
        range &&
          start >= range[0] &&
          start + length + policy.bufferMinutes <= range[1],
        "The full appointment must fit within working hours.",
      );
    }
    check(
      !rows(r, "blocks").some(
        (x) =>
          x.barberId === barberId &&
          x.date === date &&
          overlap(start, start + length + policy.bufferMinutes, x.start, x.end),
      ),
      "This time is blocked.",
      409,
    );
    check(
      !rows(r, "visits").some(
        (x) =>
          x.id !== ignoreId &&
          x.barberId === barberId &&
          x.date === date &&
          !["cancelled", "no_show"].includes(x.status) &&
          overlap(
            start,
            start + length + policy.bufferMinutes,
            x.start,
            x.start + x.duration + (x.policy?.bufferMinutes || 0),
          ),
      ),
      "This barber is already booked, possibly at another location.",
      409,
    );
  }
  function thread(r, customerId, barberId) {
    let t = rows(r, "threads").find(
      (t) => t.customerId === customerId && t.barberId === barberId,
    );
    if (!t) {
      t = { id: id(), customerId, barberId, at: clock() };
      r[key("threads", t.id)] = t;
    }
    return t;
  }
  function appointmentEvent(r, u, v, event) {
    if (!v.customerId) return;
    const t = thread(r, v.customerId, v.barberId),
      m = {
        id: id(),
        threadId: t.id,
        senderId: u.id,
        text: event,
        at: clock(),
        readBy: [u.id],
        appointment: {
          id: v.id,
          date: v.date,
          start: v.start,
          barberId: v.barberId,
          locationId: v.locationId,
          status: v.status,
          totalCents: v.totalCents,
        },
      };
    r[key("messages", m.id)] = m;
    notify(
      r,
      [
        v.customerId,
        v.barberId,
        ...(v.policy?.notifyOwner ? owners(r) : []),
      ].filter((x) => x !== u.id),
      "booking",
      event,
      `${v.client} · ${v.date}`,
      { visitId: v.id, threadId: t.id },
    );
  }
  function usable(r, u, type) {
    if (type === "users")
      return rows(r, "users")
        .filter(
          (x) =>
            x.active &&
            (u.role === "owner" || x.id === u.id || x.role === "barber"),
        )
        .map(sanitizeUser);
    if (type === "customers")
      return rows(r, "customers")
        .filter(
          (x) =>
            u.role === "owner" ||
            x.userId === u.id ||
            (u.role === "barber" &&
              (x.createdBy === u.id ||
                rows(r, "threads").some(
                  (t) => t.customerId === x.id && t.barberId === u.id,
                ) ||
                rows(r, "visits").some(
                  (v) => v.customerId === x.id && v.barberId === u.id,
                ))),
        )
        .map((x) => {
          const contacts =
            resolveSettings(r, "booking", null, u.id).allowContactAccess ||
            rows(r, "visits").some(
              (v) =>
                v.customerId === x.id &&
                v.barberId === u.id &&
                resolveSettings(r, "booking", v.locationId, u.id)
                  .allowContactAccess,
            );
          if (u.role === "barber" && !contacts)
            return { ...x, email: undefined, phone: undefined };
          return u.role === "customer" ? { ...x, notes: undefined } : x;
        });
    if (type === "visits")
      return rows(r, type)
        .filter((v) => allowed(u, v))
        .map((v) => ({
          ...v,
          ...(u.role === "customer" ? { agreement: undefined } : {}),
          ...(u.role !== "customer" && !v.shareNotesWithBarber
            ? { customerNotes: undefined }
            : {}),
        }));
    if (type === "blocks")
      return rows(r, type)
        .map((x) =>
          u.role === "customer"
            ? {
                id: x.id,
                barberId: x.barberId,
                date: x.date,
                start: x.start,
                end: x.end,
                reason: "Unavailable",
              }
            : x,
        )
        .filter(
          (x) =>
            u.role === "owner" || u.role === "customer" || x.barberId === u.id,
        );
    if (type === "services")
      return rows(r, type).filter(
        (x) => x.active || u.role === "owner" || x.barberId === u.id,
      );
    if (type === "threads")
      return rows(r, type).filter(
        (t) =>
          u.role === "owner" || t.customerId === u.id || t.barberId === u.id,
      );
    if (type === "messages") {
      const ids = new Set(usable(r, u, "threads").map((x) => x.id));
      return rows(r, type).filter((x) => ids.has(x.threadId));
    }
    if (type === "settings")
      return rows(r, type).filter(
        (x) =>
          u.role === "owner" ||
          (x.scope === "organization" &&
            ["business", "booking", "availability", "retention"].includes(
              x.group,
            )) ||
          (x.scope.startsWith("location/") && x.group !== "money") ||
          x.scope === "barber/" + u.id ||
          x.scope === "user/" + u.id,
      );
    if (type === "notifications")
      return rows(r, type).filter((x) => x.userId === u.id);
    if (type === "media")
      return rows(r, type)
        .filter(
          (x) =>
            x.visibility === "public" ||
            x.ownerId === u.id ||
            (u.role === "owner" && x.publicationRequested) ||
            (u.role === "barber" && x.barberId === u.id && x.sharedWithBarber),
        )
        .map(({ data, ...meta }) => meta);
    if (type === "ledger")
      return rows(r, type).filter(
        (x) =>
          u.role === "owner" || x.barberId === u.id || x.customerId === u.id,
      );
    if (type === "requests") return [];
    if (type === "rentals" && u.role === "barber")
      return rows(r, type).filter((x) => x.barberId === u.id);
    if (
      [
        "campaigns",
        "jobs",
        "rentals",
        "audit",
        "outbox",
        "invitations",
      ].includes(type)
    )
      return u.role === "owner"
        ? rows(r, type).map((x) =>
            type === "invitations" ? { ...x, tokenHash: undefined } : x,
          )
        : [];
    return [];
  }
  async function authenticate(req) {
    const token = String(req.headers?.authorization || "").replace(
      /^Bearer /,
      "",
    );
    check(token && token.length < 200, "Sign in to Hairflix.", 401);
    const r = await (await repo()).read(),
      session = r.records[key("sessions", sha(token))],
      u = session && r.records[key("users", session.userId)];
    check(
      session?.expiresAt > clock() && u?.active,
      "Session expired. Sign in again.",
      401,
    );
    return { user: u, token };
  }
  async function action(r, u, input) {
    const sessionId = u.sessionId;
    u = { ...r[key("users", u.id)], sessionId };
    check(
      r[key("sessions", sessionId)]?.expiresAt > clock(),
      "Session expired. Sign in again.",
      401,
    );
    check(u?.active, "Your account is inactive.", 403);
    const { type, payload: p = {} } = input;
    check(typeof type === "string", "Choose an action.");
    if (type === "settings.save") {
      const { group, scope } = p;
      check(typeof scope === "string", "Choose a settings scope.");
      if (scope.startsWith("user/"))
        check(
          scope === "user/" + u.id && group === "notifications",
          "Only your notification preferences are editable.",
          403,
        );
      else if (u.role !== "owner") {
        check(
          u.role === "barber" &&
            scope === "barber/" + u.id &&
            ["profile", "availability"].includes(group),
          "Owner-managed setting.",
          403,
        );
        if (group === "profile") {
          const old =
            r[key("settings", scope + "/" + group)]?.value || DEFAULTS.profile;
          check(
            JSON.stringify(p.value.locationIds) ===
              JSON.stringify(old.locationIds) &&
              p.value.employment === old.employment,
            "Only the owner changes assignments or employment.",
            403,
          );
        }
      } else
        check(
          scope === "organization" ||
            (scope.startsWith("location/") &&
              LOCATIONS.some((l) => "location/" + l.id === scope)) ||
            (scope.startsWith("barber/") &&
              r[key("users", scope.slice(7))]?.role === "barber"),
          "Invalid scope.",
        );
      const k = key("settings", scope + "/" + group),
        old = r[k];
      check(
        (old?.revision || 0) === p.revision,
        "This setting changed on another device. Refresh before saving.",
        409,
      );
      const value = validateSettings(group, p.value);
      if (u.role === "barber" && group === "availability")
        check(
          !r[key("users", u.id)].availabilityLocked,
          "The owner manages your working hours.",
          403,
        );
      if (group === "profile" && scope.startsWith("barber/")) {
        const b = r[key("users", scope.slice(7))];
        check(value.name.trim(), "Profile name is required.");
        if (u.role === "owner") {
          check(
            !rows(r, "visits").some(
              (v) =>
                v.barberId === b.id &&
                ["booked", "needs_reassignment", "in_service"].includes(
                  v.status,
                ) &&
                !value.locationIds.includes(v.locationId),
            ),
            "Resolve active appointments before changing locations.",
            409,
          );
          b.locations = value.locationIds;
        }
        b.name = value.name;
        b.phone = value.phone;
      }

      if (group === "availability") {
        const affected = rows(r, "visits").filter(
          (v) =>
            v.status === "booked" &&
            (scope === "organization" ||
              scope === "location/" + v.locationId ||
              scope === "barber/" + v.barberId),
        );
        for (const v of affected) {
          const h = value.week[new Date(v.date + "T12:00Z").getUTCDay()];
          check(
            h &&
              !value.closedDates.includes(v.date) &&
              v.start >= h[0] &&
              v.start + v.duration <= h[1],
            "Working hours would conflict with existing appointments. Resolve them first.",
            409,
          );
        }
      }
      const saved = {
        id: scope + "/" + group,
        scope,
        group,
        value,
        revision: (old?.revision || 0) + 1,
        updatedAt: clock(),
        updatedBy: u.id,
      };
      r[k] = saved;
      audit(r, u, "settings.changed", saved.id, old?.value || null, value);
      if (scope.startsWith("barber/"))
        notify(
          r,
          [scope.slice(7)].filter((x) => x !== u.id),
          "settings",
          "Your shop settings changed",
          group,
          { settingsId: saved.id },
        );
      return saved;
    }
    if (type === "user.update") {
      const target = r[key("users", p.id || u.id)];
      check(
        target && (u.role === "owner" || target.id === u.id),
        "Not allowed.",
        403,
      );
      const old = sanitizeUser(target);
      if (p.name !== undefined) target.name = safeText(p.name, 80);
      if (p.phone !== undefined) target.phone = String(p.phone).slice(0, 30);
      if (u.role === "owner" && target.id !== u.id) {
        if (p.active !== undefined) {
          check(
            p.active ||
              !rows(r, "visits").some(
                (v) =>
                  v.barberId === target.id &&
                  ["booked", "needs_reassignment", "in_service"].includes(
                    v.status,
                  ),
              ),
            "Reassign or resolve active appointments before deactivating this barber.",
            409,
          );
          target.active = !!p.active;
        }
        if (p.availabilityLocked !== undefined)
          target.availabilityLocked = !!p.availabilityLocked;
        if (p.locations) {
          check(
            p.locations.length &&
              p.locations.every((x) => LOCATIONS.some((l) => l.id === x)),
            "Choose current locations.",
          );
          check(
            !rows(r, "visits").some(
              (v) =>
                v.barberId === target.id &&
                ["booked", "needs_reassignment", "in_service"].includes(
                  v.status,
                ) &&
                !p.locations.includes(v.locationId),
            ),
            "Resolve active appointments before changing locations.",
            409,
          );
          target.locations = p.locations;
          const profile =
            r[key("settings", "barber/" + target.id + "/profile")];
          if (profile) {
            profile.value.locationIds = p.locations;
            profile.revision++;
          }
        }
      }
      const customer = r[key("customers", target.id)];
      if (customer) {
        customer.name = target.name;
        customer.phone = target.phone || "";
      }
      audit(r, u, "user.updated", target.id, old, sanitizeUser(target));
      return sanitizeUser(target);
    }
    if (type === "invite.create") {
      requireOwner(u);
      check(["barber", "owner"].includes(p.role), "Choose a staff role.");
      check(
        typeof p.email === "string" &&
          /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email),
        "Enter email.",
      );
      const code = randomBytes(24).toString("base64url"),
        invite = {
          id: id(),
          email: p.email.toLowerCase(),
          name: safeText(p.name, 80),
          role: p.role,
          locations: (p.locations || ["scottsdale"]).filter((x) =>
            LOCATIONS.some((l) => l.id === x),
          ),
          tokenHash: sha(code),
          expiresAt: clock() + 7 * 86400000,
          at: clock(),
          used: false,
        };
      r[key("invitations", invite.id)] = invite;
      audit(r, u, "invite.created", invite.id, null, {
        email: invite.email,
        role: invite.role,
      });
      return { ...invite, tokenHash: undefined, code };
    }
    if (type === "service.save") {
      requireStaff(u);
      const barberId = u.role === "owner" ? p.barberId : u.id,
        b = r[key("users", barberId)];
      check(b?.role === "barber" && b.active, "Choose a barber.");
      if (u.role === "barber")
        check(
          resolveSettings(r, "booking", p.locationId, barberId)
            .allowBarberPrices,
          "The owner manages service prices.",
          403,
        );
      checkLocation({ ...u, locations: b.locations }, p.locationId);
      check(
        b.locations.includes(p.locationId),
        "Barber is not assigned to that shop.",
      );
      check(
        Number.isInteger(p.cents) &&
          p.cents >= 0 &&
          p.cents <= 100000 &&
          Number.isInteger(p.minutes) &&
          p.minutes >= 5 &&
          p.minutes <= 240,
        "Check price and duration.",
      );
      const sid = p.id || id(),
        old = r[key("services", sid)];
      check(
        !old || u.role === "owner" || old.barberId === u.id,
        "Not your service.",
        403,
      );
      check(
        !old || p.revision === old.revision,
        "Service changed. Refresh first.",
        409,
      );
      const value = {
        id: sid,
        barberId,
        locationId: p.locationId,
        name: safeText(p.name, 90),
        description: String(p.description || "").slice(0, 350),
        icon: [
          "cut",
          "beard",
          "razor",
          "face",
          "brow",
          "wax",
          "kids",
          "dryer",
        ].includes(p.icon)
          ? p.icon
          : "cut",
        category: String(p.category || "Haircuts").slice(0, 60),
        cents: p.cents,
        minutes: p.minutes,
        active: p.active !== false,
        revision: (old?.revision || 0) + 1,
      };
      r[key("services", sid)] = value;
      audit(r, u, "service.saved", sid, old || null, value);
      return value;
    }
    if (type === "customer.save") {
      requireStaff(u);
      const cid = p.id || id(),
        old = r[key("customers", cid)];
      check(
        u.role === "owner" ||
          !old ||
          rows(r, "visits").some(
            (v) => v.customerId === cid && v.barberId === u.id,
          ),
        "Customer access denied.",
        403,
      );
      check(
        !old || u.role === "owner",
        "The owner manages existing customer contact records.",
        403,
      );
      const c = {
        ...old,
        id: cid,
        createdBy: old?.createdBy || u.id,
        name: safeText(p.name, 80),
        phone: String(p.phone || "").slice(0, 30),
        email: String(p.email || "").slice(0, 150),
        notes: String(p.notes || "").slice(0, 1000),
        marketingConsent: old?.marketingConsent || false,
        at: old?.at || clock(),
      };
      r[key("customers", cid)] = c;
      return c;
    }
    if (type === "customer.merge") {
      requireOwner(u);
      const a = r[key("customers", p.keepId)],
        b = r[key("customers", p.removeId)];
      check(
        a && b && a.id !== b.id && !a.userId && !b.userId,
        "Choose two imported customer records. Account-linked identities cannot be automatically merged.",
      );
      for (const type of ["visits", "threads", "ledger"])
        for (const v of rows(r, type))
          if (v.customerId === b.id) {
            v.customerId = a.id;
            if (type === "visits") v.client = a.name;
          }
      a.marketingConsent = a.marketingConsent && b.marketingConsent;
      r[key("customers", b.id)] = undefined;
      delete r[key("customers", b.id)];
      audit(r, u, "customer.merged", a.id, b, a);
      return a;
    }
    if (type === "customers.import") {
      requireOwner(u);
      check(
        Array.isArray(p.rows) && p.rows.length > 0 && p.rows.length <= 500,
        "Import 1–500 rows at a time.",
      );
      const result = {
        id: id(),
        kind: "customer-import",
        at: clock(),
        created: 0,
        duplicates: 0,
        rejected: [],
      };
      for (let i = 0; i < p.rows.length; i++) {
        const row = p.rows[i],
          name = String(row.name || "").trim(),
          phone = String(row.phone || "").replace(/[^\d+]/g, ""),
          email = String(row.email || "")
            .trim()
            .toLowerCase();
        if (!name || name.length > 80) {
          result.rejected.push({
            row: i + 1,
            error: "A name up to 80 characters is required.",
          });
          continue;
        }
        if (
          rows(r, "customers").some(
            (c) =>
              (email && c.email.toLowerCase() === email) ||
              (phone && c.phone.replace(/[^\d+]/g, "") === phone),
          )
        ) {
          result.duplicates++;
          continue;
        }
        const c = {
          id: id(),
          name,
          phone: phone.slice(0, 30),
          email: email.slice(0, 150),
          notes: "",
          marketingConsent: false,
          at: clock(),
        };
        r[key("customers", c.id)] = c;
        result.created++;
      }
      r[key("jobs", result.id)] = result;
      notify(
        r,
        [u.id],
        "job",
        "Customer import completed",
        `${result.created} added, ${result.duplicates} duplicates skipped, ${result.rejected.length} rejected.`,
        { jobId: result.id },
      );
      return result;
    }
    if (type === "visit.book") {
      const barberId = u.role === "barber" ? u.id : p.barberId;
      checkLocation(u, p.locationId);
      if (u.role === "customer")
        check(
          resolveSettings(r, "booking", p.locationId, barberId).enabled,
          "Online booking is not enabled. Use the current Squire booking link.",
        );
      check(
        env.APP_LIVE_BOOKING === "true" || env.APP_MODE === "pilot",
        "Activate the booking integration/cutover before taking live appointments.",
        503,
      );
      let customerId = u.role === "customer" ? u.id : p.customerId,
        customer = r[key("customers", customerId)];
      if (!customer && u.role !== "customer" && p.walkIn) {
        customerId = id();
        customer = {
          id: customerId,
          name: p.client?.trim() || "Walk-in",
          phone: "",
          email: "",
          notes: "",
          marketingConsent: false,
          at: clock(),
        };
        r[key("customers", customerId)] = customer;
      }
      check(customer, "Choose a customer.");
      check(
        Array.isArray(p.serviceIds) &&
          p.serviceIds.length > 0 &&
          p.serviceIds.length <= 10,
        "Choose services.",
      );
      check(
        new Set(p.serviceIds).size === p.serviceIds.length,
        "A service was selected twice.",
      );
      const services = p.serviceIds.map((sid) => r[key("services", sid)]);
      check(
        services.every(
          (s) =>
            s?.active &&
            s.barberId === barberId &&
            s.locationId === p.locationId,
        ),
        "Choose services from this barber and location.",
      );
      const date = p.walkIn ? dayNow(clock()) : p.date,
        start = p.walkIn
          ? Number(
              new Intl.DateTimeFormat("en-US", {
                timeZone: "America/Phoenix",
                hourCycle: "h23",
                hour: "2-digit",
                minute: "2-digit",
              })
                .format(new Date(clock()))
                .split(":")
                .reduce((n, x, i) => n + Number(x) * (i ? 1 : 60), 0),
            )
          : p.start,
        length = services.reduce((n, s) => n + s.minutes, 0);
      checkSlot(
        r,
        barberId,
        p.locationId,
        date,
        start,
        length,
        null,
        !!p.walkIn,
      );
      const policy = resolveSettings(r, "booking", p.locationId, barberId),
        agreement = resolveSettings(r, "money", p.locationId, barberId),
        subtotalCents = services.reduce((n, s) => n + s.cents, 0),
        taxCents = Math.round((subtotalCents * agreement.taxBps) / 10000),
        v = {
          id: id(),
          customerId,
          client: customer.name,
          barberId,
          locationId: p.locationId,
          date,
          start,
          duration: length,
          services: services.map((s) => ({ ...s })),
          subtotalCents,
          taxCents,
          totalCents: subtotalCents + taxCents,
          tipCents: 0,
          policy,
          agreement,
          status: "booked",
          approvalStatus: "not_requested",
          paymentStatus: "unpaid",
          source: p.walkIn
            ? "walk-in"
            : env.APP_MODE === "pilot"
              ? "pilot"
              : "app",
          at: clock(),
          revision: 1,
        };
      if (policy.prepay && !p.walkIn) {
        check(
          capabilities().payments,
          "Online prepayment requires a connected payment provider. No appointment has been confirmed.",
          503,
        );
      }
      r[key("visits", v.id)] = v;
      appointmentEvent(r, u, v, "Appointment booked");
      return {
        ...v,
        ...(u.role === "customer" ? { agreement: undefined } : {}),
      };
    }
    const visitActions = [
      "visit.cancel",
      "visit.reschedule",
      "visit.reassign",
      "visit.start",
      "visit.request",
      "visit.approve",
      "visit.ticket",
      "visit.cash",
      "visit.approveInPerson",
      "visit.reward",
      "visit.noShow",
    ];
    if (visitActions.includes(type)) {
      const v = r[key("visits", p.id)];
      checkAppointment(r, u, v);
      if (p.revision !== undefined)
        check(
          v.revision === p.revision,
          "Appointment changed. Refresh first.",
          409,
        );
      const old = structuredClone(v);
      const now = clock();
      if (type === "visit.noShow") {
        requireStaff(u);
        check(
          v.status === "booked" &&
            now >= dateTime(v.date, v.start) + 15 * 60000,
          "Mark no-shows only after a 15-minute grace period.",
        );
        v.status = "no_show";
        v.noShowAt = now;
        appointmentEvent(r, u, v, "Appointment marked as no-show");
      }
      if (type === "visit.cancel") {
        check(
          ["booked", "needs_reassignment"].includes(v.status),
          "Only an unstarted visit can be cancelled.",
        );
        if (u.role === "customer")
          check(
            now < dateTime(v.date, v.start),
            "Contact the shop after your appointment starts.",
          );
        v.cancellationLate =
          now >
          dateTime(v.date, v.start) - v.policy.cancellationHours * 3600000;
        v.status = "cancelled";
        v.cancelledBy = u.id;
        v.cancelledAt = now;
        v.refundStatus =
          v.paymentStatus === "paid" ? "review_required" : "not_needed";
        appointmentEvent(r, u, v, "Appointment cancelled");
      }
      if (type === "visit.reschedule" || type === "visit.reassign") {
        check(
          ["booked", "needs_reassignment"].includes(v.status),
          "Only an unstarted visit can move.",
        );
        if (u.role === "customer")
          check(
            v.policy.allowReschedule &&
              now <=
                dateTime(v.date, v.start) - v.policy.rescheduleHours * 3600000,
            "Contact the shop to reschedule inside the notice window.",
          );
        if (type === "visit.reassign") requireOwner(u);
        const bid = type === "visit.reassign" ? p.barberId : v.barberId;
        checkSlot(
          r,
          bid,
          v.locationId,
          p.date || v.date,
          p.start ?? v.start,
          v.duration,
          v.id,
        );
        v.history = [
          ...(v.history || []),
          {
            date: v.date,
            start: v.start,
            barberId: v.barberId,
            by: u.id,
            at: now,
          },
        ];
        v.date = p.date || v.date;
        v.start = p.start ?? v.start;
        if (type === "visit.reassign" && v.barberId !== bid) {
          v.agreement = {
            ...resolveSettings(r, "money", v.locationId, bid),
            taxBps: v.agreement.taxBps,
          };
          notify(
            r,
            [v.barberId].filter((x) => x !== u.id),
            "booking",
            "Appointment reassigned",
            v.client + " · " + v.date,
            {},
          );
        }
        v.barberId = bid;
        v.status = "booked";
        appointmentEvent(
          r,
          u,
          v,
          type === "visit.reassign"
            ? "Barber reassigned · booked price retained"
            : "Appointment rescheduled",
        );
      }
      if (type === "visit.start") {
        requireStaff(u);
        check(v.status === "booked", "Choose a booked visit.");
        v.status = "in_service";
      }
      if (type === "visit.ticket") {
        requireStaff(u);
        check(
          u.role === "owner" ||
            resolveSettings(r, "booking", v.locationId, v.barberId)
              .allowBarberPrices,
          "The owner manages ticket edits.",
          403,
        );
        check(
          v.status === "in_service",
          "Only an in-progress ticket can be edited.",
        );
        check(
          Array.isArray(p.lines) && p.lines.length && p.lines.length <= 15,
          "Add ticket services.",
        );
        for (const l of p.lines)
          check(
            typeof l.name === "string" &&
              l.name.length <= 90 &&
              Number.isInteger(l.cents) &&
              l.cents >= 0 &&
              l.cents <= 100000 &&
              Number.isInteger(l.minutes) &&
              l.minutes >= 5 &&
              l.minutes <= 240,
            "Invalid service line.",
          );
        const length = p.lines.reduce((n, l) => n + l.minutes, 0);
        if (length !== v.duration)
          checkSlot(
            r,
            v.barberId,
            v.locationId,
            v.date,
            v.start,
            length,
            v.id,
            "existing",
          );
        v.services = p.lines.map((l) => ({
          id: l.id || id(),
          name: l.name,
          cents: l.cents,
          minutes: l.minutes,
        }));
        v.duration = length;
        v.subtotalCents = v.services.reduce((n, l) => n + l.cents, 0);
        v.taxCents = Math.round((v.subtotalCents * v.agreement.taxBps) / 10000);
        v.creditCents = Math.min(v.creditCents || 0, v.subtotalCents);
        v.totalCents = v.subtotalCents + v.taxCents - v.creditCents;
        v.approvalStatus = "not_requested";
      }
      if (type === "visit.request") {
        requireStaff(u);
        check(v.status === "in_service", "Start the visit first.");
        v.status = "completed";
        v.approvalStatus = "requested";
        appointmentEvent(r, u, v, "Final ticket ready for approval");
      }
      if (type === "visit.approve") {
        check(
          u.role === "customer" && v.customerId === u.id,
          "The customer must approve their ticket.",
          403,
        );
        check(
          v.status === "completed" && v.approvalStatus === "requested",
          "Review the latest ticket.",
        );
        check(
          Number.isInteger(p.tipCents) &&
            p.tipCents >= 0 &&
            p.tipCents <= 100000,
          "Choose a valid optional tip.",
        );
        v.tipCents = p.tipCents;
        v.totalCents =
          v.subtotalCents + v.taxCents + p.tipCents - (v.creditCents || 0);
        v.approvalStatus = "approved";
        v.approvedAt = clock();
        notify(
          r,
          [v.barberId],
          "ticket",
          "Customer approved the ticket",
          v.client,
          { visitId: v.id },
        );
      }
      if (type === "visit.reward") {
        requireStaff(u);
        check(
          v.status === "in_service" &&
            v.paymentStatus === "unpaid" &&
            !v.rewardId,
          "Apply a reward to an in-progress ticket before approval.",
        );
        const reward = r[key("ledger", p.rewardId)];
        check(
          reward?.kind === "loyalty-reward" &&
            reward.customerId === v.customerId &&
            !reward.redeemedAt &&
            !reward.reservedVisitId,
          "Choose an unused reward for this customer.",
        );
        v.rewardId = reward.id;
        v.creditCents = Math.min(reward.amountCents, v.subtotalCents);
        v.totalCents -= v.creditCents;
        reward.reservedVisitId = v.id;
      }
      if (type === "visit.approveInPerson") {
        requireStaff(u);
        check(
          !r[key("users", v.customerId)],
          "Account holders must approve their own ticket.",
          403,
        );
        check(
          v.status === "completed" &&
            v.approvalStatus === "requested" &&
            p.confirm === true,
          "Confirm customer approval in person.",
        );
        check(
          Number.isInteger(p.tipCents) &&
            p.tipCents >= 0 &&
            p.tipCents <= 100000,
          "Invalid tip.",
        );
        v.tipCents = p.tipCents;
        v.totalCents =
          v.subtotalCents + v.taxCents + v.tipCents - (v.creditCents || 0);
        v.approvalStatus = "approved";
        v.approvalSource = "staff_attested_in_person";
        v.approvedAt = clock();
        v.approvalRecordedBy = u.id;
      }
      if (type === "visit.cash") {
        requireStaff(u);
        check(
          v.status === "completed" &&
            v.approvalStatus === "approved" &&
            v.paymentStatus === "unpaid",
          "Approve the final ticket before recording cash.",
        );
        check(
          v.agreement.paymentMethods.includes("cash"),
          "Cash is not an enabled payment method.",
        );
        check(
          p.amountCents === v.totalCents,
          "Cash amount must match the approved total.",
        );
        v.paymentStatus = "paid";
        v.paymentSource = "staff_recorded_cash";
        v.paidAt = clock();
        if (v.rewardId) {
          const reward = r[key("ledger", v.rewardId)];
          check(
            reward?.reservedVisitId === v.id && !reward.redeemedAt,
            "Reward reservation changed.",
            409,
          );
          reward.redeemedAt = clock();
          reward.redeemedBy = u.id;
          reward.appliedCreditCents = v.creditCents;
        }
        const share =
            v.agreement.rentalMode === "rent"
              ? v.subtotalCents
              : Math.round((v.subtotalCents * v.agreement.barberPercent) / 100),
          entry = {
            id: id(),
            kind: "service",
            visitId: v.id,
            customerId: v.customerId,
            barberId: v.barberId,
            locationId: v.locationId,
            amountCents: v.totalCents,
            serviceCents: v.subtotalCents,
            taxCents: v.taxCents,
            tipCents: v.tipCents,
            barberCents: share + v.tipCents,
            shopCents: v.subtotalCents - share - (v.creditCents || 0),
            shopFundedCreditCents: v.creditCents || 0,
            source: "staff_recorded_cash",
            at: clock(),
          };
        r[key("ledger", entry.id)] = entry;
        const retention = resolveSettings(r, "retention", v.locationId);
        if (retention.loyaltyEnabled) {
          const stamp = {
            id: id(),
            kind: "loyalty-earned",
            visitId: v.id,
            customerId: v.customerId,
            barberId: v.barberId,
            locationId: v.locationId,
            amountCents: 0,
            at: clock(),
          };
          r[key("ledger", stamp.id)] = stamp;
          const earned = rows(r, "ledger").filter(
            (x) => x.kind === "loyalty-earned" && x.customerId === v.customerId,
          ).length;
          if (earned % retention.loyaltyVisits === 0) {
            const reward = {
              id: id(),
              kind: "loyalty-reward",
              customerId: v.customerId,
              barberId: v.barberId,
              locationId: v.locationId,
              amountCents: retention.loyaltyRewardCents,
              at: clock(),
            };
            r[key("ledger", reward.id)] = reward;
            notify(
              r,
              [v.customerId],
              "loyalty",
              "Your loyalty reward is ready",
              `Credit: $${(reward.amountCents / 100).toFixed(2)}`,
              { rewardId: reward.id },
            );
          }
        }
        notify(
          r,
          [v.customerId, ...owners(r)].filter((x) => x !== u.id),
          "payment",
          "Cash payment recorded",
          v.client,
          { visitId: v.id },
        );
      }
      v.revision++;
      audit(r, u, type, v.id, old, v);
      return {
        ...v,
        ...(u.role === "customer" ? { agreement: undefined } : {}),
        ...(u.role !== "customer" && !v.shareNotesWithBarber
          ? { customerNotes: undefined }
          : {}),
      };
    }
    if (type === "block.save" || type === "absence") {
      requireStaff(u);
      const bid = u.role === "owner" ? p.barberId : u.id;
      check(r[key("users", bid)]?.role === "barber", "Choose a barber.");
      check(
        validDate(p.from) &&
          validDate(p.through || p.from) &&
          p.from >= dayNow(clock()) &&
          (p.through || p.from) >= p.from,
        "Choose a valid date range.",
      );
      const start = p.fullDay || type === "absence" ? 0 : p.start,
        end = p.fullDay || type === "absence" ? 1440 : p.end;
      check(
        Number.isInteger(start) &&
          Number.isInteger(end) &&
          start >= 0 &&
          end <= 1440 &&
          end > start &&
          start % 15 === 0 &&
          end % 15 === 0,
        "Use valid quarter-hour times.",
      );
      const dates = [];
      for (
        let date = p.from;
        date <= (p.through || p.from);
        date = new Date(Date.parse(date + "T12:00Z") + 86400000)
          .toISOString()
          .slice(0, 10)
      ) {
        check(dates.length < 90, "Block at most 90 days at a time.");
        dates.push(date);
      }
      for (const date of dates) {
        const affected = rows(r, "visits").filter(
          (v) =>
            v.barberId === bid &&
            v.date === date &&
            v.status === "booked" &&
            overlap(start, end, v.start, v.start + v.duration),
        );
        if (type === "absence") {
          for (const v of affected) {
            v.status = "needs_reassignment";
            v.revision++;
          }
          notify(
            r,
            owners(r),
            "absence",
            "Barber absence needs attention",
            `${date} · ${affected.length} appointments`,
            { date, barberId: bid },
          );
        } else
          check(
            !affected.length,
            "Appointments overlap this time off. Resolve them first.",
            409,
          );
        check(
          !rows(r, "blocks").some(
            (b) =>
              b.barberId === bid &&
              b.date === date &&
              overlap(start, end, b.start, b.end),
          ),
          "This time is already blocked.",
          409,
        );
        const block = {
          id: id(),
          barberId: bid,
          date,
          start,
          end,
          reason: String(p.reason || "Time off").slice(0, 100),
          kind: type === "absence" ? "absence" : "break",
          at: clock(),
        };
        r[key("blocks", block.id)] = block;
      }
      audit(r, u, type, bid, null, { dates, start, end });
      return { blocked: dates.length };
    }
    if (type === "block.remove") {
      requireStaff(u);
      const b = r[key("blocks", p.id)];
      check(
        b && (u.role === "owner" || b.barberId === u.id),
        "Not your block.",
        403,
      );
      delete r[key("blocks", b.id)];
      audit(r, u, type, b.id, b, null);
      return { removed: true };
    }
    if (type === "message.send") {
      const t = r[key("threads", p.threadId)];
      check(
        t &&
          (u.role === "owner" || t.customerId === u.id || t.barberId === u.id),
        "Thread access denied.",
        403,
      );
      const m = {
        id: id(),
        threadId: t.id,
        senderId: u.id,
        text: safeText(p.text),
        readBy: [u.id],
        at: clock(),
      };
      r[key("messages", m.id)] = m;
      notify(
        r,
        [
          t.customerId,
          ...(t.barberId === "shop" ? owners(r) : [t.barberId]),
        ].filter((x) => x !== u.id),
        "message",
        "New Hairflix message",
        m.text.slice(0, 80),
        { threadId: t.id },
      );
      return m;
    }
    if (type === "thread.create" && p.shop === true) {
      return thread(r, u.id, "shop");
    }
    if (type === "thread.create") {
      const customerId = u.role === "customer" ? u.id : p.customerId,
        bid = u.role === "barber" ? u.id : p.barberId;
      check(
        r[key("customers", customerId)] &&
          r[key("users", bid)]?.role === "barber",
        "Choose a customer and barber.",
      );
      check(u.role !== "customer" || customerId === u.id, "Not allowed.", 403);
      return thread(r, customerId, bid);
    }
    if (type === "messages.read") {
      const t = r[key("threads", p.threadId)];
      check(
        t &&
          (u.role === "owner" || t.customerId === u.id || t.barberId === u.id),
        "Thread access denied.",
        403,
      );
      for (const m of rows(r, "messages"))
        if (m.threadId === t.id && !m.readBy.includes(u.id))
          m.readBy.push(u.id);
      for (const n of rows(r, "notifications"))
        if (n.userId === u.id && n.link.threadId === t.id) n.readAt = clock();
      return { read: true };
    }
    if (type === "notification.read") {
      const n = r[key("notifications", p.id)];
      check(n?.userId === u.id, "Notification not found.", 404);
      n.readAt = clock();
      return { read: true };
    }
    if (type === "device.register") {
      check(
        typeof p.token === "string" &&
          /^(ExponentPushToken|ExpoPushToken)\[[\w-]+\]$/.test(p.token),
        "Choose a valid Expo push token.",
      );
      const token = {
        id: sha(p.token),
        userId: u.id,
        sessionId: u.sessionId,
        token: p.token,
        at: clock(),
        active: true,
      };
      r[key("devices", token.id)] = token;
      return { registered: true };
    }
    if (type === "media.save") {
      check(
        typeof p.data === "string" &&
          /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(p.data) &&
          p.data.length <= 500000,
        "Upload a compressed photo under 375 KB.",
      );
      const visit = p.visitId && r[key("visits", p.visitId)];
      if (u.role === "customer")
        check(
          visit?.customerId === u.id && visit.status === "completed",
          "Choose your completed visit.",
          403,
        );
      const bid = u.role === "barber" ? u.id : visit?.barberId || p.barberId;
      check(r[key("users", bid)]?.role === "barber", "Choose a barber.");
      check(
        rows(r, "media").filter((m) => m.ownerId === u.id).length < 30,
        "Remove an old photo before uploading more.",
      );
      const m = {
        id: id(),
        ownerId: u.id,
        barberId: bid,
        visitId: visit?.id || null,
        caption: String(p.caption || "").slice(0, 200),
        data: p.data,
        visibility: u.role === "customer" ? "private" : "public",
        sharedWithBarber: !!p.sharedWithBarber,
        publicationRequested: false,
        kind: u.role !== "customer" && p.profile ? "profile" : "portfolio",
        at: clock(),
      };
      r[key("media", m.id)] = m;
      if (m.kind === "profile") r[key("users", bid)].avatarMediaId = m.id;
      return { ...m, data: undefined };
    }
    if (type === "media.share") {
      const m = r[key("media", p.id)];
      check(m?.ownerId === u.id, "Not your photo.", 403);
      m.sharedWithBarber = !!p.sharedWithBarber;
      m.publicationRequested = !!p.publicationRequested;
      m.consentAt = m.publicationRequested ? clock() : null;
      if (!m.publicationRequested) m.visibility = "private";
      if (m.publicationRequested)
        notify(
          r,
          [m.barberId],
          "portfolio",
          "Customer requested portfolio sharing",
          m.caption || "Review the photo",
          { mediaId: m.id },
        );
      return { ...m, data: undefined };
    }
    if (type === "media.publish") {
      requireStaff(u);
      const m = r[key("media", p.id)];
      check(
        m &&
          (u.role === "owner" || m.barberId === u.id) &&
          m.publicationRequested &&
          m.consentAt,
        "Publication requires customer consent.",
        403,
      );
      m.visibility = p.approved ? "public" : "private";
      m.publicationRequested = false;
      m.moderatedAt = clock();
      notify(
        r,
        [m.ownerId],
        "portfolio",
        p.approved ? "Photo approved for portfolio" : "Photo kept private",
        "Your portfolio request was reviewed.",
        { mediaId: m.id },
      );
      return { ...m, data: undefined };
    }
    if (type === "media.remove") {
      const m = r[key("media", p.id)];
      check(
        m && (m.ownerId === u.id || u.role === "owner"),
        "Not your photo.",
        403,
      );
      if (r[key("users", m.barberId)]?.avatarMediaId === m.id)
        delete r[key("users", m.barberId)].avatarMediaId;
      delete r[key("media", p.id)];
      return { removed: true };
    }
    if (type === "memory.save") {
      check(u.role === "customer", "Customer access required.", 403);
      const v = r[key("visits", p.visitId)];
      check(
        v?.customerId === u.id && v.status === "completed",
        "Choose a completed visit.",
      );
      v.customerNotes = String(p.notes || "").slice(0, 2000);
      v.shareNotesWithBarber = !!p.shared;
      return { saved: true };
    }
    if (type === "campaign.save") {
      requireOwner(u);
      check(
        !p.id ||
          !r[key("campaigns", p.id)] ||
          r[key("campaigns", p.id)].status === "draft",
        "Sent campaigns cannot be edited.",
      );
      const c = {
        id: p.id || id(),
        title: safeText(p.title, 100),
        body: safeText(p.body, 1000),
        locationId: p.locationId || "all",
        audience: ["all", "overdue", "new"].includes(p.audience)
          ? p.audience
          : "all",
        channel: ["email", "sms", "push"].includes(p.channel)
          ? p.channel
          : "email",
        status: "draft",
        at: clock(),
      };
      r[key("campaigns", c.id)] = c;
      return c;
    }
    if (type === "campaign.send") {
      requireOwner(u);
      const c = r[key("campaigns", p.id)];
      check(c?.status === "draft", "Choose an unsent campaign.");
      check(p.confirm === true, "Confirm sending this campaign.");
      check(
        capabilities()[c.channel] && c.channel !== "push",
        "Configure an email or SMS provider before sending.",
        503,
      );
      let count = 0;
      for (const customer of rows(r, "customers")) {
        const user = r[key("users", customer.userId || customer.id)],
          prefs = preferences(r, user?.id);
        if (!user?.active || !prefs.marketing || !prefs[c.channel]) continue;
        const visits = rows(r, "visits").filter(
          (v) =>
            v.customerId === customer.id &&
            (c.locationId === "all" || v.locationId === c.locationId),
        );
        if (
          c.audience === "overdue" &&
          (visits.some((v) => v.status === "booked") ||
            !visits.some((v) => v.paidAt && v.paidAt < clock() - 21 * 86400000))
        )
          continue;
        if (
          c.audience === "new" &&
          visits.filter((v) => v.paymentStatus === "paid").length > 1
        )
          continue;
        notify(r, [user.id], "marketing", c.title, c.body, {}, true, [
          c.channel,
        ]);
        count++;
      }
      c.status = "queued";
      c.recipients = count;
      c.sentAt = clock();
      return c;
    }
    if (type === "rental.create") {
      requireOwner(u);
      const b = r[key("users", p.barberId)],
        terms = resolveSettings(r, "money", p.locationId, p.barberId);
      check(
        b?.role === "barber" &&
          terms.rentalMode === "rent" &&
          validDate(p.dueDate),
        "Choose a rental agreement and due date.",
      );
      check(
        !rows(r, "rentals").some(
          (x) =>
            x.barberId === b.id &&
            x.dueDate === p.dueDate &&
            x.locationId === p.locationId,
        ),
        "This rent invoice already exists.",
        409,
      );
      const invoice = {
        id: id(),
        barberId: b.id,
        locationId: p.locationId,
        dueDate: p.dueDate,
        amountCents: terms.rentCents,
        terms,
        status: "due",
        at: clock(),
      };
      r[key("rentals", invoice.id)] = invoice;
      notify(
        r,
        [b.id],
        "rent",
        "Chair rent invoice created",
        `Due ${p.dueDate}`,
        { rentalId: invoice.id },
      );
      return invoice;
    }
    if (type === "rental.settle") {
      requireOwner(u);
      const invoice = r[key("rentals", p.id)];
      check(invoice?.status === "due", "Choose an unpaid invoice.");
      check(
        p.amountCents === invoice.amountCents,
        "Amount must match rent due.",
      );
      invoice.status = "paid";
      invoice.paidAt = clock();
      invoice.recordedBy = u.id;
      notify(
        r,
        [invoice.barberId],
        "rent",
        "Chair rent payment recorded",
        invoice.dueDate,
        { rentalId: invoice.id },
      );
      return invoice;
    }
    if (type === "account.delete") {
      check(
        u.role === "customer",
        "Staff accounts must be deactivated by the owner.",
      );
      const record = r[key("users", u.id)];
      record.active = false;
      record.name = "Deleted customer";
      record.email = "deleted-" + u.id + "@invalid.local";
      record.phone = "";
      record.passwordHash = "";
      for (const s of rows(r, "sessions"))
        if (s.userId === u.id) delete r[key("sessions", s.id)];
      for (const m of rows(r, "media"))
        if (m.ownerId === u.id) delete r[key("media", m.id)];
      const c = r[key("customers", u.id)];
      if (c) {
        c.name = "Deleted customer";
        c.phone = "";
        c.email = "";
        c.notes = "";
        c.marketingConsent = false;
      }
      audit(r, u, type, u.id, null, { deletedAt: clock() });
      return { deleted: true };
    }
    throw new PlatformError(400, "Unsupported action.");
  }
  async function scheduleRetention() {
    return transaction((r) => {
      let queued = 0;
      const hour = Number(
        new Intl.DateTimeFormat("en-US", {
          timeZone: "America/Phoenix",
          hour: "2-digit",
          hourCycle: "h23",
        }).format(new Date(clock())),
      );
      for (const c of rows(r, "customers")) {
        const u = r[key("users", c.userId || c.id)],
          prefs = preferences(r, u?.id);
        if (!u?.active || !prefs.marketing) continue;
        const visits = rows(r, "visits").filter((v) => v.customerId === c.id);
        if (
          visits.some(
            (v) => v.status === "booked" && dateTime(v.date, v.start) > clock(),
          )
        )
          continue;
        const last = visits
          .filter((v) => v.paidAt)
          .sort((a, b) => b.paidAt - a.paidAt)[0];
        if (!last) continue;
        const policy = resolveSettings(r, "retention", last.locationId);
        const quiet =
          policy.quietStart > policy.quietEnd
            ? hour >= policy.quietStart || hour < policy.quietEnd
            : hour >= policy.quietStart && hour < policy.quietEnd;
        if (!policy.enabled || quiet) continue;
        const age = (clock() - last.paidAt) / 86400000,
          stage =
            age >= policy.winbackDays
              ? "winback"
              : age >= policy.reminderDays
                ? "reminder"
                : null;
        if (!stage) continue;
        const marker = key("retention", c.id + "/" + last.id + "/" + stage);
        if (
          r[marker] ||
          rows(r, "notifications").some(
            (n) =>
              n.userId === u.id &&
              n.marketing &&
              n.at > clock() - policy.minDaysBetween * 86400000,
          )
        )
          continue;
        notify(
          r,
          [u.id],
          "marketing",
          stage === "winback"
            ? "Your chair is waiting"
            : "Ready for your next cut?",
          "Book your next Hairflix visit when you are ready.",
          {},
          true,
        );
        r[marker] = { at: clock(), customerId: c.id, visitId: last.id };
        queued++;
      }
      return { queued };
    });
  }
  return async (req) => {
    if (!req.path?.startsWith("/api/platform/")) return null;
    const origin = req.headers?.origin,
      webOrigins = [
        env.PUBLIC_ORIGIN,
        ...String(env.APP_WEB_ORIGINS || "").split(","),
      ].filter(Boolean),
      cors =
        origin && webOrigins.includes(origin)
          ? {
              "Access-Control-Allow-Origin": origin,
              Vary: "Origin",
              "Access-Control-Allow-Headers": "Authorization, Content-Type",
              "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
            }
          : {};
    try {
      if (origin)
        check(
          webOrigins.includes(origin),
          "This web origin is not authorized.",
          403,
        );
      if (req.method === "OPTIONS") return response(200, {}, cors);
      if (req.path === "/api/platform/config" && req.method === "GET")
        return response(
          200,
          {
            ...capabilities(),
            mode: env.APP_MODE === "pilot" ? "pilot" : "live",
            locations: LOCATIONS,
          },
          cors,
        );
      check(ready(), "App storage is not configured.", 503);
      let body = {};
      if (req.body?.length) {
        check(req.body.length <= 800000, "Request too large.", 413);
        try {
          body = JSON.parse(req.body.toString());
        } catch {
          throw new PlatformError(400, "Invalid JSON.");
        }
      }
      if (req.path === "/api/platform/auth/session" && req.method === "POST") {
        const ip = sha(req.ip || "unknown");
        await transaction((r) => {
          const k = key("limits", ip),
            a = r[k];
          if (a && a.until > clock()) {
            check(a.count < 20, "Too many attempts. Wait ten minutes.", 429);
            a.count++;
          } else r[k] = { count: 1, until: clock() + 600000 };
        });
        const email = String(body.email || "")
            .trim()
            .toLowerCase(),
          password = String(body.password || "");
        check(
          /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) &&
            password.length >= 12 &&
            password.length <= 128,
          "Enter your email and a password of 12–128 characters.",
        );
        let result;
        const token = randomBytes(32).toString("base64url");
        await transaction((r) => {
          let u = rows(r, "users").find((x) => x.email === email);
          if (body.mode === "register" || body.mode === "activate") {
            check(!u, "This email is already registered.", 409);
            const invite = rows(r, "invitations").find(
              (x) =>
                !x.used &&
                x.expiresAt > clock() &&
                x.email === email &&
                equal(x.tokenHash, sha(body.inviteCode || "")),
            );
            let role = "customer",
              locations = ["scottsdale"];
            if (body.mode === "activate") {
              check(
                !rows(r, "users").some((x) => x.role === "owner") &&
                  env.APP_BOOTSTRAP_TOKEN?.length >= 32 &&
                  equal(body.activationCode || "", env.APP_BOOTSTRAP_TOKEN),
                "Owner activation is unavailable or the code is invalid.",
                403,
              );
              role = "owner";
              locations = LOCATIONS.map((x) => x.id);
            } else if (body.inviteCode) {
              check(invite, "Invitation is invalid or expired.", 403);
              role = invite.role;
              locations = invite.locations;
              invite.used = true;
            }
            u = {
              id: id(),
              email,
              name: safeText(body.name, 80),
              role,
              locations,
              active: true,
              passwordHash: passwordHash(password),
              at: clock(),
            };
            r[key("users", u.id)] = u;
            if (role === "barber") {
              const scope = "barber/" + u.id;
              r[key("settings", scope + "/profile")] = {
                id: scope + "/profile",
                scope,
                group: "profile",
                revision: 1,
                value: {
                  ...structuredClone(DEFAULTS.profile),
                  name: u.name,
                  locationIds: locations,
                },
                updatedAt: clock(),
                updatedBy: u.id,
              };
            }
            if (role === "owner" && body.mode === "activate") {
              for (const [locationId, phone, address, week] of [
                [
                  "university",
                  "+14805594539",
                  "1301 E University Dr · Unit 136, Tempe, AZ 85288",
                  [
                    [450, 1260],
                    [480, 1320],
                    [480, 1320],
                    [450, 1320],
                    [450, 1320],
                    [450, 1320],
                    [450, 1260],
                  ],
                ],
                [
                  "scottsdale",
                  "+16027851988",
                  "7349 N Vía Paseo Del Sur · Suite 520, Scottsdale, AZ 85258",
                  DEFAULTS.availability.week,
                ],
              ]) {
                for (const [group, value] of [
                  ["business", { ...DEFAULTS.business, phone, address }],
                  ["availability", { week, closedDates: [] }],
                ]) {
                  const scope = "location/" + locationId;
                  r[key("settings", scope + "/" + group)] = {
                    id: scope + "/" + group,
                    scope,
                    group,
                    value,
                    revision: 1,
                    updatedAt: clock(),
                    updatedBy: u.id,
                  };
                }
              }
            }

            if (role === "customer")
              r[key("customers", u.id)] = {
                id: u.id,
                userId: u.id,
                name: u.name,
                email,
                phone: "",
                notes: "",
                marketingConsent: false,
                at: clock(),
              };
            notify(
              r,
              [u.id],
              "account",
              "Welcome to Hairflix",
              "Your account is ready.",
            );
          } else {
            const dummy = `scrypt:${"0".repeat(32)}:${"0".repeat(128)}`;
            check(
              verifyPassword(password, u?.passwordHash || dummy) && u?.active,
              "Email or password is incorrect.",
              401,
            );
          }
          const session = {
            id: sha(token),
            userId: u.id,
            expiresAt: clock() + 7 * 86400000,
          };
          r[key("sessions", session.id)] = session;
          result = {
            token,
            user: sanitizeUser(u),
            expiresAt: session.expiresAt,
          };
        });
        return response(200, result, cors);
      }
      if (req.path === "/api/platform/worker" && req.method === "POST") {
        check(
          env.APP_WORKER_SECRET?.length >= 32 &&
            equal(
              String(req.headers?.authorization || ""),
              "Bearer " + env.APP_WORKER_SECRET,
            ),
          "Worker access required.",
          403,
        );
        await scheduleRetention();
        return response(
          200,
          await deliverNotifications({ transaction, env, fetcher, clock }),
          cors,
        );
      }
      const { user: u, token } = await authenticate(req);
      if (req.path === "/api/platform/delivery" && req.method === "POST") {
        requireOwner(u);
        await scheduleRetention();
        return response(
          200,
          await deliverNotifications({ transaction, env, fetcher, clock }),
          cors,
        );
      }
      if (req.path === "/api/platform/auth/logout" && req.method === "POST") {
        await transaction((r) => {
          delete r[key("sessions", sha(token))];
          for (const device of rows(r, "devices"))
            if (device.userId === u.id && device.sessionId === sha(token))
              device.active = false;
          return true;
        });
        return response(200, { signedOut: true }, cors);
      }
      if (req.path === "/api/platform/state" && req.method === "GET") {
        const { records: r, revision } = await (await repo()).read();
        const state = {};
        for (const t of [
          "users",
          "customers",
          "settings",
          "services",
          "visits",
          "blocks",
          "threads",
          "messages",
          "notifications",
          "media",
          "ledger",
          "campaigns",
          "jobs",
          "rentals",
          "audit",
          "outbox",
          "invitations",
        ])
          state[t] = usable(r, u, t);
        state.barberProfiles = rows(r, "users")
          .filter((b) => b.active && b.role === "barber")
          .map((b) => {
            const p = resolveSettings(r, "profile", null, b.id);
            return {
              id: b.id,
              name: b.name,
              locations: b.locations,
              bio: p.bio,
              specialty: p.specialty,
              avatarMediaId: b.avatarMediaId || null,
            };
          });
        const userPrefs = r[key("settings", "user/" + u.id + "/notifications")];
        state.notificationPreferences =
          userPrefs?.value || DEFAULTS.notifications;
        return response(
          200,
          {
            user: sanitizeUser(u),
            revision,
            defaults: DEFAULTS,
            capabilities: capabilities(),
            locations: LOCATIONS,
            state,
          },
          cors,
        );
      }
      if (req.path === "/api/platform/media" && req.method === "GET") {
        const { records: r } = await (await repo()).read(),
          m = r[key("media", req.query?.id)];
        check(
          m &&
            (m.visibility === "public" ||
              m.ownerId === u.id ||
              (u.role === "owner" && m.publicationRequested) ||
              (u.role === "barber" &&
                m.barberId === u.id &&
                m.sharedWithBarber)),
          "Photo access denied.",
          403,
        );
        return response(200, { data: m.data }, cors);
      }
      if (req.path === "/api/platform/export" && req.method === "GET") {
        requireOwner(u);
        const { records: r } = await (await repo()).read();
        return response(
          200,
          { exportedAt: clock(), customers: usable(r, u, "customers") },
          cors,
        );
      }
      if (req.path === "/api/platform/action" && req.method === "POST") {
        check(
          typeof body.requestId === "string" &&
            body.requestId.length >= 8 &&
            body.requestId.length <= 100,
          "An operation ID is required.",
        );
        const operation = key("requests", u.id + "/" + body.requestId),
          digest = sha(
            JSON.stringify({ type: body.type, payload: body.payload }),
          );
        const result = await transaction(async (r) => {
          const existing = r[operation];
          if (existing) {
            check(
              existing.digest === digest,
              "Operation ID already used for another action.",
              409,
            );
            return existing.result;
          }
          const value = await action(r, { ...u, sessionId: sha(token) }, body);
          r[operation] = { digest, result: value, at: clock() };
          return value;
        });
        return response(200, { result }, cors);
      }
      return response(404, { error: "App endpoint not found." }, cors);
    } catch (e) {
      return response(
        e.status || 503,
        {
          error: e.status
            ? e.message
            : "The app service is temporarily unavailable. Try again.",
        },
        cors,
      );
    }
  };
}
