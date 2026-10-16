import { useEffect, useState } from "react";
import { Image, View } from "react-native";
import { useMutation } from "@tanstack/react-query";
import {
  AppButton,
  AppText,
  Card,
  InlineNotice,
  Segmented,
  StatusBadge,
  SwitchRow,
  TextField,
} from "@parkflow/client/components/ui";
import { managementService as service } from "@parkflow/client/services/http/managementService";
import type {
  ManagementZone,
  ManagementOperator,
  ManagementHours,
  ZoneInput,
  ZoneLifecycle,
  ZoneMetadata,
} from "@parkflow/contracts/management";
import { spacing } from "@parkflow/design/spacing";
import {
  isoDate,
  lifecycleNames,
  ManagementError,
  numeric,
  SectionTitle,
  useManagementText,
} from "./shared";

const stack = { gap: spacing.lg };
const fieldRow = {
  flexDirection: "row" as const,
  flexWrap: "wrap" as const,
  gap: spacing.md,
};
const week = [
  "الأحد",
  "الاثنين",
  "الثلاثاء",
  "الأربعاء",
  "الخميس",
  "الجمعة",
  "السبت",
];
const englishWeek = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
const blankHours = () =>
  Array.from({ length: 7 }, (_, weekday) => ({
    weekday,
    opensAt: "08:00",
    closesAt: "20:00",
    closed: true,
  }));
function initial(zone?: ManagementZone, operators: ManagementOperator[] = []) {
  return {
    operatorId:
      zone?.operatorId ?? operators.find((o) => o.canCreateZone)?.id ?? "",
    code: zone?.code ?? "",
    name: zone?.name ?? "",
    nameAr: zone?.nameAr ?? "",
    city: zone?.city ?? "",
    cityAr: zone?.cityAr ?? "",
    address: zone?.address ?? "",
    description: zone?.description ?? "",
    latitude: zone ? String(zone.latitude) : "",
    longitude: zone ? String(zone.longitude) : "",
    capacity: zone?.capacity ? String(zone.capacity) : "",
    kind: (zone?.kind ?? "garage") as ZoneInput["kind"],
    defaultMode: zone?.defaultMode ?? "start_stop",
    images: zone?.metadata?.images?.join("\n") ?? "",
    amenities: zone?.metadata?.amenities ?? [],
    entranceLat: zone?.metadata?.entrance
      ? String(zone.metadata.entrance.latitude)
      : "",
    entranceLng: zone?.metadata?.entrance
      ? String(zone.metadata.entrance.longitude)
      : "",
    instructions: zone?.metadata?.entrance?.instructions ?? "",
    height: zone?.metadata?.heightLimitMeters
      ? String(zone.metadata.heightLimitMeters)
      : "",
  };
}

export function ZoneEditor({
  zone,
  operators,
  isAdmin,
  onSaved,
  onClose,
  onReload,
}: {
  zone?: ManagementZone;
  operators: ManagementOperator[];
  isAdmin: boolean;
  onSaved: (zone: ManagementZone) => void;
  onClose: () => void;
  onReload: () => void;
}) {
  const text = useManagementText();
  const [tab, setTab] = useState<"details" | "tariff" | "hours" | "closures">(
    "details",
  );
  const [form, setForm] = useState(() => initial(zone, operators));
  const [hours, setHours] = useState<ManagementHours[]>(
    zone?.operatingHours.length === 7 ? zone.operatingHours : blankHours(),
  );
  const [confirm, setConfirm] = useState<ZoneLifecycle | null>(null);
  const [clientError, setClientError] = useState<unknown>(null);
  const [saved, setSaved] = useState(false);
  const [rate, setRate] = useState({
    name: "Standard",
    hourly: "5",
    minimum: "0",
    free: "0",
    increment: "15",
    dailyCap: "",
    maxStay: "",
    from: "",
    to: "",
  });
  const [closure, setClosure] = useState({
    startsAt: "",
    endsAt: "",
    reason: "",
  });
  useEffect(() => {
    setForm(initial(zone, operators));
    setHours(
      zone?.operatingHours.length === 7 ? zone.operatingHours : blankHours(),
    );
  }, [zone]);
  const command = useMutation({
    mutationFn: (job: () => Promise<ManagementZone>) => job(),
    onSuccess: (next) => {
      setConfirm(null);
      setSaved(true);
      onSaved(next);
    },
  });
  const run = (job: () => Promise<ManagementZone>) => {
    setClientError(null);
    setSaved(false);
    command.reset();
    command.mutate(job);
  };
  const canEdit = !zone || zone.canEdit;
  const archived = zone?.lifecycle === "archived";
  const editable = canEdit && !archived;
  const saveDetails = () => {
    try {
      const badNumber = text(
        "أدخل رقماً صالحاً لكل حقل رقمي.",
        "Enter a valid number for each numeric field.",
      );
      const metadata: ZoneMetadata = {
        images: form.images
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean),
        amenities: form.amenities,
        ...(form.height
          ? { heightLimitMeters: numeric(form.height, badNumber) }
          : {}),
      };
      if (form.entranceLat || form.entranceLng || form.instructions)
        metadata.entrance = {
          latitude: numeric(form.entranceLat, badNumber),
          longitude: numeric(form.entranceLng, badNumber),
          instructions: form.instructions,
        };
      const input: ZoneInput = {
        operatorId: form.operatorId,
        code: form.code.trim(),
        name: form.name.trim(),
        nameAr: form.nameAr.trim(),
        city: form.city.trim(),
        cityAr: form.cityAr.trim(),
        address: form.address.trim(),
        description: form.description.trim(),
        latitude: numeric(form.latitude, badNumber),
        longitude: numeric(form.longitude, badNumber),
        capacity: numeric(form.capacity, badNumber),
        kind: form.kind,
        defaultMode: form.defaultMode,
        supportedModes: zone?.supportedModes.includes(form.defaultMode)
          ? zone.supportedModes
          : [form.defaultMode],
        supportedEntryMethods: zone?.supportedEntryMethods ?? [
          "manual",
          "qr",
          "zone_code",
        ],
        metadata,
      };
      if (
        !input.operatorId ||
        !input.code ||
        !input.name ||
        !input.nameAr ||
        !input.city ||
        !input.cityAr
      )
        throw new Error(
          text(
            "أكمل المؤسسة والرمز والاسم والمدينة باللغتين.",
            "Complete organization, code, name and city in both languages.",
          ),
        );
      run(() =>
        zone
          ? service.updateZone(zone.id, {
              ...input,
              expectedVersion: zone.version,
            })
          : service.createZone(input),
      );
    } catch (error) {
      setClientError(error);
    }
  };
  const saveRate = () => {
    try {
      if (!zone) return;
      const badNumber = text(
        "أدخل مبالغ وأرقاماً صالحة.",
        "Enter valid amounts and numbers.",
      );
      const badDate = text(
        "أدخل التاريخ والوقت مع المنطقة الزمنية مثل 2026-10-08T09:00:00+03:00.",
        "Enter a date and time with timezone, for example 2026-10-08T09:00:00+03:00.",
      );
      const input = {
        name: rate.name,
        hourlyRate: Math.round(numeric(rate.hourly, badNumber) * 100),
        minimumCharge: Math.round(numeric(rate.minimum, badNumber) * 100),
        freeMinutes: numeric(rate.free, badNumber),
        incrementMinutes: numeric(rate.increment, badNumber),
        ...(rate.dailyCap
          ? { dailyCap: Math.round(numeric(rate.dailyCap, badNumber) * 100) }
          : {}),
        ...(rate.maxStay
          ? { maxStayMinutes: numeric(rate.maxStay, badNumber) }
          : {}),
        validFrom: rate.from.trim()
          ? isoDate(rate.from, badDate)
          : new Date(Date.now()).toISOString(),
        ...(rate.to ? { validTo: isoDate(rate.to, badDate) } : {}),
      };
      run(() => service.tariff(zone.id, zone.version, input));
    } catch (error) {
      setClientError(error);
    }
  };
  const addClosure = () => {
    try {
      if (!zone) return;
      const badDate = text(
        "أدخل تاريخاً صالحاً مع المنطقة الزمنية.",
        "Enter a valid date with timezone.",
      );
      const input = {
        startsAt: isoDate(closure.startsAt, badDate),
        endsAt: isoDate(closure.endsAt, badDate),
        reason: closure.reason,
      };
      run(() => service.closure(zone.id, zone.version, input));
    } catch (error) {
      setClientError(error);
    }
  };
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [key]: value }));
  const numericField = (
    label: string,
    key:
      | "latitude"
      | "longitude"
      | "capacity"
      | "height"
      | "entranceLat"
      | "entranceLng",
  ) => (
    <TextField
      label={label}
      value={form[key]}
      onChangeText={(v) => set(key, v)}
      keyboardType="decimal-pad"
      editable={editable}
      containerStyle={{ flex: 1, minWidth: 140 }}
    />
  );
  const state = (value: ZoneLifecycle) => {
    if (zone) run(() => service.lifecycle(zone.id, zone.version, value));
  };
  return (
    <Card padding="lg" style={stack}>
      <View style={fieldRow}>
        <View style={{ flex: 1, gap: spacing.sm }}>
          <AppText variant="h2">
            {zone
              ? text(zone.nameAr, zone.name)
              : text("إضافة موقف", "Add a parking location")}
          </AppText>
          {zone ? (
            <StatusBadge
              label={text(...lifecycleNames[zone.lifecycle])}
              tone={zone.active ? "success" : "neutral"}
            />
          ) : (
            <AppText color="textSecondary">
              {text(
                "تبدأ الإضافة كمسودة وتحتاج نشر الأدمن.",
                "New locations begin as drafts and require admin publication.",
              )}
            </AppText>
          )}
        </View>
        <AppButton
          label={text("العودة للقائمة", "Back to list")}
          onPress={onClose}
          variant="ghost"
          size="sm"
          fullWidth={false}
        />
      </View>
      {zone ? (
        <AppText variant="caption" color="textSecondary">
          {text("الإصدار", "Version")} {zone.version} · {zone.operator.name}
        </AppText>
      ) : null}
      {!zone || zone.inventoryMode === "live" ? (
        <InlineNotice
          title={text(
            "الحجز يعتمد على الإشغال الفعلي",
            "Reservations require current occupancy",
          )}
          body={text(
            "بعد النشر، أدخل عدد الأماكن المتاحة أو المشغولة من شاشة العمليات وحدّثه باستمرار. لا تُقبل الحجوزات قبل توفر عدد حديث موثوق.",
            "After publication, enter available or occupied counts from the operations screen and keep them current. Reservations remain unavailable until a fresh trusted count is recorded.",
          )}
        />
      ) : null}
      {!canEdit ? (
        <InlineNotice
          title={text("عرض فقط", "Read only")}
          body={text(
            "موظف البوابة يستطيع إدارة الدخول والإشغال من شاشة العمليات.",
            "Attendants can manage check-in and occupancy from the operations screen.",
          )}
        />
      ) : null}
      {saved ? (
        <InlineNotice tone="success" title={text("تم الحفظ", "Saved")} />
      ) : null}
      <ManagementError error={clientError ?? command.error} reload={onReload} />
      {zone && canEdit ? (
        <View style={fieldRow}>
          {isAdmin &&
          zone.lifecycle !== "published" &&
          zone.lifecycle !== "archived" ? (
            <AppButton
              label={text("نشر الموقف", "Publish location")}
              onPress={() => state("published")}
              loading={command.isPending}
              fullWidth={false}
              size="sm"
            />
          ) : null}
          {!isAdmin &&
          zone.memberRole === "owner" &&
          ["draft", "suspended"].includes(zone.lifecycle) ? (
            <AppButton
              label={text("إرسال للمراجعة", "Submit for review")}
              onPress={() => state("review")}
              loading={command.isPending}
              fullWidth={false}
              size="sm"
            />
          ) : null}
          {isAdmin && zone.lifecycle === "published" ? (
            <AppButton
              label={text("تعليق الحجز", "Suspend bookings")}
              onPress={() => setConfirm("suspended")}
              variant="secondary"
              fullWidth={false}
              size="sm"
            />
          ) : null}
          {isAdmin && !archived ? (
            <AppButton
              label={text("أرشفة الموقف", "Archive location")}
              onPress={() => setConfirm("archived")}
              variant="danger"
              fullWidth={false}
              size="sm"
            />
          ) : null}
          {isAdmin && archived ? (
            <AppButton
              label={text("استعادة كمسودة", "Restore as draft")}
              onPress={() => state("draft")}
              loading={command.isPending}
              variant="secondary"
              fullWidth={false}
              size="sm"
            />
          ) : null}
        </View>
      ) : null}
      {confirm ? (
        <Card tone="sunken" style={stack}>
          <AppText>
            {text(
              "سيتوقف استقبال الحجوزات. إذا وُجدت حجوزات أو جلسات قائمة فسيُرفض التعديل لحمايتها.",
              "Bookings will stop. Existing reservations or active sessions will block this change.",
            )}
          </AppText>
          <AppButton
            label={text("تأكيد", "Confirm")}
            variant="danger"
            loading={command.isPending}
            onPress={() => state(confirm)}
          />
          <AppButton
            label={text("إلغاء", "Cancel")}
            variant="ghost"
            onPress={() => setConfirm(null)}
          />
        </Card>
      ) : null}
      {zone ? (
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            {
              value: "details",
              label: text("البيانات والموقع", "Details and location"),
            },
            { value: "tariff", label: text("الأسعار", "Pricing") },
            { value: "hours", label: text("الدوام", "Hours") },
            { value: "closures", label: text("الإغلاقات", "Closures") },
          ]}
        />
      ) : null}
      {tab === "details" ? (
        <View style={stack}>
          <SectionTitle
            title={text("البيانات الأساسية", "Basic details")}
            body={text(
              "تغيير الموقع يتطلب معالجة الحجوزات القائمة، ثم مراجعة الأدمن عند تعديل المشغّل.",
              "Moving a location requires resolving existing bookings and admin review of operator changes.",
            )}
          />
          {!zone || isAdmin ? (
            <View style={{ gap: spacing.sm }}>
              <AppText>
                {text("المؤسسة المسؤولة", "Responsible organization")}
              </AppText>
              <Segmented
                value={form.operatorId}
                onChange={(v) => set("operatorId", v)}
                options={operators
                  .filter((o) => isAdmin || o.canCreateZone)
                  .map((o) => ({ value: o.id, label: o.name }))}
              />
            </View>
          ) : null}
          <TextField
            label={text("رمز الموقف", "Location code")}
            value={form.code}
            onChangeText={(v) => set("code", v)}
            editable={editable}
          />
          <View style={fieldRow}>
            <TextField
              label={text("الاسم بالعربية", "Arabic name")}
              value={form.nameAr}
              onChangeText={(v) => set("nameAr", v)}
              editable={editable}
              containerStyle={{ flex: 1, minWidth: 180 }}
            />
            <TextField
              label={text("الاسم بالإنجليزية", "English name")}
              value={form.name}
              onChangeText={(v) => set("name", v)}
              editable={editable}
              containerStyle={{ flex: 1, minWidth: 180 }}
            />
          </View>
          <View style={fieldRow}>
            <TextField
              label={text("المدينة بالعربية", "Arabic city")}
              value={form.cityAr}
              onChangeText={(v) => set("cityAr", v)}
              editable={editable}
              containerStyle={{ flex: 1, minWidth: 180 }}
            />
            <TextField
              label={text("المدينة بالإنجليزية", "English city")}
              value={form.city}
              onChangeText={(v) => set("city", v)}
              editable={editable}
              containerStyle={{ flex: 1, minWidth: 180 }}
            />
          </View>
          <TextField
            label={text("العنوان", "Address")}
            value={form.address}
            onChangeText={(v) => set("address", v)}
            editable={editable}
          />
          <TextField
            label={text("وصف الموقف", "Description")}
            value={form.description}
            onChangeText={(v) => set("description", v)}
            editable={editable}
            multiline
          />
          <View style={fieldRow}>
            {numericField(text("خط العرض", "Latitude"), "latitude")}
            {numericField(text("خط الطول", "Longitude"), "longitude")}
            {numericField(text("عدد الأماكن", "Capacity"), "capacity")}
          </View>
          <Segmented
            value={form.kind}
            onChange={(v) => set("kind", v)}
            options={[
              { value: "garage", label: text("كراج", "Garage") },
              { value: "lot", label: text("ساحة", "Lot") },
              { value: "street", label: text("شارع", "Street") },
              { value: "private", label: text("خاص", "Private") },
            ]}
          />
          <Segmented
            value={form.defaultMode}
            onChange={(v) => set("defaultMode", v)}
            options={[
              {
                value: "start_stop",
                label: text("بدء وإيقاف", "Start / stop"),
              },
              { value: "prepaid", label: text("دفع مسبق", "Prepaid") },
            ]}
          />
          <SectionTitle
            title={text(
              "المدخل والخدمات والصور",
              "Entrance, amenities and images",
            )}
          />
          <View style={fieldRow}>
            {numericField(
              text("خط عرض المدخل", "Entrance latitude"),
              "entranceLat",
            )}
            {numericField(
              text("خط طول المدخل", "Entrance longitude"),
              "entranceLng",
            )}
            {numericField(
              text(
                "الارتفاع الأقصى بالمتر (اختياري)",
                "Height limit in meters (optional)",
              ),
              "height",
            )}
          </View>
          <TextField
            label={text("تعليمات الوصول", "Arrival instructions")}
            value={form.instructions}
            onChangeText={(v) => set("instructions", v)}
            editable={editable}
            multiline
          />
          {(
            [
              "accessible",
              "covered",
              "security",
              "ev_charging",
              "restrooms",
            ] as const
          ).map((amenity, index) => (
            <SwitchRow
              key={amenity}
              label={text(
                [
                  "مناسب لذوي الإعاقة",
                  "مغطى",
                  "حراسة",
                  "شحن كهربائي",
                  "دورات مياه",
                ][index]!,
                [
                  "Accessible",
                  "Covered",
                  "Security",
                  "EV charging",
                  "Restrooms",
                ][index]!,
              )}
              value={form.amenities.includes(amenity)}
              disabled={!editable}
              onValueChange={(checked) =>
                set(
                  "amenities",
                  checked
                    ? [...form.amenities, amenity]
                    : form.amenities.filter((a) => a !== amenity),
                )
              }
            />
          ))}
          <TextField
            label={text(
              "روابط الصور HTTPS — رابط في كل سطر",
              "HTTPS image URLs — one per line",
            )}
            hint={text("حتى 8 صور.", "Up to 8 images.")}
            value={form.images}
            onChangeText={(v) => set("images", v)}
            editable={editable}
            multiline
          />
          <View style={fieldRow}>
            {form.images
              .split("\n")
              .map((s) => s.trim())
              .filter((s) => s.startsWith("https://"))
              .slice(0, 8)
              .map((uri, index) => (
                <Image
                  key={index}
                  source={{ uri }}
                  style={{ width: 140, height: 90, borderRadius: 12 }}
                  accessibilityLabel={text("صورة الموقف", "Parking image")}
                />
              ))}
          </View>
          {editable ? (
            <AppButton
              label={
                zone
                  ? text("حفظ البيانات", "Save details")
                  : text("إنشاء المسودة", "Create draft")
              }
              loading={command.isPending}
              onPress={saveDetails}
            />
          ) : null}
        </View>
      ) : null}
      {tab === "tariff" && zone ? (
        <View style={stack}>
          <SectionTitle
            title={text("أسعار مجدولة بالشيكل", "Scheduled pricing in ILS")}
            body={text(
              "تبقى أسعار الحجوزات المؤكدة محفوظة. يمكن جدولة سعر لاحق دون تغيير التاريخ المالي.",
              "Confirmed reservations retain their prices. Schedule future rates while preserving financial history.",
            )}
          />
          {zone.tariffs.map((tariff) => (
            <Card key={tariff.id} tone="sunken">
              <AppText variant="title">
                {tariff.name} · {(tariff.hourlyRate / 100).toFixed(2)} ₪ /{" "}
                {text("ساعة", "hour")}
              </AppText>
              <AppText variant="caption">
                {tariff.validFrom} →{" "}
                {tariff.validTo ?? text("مستمر", "Ongoing")}
              </AppText>
            </Card>
          ))}
          {editable ? (
            <>
              <TextField
                label={text("اسم السعر", "Tariff name")}
                value={rate.name}
                onChangeText={(v) => setRate((r) => ({ ...r, name: v }))}
              />
              {(
                [
                  ["hourly", "السعر لكل ساعة (₪)", "Hourly rate (ILS)"],
                  ["minimum", "الحد الأدنى (₪)", "Minimum charge (ILS)"],
                  ["free", "الدقائق المجانية", "Free minutes"],
                  [
                    "increment",
                    "وحدة الاحتساب بالدقائق",
                    "Billing increment (minutes)",
                  ],
                  [
                    "dailyCap",
                    "السقف اليومي (اختياري)",
                    "Daily cap (optional)",
                  ],
                  [
                    "maxStay",
                    "أقصى مدة بالدقائق (اختياري)",
                    "Maximum stay minutes (optional)",
                  ],
                ] as const
              ).map(([key, ar, en]) => (
                <TextField
                  key={key}
                  label={text(ar, en)}
                  value={rate[key]}
                  keyboardType="decimal-pad"
                  onChangeText={(v) => setRate((r) => ({ ...r, [key]: v }))}
                />
              ))}
              <TextField
                label={text(
                  "بداية السريان مع المنطقة الزمنية",
                  "Effective from, including timezone",
                )}
                hint={text(
                  "اتركه فارغاً لتطبيق السعر عند الحفظ.",
                  "Leave blank to apply the tariff when saved.",
                )}
                value={rate.from}
                onChangeText={(v) => setRate((r) => ({ ...r, from: v }))}
              />
              <TextField
                label={text(
                  "نهاية السريان (اختياري)",
                  "Effective until (optional)",
                )}
                value={rate.to}
                onChangeText={(v) => setRate((r) => ({ ...r, to: v }))}
              />
              <AppButton
                label={text("إضافة السعر", "Add tariff")}
                onPress={saveRate}
                loading={command.isPending}
              />
            </>
          ) : null}
        </View>
      ) : null}
      {tab === "hours" && zone ? (
        <View style={stack}>
          <SectionTitle
            title={text("الدوام الأسبوعي", "Weekly operating hours")}
            body={text(
              "الأوقات بتوقيت فلسطين. تساوي الفتح والإغلاق يعني 24 ساعة؛ وقت إغلاق أبكر يعني اليوم التالي.",
              "Times use Palestine time. Equal opening and closing means 24 hours; an earlier closing time means the next day.",
            )}
          />
          {hours.map((hour, index) => (
            <Card key={hour.weekday} tone="sunken" style={stack}>
              <SwitchRow
                label={text(week[hour.weekday]!, englishWeek[hour.weekday]!)}
                description={
                  hour.closed ? text("مغلق", "Closed") : text("مفتوح", "Open")
                }
                value={!hour.closed}
                disabled={!editable}
                onValueChange={(open) =>
                  setHours((rows) =>
                    rows.map((row, i) =>
                      i === index ? { ...row, closed: !open } : row,
                    ),
                  )
                }
              />
              {!hour.closed ? (
                <View style={fieldRow}>
                  <TextField
                    label={text("يفتح HH:mm", "Opens HH:mm")}
                    value={hour.opensAt}
                    editable={editable}
                    containerStyle={{ flex: 1, minWidth: 130 }}
                    onChangeText={(v) =>
                      setHours((rows) =>
                        rows.map((row, i) =>
                          i === index ? { ...row, opensAt: v } : row,
                        ),
                      )
                    }
                  />
                  <TextField
                    label={text("يغلق HH:mm", "Closes HH:mm")}
                    value={hour.closesAt}
                    editable={editable}
                    containerStyle={{ flex: 1, minWidth: 130 }}
                    onChangeText={(v) =>
                      setHours((rows) =>
                        rows.map((row, i) =>
                          i === index ? { ...row, closesAt: v } : row,
                        ),
                      )
                    }
                  />
                </View>
              ) : null}
            </Card>
          ))}
          {editable ? (
            <AppButton
              label={text("حفظ الدوام", "Save hours")}
              loading={command.isPending}
              onPress={() =>
                run(() => service.hours(zone.id, zone.version, hours))
              }
            />
          ) : null}
        </View>
      ) : null}
      {tab === "closures" && zone ? (
        <View style={stack}>
          <SectionTitle
            title={text("العطل والإغلاق المؤقت", "Dated closures")}
            body={text(
              "لا يُقبل الإغلاق إذا تضررت حجوزات قائمة. تبقى الإغلاقات الماضية في السجل.",
              "Closures cannot conflict with existing bookings. Past closures remain in history.",
            )}
          />
          {zone.closures.length === 0 ? (
            <AppText color="textSecondary">
              {text("لا توجد إغلاقات مسجلة.", "No closures recorded.")}
            </AppText>
          ) : (
            zone.closures.map((item) => (
              <Card key={item.id} tone="sunken" style={stack}>
                <AppText variant="title">{item.reason}</AppText>
                <AppText variant="caption">
                  {item.startsAt} → {item.endsAt}
                </AppText>
                {editable && new Date(item.endsAt) > new Date() ? (
                  <AppButton
                    label={text("إلغاء الإغلاق", "Remove closure")}
                    variant="secondary"
                    size="sm"
                    onPress={() =>
                      run(() =>
                        service.removeClosure(zone.id, item.id, zone.version),
                      )
                    }
                    loading={command.isPending}
                  />
                ) : null}
              </Card>
            ))
          )}
          {editable ? (
            <>
              <TextField
                label={text(
                  "بداية الإغلاق مع المنطقة الزمنية",
                  "Closure start, including timezone",
                )}
                placeholder="2026-10-08T09:00:00+03:00"
                value={closure.startsAt}
                onChangeText={(v) => setClosure((c) => ({ ...c, startsAt: v }))}
              />
              <TextField
                label={text(
                  "نهاية الإغلاق مع المنطقة الزمنية",
                  "Closure end, including timezone",
                )}
                placeholder="2026-10-08T18:00:00+03:00"
                value={closure.endsAt}
                onChangeText={(v) => setClosure((c) => ({ ...c, endsAt: v }))}
              />
              <TextField
                label={text("السبب", "Reason")}
                value={closure.reason}
                onChangeText={(v) => setClosure((c) => ({ ...c, reason: v }))}
              />
              <AppButton
                label={text("إضافة إغلاق", "Add closure")}
                onPress={addClosure}
                loading={command.isPending}
              />
            </>
          ) : null}
        </View>
      ) : null}
    </Card>
  );
}
