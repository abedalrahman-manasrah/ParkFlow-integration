const base = require('./app.json');

/**
 * Injects the Google Maps Android key at build time.
 *
 * Android's Google Maps SDK refuses to draw tiles without an authorised key —
 * the map mounts and reports "Authorization failure" instead. Expo Go ships its
 * own key that is not valid for third-party projects, so the map only renders
 * once you supply your own in a development or production build.
 *
 * The key is read from the environment rather than committed, so it never ends
 * up in version control:
 *
 *   PowerShell:  $env:GOOGLE_MAPS_API_KEY = "AIza..."; npx expo run:android
 *   bash:        GOOGLE_MAPS_API_KEY=AIza... npx expo run:android
 *
 * iOS needs no key — react-native-maps uses Apple Maps there.
 */
module.exports = () => {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;

  return {
    ...base.expo,
    plugins: [...base.expo.plugins, 'expo-notifications'],
    ...(process.env.EXPO_PUBLIC_EAS_PROJECT_ID ? {extra:{...base.expo.extra,eas:{projectId:process.env.EXPO_PUBLIC_EAS_PROJECT_ID}}}:{}),
    android: {
      ...base.expo.android,
      ...(process.env.GOOGLE_SERVICES_JSON ? {googleServicesFile:process.env.GOOGLE_SERVICES_JSON}:{}),
      ...(apiKey ? { config: { googleMaps: { apiKey } } } : null),
    },
  };
};
