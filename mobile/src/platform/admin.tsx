import React, { useState } from "react";
import { Text, View, Share, Alert } from "react-native";
import { Button, Card, Field, Title, Line, Chip, s } from "./ui";
import { usePlatform, RecordData } from "./client";
import { Picker, useSubmit, dollars, dateNow } from "./flows";
export function Team({ onProfile }: { onProfile: (id: string) => void }) {
  const { snapshot } = usePlatform(),
    { state, locations } = snapshot!,
    { send, error, busy } = useSubmit(),
    [name, N] = useState(""),
    [email, E] = useState(""),
    [role, R] = useState("barber"),
    [loc, L] = useState("scottsdale"),
    [code, C] = useState("");
  return (
    <>
      <Title
        title="Your team"
        sub="Staff roles are granted by invitation, never by switching a demo role."
      />
      {state.users
        .filter((x: RecordData) => x.role !== "customer")
        .map((u: RecordData) => (
          <Card key={u.id}>
            <Text style={s.h2}>{u.name}</Text>
            <Text style={s.muted}>
              {u.role} · {u.locations.join(", ")}{" "}
              {u.role === "barber"
                ? " · " +
                  (state.settings.find(
                    (s: RecordData) =>
                      s.scope === "barber/" + u.id && s.group === "profile",
                  )?.value.employment || "full-time")
                : ""}
            </Text>
            {u.role === "barber" && (
              <>
                <Button
                  label="Edit profile & employment"
                  secondary
                  onPress={() => onProfile(u.id)}
                />
                <Picker
                  label="Assigned location"
                  items={[...locations, { id: "both", name: "Both locations" }]}
                  value={u.locations.length === 2 ? "both" : u.locations[0]}
                  onChange={(v) =>
                    void send("user.update", {
                      id: u.id,
                      locations:
                        v === "both" ? locations.map((l) => l.id) : [v],
                    })
                  }
                />
                <Button
                  label={
                    u.availabilityLocked
                      ? "Let barber edit working hours"
                      : "Owner manages working hours"
                  }
                  secondary
                  disabled={busy}
                  onPress={() =>
                    void send("user.update", {
                      id: u.id,
                      availabilityLocked: !u.availabilityLocked,
                    })
                  }
                />
                <Button
                  label="Deactivate barber"
                  secondary
                  disabled={busy}
                  onPress={() =>
                    Alert.alert(
                      "Deactivate barber?",
                      "Resolve future appointments before removing their access.",
                      [
                        { text: "Back" },
                        {
                          text: "Deactivate",
                          style: "destructive",
                          onPress: () =>
                            void send("user.update", {
                              id: u.id,
                              active: false,
                            }),
                        },
                      ],
                    )
                  }
                />
              </>
            )}
          </Card>
        ))}
      <Title title="Invite staff" />
      <Field label="Name" value={name} onChangeText={N} />
      <Field
        label="Email"
        value={email}
        onChangeText={E}
        autoCapitalize="none"
        keyboardType="email-address"
      />
      <Picker
        label="Role"
        items={[
          { id: "barber", name: "Barber Pro" },
          { id: "owner", name: "Owner · full access" },
        ]}
        value={role}
        onChange={R}
      />
      <Picker
        label="Location"
        items={[...locations, { id: "both", name: "Both locations" }]}
        value={loc}
        onChange={L}
      />
      <Button
        label="Create invitation"
        disabled={busy}
        onPress={() =>
          void send(
            "invite.create",
            {
              name,
              email,
              role,
              locations: loc === "both" ? locations.map((l) => l.id) : [loc],
            },
            (v) => C(v.code),
          )
        }
      />
      {!!code && (
        <Card>
          <Text style={s.text} selectable>
            Invitation code: {code}
          </Text>
          <Text style={s.muted}>
            Valid seven days. Send privately to the invited email holder. This
            grants the role selected above.
          </Text>
          <Button
            label="Share invitation"
            secondary
            onPress={() =>
              void Share.share({
                message: `Your Hairflix staff invitation: ${code}\nCreate an account with ${email} and paste this code. Expires in seven days.`,
              })
            }
          />
        </Card>
      )}
      {!!error && <Text style={s.error}>{error}</Text>}
    </>
  );
}
// CSV importer supports quoted commas, newlines and escaped double quotes.
export function parseCustomers(text: string): RecordData[] {
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
  const header = rows.shift()?.map((x) => x.trim().toLowerCase());
  if (!header?.includes("name"))
    throw Error("CSV needs name, email, phone column headers.");
  return rows.map((r) =>
    Object.fromEntries(header.map((k, i) => [k, r[i]?.trim() || ""])),
  );
}
export function Customers() {
  const { snapshot, request } = usePlatform(),
    { state, user } = snapshot!,
    { send, error, busy } = useSubmit(),
    [name, N] = useState(""),
    [email, E] = useState(""),
    [phone, P] = useState(""),
    [csv, C] = useState(""),
    [preview, V] = useState<RecordData[] | null>(null),
    [report, R] = useState<RecordData | null>(null),
    [keep, K] = useState(""),
    [remove, M] = useState(""),
    [localError, X] = useState("");
  return (
    <>
      <Title title="Customers" />
      {state.customers.map((x: RecordData) => (
        <Card key={x.id}>
          <Text style={s.h2}>{x.name}</Text>
          <Text style={s.muted}>
            {x.email || ""} {x.phone || ""}
          </Text>
        </Card>
      ))}
      <Title title="Add customer" />
      <Field label="Name" value={name} onChangeText={N} />
      <Field label="Email" value={email} onChangeText={E} />
      <Field label="Phone" value={phone} onChangeText={P} />
      <Button
        label="Save customer"
        disabled={busy}
        onPress={() =>
          void send("customer.save", { name, email, phone }, () => {
            N("");
            E("");
            P("");
          })
        }
      />
      {user.role === "owner" && (
        <>
          <Title
            title="Import & export"
            sub="Imports do not opt anyone into marketing. Account-linked identities are never merged automatically."
          />
          <Field
            label="Paste CSV (name,email,phone) or JSON rows"
            multiline
            value={csv}
            onChangeText={(v) => {
              C(v);
              V(null);
            }}
          />
          <Button
            label="Preview import"
            secondary
            onPress={() => {
              try {
                X("");
                const rows = parseCustomers(csv);
                if (!rows.length || rows.length > 500)
                  throw Error("Import 1–500 customers at a time.");
                V(rows);
              } catch (e) {
                X((e as Error).message);
              }
            }}
          />
          {preview && (
            <Card>
              <Text style={s.text}>
                {preview.length} rows ready for validation
              </Text>
              {preview.slice(0, 5).map((r, i) => (
                <Text style={s.muted} key={i}>
                  {r.name} · {r.email}
                </Text>
              ))}
              <Button
                label="Confirm import"
                disabled={busy}
                onPress={() =>
                  void send("customers.import", { rows: preview }, (v) => {
                    R(v);
                    V(null);
                    C("");
                  })
                }
              />
            </Card>
          )}
          {report && (
            <Card>
              <Text style={s.text}>
                {report.created} added · {report.duplicates} duplicates ·{" "}
                {report.rejected.length} rejected
              </Text>
              {report.rejected.map((r: RecordData) => (
                <Text key={r.row} style={s.error}>
                  Row {r.row}: {r.error}
                </Text>
              ))}
            </Card>
          )}
          <Button
            label="Export customer JSON"
            secondary
            onPress={() =>
              request("export")
                .then((v) =>
                  Share.share({ message: JSON.stringify(v, null, 2) }),
                )
                .catch((e) => X(e.message))
            }
          />
          <Title title="Merge duplicate imports" />
          <Picker
            label="Keep customer"
            items={state.customers.filter((x: RecordData) => !x.userId)}
            value={keep}
            onChange={K}
          />
          <Picker
            label="Remove duplicate"
            items={state.customers.filter(
              (x: RecordData) => !x.userId && x.id !== keep,
            )}
            value={remove}
            onChange={M}
          />
          <Button
            label="Merge selected duplicates"
            secondary
            disabled={busy || !keep || !remove}
            onPress={() =>
              Alert.alert(
                "Merge records?",
                "Visits, messages and ledger references move to the kept record. This cannot be automatically undone.",
                [
                  { text: "Back" },
                  {
                    text: "Merge",
                    onPress: () =>
                      void send("customer.merge", {
                        keepId: keep,
                        removeId: remove,
                      }),
                  },
                ],
              )
            }
          />
        </>
      )}
      {!!(error || localError) && (
        <Text style={s.error}>{error || localError}</Text>
      )}
    </>
  );
}
export function Reports() {
  const { snapshot } = usePlatform(),
    { state, user, locations } = snapshot!,
    [loc, L] = useState("all"),
    [from, F] = useState(dateNow().slice(0, 7) + "-01"),
    [through, T] = useState(dateNow()),
    { send, error, busy } = useSubmit(),
    [bid, B] = useState(""),
    [due, D] = useState(dateNow());
  const visits = state.visits.filter(
      (v: RecordData) =>
        (loc === "all" || v.locationId === loc) &&
        v.date >= from &&
        v.date <= through,
    ),
    ledger = state.ledger.filter(
      (x: RecordData) =>
        x.kind === "service" &&
        visits.some((v: RecordData) => v.id === x.visitId),
    ),
    sum = (k: string) =>
      ledger.reduce((n: number, x: RecordData) => n + (x[k] || 0), 0);
  return (
    <>
      <Title
        title={user.role === "owner" ? "Shop performance" : "Your earnings"}
        sub="Based on recorded paid tickets. Staff-recorded cash is separate from processor-verified funds."
      />
      <Picker
        label="Location"
        items={[{ id: "all", name: "All locations" }, ...locations]}
        value={loc}
        onChange={L}
      />
      <Field label="From YYYY-MM-DD" value={from} onChangeText={F} />
      <Field label="Through YYYY-MM-DD" value={through} onChangeText={T} />
      <Card>
        <Line label="Service sales" value={dollars(sum("serviceCents"))} />
        <Line label="Tips · barber owned" value={dollars(sum("tipCents"))} />
        <Line label="Tax collected" value={dollars(sum("taxCents"))} />
        <Line label="Barber earnings" value={dollars(sum("barberCents"))} />
        {user.role === "owner" && (
          <Line label="Shop service share" value={dollars(sum("shopCents"))} />
        )}
        <Line label="Paid tickets" value={String(ledger.length)} />
        <Line
          label="Cancellations"
          value={String(
            visits.filter((v: RecordData) => v.status === "cancelled").length,
          )}
        />
      </Card>
      {state.users
        .filter(
          (u: RecordData) =>
            u.role === "barber" && (user.role === "owner" || u.id === user.id),
        )
        .map((u: RecordData) => {
          const own = visits.filter((v: RecordData) => v.barberId === u.id);
          const days = new Set(
            own
              .filter((v: RecordData) => v.paymentStatus === "paid")
              .map((v: RecordData) => v.date),
          ).size;
          return (
            <Card key={u.id}>
              <Text style={s.h2}>{u.name}</Text>
              <Line label="Days with paid work" value={String(days)} />
              <Line
                label="Blocked days"
                value={String(
                  new Set(
                    state.blocks
                      .filter(
                        (b: RecordData) =>
                          b.barberId === u.id &&
                          b.date >= from &&
                          b.date <= through,
                      )
                      .map((b: RecordData) => b.date),
                  ).size,
                )}
              />
              <Line
                label="No-show rate · closed visits"
                value={
                  (
                    (own.filter((v: RecordData) => v.status === "no_show")
                      .length /
                      Math.max(
                        1,
                        own.filter((v: RecordData) =>
                          ["completed", "no_show"].includes(v.status),
                        ).length,
                      )) *
                    100
                  ).toFixed(1) + "%"
                }
              />
              <Line
                label="Needs reassignment"
                value={String(
                  own.filter(
                    (v: RecordData) => v.status === "needs_reassignment",
                  ).length,
                )}
              />
            </Card>
          );
        })}
      <Title title="Chair rent" />
      {state.rentals.map((r: RecordData) => (
        <Card key={r.id}>
          <Text style={s.text}>
            {state.users.find((x: RecordData) => x.id === r.barberId)?.name} ·{" "}
            {r.dueDate} · {dollars(r.amountCents)}
          </Text>
          <Text style={s.muted}>{r.status}</Text>
          {user.role === "owner" && r.status === "due" && (
            <Button
              label="Record rent received"
              secondary
              disabled={busy}
              onPress={() =>
                Alert.alert("Rent received?", dollars(r.amountCents), [
                  { text: "Back" },
                  {
                    text: "Received",
                    onPress: () =>
                      void send("rental.settle", {
                        id: r.id,
                        amountCents: r.amountCents,
                      }),
                  },
                ])
              }
            />
          )}
        </Card>
      ))}
      {user.role === "owner" && (
        <>
          <Picker
            label="Rental barber"
            items={state.users.filter((u: RecordData) => u.role === "barber")}
            value={bid}
            onChange={B}
          />
          <Field
            label="Rent due date YYYY-MM-DD"
            value={due}
            onChangeText={D}
          />
          <Button
            label="Create rent invoice"
            disabled={busy || loc === "all"}
            onPress={() =>
              void send("rental.create", {
                barberId: bid,
                locationId: loc,
                dueDate: due,
              })
            }
          />
          <Text style={s.muted}>
            Choose one location and configure this barber’s chair agreement as
            rent before creating an invoice.
          </Text>
        </>
      )}
      {!!error && <Text style={s.error}>{error}</Text>}
    </>
  );
}
export function Growth() {
  const { snapshot } = usePlatform(),
    { state } = snapshot!,
    { send, error, busy } = useSubmit(),
    [title, T] = useState(""),
    [body, B] = useState(""),
    [audience, A] = useState("all"),
    [channel, C] = useState("email");
  return (
    <>
      <Title
        title="Growth & retention"
        sub="Promotions go only to signed-in customers who opted into the selected channel and marketing."
      />
      <Field label="Campaign title" value={title} onChangeText={T} />
      <Field label="Message" multiline value={body} onChangeText={B} />
      <Picker
        label="Audience"
        items={["all", "overdue", "new"].map((id) => ({ id, name: id }))}
        value={audience}
        onChange={A}
      />
      <Picker
        label="Delivery channel"
        items={["email", "sms"].map((id) => ({ id, name: id }))}
        value={channel}
        onChange={C}
      />
      <Button
        label="Save campaign draft"
        disabled={busy}
        onPress={() =>
          void send("campaign.save", { title, body, audience, channel })
        }
      />
      {state.campaigns.map((x: RecordData) => (
        <Card key={x.id}>
          <Text style={s.h2}>{x.title}</Text>
          <Text style={s.text}>{x.body}</Text>
          <Text style={s.muted}>
            {x.status} · {x.channel} · {x.recipients ?? "Not sent"}
          </Text>
          {x.status === "draft" && (
            <Button
              label="Review & queue campaign"
              disabled={busy}
              onPress={() =>
                Alert.alert(
                  "Queue promotion?",
                  `Only opted-in ${x.channel} subscribers will receive this message.`,
                  [
                    { text: "Back" },
                    {
                      text: "Queue",
                      onPress: () =>
                        void send("campaign.send", { id: x.id, confirm: true }),
                    },
                  ],
                )
              }
            />
          )}
        </Card>
      ))}
      {!!error && <Text style={s.error}>{error}</Text>}
    </>
  );
}
