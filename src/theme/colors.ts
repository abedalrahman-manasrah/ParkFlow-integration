/**
 * Brand identity: calm forest green, sage and warm off-white.
 * Every colour the app draws must come from here — never inline hex in screens.
 */

const palette = {
  // Deep emerald — brand identity, dark surfaces, splash, hero areas
  emerald950: '#284F44',
  emerald900: '#1F5A4A',
  emerald800: '#346B59',
  emerald700: '#194B3E',
  emerald600: '#1F5A4A',
  emerald500: '#4F8A78',
  emerald400: '#79AB97',
  emerald300: '#ACD0BF',
  emerald200: '#C7DFD3',
  emerald100: '#EAF4F0',
  emerald50: '#F0F6F2',

  // Neutrals — very slightly green-tinted so they sit with the brand
  neutral900: '#1F2D2A',
  neutral800: '#2D3D37',
  neutral700: '#43544C',
  neutral600: '#606E67',
  neutral500: '#6E7B76',
  neutral400: '#606E67',
  neutral300: '#A6B8AE',
  neutral200: '#DDE5E1',
  neutral100: '#EAF0EC',
  neutral50: '#F7F5F0',
  white: '#FFFFFF',
  black: '#000000',

  amber600: '#805E30',
  amber500: '#C89B5B',
  amber100: '#F6EEDF',

  red600: '#9F4747',
  red500: '#B34F50',
  red100: '#F8E9E6',

  blue600: '#436B82',
  blue500: '#537D94',
  blue100: '#E8EFF3',

  violet500: '#807292',
  violet100: '#EFEBF3',
};

export type ColorScheme = {
  /** Brand */
  brand: string;
  brandPressed: string;
  brandSoft: string;
  brandSofter: string;
  onBrand: string;
  deep: string;
  deepAlt: string;
  onDeep: string;
  onDeepMuted: string;
  accent: string;

  /** Surfaces */
  background: string;
  surface: string;
  surfaceAlt: string;
  surfaceSunken: string;
  surfaceInverse: string;
  overlay: string;
  scrim: string;
  glass: string;
  glassBorder: string;

  /** Lines */
  border: string;
  borderStrong: string;
  divider: string;

  /** Text */
  text: string;
  textSecondary: string;
  textTertiary: string;
  textInverse: string;
  textOnColor: string;

  /** Status — availability + system feedback */
  success: string;
  successSoft: string;
  successText: string;
  warning: string;
  warningSoft: string;
  warningText: string;
  danger: string;
  dangerDeep: string;
  dangerSoft: string;
  dangerText: string;
  info: string;
  infoSoft: string;
  infoText: string;
  neutralSoft: string;
  neutralText: string;

  /** Charts / map */
  mapWater: string;
  mapLand: string;
  parkingMunicipal: string;
  parkingPrivate: string;
  parkingFree: string;
  parkingRestricted: string;
  skeleton: string;
  skeletonHighlight: string;
};

export const lightColors: ColorScheme = {
  brand: palette.emerald600,
  brandPressed: palette.emerald700,
  brandSoft: palette.emerald100,
  brandSofter: palette.emerald50,
  onBrand: palette.white,
  deep: palette.emerald900,
  deepAlt: palette.emerald950,
  onDeep: palette.white,
  onDeepMuted: 'rgba(255,255,255,0.82)',
  accent: palette.amber500,

  background: palette.neutral50,
  surface: palette.white,
  surfaceAlt: palette.neutral100,
  surfaceSunken: palette.neutral100,
  surfaceInverse: palette.emerald900,
  overlay: 'rgba(11,31,26,0.45)',
  scrim: 'rgba(11,31,26,0.06)',
  glass: 'rgba(255,255,255,0.78)',
  glassBorder: 'rgba(255,255,255,0.55)',

  border: palette.neutral200,
  borderStrong: palette.neutral300,
  divider: palette.neutral100,

  text: palette.neutral900,
  // Slightly deepen the secondary gray for readable small text on tinted surfaces.
  textSecondary: palette.neutral600,
  textTertiary: palette.neutral400,
  textInverse: palette.white,
  textOnColor: palette.white,

  success: palette.emerald600,
  successSoft: palette.emerald100,
  successText: palette.emerald700,
  warning: palette.amber500,
  warningSoft: palette.amber100,
  warningText: palette.amber600,
  danger: palette.red500,
  dangerDeep: '#894344',
  dangerSoft: palette.red100,
  dangerText: palette.red600,
  info: palette.blue500,
  infoSoft: palette.blue100,
  infoText: palette.blue600,
  neutralSoft: palette.neutral100,
  neutralText: palette.neutral600,

  mapWater: '#DCE9E9',
  mapLand: '#F0F2EB',
  parkingMunicipal: '#2E7D5B',
  parkingPrivate: '#3E78B2',
  parkingFree: '#168C88',
  parkingRestricted: '#D97706',
  skeleton: palette.neutral200,
  skeletonHighlight: palette.neutral100,
};

export const darkColors: ColorScheme = {
  brand: palette.emerald300,
  brandPressed: palette.emerald200,
  brandSoft: 'rgba(172,208,191,0.16)',
  brandSofter: 'rgba(172,208,191,0.09)',
  onBrand: palette.emerald950,
  deep: '#284F44',
  deepAlt: '#2C453C',
  onDeep: palette.white,
  onDeepMuted: 'rgba(255,255,255,0.82)',
  accent: palette.emerald300,

  background: '#202C27',
  surface: '#293831',
  surfaceAlt: '#33443B',
  surfaceSunken: '#24312B',
  surfaceInverse: palette.white,
  overlay: 'rgba(0,0,0,0.6)',
  scrim: 'rgba(255,255,255,0.06)',
  glass: 'rgba(41,56,49,0.9)',
  glassBorder: 'rgba(255,255,255,0.08)',

  border: '#43564B',
  borderStrong: '#5F7668',
  divider: '#3A4D42',

  text: '#EAF3F0',
  textSecondary: '#9DB2AB',
  textTertiary: '#AABBB2',
  textInverse: palette.neutral900,
  textOnColor: palette.white,

  success: palette.emerald400,
  successSoft: 'rgba(172,208,191,0.15)',
  successText: palette.emerald300,
  warning: palette.amber500,
  warningSoft: 'rgba(200,155,91,0.16)',
  warningText: '#E3C293',
  danger: '#E5A09B',
  dangerDeep: '#894344',
  dangerSoft: 'rgba(229,160,155,0.16)',
  dangerText: '#F0B9B3',
  info: palette.blue500,
  infoSoft: 'rgba(158,192,211,0.16)',
  infoText: '#B6D0DF',
  neutralSoft: '#33443B',
  neutralText: '#9DB2AB',

  mapWater: '#30474B',
  mapLand: '#293831',
  parkingMunicipal: '#62B88B',
  parkingPrivate: '#70A9DB',
  parkingFree: '#43BBB5',
  parkingRestricted: '#F2A64A',
  skeleton: '#3A4D42',
  skeletonHighlight: '#4A6053',
};

export { palette };
