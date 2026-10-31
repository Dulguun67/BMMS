// Суралцахуйн чиглэлийн өнгө (chiglel_id 1–6, 02_reference_data.sql-тэй ижил дараалал)
export const DIRS = {
  1: { short: 'Хэл яриа', color: 'var(--primary)', soft: 'blue' },
  2: { short: 'Математик', color: 'var(--purple)', soft: 'purple' },
  3: { short: 'Байгаль, нийгэм', color: 'var(--cyan)', soft: 'cyan' },
  4: { short: 'Хөдөлгөөн', color: 'var(--green)', soft: 'green' },
  5: { short: 'Дүрслэх урлаг', color: 'var(--yellow)', soft: 'yellow', ink: '#3A2A00' },
  6: { short: 'Хөгжим', color: 'var(--rose)', soft: 'rose' },
};
export const DIR_IDS = [1, 2, 3, 4, 5, 6];

export const ATT = ['Ирсэн', 'Чөлөөтэй', 'Өвчтэй', 'Тасалсан'];
export const ATT_CLS = { Ирсэн: 'p', Чөлөөтэй: 'l', Өвчтэй: 's', Тасалсан: 'a' };
export const ATT_SHORT = { Ирсэн: 'И', Чөлөөтэй: 'Ч', Өвчтэй: 'Ө', Тасалсан: 'Т' };
export const FEE = ['Төлсөн', 'Төлөөгүй', 'Чөлөөлсөн'];
export const FEE_CLS = { Төлсөн: 'paid', Төлөөгүй: 'unpaid', Чөлөөлсөн: 'exempt' };
export const DUUREG = ['Багануур', 'Багахангай', 'Баянгол', 'Баянзүрх', 'Налайх', 'Сонгинохайрхан', 'Сүхбаатар', 'Хан-Уул', 'Чингэлтэй'];
export const DUUREG_SHORT = { Багануур: 'БНД', Багахангай: 'БХД', Баянгол: 'БГД', Баянзүрх: 'БЗД', Налайх: 'НД', Сонгинохайрхан: 'СХД', Сүхбаатар: 'СБД', 'Хан-Уул': 'ХУД', Чингэлтэй: 'ЧД' };
export const HEN = ['Ээж', 'Аав', 'Эмээ', 'Өвөө', 'Ах', 'Эгч', 'Бусад'];
export const PLAN_T = ['Жилийн', 'Улирлын', 'Сарын', 'Үйл ажиллагааны'];
export const PLAN_CHIP = { Жилийн: 'purple', Улирлын: 'cyan', Сарын: 'blue', 'Үйл ажиллагааны': 'green' };
export const STATUS = ['Ноорог', 'Хянагдаж буй', 'Батлагдсан', 'Буцаасан'];
export const STATUS_CHIP = { Ноорог: '', 'Хянагдаж буй': 'yellow', Батлагдсан: 'green', Буцаасан: 'red' };
export const HELBER = ['Бүлгээр', 'Багаар', 'Ганцаарчилсан'];
export const GROWTH_ST = ['Хэвийн', 'Тураалтай', 'Илүүдэл жинтэй', 'Намхан'];
export const ANGILAL = ['Тоглоом', 'Ном', 'Хэрэглэгдэхүүн', 'Тавилга'];
export const ALBAN = ['Бүлгийн багш', 'Туслах багш', 'Заах арга зүйч', 'Эрхлэгч'];
export const BULEG_TURUL = ['Бага', 'Дунд', 'Ахлах', 'Бэлтгэл'];
export const UYE_TURUL = ['Эхлэлийн', 'Явцын', 'Төгсгөлийн'];
export const ROLE_LABEL = { bagsh: 'Бүлгийн багш', arga_zuich: 'Заах арга зүйч', admin: 'Систем хариуцагч' };
