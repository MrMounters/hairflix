import React, { useState } from "react";
import { Text, View, Switch } from "react-native";
import { Button, Card, Chip, Field, Line, Title, c, s } from "./ui";
import { usePlatform, RecordData } from "./client";
export const groupNames: Record<string, string> = {
  business: "Shop details",
  booking: "Booking & cancellation",
  availability: "Working hours",
  money: "Payments & chair agreements",
  retention: "Retention & loyalty",
  notifications: "Notification preferences",
  profile: "Barber profile",
};
const labels: Record<string, string> = {
  enabled: "Enable",
  prepay: "Require online prepayment",
  depositValue: "Deposit ($ or %)",
  slotMinutes: "Booking intervals (minutes)",
  leadMinutes: "Minimum booking notice (minutes)",
  windowDays: "Book ahead (days)",
  bufferMinutes: "Buffer between visits (minutes)",
  cancellationHours: "Cancellation notice (hours)",
  rescheduleHours: "Rescheduling notice (hours)",
  allowReschedule: "Allow customer rescheduling",
  allowBarberPrices: "Barbers manage their prices",
  allowContactAccess: "Share customer contact details with barbers",
  notifyOwner: "Notify owner of booking changes",
  barberPercent: "Barber service share (%)",
  taxBps: "Tax (basis points; 100 = 1%)",
  rentCents: "Chair rent (cents)",
  collectionDay: "Collection day (week: 1–7, month: 1–31)",
  loyaltyRewardCents: "Shop-funded reward (cents)",
  loyaltyVisits: "Paid visits per reward",
  loyaltyEnabled: "Enable loyalty rewards",
  tipsToBarber: "100% of tips stay with the barber",
  newMessage: "New messages",
  payments: "Payment updates",
  marketing: "I agree to promotional messages",
  quietStart: "Quiet hours begin (Arizona hour)",
  quietEnd: "Quiet hours end (Arizona hour)",
};
const enums: Record<string, string[]> = {
  depositMode: ["full", "fixed", "percent"],
  rentalMode: ["split", "rent"],
  rentPeriod: ["day", "week", "month"],
  employment: ["full-time", "part-time"],
  feeMode: ["business"],
  rewardFunding: ["shop"],
  timezone: ["America/Phoenix"],
  language: ["en", "es", "ar"],
};
export const pretty = (k: string) =>
  labels[k] ||
  k.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase());
function time(n: number) {
  return (
    String(Math.floor(n / 60)).padStart(2, "0") +
    ":" +
    String(n % 60).padStart(2, "0")
  );
}
function minutes(t: string) {
  const [h, m] = t.split(":").map(Number);
  return /^\d{2}:\d{2}$/.test(t) && (h < 24 || (h === 24 && m === 0)) && m < 60
    ? h * 60 + m
    : NaN;
}
export function SettingsEditor({
  group,
  scope,
  done,
}: {
  group: string;
  scope: string;
  done: () => void;
}) {
  const { snapshot, act, busy } = usePlatform(),
    snap = snapshot!;
  const saved = snap.state.settings.find(
    (x: RecordData) => x.group === group && x.scope === scope,
  );
  const inherited = Object.assign(
    {},
    snap.defaults[group],
    ...["organization", ...(scope.startsWith("barber/") ? [] : [])].map(
      (x) =>
        snap.state.settings.find(
          (s: RecordData) => s.scope === x && s.group === group,
        )?.value || {},
    ),
  );
  const [baseline] = useState(saved?.revision || 0);
  const [value, setValue] = useState<RecordData>({
      ...inherited,
      ...saved?.value,
    }),
    [raw, setRaw] = useState<Record<string, string>>({}),
    [error, setError] = useState("");
  const set = (k: string, v: any) => setValue((p) => ({ ...p, [k]: v }));
  const save = async () => {
    setError("");
    try {
      const next = JSON.parse(JSON.stringify(value));
      for (const [k, v] of Object.entries(raw)) {
        if (k.startsWith("week.")) {
          const [, day, edge] = k.split(".").map(Number);
          if (next.week[day]) {
            const m = minutes(v);
            if (!Number.isFinite(m))
              throw Error("Enter valid working hours as HH:MM.");
            next.week[day][edge] = m;
          }
          continue;
        }
        if (typeof snap.defaults[group][k] === "number") {
          if (!v.trim() || !Number.isFinite(Number(v)))
            throw Error(pretty(k) + ": enter a number.");
          next[k] = Number(v);
        } else if (k === "closedDates")
          next[k] = v
            .split(",")
            .map((x) => x.trim())
            .filter(Boolean);
        else if (k === "tipPercents")
          next[k] = v.split(",").map((x) => Number(x.trim()));
      }
      await act("settings.save", {
        group,
        scope,
        revision: baseline,
        value: next,
      });
      done();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <>
      <Title
        title={groupNames[group]}
        sub={`Applies to: ${scope.replace("/", " · ")} · ${saved ? "Saved override" : "Inherited defaults"}`}
      />
      {group === "booking" && (
        <Card>
          <Text style={s.muted}>
            Squire remains the public booking system. Internal booking requires
            a configured live cutover or an explicitly marked pilot. Prepayment
            settings are saved, but online checkout stays unavailable until
            payments are connected.
          </Text>
        </Card>
      )}
      {group === "retention" && (
        <Card>
          <Text style={s.muted}>
            Loyalty stamps follow paid visits. Shop-funded rewards protect the
            performing barber’s commission. Automatic reminder delivery requires
            the notification worker and an enabled channel.
          </Text>
        </Card>
      )}
      {Object.entries(value).map(([k, v]) => {
        if (
          group === "profile" &&
          snap.user.role !== "owner" &&
          ["employment", "locationIds"].includes(k)
        )
          return (
            <Line
              key={k}
              label={pretty(k) + " · owner managed"}
              value={String(v)}
            />
          );
        if (typeof v === "boolean")
          return (
            <View style={[s.line, { marginBottom: 12 }]} key={k}>
              <Text style={[s.text, { flex: 1 }]}>{pretty(k)}</Text>
              <Switch
                accessibilityLabel={pretty(k)}
                value={v}
                onValueChange={(x) => set(k, x)}
                trackColor={{ true: c.red }}
              />
            </View>
          );
        if (k === "week")
          return (
            <Card key={k}>
              {[
                "Sunday",
                "Monday",
                "Tuesday",
                "Wednesday",
                "Thursday",
                "Friday",
                "Saturday",
              ].map((day, i) => (
                <View key={day}>
                  <View style={s.line}>
                    <Text style={s.text}>{day}</Text>
                    <Switch
                      accessibilityLabel={day + " open"}
                      value={!!v[i]}
                      onValueChange={(on) =>
                        set(
                          k,
                          v.map((h: any, j: number) =>
                            i === j ? (on ? [540, 1080] : null) : h,
                          ),
                        )
                      }
                    />
                  </View>
                  {v[i] && (
                    <View style={s.row}>
                      {[0, 1].map((n) => (
                        <View style={{ flex: 1 }} key={n}>
                          <Field
                            label={n ? "Closes (HH:MM)" : "Opens (HH:MM)"}
                            value={raw[`week.${i}.${n}`] ?? time(v[i][n])}
                            onChangeText={(t) =>
                              setRaw((p) => ({ ...p, [`week.${i}.${n}`]: t }))
                            }
                          />
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              ))}
            </Card>
          );
        if (k === "paymentMethods" || k === "locationIds")
          return (
            <View key={k}>
              <Text style={s.caption}>{pretty(k)}</Text>
              <View style={s.chips}>
                {(k === "paymentMethods"
                  ? ["cash", "card", "apple", "google", "cashapp"]
                  : snap.locations.map((x) => x.id)
                ).map((x) => (
                  <Chip
                    key={x}
                    label={x}
                    selected={v.includes(x)}
                    onPress={() =>
                      set(
                        k,
                        v.includes(x)
                          ? v.filter((y: string) => y !== x)
                          : [...v, x],
                      )
                    }
                  />
                ))}
              </View>
              {k === "paymentMethods" && (
                <Text style={s.muted}>
                  Cash is recorded by staff. Card and wallet methods need a
                  connected processor before checkout is available.
                </Text>
              )}
            </View>
          );
        if (enums[k])
          return (
            <View key={k}>
              <Text style={s.caption}>{pretty(k)}</Text>
              <View style={s.chips}>
                {enums[k].map((x) => (
                  <Chip
                    key={x}
                    label={x}
                    selected={v === x}
                    onPress={() => set(k, x)}
                  />
                ))}
              </View>
            </View>
          );
        return (
          <Field
            key={k}
            label={pretty(k) + (Array.isArray(v) ? " (comma separated)" : "")}
            value={raw[k] ?? (Array.isArray(v) ? v.join(", ") : String(v))}
            multiline={["description", "bio", "receiptFooter"].includes(k)}
            keyboardType={typeof v === "number" ? "decimal-pad" : "default"}
            onChangeText={(t) =>
              typeof v === "number" || Array.isArray(v)
                ? setRaw((p) => ({ ...p, [k]: t }))
                : set(k, t)
            }
          />
        );
      })}
      {!!error && <Text style={s.error}>{error}</Text>}
      <Button
        label={busy ? "Saving…" : "Save changes"}
        disabled={busy}
        onPress={() => void save()}
      />
      <Button label="Back" secondary onPress={done} />
    </>
  );
}
