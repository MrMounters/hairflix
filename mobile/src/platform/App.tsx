import React, { useState, useEffect } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";
import { StatusBar } from "expo-status-bar";
import {
  Card,
  Title,
  Button,
  Chip,
  Field,
  Line,
  Icon,
  ClientAvatar,
  c,
  s,
} from "./ui";
import { PlatformProvider, usePlatform, RecordData } from "./client";
import { SettingsEditor, groupNames } from "./settings";
import {
  BookingForm,
  BlockForm,
  ServiceForm,
  VisitScreen,
  PhotoUpload,
  Photo,
  Picker,
  useSubmit,
  dollars,
  dateNow,
  clockTime,
} from "./flows";
import { Team, Customers, Reports, Growth } from "./admin";
function Auth() {
  const { login, busy, error, configured } = usePlatform(),
    [mode, M] = useState("login"),
    [email, E] = useState(""),
    [password, P] = useState(""),
    [name, N] = useState(""),
    [code, C] = useState("");
  return (
    <View style={{ maxWidth: 500, width: "100%", alignSelf: "center" }}>
      <Text style={[s.caption, { marginTop: 30 }]}>
        HAIRFLIX · THE FRESH CUT CLUB
      </Text>
      <Title
        title="Your next great cut.\nYour shop, connected."
        sub="Appointments, conversations and your haircut history in one place."
      />
      <View style={s.chips}>
        {[
          { id: "login", name: "Sign in" },
          { id: "register", name: "Create account" },
          { id: "activate", name: "Activate owner" },
        ].map((x) => (
          <Chip
            key={x.id}
            label={x.name}
            selected={mode === x.id}
            onPress={() => M(x.id)}
          />
        ))}
      </View>
      {mode !== "login" && (
        <Field
          label="Your name"
          value={name}
          onChangeText={N}
          autoComplete="name"
        />
      )}
      <Field
        label="Email"
        value={email}
        onChangeText={E}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
      />
      <Field
        label="Password (12+ characters)"
        value={password}
        onChangeText={P}
        secureTextEntry
        autoComplete={mode === "login" ? "current-password" : "new-password"}
      />
      {mode !== "login" && (
        <Field
          label={
            mode === "activate"
              ? "Private owner activation code"
              : "Staff invitation code (customers leave blank)"
          }
          value={code}
          onChangeText={C}
          secureTextEntry
          autoCapitalize="none"
        />
      )}
      {!configured && (
        <Text style={s.error}>
          This build needs EXPO_PUBLIC_APP_API_URL configured. No accounts or
          bookings are saved locally as a substitute.
        </Text>
      )}
      {!!error && (
        <Text accessibilityRole="alert" style={s.error}>
          {error}
        </Text>
      )}
      <Button
        label={
          busy
            ? "Connecting…"
            : mode === "login"
              ? "Sign in"
              : "Create secure account"
        }
        disabled={busy || !configured}
        onPress={() =>
          void login({
            mode,
            email,
            password,
            name,
            ...(mode === "activate"
              ? { activationCode: code }
              : { inviteCode: code }),
          }).catch(() => {})
        }
      />
      <Text style={[s.muted, { marginTop: 20 }]}>
        Customers create their own accounts. Barber and owner access requires an
        invitation or the initial private activation code.
      </Text>
      <Button
        label="Book through Squire"
        secondary
        onPress={() =>
          void Linking.openURL(
            "https://getsquire.com/booking/brands/hairflix-barbershop",
          )
        }
      />
      <Button
        label="Privacy policy"
        secondary
        onPress={() =>
          void Linking.openURL("https://hairflix.vercel.app/privacy.html")
        }
      />
    </View>
  );
}
function AccountDetails() {
  const { snapshot, act, busy } = usePlatform(),
    [name, N] = useState(snapshot!.user.name),
    [phone, P] = useState(snapshot!.user.phone || "");
  return (
    <>
      <Title title="Account details" />
      <Field label="Name" value={name} onChangeText={N} />
      <Field
        label="Phone (international format for texts)"
        value={phone}
        onChangeText={P}
        keyboardType="phone-pad"
      />
      <Line label="Email" value={snapshot!.user.email} />
      <Button
        label="Save account"
        disabled={busy}
        onPress={() => void act("user.update", { name, phone }).catch(() => {})}
      />
    </>
  );
}
function AppContent() {
  const client = usePlatform(),
    { snapshot, loading, busy, error, act, refresh, logout, request } = client;
  const [tab, T] = useState("home"),
    [page, P] = useState<RecordData | null>(null),
    [loc, L] = useState("all"),
    [date, D] = useState(dateNow()),
    [thread, H] = useState(""),
    [text, X] = useState(""),
    [cid, C] = useState(""),
    [bid, B] = useState(""),
    [scope, S] = useState("organization"),
    [refreshing, R] = useState(false);
  const done = () => P(null);
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        const data = response.notification.request.content.data || {};
        if (data.visitId) P({ kind: "visit", id: data.visitId });
        else if (data.threadId) {
          T("messages");
          H(String(data.threadId));
        } else T("notifications");
      },
    );
    return () => sub.remove();
  }, []);
  useEffect(() => {
    if (!snapshot || tab !== "messages" || !thread || busy) return;
    const unread = snapshot.state.messages.some(
      (m: RecordData) =>
        m.threadId === thread && !m.readBy.includes(snapshot.user.id),
    );
    if (unread) void act("messages.read", { threadId: thread }).catch(() => {});
  }, [snapshot?.revision, tab, thread, busy]);
  if (loading)
    return (
      <SafeAreaView
        style={{ flex: 1, backgroundColor: c.bg, justifyContent: "center" }}
      >
        <ActivityIndicator color={c.red} />
      </SafeAreaView>
    );
  const invoke = (type: string, p: RecordData = {}) =>
    void act(type, p).catch(() => {});
  if (!snapshot)
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
        <StatusBar style="light" />
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ padding: 22 }}
        >
          <Auth />
        </ScrollView>
      </SafeAreaView>
    );
  const { user, state, capabilities, locations } = snapshot;
  const navigate = (kind: string, extra: RecordData = {}) => {
    P({ kind, ...extra });
    client.clearError();
  };
  const staff = user && user.role !== "customer",
    owner = user?.role === "owner";
  const notificationCount =
    state?.notifications.filter((n: RecordData) => !n.readAt).length || 0;
  const unread = (t: RecordData) =>
    state.messages.filter(
      (m: RecordData) =>
        m.threadId === t.id &&
        m.senderId !== user.id &&
        !m.readBy.includes(user.id),
    ).length;
  const name = (id: string) =>
    id === "shop"
      ? "Hairflix team"
      : state.users.find((u: RecordData) => u.id === id)?.name ||
        state.customers.find((u: RecordData) => u.id === id)?.name ||
        "Customer";
  const goThread = (id: string) => {
    H(id);
    invoke("messages.read", { threadId: id });
  };
  const visitCard = (v: RecordData) => (
    <Pressable
      key={v.id}
      accessibilityRole="button"
      accessibilityLabel={`Appointment ${v.client} ${v.date} ${clockTime(v.start)}`}
      onPress={() => navigate("visit", { id: v.id })}
    >
      <Card>
        <Text style={s.caption}>
          {v.date} · {clockTime(v.start)} ·{" "}
          {locations.find((l) => l.id === v.locationId)?.name}
        </Text>
        <Text style={s.h2}>{v.client}</Text>
        <Text style={s.text}>
          {name(v.barberId)} ·{" "}
          {v.services.map((x: RecordData) => x.name).join(", ")}
        </Text>
        <View style={[s.row, s.between, { marginTop: 12 }]}>
          <Text style={s.muted}>{v.status.replaceAll("_", " ")}</Text>
          <Text style={s.text}>{dollars(v.totalCents)}</Text>
        </View>
        {v.source === "pilot" && <Text style={s.muted}>Internal pilot</Text>}
      </Card>
    </Pressable>
  );
  async function push() {
    try {
      if (!Device.isDevice || Platform.OS === "web")
        throw Error(
          "Push registration needs a physical iPhone or Android development build.",
        );
      const projectId =
        Constants.expoConfig?.extra?.eas?.projectId ||
        Constants.easConfig?.projectId;
      if (!projectId) throw Error("Link this app to an EAS project first.");
      if (Platform.OS === "android")
        await Notifications.setNotificationChannelAsync("default", {
          name: "Hairflix",
          importance: Notifications.AndroidImportance.HIGH,
        });
      const result = await Notifications.requestPermissionsAsync();
      if (result.status !== "granted")
        throw Error("Notifications are disabled in device settings.");
      const token = await Notifications.getExpoPushTokenAsync({ projectId });
      await act("device.register", { token: token.data });
      Alert.alert(
        "Notifications enabled",
        "This phone is registered for Hairflix updates.",
      );
    } catch (e) {
      Alert.alert("Notification setup", (e as Error).message);
    }
  }
  function home() {
    const attention = state.visits.filter(
      (v: RecordData) =>
        v.status === "needs_reassignment" ||
        (v.approvalStatus === "requested" && user.role === "customer"),
    );
    return (
      <>
        <Title
          title={`Welcome, ${user.name.split(" ")[0]}.`}
          sub={
            owner
              ? "Two locations. One clear view."
              : staff
                ? "Your chair. Your clients. Your day."
                : "Keep your next cut close."
          }
        />
        {!capabilities.liveBooking && (
          <Card>
            <Text style={s.text}>Internal pilot</Text>
            <Text style={s.muted}>
              Hairflix’s public calendar is still on Squire. Bookings here do
              not sync there and must not be treated as confirmed shop
              appointments.
            </Text>
            <Button
              label="Book through Squire"
              secondary
              onPress={() =>
                void Linking.openURL(
                  "https://getsquire.com/booking/brands/hairflix-barbershop",
                )
              }
            />
          </Card>
        )}
        <View style={s.chips}>
          <Chip
            label={`${notificationCount} unread updates`}
            onPress={() => T("notifications")}
          />
          <Chip label="New booking" onPress={() => navigate("booking")} />
          {staff && <Chip label="Time off" onPress={() => navigate("block")} />}
        </View>
        {attention.length > 0 && <Title title="Needs attention" />}
        {attention.map(visitCard)}
        {!staff && (
          <>
            <Title title="Find your barber" />
            {state.barberProfiles?.map((b: RecordData) => (
              <Pressable
                key={b.id}
                accessibilityRole="button"
                onPress={() => navigate("barber", { id: b.id })}
              >
                <Card>
                  {b.avatarMediaId && (
                    <Photo media={{ id: b.avatarMediaId, caption: b.name }} />
                  )}
                  <Text style={s.h2}>{b.name}</Text>
                  <Text style={s.muted}>
                    {b.specialty ||
                      b.locations
                        .map(
                          (id: string) =>
                            locations.find((l) => l.id === id)?.name,
                        )
                        .join(" · ")}
                  </Text>
                  <Text style={s.link}>View services & work →</Text>
                </Card>
              </Pressable>
            ))}
          </>
        )}
        <Title title="Coming up" />
        {state.visits
          .filter(
            (v: RecordData) => v.date >= dateNow() && v.status === "booked",
          )
          .sort((a: RecordData, b: RecordData) =>
            (a.date + a.start).localeCompare(b.date + b.start),
          )
          .slice(0, 6)
          .map(visitCard)}
        {!state.visits.length && (
          <Card>
            <Text style={s.muted}>
              No appointments yet. Staff can configure services and availability
              before creating a booking.
            </Text>
          </Card>
        )}
        {!staff && (
          <>
            <Title title="Your rewards" />
            {state.ledger
              .filter((x: RecordData) => x.kind === "loyalty-reward")
              .map((x: RecordData) => (
                <Card key={x.id}>
                  <Text style={s.h2}>{dollars(x.amountCents)} shop credit</Text>
                  <Text style={s.muted}>
                    {x.redeemedAt
                      ? "Redeemed"
                      : "Ask the shop to apply this reward."}
                  </Text>
                </Card>
              ))}
            <Line
              label="Paid visits earned"
              value={String(
                state.ledger.filter(
                  (x: RecordData) => x.kind === "loyalty-earned",
                ).length,
              )}
            />
          </>
        )}
      </>
    );
  }
  function calendar() {
    return (
      <>
        <Title title={owner ? "Master calendar" : "Your calendar"} />
        <Picker
          label="Location"
          items={[{ id: "all", name: "All locations" }, ...locations]}
          value={loc}
          onChange={L}
        />
        <Field label="Date YYYY-MM-DD" value={date} onChangeText={D} />
        <Button
          label="Add booking"
          icon="add"
          onPress={() => navigate("booking")}
        />
        {staff && (
          <View style={s.chips}>
            <Chip label="Block time" onPress={() => navigate("block")} />
            <Chip label="Report absence" onPress={() => navigate("absence")} />
          </View>
        )}
        {state.visits
          .filter(
            (v: RecordData) =>
              v.date === date && (loc === "all" || v.locationId === loc),
          )
          .sort((a: RecordData, b: RecordData) => a.start - b.start)
          .map(visitCard)}
        {state.blocks
          .filter((b: RecordData) => b.date === date)
          .map((b: RecordData) => (
            <Card key={b.id}>
              <Text style={s.text}>
                {name(b.barberId)} · {b.reason}
              </Text>
              <Text style={s.muted}>
                {clockTime(b.start)}–
                {b.end === 1440 ? "24:00" : clockTime(b.end)}
              </Text>
              {staff && (
                <Button
                  label="Remove block"
                  secondary
                  disabled={busy}
                  onPress={() => invoke("block.remove", { id: b.id })}
                />
              )}
            </Card>
          ))}
      </>
    );
  }
  function messages() {
    const current = state.threads.find((x: RecordData) => x.id === thread);
    if (current)
      return (
        <>
          <Button label="All conversations" secondary onPress={() => H("")} />
          <Title
            title={
              user.role === "customer"
                ? name(current.barberId)
                : name(current.customerId)
            }
            sub="Hairflix messages"
          />
          {state.messages
            .filter((m: RecordData) => m.threadId === thread)
            .sort((a: RecordData, b: RecordData) => a.at - b.at)
            .map((m: RecordData) => (
              <View
                key={m.id}
                style={{
                  alignSelf: m.senderId === user.id ? "flex-end" : "flex-start",
                  backgroundColor: m.senderId === user.id ? "#49222c" : c.panel,
                  borderRadius: 18,
                  padding: 16,
                  marginBottom: 10,
                  maxWidth: "92%",
                }}
              >
                <Text style={s.caption}>{name(m.senderId)}</Text>
                <Text style={s.text}>{m.text}</Text>
                {m.appointment && (
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => navigate("visit", { id: m.appointment.id })}
                  >
                    <Text style={[s.link, { paddingBottom: 0 }]}>
                      {m.appointment.date} · {clockTime(m.appointment.start)} ·{" "}
                      {m.appointment.status.replaceAll("_", " ")} →
                    </Text>
                  </Pressable>
                )}
                <Text style={s.muted}>
                  {new Date(m.at).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </Text>
              </View>
            ))}
          <Field label="Message" value={text} onChangeText={X} multiline />
          <Button
            label="Send message"
            disabled={busy || !text.trim()}
            onPress={() =>
              void act("message.send", { threadId: thread, text })
                .then(() => X(""))
                .catch(() => {})
            }
          />
          {staff && current.barberId !== "shop" && (
            <Button
              label="Create booking in this conversation"
              secondary
              onPress={() =>
                navigate("booking", {
                  customerId: current.customerId,
                  barberId: current.barberId,
                })
              }
            />
          )}
          {state.visits
            .filter(
              (v: RecordData) =>
                v.customerId === current.customerId &&
                v.barberId === current.barberId &&
                ["booked", "needs_reassignment"].includes(v.status),
            )
            .map((v: RecordData) => (
              <Button
                key={v.id}
                label={`Reschedule ${v.date} · ${clockTime(v.start)}`}
                secondary
                onPress={() => navigate("visit", { id: v.id })}
              />
            ))}
        </>
      );
    const sorted = [...state.threads].sort(
      (a: RecordData, b: RecordData) => unread(b) - unread(a),
    );
    return (
      <>
        <Title
          title="Messages"
          sub="Shop conversations and appointment updates."
        />
        {sorted.some((t) => unread(t) > 0) && (
          <Text style={s.caption}>Unread</Text>
        )}
        {sorted.map((t: RecordData) => (
          <Pressable
            key={t.id}
            accessibilityRole="button"
            onPress={() => goThread(t.id)}
          >
            <Card>
              <View style={s.row}>
                <ClientAvatar name={name(t.customerId)} />
                <View style={{ flex: 1 }}>
                  <Text style={s.h2}>
                    {name(user.role === "customer" ? t.barberId : t.customerId)}
                  </Text>
                  <Text style={s.muted}>
                    {state.messages
                      .filter((m: RecordData) => m.threadId === t.id)
                      .at(-1)?.text || "Start a conversation"}
                  </Text>
                </View>
                {unread(t) > 0 && (
                  <View
                    style={{
                      backgroundColor: c.red,
                      padding: 8,
                      borderRadius: 20,
                    }}
                  >
                    <Text style={s.text}>{unread(t)}</Text>
                  </View>
                )}
              </View>
            </Card>
          </Pressable>
        ))}
        <Title title="New conversation" />
        {user.role !== "customer" && (
          <Picker
            label="Customer"
            items={state.customers}
            value={cid}
            onChange={C}
          />
        )}{" "}
        {user.role !== "barber" && (
          <Picker
            label="Barber"
            items={state.users.filter((x: RecordData) => x.role === "barber")}
            value={bid}
            onChange={B}
          />
        )}
        <Button
          label="Open conversation"
          disabled={busy}
          onPress={() =>
            void act("thread.create", { customerId: cid, barberId: bid })
              .then((t) => H(t.id))
              .catch(() => {})
          }
        />
      </>
    );
  }
  function notifications() {
    return (
      <>
        <Title title="Your updates" />
        <Button
          label="Enable notifications on this phone"
          secondary
          onPress={() => void push()}
        />
        {state.notifications
          .sort((a: RecordData, b: RecordData) => b.at - a.at)
          .map((n: RecordData) => (
            <Pressable
              key={n.id}
              accessibilityRole="button"
              onPress={() => {
                invoke("notification.read", { id: n.id });
                if (n.link.visitId) navigate("visit", { id: n.link.visitId });
                else if (n.link.threadId) {
                  T("messages");
                  goThread(n.link.threadId);
                }
              }}
            >
              <Card>
                <View style={s.row}>
                  {!n.readAt && (
                    <View
                      style={{
                        width: 9,
                        height: 9,
                        borderRadius: 5,
                        backgroundColor: c.red,
                      }}
                    />
                  )}
                  <Text style={s.h2}>{n.title}</Text>
                </View>
                <Text style={s.text}>{n.body}</Text>
                <Text style={s.muted}>{new Date(n.at).toLocaleString()}</Text>
              </Card>
            </Pressable>
          ))}
      </>
    );
  }
  function settings() {
    const scopes = owner
      ? [
          { id: "organization", name: "Entire shop" },
          ...locations.map((l) => ({ id: "location/" + l.id, name: l.name })),
          ...state.users
            .filter((x: RecordData) => x.role === "barber")
            .map((u: RecordData) => ({ id: "barber/" + u.id, name: u.name })),
        ]
      : [{ id: "barber/" + user.id, name: "Your profile" }];
    return (
      <>
        <Title
          title="Settings"
          sub="Changes are saved to the server and shared across your signed-in devices."
        />
        {staff && (
          <>
            <Picker
              label="Apply settings to"
              items={scopes}
              value={scope}
              onChange={S}
            />
            {(owner
              ? [
                  "business",
                  "booking",
                  "availability",
                  "money",
                  "retention",
                  ...(scope.startsWith("barber/") ? ["profile"] : []),
                ]
              : ["profile", "availability"]
            ).map((g) => (
              <Button
                key={g}
                label={groupNames[g]}
                secondary
                icon={
                  g === "availability"
                    ? "calendar-outline"
                    : g === "money"
                      ? "wallet-outline"
                      : "options-outline"
                }
                onPress={() =>
                  navigate("settings", {
                    group: g,
                    scope: owner ? scope : "barber/" + user.id,
                  })
                }
              />
            ))}
          </>
        )}
        <Button
          label="Notification preferences"
          secondary
          icon="notifications-outline"
          onPress={() =>
            navigate("settings", {
              group: "notifications",
              scope: "user/" + user.id,
            })
          }
        />
        <Button
          label="Account details"
          secondary
          icon="person-outline"
          onPress={() => navigate("account")}
        />
        {staff && (
          <>
            <Button
              label="Services & prices"
              secondary
              icon="cut-outline"
              onPress={() => navigate("services")}
            />
            <Button
              label="Portfolio"
              secondary
              icon="images-outline"
              onPress={() => navigate("portfolio")}
            />
            <Button
              label="Customers"
              secondary
              icon="people-outline"
              onPress={() => navigate("customers")}
            />
            <Button
              label="Earnings & reports"
              secondary
              icon="bar-chart-outline"
              onPress={() => navigate("reports")}
            />
          </>
        )}
        {owner && (
          <>
            <Button
              label="Team & invitations"
              secondary
              icon="people-circle-outline"
              onPress={() => navigate("team")}
            />
            <Button
              label="Campaigns"
              secondary
              icon="megaphone-outline"
              onPress={() => navigate("growth")}
            />
            <Button
              label="Connections & delivery log"
              secondary
              icon="link-outline"
              onPress={() => navigate("connections")}
            />
            <Button
              label="Activity log"
              secondary
              icon="list-outline"
              onPress={() => navigate("audit")}
            />
          </>
        )}
        {!staff && (
          <Button
            label="My photos"
            secondary
            icon="images-outline"
            onPress={() => navigate("portfolio")}
          />
        )}
        <Button
          label="Help & support"
          secondary
          icon="help-circle-outline"
          onPress={() => navigate("help")}
        />
        <Button
          label="Sign out"
          secondary
          icon="log-out-outline"
          disabled={busy}
          onPress={() => void logout().catch(() => {})}
        />
        {!staff && (
          <Button
            label="Delete my account"
            secondary
            onPress={() =>
              Alert.alert(
                "Delete account?",
                "Your profile and photos will be removed. Required transaction history is retained.",
                [
                  { text: "Back" },
                  {
                    text: "Delete account",
                    style: "destructive",
                    onPress: () =>
                      void act("account.delete", {})
                        .then(() => logout())
                        .catch(() => {}),
                  },
                ],
              )
            }
          />
        )}
      </>
    );
  }
  function content() {
    if (!page)
      return tab === "home"
        ? home()
        : tab === "calendar"
          ? calendar()
          : tab === "messages"
            ? messages()
            : tab === "notifications"
              ? notifications()
              : settings();
    switch (page.kind) {
      case "booking":
        return (
          <BookingForm
            done={done}
            customerId={page.customerId}
            barberId={page.barberId}
          />
        );
      case "block":
      case "absence":
        return <BlockForm absence={page.kind === "absence"} done={done} />;
      case "visit":
        return <VisitScreen id={page.id} done={done} />;
      case "settings":
        return (
          <SettingsEditor group={page.group} scope={page.scope} done={done} />
        );
      case "account":
        return <AccountDetails />;
      case "team":
        return (
          <Team
            onProfile={(id) =>
              navigate("settings", { group: "profile", scope: "barber/" + id })
            }
          />
        );
      case "customers":
        return <Customers />;
      case "reports":
        return <Reports />;
      case "growth":
        return <Growth />;
      case "service":
        return (
          <ServiceForm
            existing={page.existing}
            done={() => P({ kind: "services" })}
          />
        );
      case "services":
        return (
          <>
            <Title
              title="Services & prices"
              sub="Booked services keep their price and duration even after edits."
            />
            <Button label="Add service" onPress={() => navigate("service")} />
            {state.services
              .filter((x: RecordData) => owner || x.barberId === user.id)
              .map((x: RecordData) => (
                <Pressable
                  key={x.id}
                  onPress={() => navigate("service", { existing: x })}
                >
                  <Card>
                    <Text style={s.h2}>{x.name}</Text>
                    <Text style={s.muted}>
                      {name(x.barberId)} · {x.minutes} min · {dollars(x.cents)}{" "}
                      · {x.active ? "Active" : "Archived"}
                    </Text>
                  </Card>
                </Pressable>
              ))}
          </>
        );
      case "barber": {
        const b = state.barberProfiles.find(
          (b: RecordData) => b.id === page.id,
        );
        if (!b) return <Text style={s.muted}>Barber is unavailable.</Text>;
        return (
          <>
            <Title title={b.name} sub={b.specialty} />
            {b.avatarMediaId && (
              <Photo media={{ id: b.avatarMediaId, caption: b.name }} />
            )}
            <Text style={s.text}>{b.bio}</Text>
            <Title title="Services" />
            {state.services
              .filter((x: RecordData) => x.active && x.barberId === b.id)
              .map((x: RecordData) => (
                <Line
                  key={x.id}
                  label={`${x.name} · ${x.minutes} min`}
                  value={dollars(x.cents)}
                />
              ))}
            <Button
              label={"Book with " + b.name}
              onPress={() => navigate("booking", { barberId: b.id })}
            />
            <Title title="Recent work" />
            {state.media
              .filter(
                (m: RecordData) =>
                  m.barberId === b.id &&
                  m.visibility === "public" &&
                  m.kind !== "profile",
              )
              .map((m: RecordData) => (
                <Photo key={m.id} media={m} />
              ))}
          </>
        );
      }
      case "portfolio":
        return (
          <>
            <Title
              title={staff ? "Portfolio" : "Your haircut photos"}
              sub="Customer photos stay private unless explicitly shared. Publication requests require barber review."
            />
            {user.role === "barber" && (
              <Card>
                <Text style={s.h2}>Your profile photo</Text>
                <PhotoUpload barberId={user.id} profile />
              </Card>
            )}
            {owner && (
              <Picker
                label="Portfolio barber"
                items={state.users.filter(
                  (u: RecordData) => u.role === "barber",
                )}
                value={bid}
                onChange={B}
              />
            )}
            {staff && (
              <PhotoUpload
                key={user.role === "barber" ? user.id : bid}
                barberId={user.role === "barber" ? user.id : bid}
              />
            )}{" "}
            {state.media.map((m: RecordData) => (
              <Card key={m.id}>
                <Photo media={m} />
                <Text style={s.text}>{m.caption}</Text>
                <Text style={s.muted}>{m.visibility}</Text>
                {staff && m.publicationRequested && (
                  <>
                    <Button
                      label="Approve for portfolio"
                      disabled={busy}
                      onPress={() =>
                        invoke("media.publish", { id: m.id, approved: true })
                      }
                    />
                    <Button
                      label="Keep private"
                      secondary
                      disabled={busy}
                      onPress={() =>
                        invoke("media.publish", { id: m.id, approved: false })
                      }
                    />
                  </>
                )}
                {m.ownerId === user.id && (
                  <>
                    <Button
                      label="Remove photo"
                      secondary
                      disabled={busy}
                      onPress={() => invoke("media.remove", { id: m.id })}
                    />
                    {!staff && (
                      <Button
                        label="Revoke sharing & publication"
                        secondary
                        disabled={busy}
                        onPress={() =>
                          invoke("media.share", {
                            id: m.id,
                            sharedWithBarber: false,
                            publicationRequested: false,
                          })
                        }
                      />
                    )}
                  </>
                )}
              </Card>
            ))}
          </>
        );
      case "audit":
        return (
          <>
            <Title title="Activity log" />
            {state.audit
              .sort((a: RecordData, b: RecordData) => b.at - a.at)
              .slice(0, 100)
              .map((a: RecordData) => (
                <Card key={a.id}>
                  <Text style={s.text}>{a.type}</Text>
                  <Text style={s.muted}>
                    {name(a.actorId)} · {new Date(a.at).toLocaleString()}
                  </Text>
                  <Text selectable style={s.muted}>
                    {a.recordId}
                  </Text>
                </Card>
              ))}
          </>
        );
      case "connections":
        return (
          <>
            <Title
              title="Connections"
              sub="These indicators report configured capabilities. Saving a preference does not connect a provider."
            />
            {Object.entries(capabilities).map(([k, v]) => (
              <Line
                key={k}
                label={k}
                value={v ? "Available" : "Not connected"}
              />
            ))}
            <Text style={s.muted}>
              Stripe, Wallet, Tap to Pay, Instagram, WhatsApp, gift cards and
              memberships need separate provider implementation and credentials.
              Public bookings continue through Squire.
            </Text>
            <Button
              label="Process queued notifications"
              disabled={busy}
              onPress={() =>
                request("delivery", {})
                  .then(() => refresh())
                  .catch((e) => Alert.alert("Delivery", e.message))
              }
            />
            <Title title="Delivery log" />
            {state.outbox
              .slice(-60)
              .reverse()
              .map((x: RecordData) => (
                <Card key={x.id}>
                  <Text style={s.text}>
                    {x.channel} · {x.status}
                  </Text>
                  <Text style={s.muted}>
                    {x.reason || "Waiting for delivery worker"}
                  </Text>
                </Card>
              ))}
          </>
        );
      case "help":
        return (
          <>
            <Title title="How can we help?" />
            <Button
              label="Message your barber"
              onPress={() => {
                done();
                T("messages");
              }}
            />
            <Button
              label="Message shop"
              secondary
              disabled={busy}
              onPress={() =>
                void act("thread.create", { shop: true })
                  .then((t) => {
                    done();
                    T("messages");
                    H(t.id);
                  })
                  .catch(() => {})
              }
            />
            <Button
              label="Shop contact details"
              secondary
              onPress={() =>
                void Linking.openURL("https://www.hairflixbarbershop.com/")
              }
            />
            <Button
              label="Privacy policy"
              secondary
              onPress={() =>
                void Linking.openURL("https://hairflix.vercel.app/privacy.html")
              }
            />
          </>
        );
      default:
        return null;
    }
  }
  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: c.bg }}
      edges={["top", "left", "right", "bottom"]}
    >
      <StatusBar style="light" />
      <View
        style={[
          s.row,
          s.between,
          { padding: 18, borderBottomColor: c.line, borderBottomWidth: 1 },
        ]}
      >
        <View style={s.row}>
          <Image
            source={require("../../assets/icon.png")}
            style={{ width: 34, height: 34, borderRadius: 8 }}
            accessibilityLabel="Hairflix logo"
          />
          <Text style={[s.h2, { marginBottom: 0, letterSpacing: 2 }]}>
            HAIRFLIX
          </Text>
        </View>
        {user && (
          <Text style={s.muted}>
            {user.role === "owner"
              ? "Owner HQ"
              : user.role === "barber"
                ? "Barber Pro"
                : "Customer"}
          </Text>
        )}
      </View>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            padding: 20,
            paddingBottom: 35,
            maxWidth: 780,
            width: "100%",
            alignSelf: "center",
          }}
          refreshControl={
            snapshot ? (
              <RefreshControl
                tintColor={c.red}
                refreshing={refreshing}
                onRefresh={() => {
                  R(true);
                  refresh()
                    .catch(() => {})
                    .finally(() => R(false));
                }}
              />
            ) : undefined
          }
        >
          {snapshot ? (
            <>
              {page && (
                <Button
                  label="Back"
                  secondary
                  icon="arrow-back"
                  onPress={done}
                />
              )}
              <View
                key={
                  page
                    ? JSON.stringify({
                        kind: page.kind,
                        id: page.id,
                        group: page.group,
                        scope: page.scope,
                      })
                    : tab
                }
                style={{ marginTop: 14 }}
              >
                {content()}
              </View>
              {!!error && (
                <Text accessibilityRole="alert" style={s.error}>
                  {error}
                </Text>
              )}
            </>
          ) : (
            <Auth />
          )}
        </ScrollView>
      </KeyboardAvoidingView>
      {snapshot && (
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-around",
            paddingVertical: 12,
            borderTopWidth: 1,
            borderTopColor: c.line,
            backgroundColor: c.panel,
          }}
        >
          {[
            { id: "home", label: "Home", icon: "home-outline" },
            { id: "calendar", label: "Calendar", icon: "calendar-outline" },
            { id: "messages", label: "Messages", icon: "chatbubbles-outline" },
            {
              id: "notifications",
              label: notificationCount
                ? `Updates ${notificationCount}`
                : "Updates",
              icon: "notifications-outline",
            },
            { id: "settings", label: "Settings", icon: "options-outline" },
          ].map((n) => (
            <Pressable
              key={n.id}
              accessibilityRole="button"
              accessibilityLabel={n.label}
              accessibilityState={{ selected: tab === n.id }}
              onPress={() => {
                T(n.id);
                P(null);
                client.clearError();
              }}
              style={{ alignItems: "center", padding: 5, gap: 5 }}
            >
              <Icon
                name={n.icon as any}
                color={tab === n.id ? c.red : c.muted}
              />
              <Text
                style={[
                  s.muted,
                  { fontSize: 10, color: tab === n.id ? c.text : c.muted },
                ]}
              >
                {n.label}
              </Text>
            </Pressable>
          ))}
        </View>
      )}
    </SafeAreaView>
  );
}
export default function PlatformApp() {
  return (
    <PlatformProvider>
      <AppContent />
    </PlatformProvider>
  );
}
