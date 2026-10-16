// General guidance, not vehicle-specific diagnosis. The vehicle's manual takes precedence.
// Reviewed 2026-10-10. Only these curated symbols may resolve to guidance.
const sourceA = 'https://www.fordservicecontent.com/Ford_Content/vdirsnet/OwnerManual/Home/Content?ProcUid=G2217047&Uid=G2217045&buildtype=web&countryCode=USA&div=f&languageCode=en&moidRef=G2130115&userMarket=GBR&vFilteringEnabled=False&variantid=9374';
const sourceB = 'https://www.fordservicecontent.com/Ford_Content/vdirsnet/OwnerManual/Home/Content?ProcUid=G2260080&Uid=G2260078&buildtype=web&countryCode=USA&div=f&languageCode=en&moidRef=G2130115&userMarket=CAN&vFilteringEnabled=False&variantid=9537';
type Copy = { name: string; explanation: string; causes: string; action: string };
export type Guidance = {
  ar: Copy; en: Copy; urgency: 'stop' | 'urgent' | 'soon';
  categories: Array<'maintenance' | 'tire_service'>;
  specialty?: RegExp; sources: string[];
};
export const catalog: Record<string, Guidance> = {
  oil_pressure: {
    ar: { name: 'ضغط زيت المحرك', explanation: 'رمز علبة الزيت يرتبط بضغط الزيت.', causes: 'قد يكون الضغط منخفضًا أو يوجد خلل بالنظام.', action: 'إذا بقي مضاءً والمحرك يعمل، توقف في مكان مناسب وأطفئ المحرك واطلب المساعدة.' },
    en: { name: 'Engine oil pressure', explanation: 'Oil-can symbol relates to oil pressure.', causes: 'Possible low pressure or system fault.', action: 'If lit with the engine running, stop in a suitable place, switch off and seek assistance.' },
    urgency: 'stop', categories: ['maintenance'], sources: [sourceA],
  },
  coolant_temperature: {
    ar: { name: 'حرارة سائل التبريد', explanation: 'رمز ميزان الحرارة فوق موجات يرتبط بحرارة المحرك.', causes: 'قد يكون المحرك ساخنًا أو يوجد خلل بالتبريد.', action: 'إذا بقي مضاءً والمحرك يعمل، توقف وأطفئ المحرك واطلب المساعدة. لا تفتح غطاء التبريد الساخن.' },
    en: { name: 'Coolant temperature', explanation: 'Thermometer over waves relates to engine temperature.', causes: 'Possible overheating or cooling fault.', action: 'If lit with the engine running, stop, switch off and seek assistance. Do not open a hot coolant cap.' },
    urgency: 'stop', categories: ['maintenance'], sources: [sourceA],
  },
  check_engine: {
    ar: { name: 'فحص المحرك', explanation: 'رمز المحرك يرتبط بنظام التحكم بالمحرك والانبعاثات.', causes: 'قد يوجد خلل بالتحكم أو الانبعاثات.', action: 'اطلب فحصًا قريبًا. إذا كان يومض أو ظهرت أعراض شديدة، توقف واطلب المساعدة؛ الصورة لا تكشف الوميض.' },
    en: { name: 'Check engine', explanation: 'Engine symbol relates to engine/emissions control.', causes: 'Possible control or emissions fault.', action: 'Arrange inspection soon. If flashing or symptoms are severe, stop and seek assistance; a photo cannot detect flashing.' },
    urgency: 'urgent', categories: ['maintenance'], sources: [sourceA],
  },
  battery: {
    ar: { name: 'نظام الشحن', explanation: 'رمز البطارية يرتبط بنظام الشحن.', causes: 'قد يوجد خلل بالشحن؛ لا يعني حتمًا تلف البطارية.', action: 'إذا بقي مضاءً والمحرك يعمل، اطلب فحصًا عاجلًا.' },
    en: { name: 'Charging system', explanation: 'Battery symbol relates to charging.', causes: 'Possible charging fault; not necessarily a failed battery.', action: 'If lit with the engine running, arrange prompt inspection.' },
    urgency: 'urgent', categories: ['maintenance'], specialty: /battery|charging|electrical|بطاري|شحن|كهرباء/i, sources: [sourceB],
  },
  brake: {
    ar: { name: 'نظام الفرامل', explanation: 'دائرة مع تعجب أو كلمة BRAKE ترتبط بالفرامل.', causes: 'قد تكون فرامل التوقف مفعلة أو السائل منخفضًا أو يوجد خلل.', action: 'تحقق من تحرير فرامل التوقف. إذا بقي التحذير، توقف واطلب مساعدة مختصة.' },
    en: { name: 'Brake system', explanation: 'Circled exclamation or BRAKE relates to brakes.', causes: 'Possible applied parking brake, low fluid or fault.', action: 'Check parking brake release. If the warning persists, stop and seek qualified help.' },
    urgency: 'stop', categories: ['maintenance'], specialty: /brake|فرامل|مكابح/i, sources: [sourceB],
  },
  abs: {
    ar: { name: 'نظام ABS', explanation: 'حروف ABS تشير إلى نظام منع انغلاق الفرامل.', causes: 'قد يوجد خلل بنظام ABS.', action: 'اطلب فحصًا عاجلًا، خاصة مع تحذير الفرامل. لا يمكن تقييم أداء الفرامل بالصورة.' },
    en: { name: 'ABS', explanation: 'ABS letters identify anti-lock braking.', causes: 'Possible ABS fault.', action: 'Arrange prompt inspection, especially with a brake warning. A photo cannot assess braking performance.' },
    urgency: 'urgent', categories: ['maintenance'], specialty: /\babs\b|brake|فرامل|مكابح/i, sources: [sourceB],
  },
  tire_pressure: {
    ar: { name: 'ضغط الإطارات', explanation: 'تعجب داخل شكل إطار يرتبط بمراقبة ضغط الإطارات.', causes: 'قد يكون الضغط منخفضًا أو يوجد خلل بالمراقبة.', action: 'افحص الضغط حسب ملصق السيارة قريبًا واطلب فحص النظام إذا كان التحذير يومض.' },
    en: { name: 'Tire pressure', explanation: 'Exclamation inside a tire shape relates to pressure monitoring.', causes: 'Possible low pressure or monitoring fault.', action: 'Check pressure against the vehicle placard soon; request system inspection if flashing.' },
    urgency: 'soon', categories: ['tire_service'], sources: [sourceB],
  },
  airbag: {
    ar: { name: 'الوسائد الهوائية', explanation: 'شخص أمام دائرة يشير لنظام الوسائد الهوائية.', causes: 'قد يوجد خلل بنظام الحماية.', action: 'إذا بقي مضاءً والمحرك يعمل، اطلب فحصًا عاجلًا من مختص.' },
    en: { name: 'Airbag', explanation: 'Person with a circle identifies the airbag system.', causes: 'Possible restraint-system fault.', action: 'If lit with the engine running, arrange prompt specialist inspection.' },
    urgency: 'urgent', categories: ['maintenance'], specialty: /airbag|\bsrs\b|وسائد|وسادة/i, sources: [sourceA],
  },
};
