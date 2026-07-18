# MakeenCore

[![Status](https://img.shields.io/badge/Status-Production%20Ready-success)](https://github.com/7odaifa-ab/MakeenCore)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue)](https://www.typescriptlang.org/)
[![English](https://img.shields.io/badge/lang-English-green)](./README.md)
[![Zakhm](https://img.shields.io/badge/بواسطة-Zakhm-9cf)](https://zakhm.sa)

> محرك تخطيط قطعي مكتوب بلغة TypeScript لتوليد خطط حفظ ومراجعة القرآن الكريم.

يُنتج MakeenCore خططاً يومية توازن بين **الحفظ الجديد**، **المراجعة الصغرى** (المواد الحديثة)، و**المراجعة الكبرى** (مراجعة الدورة الكاملة). مصمم كمكتبة مستقلة للدمج في الأنظمة الخلفية (NestJS, Express, إلخ).

---

## البداية السريعة

### التثبيت

```bash
npm install @zakhm_sa/makeen-core
```

### مثال بسيط

```typescript
import { MakeenEngine } from '@zakhm_sa/makeen-core';

const result = MakeenEngine.generatePlan({
    name: "حفظ 30 يوماً",
    direction: "FORWARD",
    daysPerWeek: 5,
    tracks: [{
        type: "HIFZ",
        priority: 1,
        amountUnit: "LINES",
        amountValue: 10,
        start: { surah: 1, ayah: 1 },
        end: { surah: 2, ayah: 50 },
        config: {
            maxAyahPerDay: 10,
            surahCompletion: { enabled: true, maxOverflowLines: 2 }
        }
    }],
    startDate: "2026-04-01"
});

if (result.success) {
    console.log(`الخطة: ${result.data.totalDays} يوماً`);
    console.log(result.data.plan); // مصفوفة الأحداث اليومية
}
```

### نمط البناء (متقدم)

```typescript
import { PlanBuilder, WindowMode } from '@zakhm_sa/makeen-core';

const manager = new PlanBuilder()
    .setSchedule({
        startDate: "2026-04-01",
        daysPerWeek: 6,
        isReverse: false,
        maxAyahPerDay: 8
    })
    .planByDailyAmount({
        from: { surah: 2, ayah: 1 },
        to: { surah: 2, ayah: 286 },
        dailyLines: 12
    })
    .addMinorReview(5, WindowMode.GRADUAL)
    .stopWhenCompleted()
    .build();

const days = manager.generatePlan();
```

---

## القدرات الجوهرية

| الميزة | الوصف |
|--------|-------|
| **جدولة متعددة المسارات** | حفظ (جديد)، مراجعة صغرى (حديث)، مراجعة كبرى (دورة كاملة) |
| **فهرسة قرآنية دقيقة** | حسابات التجمع التراكمي (prefix-sum) لأي مدى |
| **قواعد تربوية** | سلامة الآيات، استمرارية السور، أيام التقوية |
| **سعة قابلة للتفسير** | إظهار الأسطر المطلوبة والفعلية وسبب التجاوز |
| **أوضاع التخطيط** | بالمدة ("أنهِ في X يوماً") أو بالمقدار اليومي ("Y سطر/يوم") |
| **تصميم مكتبة أولاً** | TypeScript نقية، بدون تبعيات، مخرجات قطعية |

---

## الإعدادات

### خيارات الجدولة

```typescript
.setSchedule({
    startDate: "2026-04-01",      // تاريخ ISO
    daysPerWeek: 5,                // 1-7
    isReverse: false,              // false = الفاتحة → الناس
    maxAyahPerDay: 10,             // الحد الأقصى (5-20)
    surahCompletion: {             // إكمال اختياري ضمن سماح واضح بالأسطر
        enabled: true,
        maxOverflowLines: 2,
        mayExceedMaxAyahs: false
    },
    strictSequentialMode: false,   // عدم الانتقال حتى 100% إكمال
    consolidationDayInterval: 6,   // كل N يوم = مراجعة فقط
    surahBoundedMinorReview: true,  // المراجعة الصغرى ضمن السورة الحالية (الافتراضي)
    minorReviewPagesCount: 5,      // عدد الصفحات للمراجعة (15 سطر = صفحة)
    includeHijri: false            // إرفاق تاريخ هجري (أم القرى) بكل يوم
})
```

| الخيار | النوع | الافتراضي | الوصف |
|--------|-------|-----------|-------|
| `startDate` | string | مطلوب | تاريخ بدء الخطة (YYYY-MM-DD) |
| `daysPerWeek` | number | مطلوب | أيام الدراسة في الأسبوع |
| `isReverse` | boolean | false | الاتجاه: true = الناس → الفاتحة |
| `maxAyahPerDay` | number | 10 | الحد الأقصى للحفظ اليومي |
| `surahCompletion` | object | معطل | إكمال السورة ضمن سماح يحدده المعلم بالأسطر |
| `strictSequentialMode` | boolean | false | عدم تغيير السورة حتى 100% إكمال |
| `consolidationDayInterval` | number | معطل | كل يوم دراسة مولّد رقم N يكون للمراجعة فقط |
| `surahBoundedMinorReview` | boolean | true | تصفير المراجعة الصغرى وحصرها في سورة الحفظ الحالية |
| `minorReviewPagesCount` | number | — | مقدار دقيق بصفحات ذات 15 سطرًا داخل السورة الحالية |
| `includeHijri` | boolean | false | إرفاق تاريخ هجري (أم القرى) بكل يوم (للعرض فقط) |

---

## أوضاع التخطيط

### 1. التخطيط بالمدة

تُقدم: `from`، `to`، `durationDays`، `daysPerWeek`  
المحرك يُنتج: `dailyLines`، `limitDays`

```typescript
const manager = new PlanBuilder()
    .setSchedule({
        startDate: '2026-02-01',
        daysPerWeek: 5,
        isReverse: true,
        maxAyahPerDay: 5
    })
    .planByDuration({
        from: { surah: 66, ayah: 1 },
        to: { surah: 58, ayah: 8 },
        durationDays: 30
    })
    .addMinorReview(3, WindowMode.GRADUAL)
    .addMajorReview(15 * 5, { surah: 114, ayah: 1 })
    .stopWhenCompleted()
    .build();
```

### 2. التخطيط بالمقدار اليومي

تُقدم: `from`، `to`، `dailyLines`، `daysPerWeek`  
المحرك يُنتج: أفق أيام الدراسة اعتمادًا على حدّي الأسطر والآيات وأيام التجميع

```typescript
const manager = new PlanBuilder()
    .setSchedule({
        startDate: '2026-02-01',
        daysPerWeek: 6,
        isReverse: true,
        maxAyahPerDay: 12
    })
    .planByDailyAmount({
        from: { surah: 66, ayah: 1 },
        to: { surah: 55, ayah: 78 },
        dailyLines: 14
    })
    .addMinorReview(7, WindowMode.GRADUAL)
    .addMajorReview(15 * 10, { surah: 114, ayah: 1 })
    .stopWhenCompleted()
    .build();
```

---

## ميزات متقدمة

### أفق المراجعة الكبرى (نافذة منزلقة)

افتراضياً تدور المراجعة الكبرى من نقطة بداية ثابتة حتى "جدار" المحفوظ ثم تعود. في الخطط الطويلة قد ترغب أن تبقى على **آخر N سطر محفوظة** بدل أن تعيد من البداية دائماً. مرّر `horizonLines` لتحديد أقصى مسافة يرجع إليها خلف جبهة الحفظ — ومع تقدّم الحفظ تنزلق النافذة معه.

```typescript
new PlanBuilder()
    .setSchedule({ startDate: '2026-04-01', daysPerWeek: 6 })
    .addHifz(15, { surah: 1, ayah: 1 })
    // المراجعة الكبرى لا ترجع أبعد من 150 سطراً (~10 صفحات) خلف الجبهة:
    .addMajorReview(30, { surah: 1, ayah: 1 }, undefined, { horizonLines: 150 })
    .build();
```

وعبر واجهة الـ DTO، عيّنه في `config` لمسار المراجعة الكبرى:

```typescript
{
  type: "MAJOR_REVIEW", priority: 3, amountUnit: "LINES", amountValue: 30,
  config: { horizonLines: 150 }
}
```

احذف `horizonLines` للعودة إلى الدورة الكلاسيكية بنقطة بداية ثابتة (متوافق رجعياً بالكامل).

### اللقطة والاستئناف (الطالب المتقطع)

كثير من الطلاب يتوقفون أسابيع ثم يعودون. بدل إعادة المحاكاة من تاريخ البداية الأصلي، صدّر حالة المسارات الحيّة، واحفظها في مخزنك الخاص، ثم استأنف من النقطة الحقيقية لاحقاً. تحمل اللقطة **التاريخ الكامل (history)** — وهو ضروري لبقاء نافذة المراجعة الصغرى صحيحة.

```typescript
// ...بعد توليد بعض الأيام:
const snapshot = manager.exportSnapshot();   // قابلة للتسلسل — احفظها كـ JSON أينما شئت

// لاحقاً عند عودة الطالب — أعد بناء نفس الخطة بتاريخ الاستئناف الحقيقي:
const resumed = new PlanBuilder()
    .setSchedule({ startDate: '2026-06-01', daysPerWeek: 6 }) // تاريخ الاستئناف الفعلي
    .addHifz(15, { surah: 1, ayah: 1 })
    .addMinorReview(3)
    .build();
resumed.importSnapshot(snapshot);            // استعادة المواضع + التاريخ
const nextDays = resumed.generatePlan();     // يُكمل من حيث توقّف الطالب
```

### التقويم الهجري (اختياري، بلا اعتماديات)

أرفِق تاريخاً هجرياً (أم القرى) بكل يوم مُولَّد — مفيد لخطط ختمة رمضان. هو للعرض فقط (الجدولة تبقى ميلادية) ولا يضيف أي اعتماديات (يستخدم `Intl` المدمج).

```typescript
new PlanBuilder()
    .setSchedule({ startDate: '2026-02-18', daysPerWeek: 7, includeHijri: true })
    .addHifz(15, { surah: 1, ayah: 1 })
    .build()
    .generatePlan(); // كل PlanDay أصبح لديه hijriDate، مثل "١ رمضان ١٤٤٧ هـ"
```

أو عبر واجهة الـ DTO، مرّر `includeHijri: true` في الطلب؛ عندها يحمل كل `PlanDayDTO` حقل `hijriDate`. كما تُصدَّر الأداة المستقلة `HijriDateUtils` (`toHijri`، `toHijriISO`).

---

## المخرجات

يُعيد المحرك إدخالات الخطة اليومية مع تصنيفات الأحداث:

| نوع الحدث | الوصف |
|-----------|-------|
| `MEMORIZATION` | المادة الجديدة للحفظ |
| `REVIEW` | أحداث المراجعة المجدولة |

قد تخلو أيام الإجازة أو التجميع من حدث حفظ. وتعرض أحداث الحفظ أيضًا `requestedLines` و`overflowLines` و`overflowReason`.

```typescript
if (result.success) {
    const planDays = result.data.plan;
    // احفظ في قاعدة البيانات (Prisma, إلخ)
}
```

---

## التوثيق

| المستند | الغرض |
|---------|-------|
| [عقد الاستخدام للذكاء الاصطناعي](llms.txt) | مصدر حقيقة مختصر للنماذج والوكلاء |
| [دليل المستخدم](USER_GUIDE.md) | السلوك الحالي للمسارات والأمثلة |
| [عقود الربط البرمجي](doc/planning-engine/planning-engine-api-contracts.md) | عقود التكامل مع TypeScript |
| [دليل القواعد التربوية](doc/planning-engine/pedagogical-rules-guide.md) | سلوك القواعد والإعدادات |
| [أوضاع التخطيط والمراحل](doc/planning-engine/planning-modes-and-phases.md) | مراحل التنفيذ وسيناريوهات QA والمعالم والقيود الحالية |
| [حالة المشروع والاختبارات](doc/planning-engine/project-status-and-qa.ar.md) | ما هو منفذ وداخلي وانتقالي ومختبر |
| [تدقيق التوثيق](doc/planning-engine/documentation-audit.md) | تصنيف مدعوم بالأدلة للتفاصيل العامة والداخلية والمعلنة والقديمة |
| [وثيقة المتطلبات](doc/planning-engine/planning-engine-prd.md) | نية المنتج التاريخية؛ يوضح التنبيه أنها ليست عقد API حاليًا |

---

## الاختبارات

```bash
npm install
npm test
```

**إجمالي الاختبارات الآلية:** 73/73 ناجحة، إضافة إلى 10/10 سيناريوهات تحقق.

---

## ملاحظات لمستخدمي المكتبة

- مشغلات السيناريوهات وبرامج Excel في `/src` للاختبار الداخلي فقط
- للإنتاج: استخدم `planDays` وقم بالحفظ في تطبيقك المضيف
- عقود الاستخدام التقنية المنشورة موجودة تحت `/doc/planning-engine`

---

<div align="center" dir="rtl">

## صُنع بـ 💜 بواسطة Zakhm

<table dir="rtl">
<tr>
<td width="100" align="center">
<img src="https://github.com/user-attachments/assets/9223eb9d-920c-4ae6-8fb5-8ab3883ee105" alt="شعار زخم" width="80" height="80" style="border-radius: 12px;">
</td>
<td align="right">

**[Zakhm](https://zakhm.sa)** — نُمكّن التعليم الإسلامي من خلال التقنية.

نؤمن بأن الأدوات الممتازة يجب أن تكون متاحة للجميع. استخدم MakeenCore بحرية، وفكّر بالمساهمة لمساعدة المجتمع على النمو.

📄 مرخص بموجب [رخصة Zakhm Attribution (ZAL) 1.0](./LICENSE)

</td>
</tr>
</table>

</div>
