import React, { useState } from "react";
import { Text, View, Switch, Image, Alert, Pressable } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import {
  Button,
  Card,
  Chip,
  Field,
  Line,
  Title,
  Icon,
  c,
  s,
  ClientAvatar,
} from "./ui";
import { usePlatform, RecordData } from "./client";
export const serviceIcons: Record<
  string,
  React.ComponentProps<typeof Icon>["name"]
> = {
  cut: "cut-outline",
  beard: "person-outline",
  razor: "remove-outline",
  face: "sparkles-outline",
  brow: "eye-outline",
  wax: "flame-outline",
  kids: "happy-outline",
  dryer: "color-wand-outline",
};
export const dollars = (n: number) => "$" + ((n || 0) / 100).toFixed(2);
export const dateNow = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Phoenix",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
export const clockTime = (n: number) =>
  String(Math.floor(n / 60)).padStart(2, "0") +
  ":" +
  String(n % 60).padStart(2, "0");
export const parseTime = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  if (!/^\d{2}:\d{2}$/.test(t) || h > 23 || m > 59)
    throw Error("Use 24-hour time, for example 15:15.");
  return h * 60 + m;
};
export function Picker({
  label,
  items,
  value,
  onChange,
}: {
  label: string;
  items: RecordData[];
  value: string;
  onChange: (x: string) => void;
}) {
  return (
    <View>
      <Text style={s.caption}>{label}</Text>
      <View style={s.chips}>
        {items.map((x) => (
          <Chip
            key={x.id}
            label={x.name}
            selected={x.id === value}
            onPress={() => onChange(x.id)}
          />
        ))}
      </View>
    </View>
  );
}
export function useSubmit() {
  const { act, busy } = usePlatform(),
    [error, setError] = useState("");
  return {
    error,
    busy,
    send: async (type: string, p: RecordData, done?: (v: any) => void) => {
      try {
        setError("");
        const v = await act(type, p);
        done?.(v);
      } catch (e) {
        setError((e as Error).message);
      }
    },
  };
}
export function BookingForm({
  customerId = "",
  barberId = "",
  done,
}: {
  customerId?: string;
  barberId?: string;
  done: () => void;
}) {
  const { snapshot } = usePlatform(),
    { state, user, locations, capabilities } = snapshot!,
    { send, error, busy } = useSubmit();
  const [bid, B] = useState(user.role === "barber" ? user.id : barberId),
    [cid, C] = useState(user.role === "customer" ? user.id : customerId),
    [loc, L] = useState(user.locations[0] || locations[0].id),
    [walk, W] = useState(false),
    [date, D] = useState(dateNow()),
    [time, T] = useState("10:00"),
    [services, S] = useState<string[]>([]),
    [name, N] = useState("");
  const catalog = state.services.filter(
      (x: RecordData) => x.active && x.barberId === bid && x.locationId === loc,
    ),
    total = catalog
      .filter((x: RecordData) => services.includes(x.id))
      .reduce((n: number, x: RecordData) => n + x.cents, 0);
  return (
    <>
      <Title
        title="Create a booking"
        sub={
          capabilities.liveBooking
            ? "Live Hairflix calendar"
            : "Internal pilot · does not sync to Squire"
        }
      />
      <Picker
        label="Location"
        items={locations}
        value={loc}
        onChange={(v) => {
          L(v);
          B("");
          S([]);
        }}
      />
      {user.role !== "barber" && (
        <Picker
          label="Barber"
          items={state.users.filter(
            (x: RecordData) => x.role === "barber" && x.locations.includes(loc),
          )}
          value={bid}
          onChange={(v) => {
            B(v);
            S([]);
          }}
        />
      )}
      {user.role !== "customer" && (
        <>
          <Picker
            label="Booking type"
            items={[
              { id: "appointment", name: "Appointment" },
              { id: "walk-in", name: "Walk-in · start now" },
            ]}
            value={walk ? "walk-in" : "appointment"}
            onChange={(v) => W(v === "walk-in")}
          />
          <Picker
            label="Customer"
            items={state.customers}
            value={cid}
            onChange={C}
          />
          {walk && (
            <Field
              label="Walk-in name (if no customer selected)"
              value={name}
              onChangeText={N}
            />
          )}
        </>
      )}
      {!walk && (
        <>
          <Field label="Date (YYYY-MM-DD)" value={date} onChangeText={D} />
          <Field
            label="Time (24-hour HH:MM, Arizona)"
            value={time}
            onChangeText={T}
          />
        </>
      )}
      <Text style={s.caption}>This barber’s services</Text>
      {catalog.map((x: RecordData) => (
        <Pressable
          key={x.id}
          accessibilityRole="checkbox"
          accessibilityLabel={`${x.name}, ${x.minutes} minutes, ${dollars(x.cents)}`}
          accessibilityState={{ checked: services.includes(x.id) }}
          onPress={() =>
            S(
              services.includes(x.id)
                ? services.filter((id) => id !== x.id)
                : [...services, x.id],
            )
          }
        >
          <Card
            style={{ borderColor: services.includes(x.id) ? c.red : c.line }}
          >
            <View style={s.row}>
              <Icon name={serviceIcons[x.icon] || "cut-outline"} />
              <View style={{ flex: 1 }}>
                <Text style={s.text}>{x.name}</Text>
                <Text style={s.muted}>{x.minutes} min</Text>
              </View>
              <Text style={s.text}>{dollars(x.cents)}</Text>
              {services.includes(x.id) && (
                <Icon name="checkmark-circle" color={c.red} />
              )}
            </View>
          </Card>
        </Pressable>
      ))}
      {!catalog.length && (
        <Text style={s.muted}>
          Choose a barber with services configured at this location.
        </Text>
      )}
      <Line label="Services subtotal" value={dollars(total)} />
      <Text style={s.muted}>
        Availability is checked again on the server when you save. Overlapping
        appointments and time off are rejected.
      </Text>
      {!!error && <Text style={s.error}>{error}</Text>}
      <Button
        label="Confirm booking"
        disabled={busy || !services.length}
        onPress={() => {
          try {
            void send(
              "visit.book",
              {
                barberId: bid,
                customerId: cid,
                locationId: loc,
                walkIn: walk,
                client: name,
                date,
                start: walk ? 0 : parseTime(time),
                serviceIds: services,
              },
              done,
            );
          } catch (e) {
            Alert.alert("Check time", (e as Error).message);
          }
        }}
      />
    </>
  );
}
export function ServiceForm({
  existing,
  done,
}: {
  existing?: RecordData;
  done: () => void;
}) {
  const { snapshot } = usePlatform(),
    { user, state, locations } = snapshot!,
    { send, error, busy } = useSubmit();
  const [v, V] = useState<RecordData>(
    existing || {
      name: "",
      description: "",
      minutes: 30,
      cents: 3500,
      icon: "cut",
      category: "Haircuts",
      locationId: user.locations[0],
      barberId: user.role === "barber" ? user.id : "",
    },
  );
  const [price, Price] = useState(String(v.cents / 100));
  const set = (k: string, x: any) => V((p) => ({ ...p, [k]: x }));
  return (
    <>
      <Title title={existing ? "Edit service" : "New service"} />
      {user.role === "owner" && (
        <Picker
          label="Barber"
          items={state.users.filter((x: RecordData) => x.role === "barber")}
          value={v.barberId}
          onChange={(x) => set("barberId", x)}
        />
      )}
      <Picker
        label="Location"
        items={locations}
        value={v.locationId}
        onChange={(x) => set("locationId", x)}
      />
      {["name", "description", "category"].map((k) => (
        <Field key={k} label={k} value={v[k]} onChangeText={(x) => set(k, x)} />
      ))}
      <Field
        label="Price in dollars"
        value={price}
        keyboardType="decimal-pad"
        onChangeText={(x) => {
          Price(x);
          set("cents", Math.round(Number(x) * 100));
        }}
      />
      <Field
        label="Duration (minutes)"
        value={String(v.minutes)}
        keyboardType="number-pad"
        onChangeText={(x) => set("minutes", Number(x))}
      />
      <Picker
        label="Service icon"
        items={[
          "cut",
          "beard",
          "razor",
          "face",
          "brow",
          "wax",
          "kids",
          "dryer",
        ].map((id) => ({ id, name: id }))}
        value={v.icon}
        onChange={(x) => set("icon", x)}
      />
      {!!error && <Text style={s.error}>{error}</Text>}
      <Button
        label="Save service"
        disabled={busy}
        onPress={() => void send("service.save", v, done)}
      />
      {existing && (
        <Button
          label={v.active ? "Archive service" : "Restore service"}
          secondary
          disabled={busy}
          onPress={() =>
            void send("service.save", { ...v, active: !v.active }, done)
          }
        />
      )}
    </>
  );
}
export function BlockForm({
  absence = false,
  done,
}: {
  absence?: boolean;
  done: () => void;
}) {
  const { snapshot } = usePlatform(),
    { user, state } = snapshot!,
    { send, error, busy } = useSubmit();
  const [bid, B] = useState(user.role === "barber" ? user.id : ""),
    [from, F] = useState(dateNow()),
    [through, T] = useState(dateNow()),
    [full, H] = useState(true),
    [start, S] = useState("12:00"),
    [end, E] = useState("13:00"),
    [reason, R] = useState("Vacation");
  return (
    <>
      <Title
        title={absence ? "Report an absence" : "Block time off"}
        sub={
          absence
            ? "Affected appointments will be flagged for owner reassignment."
            : "Existing appointments must be resolved before blocking time."
        }
      />
      {user.role === "owner" && (
        <Picker
          label="Barber"
          items={state.users.filter((x: RecordData) => x.role === "barber")}
          value={bid}
          onChange={B}
        />
      )}
      <Field label="From (YYYY-MM-DD)" value={from} onChangeText={F} />
      <Field label="Through (YYYY-MM-DD)" value={through} onChangeText={T} />
      {!absence && (
        <>
          <View style={s.line}>
            <Text style={s.text}>Full days</Text>
            <Switch value={full} onValueChange={H} />
          </View>
          {!full && (
            <>
              <Field label="Starts HH:MM" value={start} onChangeText={S} />
              <Field label="Ends HH:MM" value={end} onChangeText={E} />
            </>
          )}
        </>
      )}
      <Field label="Reason" value={reason} onChangeText={R} />
      {!!error && <Text style={s.error}>{error}</Text>}
      <Button
        label="Save block"
        disabled={busy}
        onPress={() => {
          try {
            void send(
              absence ? "absence" : "block.save",
              {
                barberId: bid,
                from,
                through,
                fullDay: full,
                start: parseTime(start),
                end: parseTime(end),
                reason,
              },
              done,
            );
          } catch (e) {
            Alert.alert("Check time", (e as Error).message);
          }
        }}
      />
    </>
  );
}
export function VisitScreen({ id, done }: { id: string; done: () => void }) {
  const { snapshot, act } = usePlatform(),
    { user, state } = snapshot!,
    { send, error, busy } = useSubmit();
  const v = state.visits.find((x: RecordData) => x.id === id);
  const [date, D] = useState(v?.date || dateNow()),
    [time, T] = useState(clockTime(v?.start || 600)),
    [tip, I] = useState("0"),
    [notes, N] = useState(v?.customerNotes || ""),
    [shared, H] = useState(!!v?.shareNotesWithBarber),
    [bid, B] = useState(v?.barberId || "");
  if (!v) return <Text style={s.muted}>This appointment is unavailable.</Text>;
  const staff = user.role !== "customer";
  const action = (type: string, p: RecordData = {}) =>
    void send("visit." + type, { id: v.id, revision: v.revision, ...p });
  const deadline =
    Date.parse(`${v.date}T${clockTime(v.start)}:00-07:00`) -
    v.policy.cancellationHours * 3600000;
  const hours = Math.max(0, Math.floor((deadline - Date.now()) / 3600000));
  return (
    <>
      <Title
        title={v.client}
        sub={`${v.date} · ${clockTime(v.start)} · ${v.status.replaceAll("_", " ")}`}
      />
      <Card>
        {v.services.map((x: RecordData, i: number) => (
          <Line
            key={i}
            label={`${x.name} · ${x.minutes} min`}
            value={dollars(x.cents)}
          />
        ))}
        <Line label="Tax" value={dollars(v.taxCents)} />
        {!!v.creditCents && (
          <Line
            label="Shop-funded loyalty credit"
            value={"-" + dollars(v.creditCents)}
          />
        )}
        <Line label="Tip" value={dollars(v.tipCents)} />
        <Line label="Total" value={dollars(v.totalCents)} strong />
        <Line label="Approval" value={v.approvalStatus} />
        <Line label="Payment" value={v.paymentStatus} />
        {v.source === "pilot" && (
          <Text style={s.muted}>Pilot appointment · not sent to Squire</Text>
        )}
      </Card>
      {["booked", "needs_reassignment"].includes(v.status) && (
        <>
          <Field label="New date YYYY-MM-DD" value={date} onChangeText={D} />
          <Field label="New time HH:MM" value={time} onChangeText={T} />
          <Button
            label="Reschedule"
            disabled={busy}
            onPress={() => {
              try {
                action("reschedule", { date, start: parseTime(time) });
              } catch (e) {
                Alert.alert("Time", (e as Error).message);
              }
            }}
          />
          {user.role === "owner" && (
            <>
              <Picker
                label="Reassign barber · price stays as booked"
                items={state.users.filter(
                  (x: RecordData) =>
                    x.role === "barber" && x.locations.includes(v.locationId),
                )}
                value={bid}
                onChange={B}
              />
              <Button
                label="Confirm reassignment"
                secondary
                disabled={busy}
                onPress={() => {
                  try {
                    action("reassign", {
                      barberId: bid,
                      date,
                      start: parseTime(time),
                    });
                  } catch (e) {
                    Alert.alert("Time", (e as Error).message);
                  }
                }}
              />
            </>
          )}
          <Button
            label="Cancel appointment"
            secondary
            disabled={busy}
            onPress={() =>
              Alert.alert(
                "Cancel appointment?",
                Date.now() > deadline
                  ? "Inside the notice window. Saved cancellation terms apply."
                  : "Within the cancellation notice window.",
                [
                  { text: "Keep appointment" },
                  {
                    text: "Cancel appointment",
                    style: "destructive",
                    onPress: () => action("cancel"),
                  },
                ],
              )
            }
          />
          <Text style={s.muted}>
            {hours
              ? `${hours} hours left before the cancellation notice deadline.`
              : "Inside the cancellation notice window. Contact the shop about applicable terms."}
          </Text>
          {staff && v.status === "booked" && (
            <Button
              label="Start visit"
              disabled={busy}
              onPress={() => action("start")}
            />
          )}
        </>
      )}
      {staff && v.status === "booked" && (
        <Button
          label="Mark no-show (after 15 minutes)"
          secondary
          disabled={busy}
          onPress={() => action("noShow")}
        />
      )}{" "}
      {staff && v.status === "in_service" && <TicketEditor visit={v} />}
      {staff &&
        v.status === "in_service" &&
        !v.rewardId &&
        state.ledger
          .filter(
            (r: RecordData) =>
              r.kind === "loyalty-reward" &&
              r.customerId === v.customerId &&
              !r.redeemedAt &&
              !r.reservedVisitId,
          )
          .map((r: RecordData) => (
            <Button
              key={r.id}
              label={"Apply shop-funded reward · " + dollars(r.amountCents)}
              disabled={busy}
              secondary
              onPress={() => action("reward", { rewardId: r.id })}
            />
          ))}
      {staff && v.status === "in_service" && (
        <Button
          label="Finish & request customer approval"
          disabled={busy}
          onPress={() => action("request")}
        />
      )}
      {v.status === "completed" && (
        <>
          <Field
            label="Optional tip ($)"
            keyboardType="decimal-pad"
            value={tip}
            onChangeText={I}
          />
          {!staff && v.approvalStatus === "requested" && (
            <Button
              label="Approve this ticket"
              disabled={busy}
              onPress={() =>
                action("approve", { tipCents: Math.round(Number(tip) * 100) })
              }
            />
          )}{" "}
          {staff &&
            v.approvalStatus === "requested" &&
            !state.users.some((u: RecordData) => u.id === v.customerId) && (
              <Button
                label="Record in-person customer approval"
                disabled={busy}
                onPress={() =>
                  Alert.alert(
                    "Customer approval",
                    "Confirm the customer reviewed this final ticket and the optional tip in person.",
                    [
                      { text: "Back" },
                      {
                        text: "Customer approved",
                        onPress: () =>
                          action("approveInPerson", {
                            confirm: true,
                            tipCents: Math.round(Number(tip) * 100),
                          }),
                      },
                    ],
                  )
                }
              />
            )}{" "}
          {staff &&
            v.approvalStatus === "approved" &&
            v.paymentStatus === "unpaid" && (
              <Button
                label={`Record cash received · ${dollars(v.totalCents)}`}
                disabled={busy}
                onPress={() =>
                  Alert.alert(
                    "Cash received?",
                    `Record ${dollars(v.totalCents)} actually received. This does not charge a card.`,
                    [
                      { text: "Back" },
                      {
                        text: "Cash received",
                        onPress: () =>
                          action("cash", { amountCents: v.totalCents }),
                      },
                    ],
                  )
                }
              />
            )}{" "}
          {!staff && (
            <Card>
              <Field
                label="Remember this haircut"
                multiline
                value={notes}
                onChangeText={N}
              />
              <View style={s.line}>
                <Text style={s.text}>Share notes with my barber</Text>
                <Switch value={shared} onValueChange={H} />
              </View>
              <Button
                label="Save haircut notes"
                disabled={busy}
                onPress={() =>
                  void send("memory.save", { visitId: id, notes, shared })
                }
              />
              <PhotoUpload visitId={id} barberId={v.barberId} />
            </Card>
          )}
        </>
      )}
      {!!error && <Text style={s.error}>{error}</Text>}
      <Button label="Back to calendar" secondary onPress={done} />
    </>
  );
}
export function PhotoUpload({
  visitId,
  barberId,
  profile = false,
}: {
  profile?: boolean;
  visitId?: string;
  barberId?: string;
}) {
  const { snapshot } = usePlatform(),
    { send, error, busy } = useSubmit(),
    [caption, C] = useState(""),
    [shared, S] = useState(false),
    [portfolio, P] = useState(false);
  const customer = snapshot!.user.role === "customer";
  async function pick() {
    try {
      const permission =
        await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          "Photo permission",
          "Allow access to a photo to upload your haircut.",
        );
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        base64: true,
        quality: 0.25,
        allowsEditing: true,
        aspect: [1, 1],
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      const photo = await manipulateAsync(
        asset.uri,
        [
          {
            resize:
              asset.width >= asset.height ? { width: 900 } : { height: 900 },
          },
        ],
        { compress: 0.6, format: SaveFormat.JPEG, base64: true },
      );
      if (!photo.base64 || photo.base64.length > 499000) {
        Alert.alert(
          "Photo too large",
          "Choose a smaller photo or crop it more. Limit: 375 KB.",
        );
        return;
      }
      await send(
        "media.save",
        {
          visitId,
          barberId,
          profile,
          data: `data:image/jpeg;base64,${photo.base64}`,
          caption,
          sharedWithBarber: shared,
        },
        async (m) => {
          if (portfolio)
            await send("media.share", {
              id: m.id,
              sharedWithBarber: true,
              publicationRequested: true,
            });
        },
      );
    } catch (e) {
      Alert.alert("Upload failed", (e as Error).message);
    }
  }
  return (
    <>
      <Field label="Photo caption" value={caption} onChangeText={C} />
      {customer && (
        <>
          <View style={s.line}>
            <Text style={s.text}>Share photo with barber</Text>
            <Switch value={shared} onValueChange={S} />
          </View>
          <View style={s.line}>
            <Text style={[s.text, { flex: 1 }]}>
              I consent to portfolio publication after barber review
            </Text>
            <Switch value={portfolio} onValueChange={P} />
          </View>
        </>
      )}
      <Button
        label="Choose & upload photo"
        secondary
        disabled={busy || (!customer && !barberId)}
        onPress={() => void pick()}
      />
      {!!error && <Text style={s.error}>{error}</Text>}
    </>
  );
}
export function Photo({ media }: { media: RecordData }) {
  const { request } = usePlatform(),
    [data, D] = useState("");
  React.useEffect(() => {
    request("media?id=" + encodeURIComponent(media.id))
      .then((x) => D(x.data))
      .catch(() => {});
  }, [media.id]);
  return data ? (
    <Image
      source={{ uri: data }}
      accessibilityLabel={media.caption || "Haircut photo"}
      style={{ width: "100%", height: 280, borderRadius: 14, marginBottom: 12 }}
      resizeMode="contain"
    />
  ) : (
    <Text style={s.muted}>Loading photo…</Text>
  );
}

function TicketEditor({ visit }: { visit: RecordData }) {
  const { snapshot } = usePlatform(),
    { send, error, busy } = useSubmit();
  const [open, O] = useState(false),
    [lines, L] = useState<RecordData[]>(
      visit.services.map((x: RecordData) => ({
        ...x,
        price: String(x.cents / 100),
      })),
    );
  const update = (i: number, k: string, value: any) =>
    L((p) => p.map((x, j) => (i === j ? { ...x, [k]: value } : x)));
  if (!open)
    return (
      <Button
        label="Edit final ticket services"
        secondary
        onPress={() => O(true)}
      />
    );
  return (
    <Card>
      <Text style={s.h2}>Final ticket</Text>
      {lines.map((x, i) => (
        <View key={i}>
          <Field
            label={`Line ${i + 1} service`}
            value={x.name}
            onChangeText={(v) => update(i, "name", v)}
          />
          <Field
            label="Price ($)"
            value={x.price}
            keyboardType="decimal-pad"
            onChangeText={(v) => update(i, "price", v)}
          />
          <Field
            label="Minutes"
            value={String(x.minutes)}
            keyboardType="number-pad"
            onChangeText={(v) => update(i, "minutes", Number(v))}
          />
          <Button
            label="Remove service line"
            secondary
            onPress={() => L((p) => p.filter((_, j) => j !== i))}
          />
        </View>
      ))}
      <Text style={s.caption}>Add a service</Text>
      {snapshot!.state.services
        .filter(
          (x: RecordData) =>
            x.active &&
            x.barberId === visit.barberId &&
            x.locationId === visit.locationId,
        )
        .map((x: RecordData) => (
          <Chip
            key={x.id}
            label={x.name}
            onPress={() =>
              L((p) => [...p, { ...x, price: String(x.cents / 100) }])
            }
          />
        ))}
      {!!error && <Text style={s.error}>{error}</Text>}
      <Button
        label="Save revised ticket"
        disabled={busy}
        onPress={() =>
          void send(
            "visit.ticket",
            {
              id: visit.id,
              revision: visit.revision,
              lines: lines.map((x) => ({
                id: x.id,
                name: x.name,
                minutes: x.minutes,
                cents: Math.round(Number(x.price) * 100),
              })),
            },
            () => O(false),
          )
        }
      />
      <Button label="Discard changes" secondary onPress={() => O(false)} />
    </Card>
  );
}
