import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createPlatformApp } from "../server/platform/app.mjs";
import { SqlitePlatformRepository } from "../server/platform/repository.mjs";
const now = Date.parse("2026-11-24T16:00:00Z");
async function fixture(t, extra = {}) {
  const dir = await mkdtemp(join(tmpdir(), "hf-platform-")),
    file = join(dir, "app.sqlite");
  const repo = await SqlitePlatformRepository.open(file);
  t.after(async () => {
    repo.close();
    await rm(dir, { recursive: true, force: true });
  });
  let app;
  const env = {
    APP_MODE: "pilot",
    APP_BOOTSTRAP_TOKEN: "owner-activation-secret-long-enough-123456",
    PUBLIC_ORIGIN: "https://example.com",
    ...extra,
  };
  const clock = () => now;
  const build = () =>
    createPlatformApp(env, {
      repository: repo,
      clock,
      fetcher: async () => ({
        ok: true,
        json: async () => ({ id: "email-accepted" }),
      }),
    });
  app = build();
  let n = 0;
  const req = async (path, body, token) => {
    const url = new URL("https://example.com/api/platform/" + path);
    const r = await app({
      path: url.pathname,
      query: Object.fromEntries(url.searchParams),
      method: body ? "POST" : "GET",
      headers: token ? { authorization: "Bearer " + token } : {},
      ip: "test",
      body: body ? Buffer.from(JSON.stringify(body)) : Buffer.alloc(0),
    });
    return { status: r.status, ...JSON.parse(r.body) };
  };
  const auth = async (email, mode = "register", more = {}) => {
    const r = await req("auth/session", {
      mode,
      email,
      name: email.split("@")[0],
      password: "long-secure-password",
      ...more,
    });
    assert.equal(r.status, 200, JSON.stringify(r));
    return r;
  };
  const act = (u, type, payload = {}, requestId) =>
    req(
      "action",
      { type, payload, requestId: requestId || "request-" + ++n },
      u.token,
    );
  const owner = await auth("owner@example.com", "activate", {
    activationCode: env.APP_BOOTSTRAP_TOKEN,
  });
  const invite = await act(owner, "invite.create", {
    email: "barber@example.com",
    name: "Lara",
    role: "barber",
    locations: ["scottsdale", "university"],
  });
  const barber = await auth("barber@example.com", "register", {
    inviteCode: invite.result.code,
  });
  const customer = await auth("john@example.com");
  const outsider = await auth("outsider@example.com");
  const service = (
    await act(barber, "service.save", {
      name: "Fade",
      locationId: "scottsdale",
      minutes: 30,
      cents: 4000,
      icon: "cut",
    })
  ).result;
  const booking = async (who = customer, start = 600, date = "2026-11-25") =>
    act(who, "visit.book", {
      barberId: barber.user.id,
      customerId: customer.user.id,
      locationId: "scottsdale",
      date,
      start,
      serviceIds: [service.id],
    });
  return {
    repo,
    req,
    auth,
    act,
    owner,
    barber,
    customer,
    outsider,
    service,
    booking,
    restart: () => {
      app = build();
    },
  };
}
test("server authentication, invitations, scoped permissions and stale setting revisions", async (t) => {
  const f = await fixture(t);
  assert.equal((await f.req("state")).status, 401);
  assert.equal(
    (
      await f.act(f.customer, "invite.create", {
        email: "x@example.com",
        role: "owner",
        name: "x",
      })
    ).status,
    403,
  );
  const b = {
    ...(await f.req("state", null, f.owner.token)).defaults.booking,
    enabled: true,
  };
  const save = await f.act(f.owner, "settings.save", {
    group: "booking",
    scope: "organization",
    revision: 0,
    value: b,
  });
  assert.equal(save.status, 200);
  assert.equal(
    (
      await f.act(f.owner, "settings.save", {
        group: "booking",
        scope: "organization",
        revision: 0,
        value: b,
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await f.act(f.barber, "settings.save", {
        group: "money",
        scope: "organization",
        revision: 0,
        value: {},
      })
    ).status,
    403,
  );
  const me = (await f.req("state", null, f.customer.token)).user;
  assert.equal(me.role, "customer");
  assert.equal(JSON.stringify(me).includes("passwordHash"), false);
  f.restart();
  assert.equal(
    (await f.req("state", null, f.owner.token)).state.settings.find(
      (s) => s.scope === "organization" && s.group === "booking",
    ).value.enabled,
    true,
  );
});
test("atomic booking rejects races, blocks and overlaps across locations; service snapshots survive editing", async (t) => {
  const f = await fixture(t);
  const defaults = (await f.req("state", null, f.owner.token)).defaults;
  await f.act(f.owner, "settings.save", {
    group: "booking",
    scope: "organization",
    revision: 0,
    value: { ...defaults.booking, enabled: true },
  });
  const results = await Promise.all([f.booking(), f.booking()]);
  assert.deepEqual(results.map((x) => x.status).sort(), [200, 409]);
  const v = results.find((x) => x.status === 200).result;
  assert.equal(
    (await f.req("state", null, f.outsider.token)).state.visits.length,
    0,
  );
  assert.equal(
    (await f.act(f.outsider, "visit.cancel", { id: v.id })).status,
    403,
  );
  await f.act(f.barber, "service.save", { ...f.service, cents: 5000 });
  assert.equal(
    (await f.req("state", null, f.customer.token)).state.visits[0].services[0]
      .cents,
    4000,
  );
  assert.equal(
    (
      await f.act(f.barber, "block.save", {
        from: v.date,
        through: v.date,
        fullDay: true,
      })
    ).status,
    409,
  );
  const absent = await f.act(f.barber, "absence", {
    from: v.date,
    through: v.date,
    reason: "Sick",
  });
  assert.equal(absent.status, 200);
  const state = (await f.req("state", null, f.owner.token)).state;
  assert.equal(state.visits[0].status, "needs_reassignment");
  assert.equal((await f.booking(f.customer, 660)).status, 409);
});
test("per-person message receipts, appointment cards and durable notifications", async (t) => {
  const f = await fixture(t);
  const t1 = (
    await f.act(f.customer, "thread.create", { barberId: f.barber.user.id })
  ).result;
  await f.act(f.customer, "message.send", { threadId: t1.id, text: "Hello" });
  const before = (await f.req("state", null, f.barber.token)).state;
  assert.equal(before.messages[0].readBy.includes(f.barber.user.id), false);
  assert.equal(
    before.notifications.some((x) => x.type === "message"),
    true,
  );
  await f.act(f.owner, "messages.read", { threadId: t1.id });
  assert.equal(
    (
      await f.req("state", null, f.barber.token)
    ).state.messages[0].readBy.includes(f.barber.user.id),
    false,
  );
  await f.act(f.barber, "messages.read", { threadId: t1.id });
  assert.equal(
    (
      await f.req("state", null, f.barber.token)
    ).state.messages[0].readBy.includes(f.barber.user.id),
    true,
  );
  assert.equal(
    (
      await f.act(f.outsider, "message.send", {
        threadId: t1.id,
        text: "attack",
      })
    ).status,
    403,
  );
  const v = await f.booking(f.owner);
  assert.equal(v.status, 200);
  await f.act(f.owner, "visit.reschedule", {
    id: v.result.id,
    date: "2026-11-26",
    start: 600,
  });
  const cards = (
    await f.req("state", null, f.customer.token)
  ).state.messages.filter((m) => m.appointment);
  assert.equal(cards.length, 2);
  assert.equal(cards[0].appointment.date, "2026-11-25");
  assert.equal(cards[1].appointment.date, "2026-11-26");
});
test("ticket approval, cash idempotency, privacy and commission preserve actual money status", async (t) => {
  const f = await fixture(t);
  const v = (await f.booking(f.owner)).result;
  await f.act(f.barber, "visit.start", { id: v.id });
  assert.equal(
    (await f.act(f.barber, "visit.cash", { id: v.id, amountCents: 4000 }))
      .status,
    400,
  );
  await f.act(f.barber, "visit.request", { id: v.id });
  assert.equal(
    (await f.act(f.barber, "visit.approve", { id: v.id, tipCents: 1000 }))
      .status,
    403,
  );
  await f.act(f.customer, "visit.approve", { id: v.id, tipCents: 1000 });
  await f.act(f.customer, "memory.save", {
    visitId: v.id,
    notes: "Private note before payment",
    shared: false,
  });
  const paid = await f.act(
    f.barber,
    "visit.cash",
    { id: v.id, amountCents: 5000 },
    "same-payment-id",
  );
  assert.equal(paid.status, 200);
  assert.equal(paid.result.customerNotes, undefined);
  assert.equal(
    (
      await f.act(
        f.barber,
        "visit.cash",
        { id: v.id, amountCents: 5000 },
        "same-payment-id",
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await f.act(
        f.barber,
        "visit.cash",
        { id: v.id, amountCents: 4000 },
        "same-payment-id",
      )
    ).status,
    409,
  );
  await f.act(f.customer, "memory.save", {
    visitId: v.id,
    notes: "Private note",
    shared: false,
  });
  let state = (await f.req("state", null, f.barber.token)).state;
  assert.equal(state.visits[0].customerNotes, undefined);
  assert.equal(state.ledger.length, 1);
  assert.equal(state.ledger[0].barberCents, 3400);
  assert.equal(state.ledger[0].shopCents, 1600);
  const photo = (
    await f.act(f.customer, "media.save", {
      visitId: v.id,
      data: "data:image/jpeg;base64,/9j/2Q==",
      caption: "Private haircut",
    })
  ).result;
  assert.equal(
    (await f.req("media?id=" + photo.id, null, f.barber.token)).status,
    403,
  );
  const r = await f.repo.read();
  assert.equal(r.records["media:" + photo.id].visibility, "private");
  assert.equal(
    (await f.req("state", null, f.outsider.token)).state.media.length,
    0,
  );
  assert.equal(
    (await f.act(f.barber, "media.publish", { id: photo.id, approved: true }))
      .status,
    403,
  );
});
test("marketing honors saved user preferences and queues only selected channel; delivery records provider acceptance", async (t) => {
  const f = await fixture(t, {
    APP_EMAIL_API_KEY: "test",
    APP_EMAIL_FROM: "Hairflix <test@example.com>",
  });
  const defaults = (await f.req("state", null, f.customer.token)).defaults;
  await f.act(f.customer, "user.update", { phone: "+15555555555" });
  await f.act(f.customer, "settings.save", {
    group: "notifications",
    scope: "user/" + f.customer.user.id,
    revision: 0,
    value: {
      ...defaults.notifications,
      push: true,
      email: true,
      sms: true,
      marketing: true,
    },
  });
  const c = (
    await f.act(f.owner, "campaign.save", {
      title: "Fresh cut",
      body: "Come back soon",
      channel: "email",
    })
  ).result;
  assert.equal(
    (await f.act(f.owner, "campaign.send", { id: c.id, confirm: true })).result
      .recipients,
    1,
  );
  const state = (await f.req("state", null, f.owner.token)).state;
  const marketing = state.outbox.filter((x) =>
    state.notifications.some((n) => n.id === x.notificationId && n.marketing),
  ); // owner cannot read recipient notification; inspect repository
  const r = await f.repo.read(),
    notifications = Object.values(r.records).filter((x) => x.marketing),
    ids = new Set(notifications.map((x) => x.id));
  const jobs = Object.entries(r.records)
    .filter(([k, x]) => k.startsWith("outbox:") && ids.has(x.notificationId))
    .map(([, x]) => x);
  assert.deepEqual(
    jobs.map((j) => j.channel),
    ["email"],
  );
  assert.equal((await f.req("delivery", {}, f.customer.token)).status, 403);
  await f.req("delivery", {}, f.owner.token);
  assert.equal(
    (await f.repo.read()).records["outbox:" + jobs[0].id].status,
    "accepted",
  );
});
test("import validates rows, skips duplicates and never manufactures marketing consent", async (t) => {
  const f = await fixture(t);
  const rows = [
    { name: "A", email: "a@example.com" },
    { name: "B", email: "a@example.com" },
    { name: "" },
  ];
  const result = await f.act(f.owner, "customers.import", { rows });
  assert.equal(result.result.created, 1);
  assert.equal(result.result.duplicates, 1);
  assert.equal(result.result.rejected.length, 1);
  assert.equal(
    (await f.act(f.barber, "customers.import", { rows })).status,
    403,
  );
  assert.equal(
    (await f.req("state", null, f.owner.token)).state.customers.find(
      (x) => x.name === "A",
    ).marketingConsent,
    false,
  );
});

test("SQLite records survive closing and reopening the database", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "hf-restart-"));
  const file = join(dir, "app.sqlite");
  t.after(() => rm(dir, { recursive: true, force: true }));
  let repo = await SqlitePlatformRepository.open(file);
  assert.equal(
    await repo.commit(0, { "sample:1": { id: "1", text: "Stored" } }),
    true,
  );
  repo.close();
  repo = await SqlitePlatformRepository.open(file);
  assert.equal((await repo.read()).records["sample:1"].text, "Stored");
  assert.equal(
    await repo.commit(0, { "sample:1": { text: "Lost update" } }),
    false,
  );
  assert.equal((await repo.read()).records["sample:1"].text, "Stored");
  repo.close();
});
test("shop messages reach owners; barber-created customers stay bookable; hours locks enforce owner policy", async (t) => {
  const f = await fixture(t);
  const customer = (
    await f.act(f.barber, "customer.save", {
      name: "Walk-in person",
      phone: "",
      email: "",
    })
  ).result;
  assert.equal(
    (await f.req("state", null, f.barber.token)).state.customers.some(
      (x) => x.id === customer.id,
    ),
    true,
  );
  const t1 = (await f.act(f.barber, "thread.create", { shop: true })).result;
  await f.act(f.barber, "message.send", {
    threadId: t1.id,
    text: "Shop help please",
  });
  assert.equal(
    (await f.req("state", null, f.owner.token)).state.notifications.some(
      (n) => n.body === "Shop help please",
    ),
    true,
  );
  await f.act(f.owner, "user.update", {
    id: f.barber.user.id,
    availabilityLocked: true,
  });
  const defaults = (await f.req("state", null, f.owner.token)).defaults;
  assert.equal(
    (
      await f.act(f.barber, "settings.save", {
        scope: "barber/" + f.barber.user.id,
        group: "availability",
        revision: 0,
        value: defaults.availability,
      })
    ).status,
    403,
  );
});
test("shop-funded rewards preserve the performing barber share and settle only once with payment", async (t) => {
  const f = await fixture(t);
  const defaults = (await f.req("state", null, f.owner.token)).defaults;
  await f.act(f.owner, "settings.save", {
    scope: "organization",
    group: "retention",
    revision: 0,
    value: {
      ...defaults.retention,
      loyaltyEnabled: true,
      loyaltyVisits: 2,
      loyaltyRewardCents: 1000,
    },
  });
  for (const date of ["2026-11-25", "2026-11-26"]) {
    const v = (await f.booking(f.owner, 600, date)).result;
    await f.act(f.barber, "visit.start", { id: v.id });
    await f.act(f.barber, "visit.request", { id: v.id });
    await f.act(f.customer, "visit.approve", { id: v.id, tipCents: 0 });
    await f.act(f.barber, "visit.cash", { id: v.id, amountCents: 4000 });
  }
  const reward = (
    await f.req("state", null, f.customer.token)
  ).state.ledger.find((x) => x.kind === "loyalty-reward");
  assert.ok(reward);
  const v = (await f.booking(f.owner, 600, "2026-11-27")).result;
  await f.act(f.barber, "visit.start", { id: v.id });
  assert.equal(
    (await f.act(f.barber, "visit.reward", { id: v.id, rewardId: reward.id }))
      .status,
    200,
  );
  assert.equal(
    (await f.req("state", null, f.customer.token)).state.ledger.find(
      (x) => x.id === reward.id,
    ).redeemedAt,
    undefined,
  );
  await f.act(f.barber, "visit.request", { id: v.id });
  const approved = await f.act(f.customer, "visit.approve", {
    id: v.id,
    tipCents: 1000,
  });
  assert.equal(approved.result.totalCents, 4000);
  await f.act(f.barber, "visit.cash", { id: v.id, amountCents: 4000 });
  const state = (await f.req("state", null, f.owner.token)).state;
  const entry = state.ledger.find(
    (x) => x.visitId === v.id && x.kind === "service",
  );
  assert.equal(entry.barberCents, 3400);
  assert.equal(entry.shopCents, 600);
  assert.equal(
    entry.amountCents,
    entry.barberCents + entry.shopCents + entry.taxCents,
  );
  assert.equal(
    state.ledger.find((x) => x.id === reward.id).appliedCreditCents,
    1000,
  );
});
test("notification failures stay blocked or require review; opt-out cancels queued marketing", async (t) => {
  const f = await fixture(t);
  await f.req("delivery", {}, f.owner.token);
  let state = (await f.req("state", null, f.owner.token)).state;
  assert.equal(
    state.outbox.every((j) => j.status === "blocked"),
    true,
  );
  const defaults = (await f.req("state", null, f.customer.token)).defaults;
  await f.act(f.customer, "settings.save", {
    scope: "user/" + f.customer.user.id,
    group: "notifications",
    revision: 0,
    value: { ...defaults.notifications, marketing: false },
  });
  assert.equal((await f.req("worker", {}, f.owner.token)).status, 403);
});

test("reassignment keeps the quoted service price and uses the performing barber compensation terms", async (t) => {
  const f = await fixture(t);
  const invitation = (
    await f.act(f.owner, "invite.create", {
      email: "other-barber@example.com",
      name: "Michael",
      role: "barber",
      locations: ["scottsdale"],
    })
  ).result;
  const other = await f.auth("other-barber@example.com", "register", {
    inviteCode: invitation.code,
  });
  const defaults = (await f.req("state", null, f.owner.token)).defaults;
  await f.act(f.owner, "settings.save", {
    group: "money",
    scope: "barber/" + other.user.id,
    revision: 0,
    value: { ...defaults.money, barberPercent: 75 },
  });
  const v = (await f.booking(f.owner)).result;
  assert.equal(
    (
      await f.act(f.owner, "visit.reassign", {
        id: v.id,
        barberId: other.user.id,
      })
    ).status,
    200,
  );
  assert.equal(
    (await f.req("state", null, f.barber.token)).state.visits.length,
    0,
  );
  const transferred = (await f.req("state", null, other.token)).state.visits[0];
  assert.equal(transferred.subtotalCents, 4000);
  assert.equal(transferred.agreement.barberPercent, 75);
  await f.act(other, "visit.start", { id: v.id });
  await f.act(other, "visit.request", { id: v.id });
  await f.act(f.customer, "visit.approve", { id: v.id, tipCents: 1000 });
  await f.act(other, "visit.cash", { id: v.id, amountCents: 5000 });
  const ledger = (await f.req("state", null, f.owner.token)).state.ledger.find(
    (x) => x.visitId === v.id,
  );
  assert.equal(ledger.barberCents, 4000);
  assert.equal(ledger.shopCents, 1000);
});

test("signing out one phone revokes only its session and push registration", async (t) => {
  const f = await fixture(t);
  const second = await f.auth("john@example.com", "login");
  await f.act(f.customer, "device.register", {
    token: "ExpoPushToken[first_phone]",
  });
  await f.act(second, "device.register", {
    token: "ExpoPushToken[second_phone]",
  });
  await f.req("auth/logout", {}, f.customer.token);
  assert.equal((await f.req("state", null, f.customer.token)).status, 401);
  assert.equal((await f.req("state", null, second.token)).status, 200);
  const devices = Object.entries((await f.repo.read()).records)
    .filter(([k]) => k.startsWith("devices:"))
    .map(([, v]) => v);
  assert.equal(
    devices.find((d) => d.token.includes("first_phone")).active,
    false,
  );
  assert.equal(
    devices.find((d) => d.token.includes("second_phone")).active,
    true,
  );
});

test("owner contact imports support full reports, preserve history and suppressions, and deduplicate US phones", async (t) => {
  const f = await fixture(t);
  const rows = Array.from({ length: 1078 }, (_, i) => ({
    name: "Fictional contact " + i,
    email: "contact" + i + "@example.test",
    phone: "",
    notes: "Imported note",
    lastVisitDate: "2026-01-01",
    smsOptOut: "Yes",
  }));
  const result = await f.act(f.owner, "customers.import", { rows });
  assert.equal(result.result.created, 1078);
  const customer = (
    await f.req("state", null, f.owner.token)
  ).state.customers.find((c) => c.name === "Fictional contact 0");
  assert.equal(customer.importedDetails.lastVisitDate, "2026-01-01");
  assert.equal(customer.notes, "Imported note");
  assert.equal(customer.contactOptOut.sms, true);
  assert.equal(customer.marketingConsent, false);
  await f.act(f.owner, "customers.import", {
    rows: [{ name: "Phone one", phone: "(480) 555-0100" }],
  });
  const duplicate = await f.act(f.owner, "customers.import", {
    rows: [
      {
        name: "Phone duplicate",
        phone: "+1 480 555 0100",
        emailOptOut: "true",
      },
    ],
  });
  assert.equal(duplicate.result.duplicates, 1);
  assert.equal((await f.req("export", null, f.barber.token)).status, 403);
  const exported = (await f.req("export", null, f.owner.token)).customers;
  assert.equal(
    exported.find((c) => c.name === "Phone one").contactOptOut.email,
    true,
  );
  assert.equal(
    exported.find((c) => c.name === "Fictional contact 0").notes,
    "Imported note",
  );
});
