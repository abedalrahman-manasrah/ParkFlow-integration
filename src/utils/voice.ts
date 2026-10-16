import { Platform } from 'react-native';
import * as Speech from 'expo-speech';
import { ExpoSpeechRecognitionModule } from 'expo-speech-recognition';
import type { Locale } from '@/i18n';

/**
 * Voice helpers. Recognition uses the browser speech API on web and the
 * platform recogniser on device (expo-speech-recognition, which needs a dev
 * build — it is not in Expo Go). Speech output uses expo-speech on both.
 */

type BrowserRecognition = {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

type RecognitionCtor = new () => BrowserRecognition;

function browserRecognitionCtor(): RecognitionCtor | undefined {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return undefined;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

/** Whether the mic button should show. Native checks the recogniser is installed. */
export function isVoiceSearchSupported(): boolean {
  if (Platform.OS === 'web') return browserRecognitionCtor() !== undefined;
  try {
    return ExpoSpeechRecognitionModule.isRecognitionAvailable();
  } catch {
    // The native module is missing (Expo Go or a build without it).
    return false;
  }
}

/** Palestinian Arabic is tried first; the platform falls back to the nearest Arabic. */
/** Voice search language is chosen by the user, not by the app language. */
export type VoiceLanguage = 'ar' | 'en';
const recognitionLang = (language: VoiceLanguage): string => (language === 'ar' ? 'ar-JO' : 'en-US');

/** Result handler for the current native listen, cleared once it has been used. */
let pendingNative: ((transcript: string) => void) | undefined;

/** Called by the component's native event hooks. Only the first call per listen counts. */
export function deliverNativeResult(transcript: string): void {
  const done = pendingNative;
  pendingNative = undefined;
  done?.(transcript.trim());
}

/**
 * Listens once and returns the transcript ('' when nothing was heard or the
 * user stopped). Returns a cancel function for the mic button.
 */
export function listenOnce(
  language: VoiceLanguage,
  onDone: (transcript: string) => void,
): (() => void) | undefined {
  if (Platform.OS === 'web') {
    const Ctor = browserRecognitionCtor();
    if (!Ctor) return undefined;
    const recognition = new Ctor();
    recognition.lang = recognitionLang(language);
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onresult = (event) => onDone((event.results[0]?.[0]?.transcript ?? '').trim());
    recognition.onerror = () => onDone('');
    recognition.onend = () => undefined;
    recognition.start();
    return () => recognition.stop();
  }

  pendingNative = onDone;
  void (async () => {
    try {
      const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!permission.granted) return deliverNativeResult('');
      ExpoSpeechRecognitionModule.start({ lang: recognitionLang(language), interimResults: false, maxAlternatives: 1 });
    } catch {
      deliverNativeResult('');
    }
  })();
  return () => {
    pendingNative = undefined;
    ExpoSpeechRecognitionModule.stop();
  };
}

/**
 * Destination search accepts either supported language. The selected voice
 * language is only the first recogniser to try; it is not tied to app locale.
 */
export function listenOnceBilingual(
  preferred: VoiceLanguage,
  onDone: (transcript: string) => void,
): (() => void) | undefined {
  const order: VoiceLanguage[] = preferred === 'ar' ? ['ar', 'en'] : ['en', 'ar'];
  let cancelled = false;
  let currentCancel: (() => void) | undefined;

  const listenAt = (index: number) => {
    currentCancel = listenOnce(order[index]!, (transcript) => {
      if (cancelled) return;
      if (transcript || index === order.length - 1) {
        onDone(transcript);
        return;
      }
      listenAt(index + 1);
    });
    if (!currentCancel && index < order.length - 1) listenAt(index + 1);
    else if (!currentCancel) onDone('');
  };

  listenAt(0);
  return () => {
    cancelled = true;
    currentCancel?.();
  };
}

/** Speaks a short alert. Failures are silent: an alert must never break the screen. */
export function speak(text: string, locale: Locale): void {
  try {
    Speech.stop();
    Speech.speak(text, { language: locale === 'ar' ? 'ar' : 'en-US', rate: 0.95 });
  } catch {
    // Speech output is a convenience; ignore platforms without a voice.
  }
}

/**
 * Turns a spoken sentence into a place name. "بدي أروح ع شارع ركب" becomes
 * "شارع ركب", because the search matches names, not commands.
 */
const COMMAND_PREFIX =
  /^\s*(?:(?:بدي|بدنا|أريد|اريد|أبي|ابي|عايز|عاوز)\s*)?(?:(?:أروح|اروح|نروح|روح|أذهب|اذهب|نذهب|وديني|خذني)\s*)?(?:(?:على|إلى|الى|لـ|ل|ع)\s*)?/u;
const ENGLISH_PREFIX = /^\s*(?:i want to go to|i want to|take me to|navigate to|go to|drive to|directions to)\s+/i;

export function extractPlaceQuery(transcript: string): string {
  const trimmed = transcript.trim();
  const stripped = trimmed.replace(ENGLISH_PREFIX, '').replace(COMMAND_PREFIX, '').trim();
  return stripped.length >= 2 ? stripped : trimmed;
}
