import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, View } from 'react-native';
import { MapPin, Mic } from 'lucide-react-native';
import { AppText, PressableScale, SearchField } from '@/components/ui';
import { useLocale } from '@/hooks/useLocale';
import { useSpeechRecognitionEvent } from 'expo-speech-recognition';
import { usePreferencesStore } from '@/store/preferencesStore';
import { deliverNativeResult, isVoiceSearchSupported, listenOnceBilingual } from '@/utils/voice';
import { useTheme } from '@/theme/ThemeProvider';
import { radius } from '@/theme/radius';
import { shadow } from '@/theme/shadows';
import { spacing } from '@/theme/spacing';
import type { PlaceSuggestion } from '@/services/placeSearchService';

interface Props {
  value: string;
  suggestions: PlaceSuggestion[];
  loading: boolean;
  error?: boolean;
  showSuggestions: boolean;
  onChange: (value: string) => void;
  onSelect: (suggestion: PlaceSuggestion) => void;
}

export function DestinationSearchBox({
  value,
  suggestions,
  loading,
  error,
  showSuggestions,
  onChange,
  onSelect,
}: Props) {
  const { colors } = useTheme();
  const { t, row, isRTL, locale } = useLocale();
  const voiceLanguage = usePreferencesStore((s) => s.voiceLanguage);
  const hasQuery = value.trim().length >= 2;
  const [listening, setListening] = useState(false);
  const cancelRef = useRef<(() => void) | undefined>(undefined);
  const voiceSupported = isVoiceSearchSupported();

  // Device recogniser events. Web uses its own callbacks, so these only matter natively.
  useSpeechRecognitionEvent('result', (event) => deliverNativeResult(event.results[0]?.transcript ?? ''));
  useSpeechRecognitionEvent('error', () => deliverNativeResult(''));
  useSpeechRecognitionEvent('end', () => deliverNativeResult(''));

  // Stop the mic if the search box unmounts mid-listen.
  useEffect(() => () => cancelRef.current?.(), []);

  const toggleVoice = () => {
    if (listening) {
      cancelRef.current?.();
      setListening(false);
      return;
    }
    setListening(true);
    cancelRef.current = listenOnceBilingual(voiceLanguage, (transcript) => {
      setListening(false);
      if (transcript) onChange(transcript);
    });
  };

  const trailing = loading ? (
    <ActivityIndicator size="small" color={colors.brand} />
  ) : voiceSupported ? (
    <PressableScale
      onPress={toggleVoice}
      haptic="light"
      accessibilityRole="button"
      accessibilityLabel={listening ? t('voice.stop') : t('voice.search')}
      accessibilityState={{ selected: listening }}
      hitSlop={8}
      style={{
        width: 32,
        height: 32,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: listening ? colors.brand : colors.brandSofter,
      }}
    >
      <Mic size={16} color={listening ? colors.onBrand : colors.brand} strokeWidth={2.2} />
    </PressableScale>
  ) : undefined;

  return (
    // The map's control rail floats in the same row at the end edge, so the
    // search field stops short of it; otherwise the mic button sits underneath.
    <View style={{ gap: spacing.xs, [isRTL ? 'paddingLeft' : 'paddingRight']: 56 }}>
      <SearchField
        value={value}
        onChangeText={onChange}
        placeholder={listening ? t('voice.listening') : t('map.search')}
        tone="surface"
        trailing={trailing}
        style={shadow.sm}
      />
      {showSuggestions && hasQuery ? (
        <View
          style={[
            {
              maxHeight: 252,
              overflow: 'hidden',
              borderRadius: radius.lg,
              backgroundColor: colors.surface,
            },
            shadow.md,
          ]}
        >
          {loading ? (
            <View style={{ padding: spacing.md }}>
              <AppText variant="caption" color="textSecondary">{t('common.loading')}</AppText>
            </View>
          ) : error ? (
            <View style={{ padding: spacing.md }}>
              <AppText variant="caption" color="danger">{t('map.searchFailed')}</AppText>
            </View>
          ) : suggestions.length === 0 ? (
            <View style={{ padding: spacing.md }}>
              <AppText variant="caption" color="textSecondary">{t('map.noDestinations')}</AppText>
            </View>
          ) : (
            <ScrollView keyboardShouldPersistTaps="handled" nestedScrollEnabled>
              {suggestions.map((item) => (
                <PressableScale
                  key={item.id}
                  onPress={() => onSelect(item)}
                  accessibilityRole="button"
                  accessibilityLabel={locale === 'ar' ? item.nameAr ?? item.name : item.nameEn ?? item.name}
                  style={{
                    flexDirection: row,
                    alignItems: 'center',
                    gap: spacing.sm,
                    paddingHorizontal: spacing.md,
                    paddingVertical: spacing.sm,
                    borderBottomWidth: 1,
                    borderBottomColor: colors.border,
                  }}
                >
                  <View
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: radius.md,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: colors.brandSoft,
                    }}
                  >
                    <MapPin size={16} color={colors.brand} strokeWidth={2.2} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <AppText variant="label" numberOfLines={1}>
                      {locale === 'ar' ? item.nameAr ?? item.name : item.nameEn ?? item.name}
                    </AppText>
                    <AppText variant="caption" color="textSecondary" numberOfLines={1}>
                      {[item.category, item.address].filter(Boolean).join(' · ')}
                    </AppText>
                  </View>
                </PressableScale>
              ))}
            </ScrollView>
          )}
        </View>
      ) : null}
    </View>
  );
}
