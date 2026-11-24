import { randomUUID } from "node:crypto";
import { rows, key, DEFAULTS } from "./settings.mjs";
// A durable lease prevents overlapping workers from sending the same job.
// Ambiguous provider failures require review rather than risking duplicate texts.
export async function deliverNotifications({
  transaction,
  env,
  fetcher = fetch,
  clock = Date.now,
}) {
  const outcomes = [];
  for (let i = 0; i < 20; i++) {
    const job = await transaction((r) => {
      for (const x of rows(r, "outbox"))
        if (x.status === "sending" && x.leaseUntil < clock()) {
          x.status = "review_required";
          x.reason = "Worker ended before provider outcome was recorded.";
        }
      const j = rows(r, "outbox").find(
        (x) =>
          ["queued", "blocked"].includes(x.status) && x.nextAttempt <= clock(),
      );
      if (!j) return null;
      const n = r[key("notifications", j.notificationId)],
        u = r[key("users", j.userId)],
        prefs = {
          ...DEFAULTS.notifications,
          ...r[key("settings", "user/" + j.userId + "/notifications")]?.value,
        };
      if (
        !n ||
        !u?.active ||
        !prefs[j.channel] ||
        (n.marketing &&
          (!prefs.marketing ||
            r[key("customers", j.userId)]?.contactOptOut?.[j.channel])) ||
        (n.type === "message" && !prefs.newMessage) ||
        (n.type === "booking" && !prefs.booking) ||
        (n.type === "payment" && !prefs.payments)
      ) {
        j.status = "cancelled";
        return { skip: true };
      }
      let target;
      if (j.channel === "push")
        target = rows(r, "devices")
          .filter((d) => d.userId === u.id && d.active)
          .map((d) => d.token);
      else target = j.channel === "email" ? u.email : u.phone;
      const configured =
        j.channel === "push"
          ? target.length
          : j.channel === "email"
            ? env.APP_EMAIL_API_KEY && env.APP_EMAIL_FROM
            : env.APP_SMS_ACCOUNT_ID &&
              env.APP_SMS_AUTH_TOKEN &&
              env.APP_SMS_FROM;
      if (!configured || !target) {
        j.status = "blocked";
        j.reason = "Provider or verified destination is missing.";
        j.nextAttempt = clock() + 3600000;
        return { skip: true };
      }
      j.status = "sending";
      j.lease = randomUUID();
      j.leaseUntil = clock() + 120000;
      j.attempts++;
      return { id: j.id, lease: j.lease, channel: j.channel, n, target };
    });
    if (!job) break;
    if (job.skip) continue;
    let status = "review_required",
      reason = "Provider outcome is uncertain.",
      providerIds = [];
    try {
      let url,
        headers = { "Content-Type": "application/json" },
        body;
      if (job.channel === "push") {
        url = "https://exp.host/--/api/v2/push/send";
        body = job.target.map((to) => ({
          to,
          title: job.n.title,
          body: job.n.body,
          data: job.n.link,
          sound: "default",
        }));
        if (env.APP_EXPO_ACCESS_TOKEN)
          headers.Authorization = "Bearer " + env.APP_EXPO_ACCESS_TOKEN;
      } else if (job.channel === "email") {
        url = "https://api.resend.com/emails";
        headers.Authorization = "Bearer " + env.APP_EMAIL_API_KEY;
        headers["Idempotency-Key"] = "hairflix-" + job.id;
        body = {
          from: env.APP_EMAIL_FROM,
          to: [job.target],
          subject: job.n.title,
          text: job.n.body,
        };
      } else {
        url = `https://api.twilio.com/2010-04-01/Accounts/${env.APP_SMS_ACCOUNT_ID}/Messages.json`;
        headers = {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization:
            "Basic " +
            Buffer.from(
              env.APP_SMS_ACCOUNT_ID + ":" + env.APP_SMS_AUTH_TOKEN,
            ).toString("base64"),
        };
        body = new URLSearchParams({
          From: env.APP_SMS_FROM,
          To: job.target,
          Body: job.n.title + "\n" + job.n.body,
        }).toString();
      }
      const response = await fetcher(url, {
        method: "POST",
        headers,
        body: typeof body === "string" ? body : JSON.stringify(body),
        signal: AbortSignal.timeout(15000),
      });
      const data = await response.json();
      if (response.ok) {
        if (job.channel === "push") {
          const tickets = Array.isArray(data.data) ? data.data : [data.data];
          providerIds = tickets
            .filter((x) => x?.status === "ok")
            .map((x) => x.id);
          status =
            providerIds.length === job.target.length ? "accepted" : "failed";
          reason =
            status === "failed"
              ? "One or more push tokens were rejected."
              : "Awaiting push receipt; acceptance does not prove delivery.";
        } else {
          status = "accepted";
          providerIds = [data.id || data.sid].filter(Boolean);
          reason = "Provider accepted; delivery is not yet verified.";
        }
      } else {
        status = "failed";
        reason =
          "Provider rejected the request. Check the provider dashboard before retrying.";
      }
    } catch {}
    await transaction((r) => {
      const j = r[key("outbox", job.id)];
      if (j?.lease === job.lease) {
        j.status = status;
        j.reason = reason;
        j.providerIds = providerIds;
        j.finishedAt = clock();
        delete j.lease;
        delete j.leaseUntil;
      }
    });
    outcomes.push({ id: job.id, status });
  }
  // Expo receipts describe handoff to APNs/FCM, not whether the user read a notification.
  const accepted = await transaction((r) =>
    rows(r, "outbox")
      .filter(
        (j) =>
          j.channel === "push" &&
          j.status === "accepted" &&
          j.finishedAt < clock() - 900000,
      )
      .slice(0, 20),
  );
  for (const job of accepted) {
    try {
      const headers = { "Content-Type": "application/json" };
      if (env.APP_EXPO_ACCESS_TOKEN)
        headers.Authorization = "Bearer " + env.APP_EXPO_ACCESS_TOKEN;
      const response = await fetcher(
        "https://exp.host/--/api/v2/push/getReceipts",
        {
          method: "POST",
          headers,
          body: JSON.stringify({ ids: job.providerIds }),
          signal: AbortSignal.timeout(10000),
        },
      );
      if (!response.ok) continue;
      const { data = {} } = await response.json();
      await transaction((r) => {
        const j = r[key("outbox", job.id)];
        if (j?.status !== "accepted") return;
        const receipts = job.providerIds.map((id) => data[id]);
        if (receipts.some((x) => x?.status === "error")) {
          j.status = "failed";
          j.reason = "Push delivery receipt reported an error.";
        } else if (
          receipts.length &&
          receipts.every((x) => x?.status === "ok")
        ) {
          j.status = "delivered_to_push_service";
          j.reason =
            "APNs/FCM accepted the notification; user receipt/read is unknown.";
        } else if (j.finishedAt < clock() - 86400000) {
          j.status = "review_required";
          j.reason = "Push receipt unavailable after 24 hours.";
        }
        j.receiptCheckedAt = clock();
      });
    } catch {}
  }
  return { processed: outcomes.length, outcomes };
}
