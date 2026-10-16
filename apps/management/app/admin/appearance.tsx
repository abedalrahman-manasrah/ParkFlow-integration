import { useEffect, useRef, useState } from 'react';
import { View, useWindowDimensions } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AppButton, AppHeader, AppText, Card, ErrorState, InlineNotice, Screen, Segmented, SwitchRow, TextField } from '@parkflow/client/components/ui';
import { ConfiguredWelcome } from '@parkflow/client/components/brand/ConfiguredWelcome';
import { useLocale } from '@parkflow/client/hooks/useLocale';
import { useAuthStore } from '@parkflow/client/store/authStore';
import { useAppConfigStore } from '@parkflow/client/store/appConfigStore';
import { appConfigService } from '@parkflow/client/services/http/appConfigService';
import { captureLoginGuard } from '@parkflow/client/services/http/apiClient';
import { ThemeProvider, useTheme } from '@parkflow/client/theme/ThemeProvider';
import { configuredColors } from '@parkflow/design/appConfigColors';
import { darkColors, lightColors } from '@parkflow/design/colors';
import { spacing } from '@parkflow/design/spacing';
import { appConfigSchema, defaultAppConfig, type AdminAppConfig, type AppConfig, type AppConfigRevision, type AppConfigSection, type LocalizedContent } from '@parkflow/contracts/appConfig';
import type { Locale } from '@parkflow/client/i18n';

function BilingualField({ label, value, onChange, maxLength, multiline = false }: { label: string; value: LocalizedContent; onChange: (value: LocalizedContent) => void; maxLength: number; multiline?: boolean }) {
  return <View style={{ gap: spacing.sm }}>
    <AppText variant="title">{label}</AppText>
    <TextField label="English" accessibilityLabel={`${label} English`} value={value.en} onChangeText={en => onChange({ ...value, en })} maxLength={maxLength} multiline={multiline} />
    <TextField label="العربية" accessibilityLabel={`${label} العربية`} value={value.ar} onChangeText={ar => onChange({ ...value, ar })} maxLength={maxLength} multiline={multiline} />
  </View>;
}

export default function AppearanceEditor() {
  const userId = useAuthStore(state => state.user?.id);
  return <AccountAppearanceEditor key={userId ?? 'anonymous'} userId={userId} />;
}

function AccountAppearanceEditor({ userId }: { userId?: string }) {
  const { locale, row } = useLocale();
  const { colors, isDark } = useTheme();
  const { width } = useWindowDimensions();
  const s = (en: string, ar: string) => locale === 'ar' ? ar : en;
  const isAdmin = useAuthStore(state => state.user?.role === 'ADMIN');
  const queryClient = useQueryClient();
  const queryKey = ['admin', 'app-config', userId] as const;
  const current = useQuery({ queryKey, queryFn: appConfigService.admin, enabled: isAdmin });
  const [snapshot, setSnapshot] = useState<AdminAppConfig | null>(null);
  const [config, setConfig] = useState<AppConfig>(() => appConfigSchema.parse(defaultAppConfig));
  const [saved, setSaved] = useState('');
  const [tab, setTab] = useState<'edit' | 'preview' | 'history'>('edit');
  const [previewLocale, setPreviewLocale] = useState<Locale>(locale);
  const [previewed, setPreviewed] = useState('');
  const [reason, setReason] = useState('');
  const [history, setHistory] = useState<AppConfigRevision[]>([]);
  const [nextHistory, setNextHistory] = useState<number | null>(null);
  const [historyPreview, setHistoryPreview] = useState<AppConfigRevision | null>(null);
  const [confirm, setConfirm] = useState<'publish' | 'rollback' | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [notice, setNotice] = useState('');
  const pending = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const serialized = JSON.stringify(config);
  const dirty = serialized !== saved;
  const validation = appConfigSchema.safeParse(config);

  const accept = (next: AdminAppConfig) => {
    const nextConfig = appConfigSchema.parse(next.draft?.config ?? next.published?.config ?? defaultAppConfig);
    setSnapshot(next); setConfig(nextConfig); setSaved(JSON.stringify(nextConfig)); setConfirm(null); setHistoryPreview(null);
  };
  useEffect(() => { if (current.data && !snapshot) accept(current.data); }, [current.data, snapshot]);

  const acceptLatest = async (next: AdminAppConfig, ensureCurrent: () => void) => {
    ensureCurrent();
    await queryClient.cancelQueries({ queryKey, exact: true });
    ensureCurrent();
    queryClient.setQueryData(queryKey, next);
    accept(next);
  };

  async function run(action: (ensureCurrent: () => void) => Promise<void>) {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError(null); setNotice('');
    const ensureLogin = captureLoginGuard();
    const ensureCurrent = () => {
      ensureLogin();
      if (!mounted.current) throw new Error('Appearance editor was closed');
    };
    try { await action(ensureCurrent); } catch (cause) {
      try { ensureCurrent(); setError(cause); } catch { /* A previous login cannot report into this editor. */ }
    } finally { pending.current = false; setBusy(false); }
  }
  const loadHistory = async (before?: number, ensureCurrent = captureLoginGuard()) => {
    const result = await appConfigService.history(before);
    ensureCurrent();
    setHistory(previous => before ? [...previous, ...result.items] : result.items);
    setNextHistory(result.nextBeforeVersion);
  };
  const update = (patch: Partial<AppConfig>) => { setConfig(previous => ({ ...previous, ...patch })); setConfirm(null); setHistoryPreview(null); };
  const editSection = (id: string, section: AppConfigSection) => update({ sections: config.sections.map(item => item.id === id ? section : item) });
  const moveSection = (index: number, offset: number) => {
    const sections = [...config.sections];
    [sections[index], sections[index + offset]] = [sections[index + offset], sections[index]];
    update({ sections });
  };
  const addSection = (type: AppConfigSection['type']) => {
    const base = { id: `section-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, visible: true };
    const section: AppConfigSection = type === 'image' ? { ...base, type, url: '', alt: { en: 'Image description', ar: 'وصف الصورة' } }
      : type === 'action' ? { ...base, type, label: { en: 'Get started', ar: 'ابدأ الآن' }, path: '/(onboarding)/name' }
        : { ...base, type, text: { en: type === 'title' ? 'Section title' : 'Section description', ar: type === 'title' ? 'عنوان القسم' : 'وصف القسم' } };
    update({ sections: [...config.sections, section] });
  };
  const openPreview = () => { setHistoryPreview(null); setPreviewed(serialized); setTab('preview'); };
  const previewConfig = historyPreview?.config ?? (validation.success ? validation.data : null);
  const brandFallback = previewConfig && configuredColors(isDark ? darkColors : lightColors, previewConfig.brandColor).brand.toLowerCase() !== previewConfig.brandColor.toLowerCase();

  if (!isAdmin) return <Screen><AppHeader title={s('Appearance & content', 'المظهر والمحتوى')} leading="back" /><ErrorState error={new Error(s('Platform administrator access is required.', 'هذه الصفحة مخصصة لأدمن المنصة.'))} /></Screen>;
  if (!snapshot) return <Screen><AppHeader title={s('Appearance & content', 'المظهر والمحتوى')} leading="back" />{current.error ? <ErrorState error={current.error} onRetry={() => { void current.refetch(); }} /> : <AppText>{s('Loading appearance…', 'جارٍ تحميل المظهر…')}</AppText>}</Screen>;

  return <Screen keyboardAvoiding contentContainerStyle={{ gap: spacing.xl, width: '100%', maxWidth: 1240, alignSelf: 'center' }}>
    <AppHeader title={s('Appearance & content', 'المظهر والمحتوى')} subtitle={s('Preview, save a draft, then publish to drivers.', 'عاين التغييرات واحفظ المسودة ثم انشرها للمستخدمين.')} leading="back" />
    <Card padding="lg" style={{ gap: spacing.md }}>
      <AppText variant="title">{s(`Editor version ${snapshot.version} · ${dirty ? 'Unsaved changes' : snapshot.draft ? 'Saved draft' : 'Published appearance'}`, `إصدار المحرر ${snapshot.version} · ${dirty ? 'تغييرات غير محفوظة' : snapshot.draft ? 'مسودة محفوظة' : 'المظهر المنشور'}`)}</AppText>
      <AppText color="textSecondary">{s('Changes stay private until published. The sign-up and login buttons always remain available.', 'تبقى التغييرات خاصة حتى النشر. أزرار التسجيل والدخول تبقى متاحة دائماً.')}</AppText>
      <View style={{ flexDirection: row, flexWrap: 'wrap', gap: spacing.sm }}>
        <AppButton label={s('Save draft', 'حفظ المسودة')} size="sm" fullWidth={false} disabled={busy || !validation.success || !dirty} loading={busy} onPress={() => { void run(async ensureCurrent => { if (!validation.success) return; const next = await appConfigService.saveDraft(snapshot.version, validation.data); await acceptLatest(next, ensureCurrent); setNotice(s('Draft saved. Review the preview before publishing.', 'تم حفظ المسودة. راجع المعاينة قبل النشر.')); }); }} />
        <AppButton label={s('Preview changes', 'معاينة التغييرات')} size="sm" fullWidth={false} variant="secondary" disabled={busy || !validation.success} onPress={openPreview} />
        <AppButton label={s('Review publication', 'مراجعة النشر')} size="sm" fullWidth={false} variant="secondary" disabled={busy || dirty || !snapshot.draftRevisionId || previewed !== serialized} onPress={() => { setConfirm('publish'); setTab('preview'); setHistoryPreview(null); }} />
        <AppButton label={s(dirty ? 'Reload (discard local edits)' : 'Reload latest', dirty ? 'إعادة التحميل (إلغاء التعديلات المحلية)' : 'تحميل أحدث إصدار')} size="sm" fullWidth={false} variant="ghost" disabled={busy} onPress={() => { void run(async ensureCurrent => { const next = await appConfigService.admin(); await acceptLatest(next, ensureCurrent); setPreviewed(''); }); }} />
      </View>
    </Card>
    {error ? <InlineNotice tone="danger" title={s('Change could not be applied', 'تعذر تطبيق التغيير')} body={error instanceof Error ? error.message : s('Please try again.', 'يرجى المحاولة مجدداً.')} /> : null}
    {notice ? <InlineNotice tone="success" title={notice} /> : null}
    {!validation.success ? <InlineNotice tone="warning" title={s('Check these fields before saving or previewing', 'تحقق من الحقول قبل الحفظ أو المعاينة')} body={validation.error.issues.slice(0, 6).map(issue => `${issue.path.join(' / ')}: ${issue.message}`).join('\n')} /> : null}
    <Segmented value={tab} onChange={next => { setTab(next); setConfirm(null); if (next === 'history') void run(ensureCurrent => loadHistory(undefined, ensureCurrent)); if (next === 'preview') { setHistoryPreview(null); if (validation.success) setPreviewed(serialized); } }} options={[{ value: 'edit', label: s('Edit', 'تحرير') }, { value: 'preview', label: s('Preview', 'معاينة') }, { value: 'history', label: s('History', 'سجل النسخ') }]} />

    {tab === 'edit' ? <View pointerEvents={busy ? 'none' : 'auto'} style={{ gap: spacing.xl }}>
      <View style={{ flexDirection: width > 850 ? row : 'column', gap: spacing.xl }}>
        <Card padding="lg" style={{ flex: 1, gap: spacing.lg }}>
          <AppText variant="h3">{s('Brand', 'الهوية')}</AppText>
          <TextField label={s('Brand color', 'لون الهوية')} hint={s('Six-digit hex, e.g. #1F5A4A. A readable fallback is used where contrast is too low.', 'ست خانات مثل #1F5A4A. يُستخدم لون بديل مقروء إذا كان التباين ضعيفاً.')} value={config.brandColor} maxLength={7} autoCapitalize="none" onChangeText={brandColor => update({ brandColor })} />
          <View style={{ height: 30, borderRadius: 8, backgroundColor: /^#[0-9a-f]{6}$/i.test(config.brandColor) ? config.brandColor : colors.border }} />
          <TextField label={s('Logo image URL', 'رابط صورة الشعار')} hint={s('Public HTTPS image. Leave blank for the ParkFlow logo.', 'صورة برابط HTTPS عام. اتركه فارغاً لشعار باركفلو.')} value={config.logoUrl ?? ''} maxLength={2048} autoCapitalize="none" keyboardType="url" onChangeText={logoUrl => update({ logoUrl: logoUrl || null })} />
          <BilingualField label={s('App name', 'اسم التطبيق')} value={config.appName} onChange={appName => update({ appName })} maxLength={80} />
        </Card>
        <Card padding="lg" style={{ flex: 1, gap: spacing.lg }}>
          <AppText variant="h3">{s('Welcome message', 'رسالة الترحيب')}</AppText>
          <BilingualField label={s('Headline', 'العنوان الرئيسي')} value={config.welcome.headline} onChange={headline => update({ welcome: { ...config.welcome, headline } })} maxLength={160} />
          <BilingualField label={s('Description', 'الوصف')} value={config.welcome.body} onChange={body => update({ welcome: { ...config.welcome, body } })} maxLength={1500} multiline />
          <SwitchRow label={s('Show announcement banner', 'إظهار شريط الإعلان')} value={config.banner.enabled} onValueChange={enabled => update({ banner: { ...config.banner, enabled } })} />
          <BilingualField label={s('Banner text', 'نص الإعلان')} value={config.banner.text} onChange={text => update({ banner: { ...config.banner, text } })} maxLength={300} multiline />
        </Card>
      </View>
      <AppText variant="h3">{s('Welcome sections', 'أقسام صفحة الترحيب')}</AppText>
      <AppText color="textSecondary">{s('Up to 12 plain-text, image, or sign-in action blocks. Move sections up or down to change their order.', 'حتى 12 قسماً للنصوص والصور وأزرار التسجيل والدخول. غيّر ترتيب الأقسام بتحريكها للأعلى أو للأسفل.')}</AppText>
      {config.sections.map((section, index) => <Card key={section.id} padding="lg" style={{ gap: spacing.md }}>
        <View style={{ flexDirection: row, flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm }}>
          <AppText variant="title">{index + 1}. {s(section.type, ({ title: 'عنوان', body: 'نص', image: 'صورة', action: 'زر' })[section.type])}</AppText>
          <AppButton label={s('Move up', 'للأعلى')} size="sm" fullWidth={false} variant="ghost" disabled={index === 0} onPress={() => moveSection(index, -1)} />
          <AppButton label={s('Move down', 'للأسفل')} size="sm" fullWidth={false} variant="ghost" disabled={index === config.sections.length - 1} onPress={() => moveSection(index, 1)} />
          <AppButton label={s('Remove', 'إزالة')} size="sm" fullWidth={false} variant="danger" onPress={() => update({ sections: config.sections.filter(item => item.id !== section.id) })} />
        </View>
        <SwitchRow label={s('Visible', 'ظاهر')} value={section.visible} onValueChange={visible => editSection(section.id, { ...section, visible })} />
        {section.type === 'title' || section.type === 'body' ? <BilingualField label={s('Text', 'النص')} value={section.text} maxLength={section.type === 'title' ? 160 : 1500} multiline={section.type === 'body'} onChange={text => editSection(section.id, { ...section, text })} /> : null}
        {section.type === 'image' ? <><TextField label={s('HTTPS image URL', 'رابط صورة HTTPS')} value={section.url} maxLength={2048} autoCapitalize="none" keyboardType="url" onChangeText={url => editSection(section.id, { ...section, url })} /><BilingualField label={s('Image description', 'وصف الصورة')} value={section.alt} maxLength={160} onChange={alt => editSection(section.id, { ...section, alt })} /></> : null}
        {section.type === 'action' ? <><BilingualField label={s('Button label', 'نص الزر')} value={section.label} maxLength={80} onChange={label => editSection(section.id, { ...section, label })} /><Segmented value={section.path} options={[{ value: '/(onboarding)/name', label: s('Sign up', 'إنشاء حساب') }, { value: '/(onboarding)/phone', label: s('Log in', 'تسجيل الدخول') }]} onChange={path => editSection(section.id, { ...section, path })} /></> : null}
      </Card>)}
      <View style={{ flexDirection: row, flexWrap: 'wrap', gap: spacing.sm }}>{(['title', 'body', 'image', 'action'] as const).map(type => <AppButton key={type} label={s(`Add ${type}`, `إضافة ${({ title: 'عنوان', body: 'نص', image: 'صورة', action: 'زر' })[type]}`)} size="sm" fullWidth={false} variant="secondary" disabled={config.sections.length >= 12} onPress={() => addSection(type)} />)}</View>
    </View> : null}

    {tab === 'preview' && previewConfig ? <View style={{ gap: spacing.lg }}>
      <Segmented value={previewLocale} onChange={setPreviewLocale} options={[{ value: 'en', label: 'English' }, { value: 'ar', label: 'العربية' }]} />
      <AppText color="textSecondary">{historyPreview ? s(`Previewing history version ${historyPreview.version}`, `معاينة النسخة السابقة ${historyPreview.version}`) : s('Local preview. Nothing is published by opening this preview.', 'معاينة محلية. فتح المعاينة لا ينشر أي تغيير.')}</AppText>
      {brandFallback ? <InlineNotice title={s('Readable color applied', 'تم تطبيق لون مقروء')} body={s('The selected color has insufficient contrast in this theme. The preview uses the safe theme fallback.', 'تباين اللون المختار غير كافٍ في هذا النمط. تستخدم المعاينة اللون البديل الآمن.')} /> : null}
      <ThemeProvider previewBrandColor={previewConfig.brandColor}><Card padding="lg"><ConfiguredWelcome config={previewConfig} locale={previewLocale} /></Card></ThemeProvider>
      {historyPreview ? <View style={{ gap: spacing.sm }}>
        <AppButton label={s('Use this version as a local draft', 'استخدام النسخة كمسودة محلية')} variant="secondary" disabled={busy} onPress={() => { update(appConfigSchema.parse(historyPreview.config)); setHistoryPreview(null); setTab('edit'); }} />
        {historyPreview.publishedAt && historyPreview.id !== snapshot.publishedRevisionId ? <AppButton label={s('Review restoring this publication', 'مراجعة استعادة هذه النسخة المنشورة')} variant="secondary" disabled={busy} onPress={() => setConfirm('rollback')} /> : null}
      </View> : null}
    </View> : null}

    {confirm ? <Card padding="lg" style={{ gap: spacing.md }}>
      <AppText variant="h3">{confirm === 'publish' ? s('Publish this saved draft?', 'نشر هذه المسودة المحفوظة؟') : s('Restore this published version?', 'استعادة هذه النسخة المنشورة؟')}</AppText>
      <AppText>{s('This replaces the live welcome and brand settings and clears the current draft. A new version and audit record are saved; history remains available.', 'سيُستبدل الترحيب والهوية المنشوران وتُمسح المسودة الحالية. تُحفظ نسخة جديدة وسجل تدقيق مع الاحتفاظ بسجل النسخ.')}</AppText>
      <TextField label={s('Reason for this change', 'سبب التغيير')} hint={s('At least 5 characters.', 'خمسة أحرف على الأقل.')} value={reason} onChangeText={setReason} maxLength={500} multiline />
      <AppButton label={confirm === 'publish' ? s('Publish now', 'نشر الآن') : s('Restore now', 'استعادة الآن')} loading={busy} disabled={reason.trim().length < 5 || busy || (confirm === 'publish' && (dirty || previewed !== serialized))} onPress={() => { void run(async ensureCurrent => {
        const next = confirm === 'publish' ? await appConfigService.publish(snapshot.version, snapshot.draftRevisionId!, reason.trim()) : await appConfigService.rollback(snapshot.version, historyPreview!.id, reason.trim());
        await acceptLatest(next, ensureCurrent); setReason(''); setNotice(s('Published successfully. Drivers will receive this version when the app refreshes.', 'تم النشر. سيظهر الإصدار للمستخدمين عند تحديث التطبيق.')); await useAppConfigStore.getState().refresh({ force: true });
      }); }} />
      <AppButton label={s('Cancel', 'إلغاء')} variant="ghost" disabled={busy} onPress={() => setConfirm(null)} />
    </Card> : null}

    {tab === 'history' ? <View style={{ gap: spacing.md }}>
      <AppText color="textSecondary">{s('Every save and publication creates a new version. Published history can be restored after previewing it.', 'كل حفظ ونشر ينشئ نسخة جديدة. يمكن استعادة نسخة منشورة بعد معاينتها.')}</AppText>
      {!history.length && !busy ? <AppText>{s('No saved versions yet.', 'لا توجد نسخ محفوظة بعد.')}</AppText> : null}
      {history.map(revision => <Card key={revision.id} padding="lg" style={{ gap: spacing.sm }}>
        <AppText variant="title">{s(`Version ${revision.version}`, `النسخة ${revision.version}`)} · {revision.publishedAt ? s('Published', 'منشورة') : s('Draft', 'مسودة')}{revision.id === snapshot.publishedRevisionId ? s(' · Current', ' · الحالية') : ''}</AppText>
        <AppText>{revision.config.appName[locale]}</AppText>
        <AppText color="textSecondary" variant="caption">{new Date(revision.createdAt).toLocaleString(locale === 'ar' ? 'ar' : 'en')} · {s('Author', 'الكاتب')}: {revision.createdBy}</AppText>
        {revision.publication?.reason ? <AppText color="textSecondary">{revision.publication.reason}</AppText> : null}
        <AppButton label={s('Preview version', 'معاينة النسخة')} variant="secondary" size="sm" disabled={busy} onPress={() => { setHistoryPreview(revision); setConfirm(null); setTab('preview'); }} />
      </Card>)}
      {nextHistory ? <AppButton label={s('Load older versions', 'تحميل النسخ الأقدم')} loading={busy} variant="secondary" onPress={() => { void run(ensureCurrent => loadHistory(nextHistory, ensureCurrent)); }} /> : null}
    </View> : null}
  </Screen>;
}
