/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { memo } from 'react';
import { ChevronRight, Scale } from 'lucide-react';
import { soundManager } from '../../utils/sounds';

interface TermsAndConditionsModalProps {
  onClose: () => void;
}

/**
 * Fullscreen terms & conditions view (redesigned from centered modal).
 *
 * Design decisions:
 * - Fullscreen (not centered modal) to match Subscribers/Reports/RechargeHistory
 *   layout pattern — visual unification across garage tabs.
 * - The "I agree" button is removed. Article 7 of the terms already states
 *   that using the app = explicit irrevocable agreement, so a separate
 *   approval button is legally redundant and actually weakens the position
 *   (implies the user MUST click agree). The header back button is the only
 *   way out — same as every other fullscreen view.
 * - Legal text is unchanged — already in the owner's favor (full liability
 *   waiver, indemnification, Egyptian jurisdiction).
 */
export const TermsAndConditionsModal: React.FC<TermsAndConditionsModalProps> = memo(({ onClose }) => {
  const handleClose = () => {
    try {
      soundManager.play('setting');
    } catch {
      // Ignore audio errors
    }
    onClose();
  };

  return (
    <div
      className="fixed inset-0 bg-[#faf9f6] dark:bg-slate-950 z-[100] flex flex-col pt-safe px-safe overflow-hidden transition-colors"
      dir="rtl"
    >
      {/* Header — matches Subscribers/RechargeHistory pattern */}
      <header className="relative bg-[#faf9f6] dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-6 py-3 z-40 w-full shrink-0">
        <div className="max-w-4xl mx-auto flex items-center gap-4 w-full">
          <button
            type="button"
            onClick={handleClose}
            className="w-10 h-10 bg-slate-900 dark:bg-amber-400 text-amber-400 dark:text-slate-950 rounded-xl flex items-center justify-center hover:bg-slate-800 dark:hover:bg-amber-500 transition-colors shadow-sm outline-none shrink-0"
            aria-label="الرجوع"
            title="رجوع"
          >
            <ChevronRight className="w-5.5 h-5.5 text-amber-400 dark:text-slate-950 stroke-[3.5]" />
          </button>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/10 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
              <Scale className="w-5 h-5" />
            </div>
            <div className="flex flex-col">
              <h1 className="text-base font-black text-slate-900 dark:text-slate-100 tracking-tight leading-none">
                الشروط والأحكام
              </h1>
              <p className="text-[10px] font-bold text-slate-400 mt-0.5">
                إخلاء المسؤولية القانونية
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* Scrollable Content */}
      <main className="flex-1 overflow-y-auto custom-scrollbar-slate stable-scrollbar">
        <div className="max-w-2xl mx-auto w-full p-4 sm:p-6 space-y-5 text-slate-700 dark:text-slate-300 text-xs sm:text-sm leading-relaxed select-text pb-10">

          {/* Legal Notice Box */}
          <div className="p-3.5 sm:p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-900 dark:text-amber-200 flex items-start gap-3">
            <p className="text-[11px] sm:text-xs opacity-90 leading-normal">
              باستخدامك أو تسجيلك للدخول في هذه المنظومة الإلكترونية، فإنك تقر وتوافق دون قيد أو شرط على كافة البنود والالتزامات وإخلاء المسؤولية القانونية الواردة أدناه، وتعد هذه الوثيقة عقداً قانونياً ملزماً ونهائياً لك وللمنشأة التابع لها.
            </p>
          </div>

          {/* Article 1 */}
          <section className="space-y-2">
            <div className="flex items-center gap-2 text-slate-900 dark:text-white font-black text-sm">
              <span className="w-6 h-6 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-xs font-mono text-emerald-600 dark:text-emerald-400">١</span>
              <h4>المادة الأولى: الطبيعة القانونية للمنظومة</h4>
            </div>
            <p className="text-slate-600 dark:text-slate-400 pr-8">
              تُعد هذه المنظومة تطبيقاً تقنياً وأداة برمجية وسيطة مخصصة حصراً للمساعدة في التنظيم الإداري والتشغيلي الداخلي لمواقف السيارات والجراجات. ولا تُعد المنظومة أو مالكها أو مطوروها أو إدارتها بأي شكل من الأشكال:
            </p>
            <ul className="list-disc list-inside space-y-1 text-slate-600 dark:text-slate-400 pr-10 text-[11px] sm:text-xs">
              <li>طرفاً في أي عقد إيداع أو حراسة مبرم بين إدارة الجراج ومالكي المركبات أو المترددين عليه.</li>
              <li>حارساً قضائياً أو اتفاقياً أو وديعاً لأي مركبة أو متعلقات شخصية.</li>
              <li>شركة تأمين أو جهة حراسة أمنية أو ضامناً لأي تعويضات.</li>
            </ul>
            <p className="text-slate-600 dark:text-slate-400 pr-8 text-[11px] sm:text-xs">
              وينحصر دور المنظومة في تزويد المشتركين ببرمجية سحابية لإدارة وتدوين السجلات فقط دون أي تدخل في إدارة الجراج الواقعية.
            </p>
          </section>

          {/* Article 2 */}
          <section className="space-y-2">
            <div className="flex items-center gap-2 text-slate-900 dark:text-white font-black text-sm">
              <span className="w-6 h-6 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-xs font-mono text-emerald-600 dark:text-emerald-400">٢</span>
              <h4>المادة الثانية: إخلاء المسؤولية التام والنهائي عن المركبات ومحتوياتها</h4>
            </div>
            <p className="text-slate-600 dark:text-slate-400 pr-8">
              تنعدم وتنتفي أدنى مسؤولية قانونية، مدنية أو جنائية أو تعويضية أو تضامنية، عن إدارة المنظومة ومالكها ومطوريها في الحالات الآتية على سبيل الحصر أو الشمول:
            </p>
            <ul className="list-disc list-inside space-y-1 text-slate-600 dark:text-slate-400 pr-10 text-[11px] sm:text-xs">
              <li>سرقة أي مركبة أو محاولة سرقتها، أو تعرضها للتلف أو الكسر أو الحريق أو الخدش أو الحوادث المرورية داخل الجراج أو على مداخله ومخارجه.</li>
              <li>فقدان أو سرقة أو تلف أي مبالغ مالية أو متعلقات شخصية أو أجهزة أو بضائع أو وثائق تترك داخل أي مركبة.</li>
              <li>أي أضرار مادية أو بشرية أو إصابات جسدية ناتجة عن الكوارث الطبيعية، القوة القاهرة، الحوادث العرضية، أو الانهيارات والحرائق والتماس الكهربائي في منشأة الجراج.</li>
            </ul>
            <p className="text-slate-600 dark:text-slate-400 pr-8 text-[11px] sm:text-xs font-bold text-slate-700 dark:text-slate-300">
              تقع المسؤولية المدنية والجنائية الكاملة عن أمان وسلامة وحراسة المركبات على عاتق مالك/مشغل الجراج الفعلي والقائمين عليه بموجب القوانين العامة المعمول بها.
            </p>
          </section>

          {/* Article 3 */}
          <section className="space-y-2">
            <div className="flex items-center gap-2 text-slate-900 dark:text-white font-black text-sm">
              <span className="w-6 h-6 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-xs font-mono text-emerald-600 dark:text-emerald-400">٣</span>
              <h4>المادة الثالثة: سلوك المستخدمين، صحة البيانات، والمخالفات القانونية</h4>
            </div>
            <ul className="list-disc list-inside space-y-1 text-slate-600 dark:text-slate-400 pr-8 text-[11px] sm:text-xs">
              <li>يقر المستخدم (سواء كان مالك جراج، مشرفاً، موظفاً، مندوباً، أو أي طرف مستخدم للمنظومة) بأنه المسؤول شخصياً وحصرياً عن صحة ومشروعية كافة البيانات المدخلة، بما في ذلك أرقام اللوحات المعدنية، أسماء المشتركين، أرقام الهواتف، وأوقات الدخول والخروج.</li>
              <li>يُحظر حظراً باتاً استخدام المنظومة في أي غرض غير مشروع، بما في ذلك إيواء أو تسهيل حركة مركبات مسروقة، أو مركبات ذات لوحات مزورة أو مطموسة، أو تخزين مواد مجرمة قانوناً.</li>
              <li>في حال ارتكاب أي مستخدم لأي مخالفة قانونية أو جريمة أو تدليس، تقع المسؤولية القانونية الجنائية والمدنية كاملة على عاتق مرتكبها ومسؤول الجراج، وتتحصن المنظومة ومالكها بحصانة تامة من أي تبعة أو تضامن أو مشاركة.</li>
            </ul>
          </section>

          {/* Article 4 */}
          <section className="space-y-2">
            <div className="flex items-center gap-2 text-slate-900 dark:text-white font-black text-sm">
              <span className="w-6 h-6 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-xs font-mono text-emerald-600 dark:text-emerald-400">٤</span>
              <h4>المادة الرابعة: التعهد بالتعويض والحماية القضائية الشاملة للمنظومة (Indemnification)</h4>
            </div>
            <p className="text-slate-600 dark:text-slate-400 pr-8 text-[11px] sm:text-xs">
              يتعهد كل مستخدم للجراج أو المنظومة بالدفاع عن مالك المنظومة ومطوريها وإدارتها وتعويضهم تعويضاً شاملاً عن أي دعاوى قضائية، بلاغات، مطالبات، خسائر، غرامات، أتعاب محاماة، أو نفقات قانونية قد تنشأ عن:
            </p>
            <ul className="list-disc list-inside space-y-1 text-slate-600 dark:text-slate-400 pr-10 text-[11px] sm:text-xs">
              <li>استخدامه غير المشروع أو الخاطئ للمنظومة أو بياناتها.</li>
              <li>أي نزاع مالي أو قضائي ينشأ بين إدارة الجراج ورواده أو المترددين عليه أو أي جهة حكومية أو خاصة.</li>
              <li>أي مخالفة لهذه الشروط والأحكام أو للقوانين واللوائح السارية.</li>
            </ul>
          </section>

          {/* Article 5 */}
          <section className="space-y-2">
            <div className="flex items-center gap-2 text-slate-900 dark:text-white font-black text-sm">
              <span className="w-6 h-6 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-xs font-mono text-emerald-600 dark:text-emerald-400">٥</span>
              <h4>المادة الخامسة: المعاملات المالية، الرسوم، والاشتراكات</h4>
            </div>
            <ul className="list-disc list-inside space-y-1 text-slate-600 dark:text-slate-400 pr-8 text-[11px] sm:text-xs">
              <li>المنظومة لا تتقاضى أو تحصّل أو تحتفظ بأي رسوم انتظار يدفعها قائدو المركبات للجراجات؛ وكل ما يتعلق بالتعريفة المالية ورسوم الانتظار والاشتراكات الشهرية ونزاعات التذاكر المفقودة هو علاقة مالية مباشرة ومستقلة تماماً بين قائد المركبة وإدارة الجراج دون أدنى تدخل أو التزام من جانب المنظومة.</li>
              <li>باقات الاشتراك في المنظومة هي مقابل استغلال البرمجية السحابية فقط، وتخضع لسياسات الشحن والحدود التشغيلية المعلنة دون أي حق في المطالبة بأرباح أو تعويضات تشغيلية في حال تعطل أو إغلاق الجراج.</li>
            </ul>
          </section>

          {/* Article 6 */}
          <section className="space-y-2">
            <div className="flex items-center gap-2 text-slate-900 dark:text-white font-black text-sm">
              <span className="w-6 h-6 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-xs font-mono text-emerald-600 dark:text-emerald-400">٦</span>
              <h4>المادة السادسة: استمرارية الخدمة والأعطال التقنية</h4>
            </div>
            <p className="text-slate-600 dark:text-slate-400 pr-8 text-[11px] sm:text-xs">
              تُقدم المنظومة "كما هي" (AS IS) دون أي ضمانات ضمنية أو صريحة لاستمرار الخدمة دون انقطاع، ولا تتحمل إدارة المنظومة أي مسؤولية عن أي أضرار مباشرة أو غير مباشرة ناتجة عن انقطاع شبكة الإنترنت، أعمال الصيانة الدورية أو الطارئة للخوادم، أو تلف أجهزة المستخدمين.
            </p>
          </section>

          {/* Article 7 */}
          <section className="space-y-2">
            <div className="flex items-center gap-2 text-slate-900 dark:text-white font-black text-sm">
              <span className="w-6 h-6 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-xs font-mono text-emerald-600 dark:text-emerald-400">٧</span>
              <h4>المادة السابعة: الإقرار الصريح، النفاذ، والاختصاص القضائي</h4>
            </div>
            <p className="text-slate-600 dark:text-slate-400 pr-8 text-[11px] sm:text-xs">
              يُعد مجرد تسجيل الدخول أو استخدام هذه المنظومة أو النقر على أي من خدماتها إقراراً صريحاً ونهائياً لا رجعة فيه بقراءة هذه الشروط وفهمها والموافقة التامة عليها والالتزام ببنودها. وفي حال نشوء أي نزاع حول تفسير هذه الشروط، ينعقد الاختصاص القضائي الحصري للمحاكم المختصة بجمهورية مصر العربية وفقاً للقوانين المصرية السارية.
            </p>
          </section>

          {/* Branding */}
          <div className="pt-6 flex items-center justify-center gap-3 select-none text-slate-400 dark:text-slate-500 font-bold text-[10px] md:text-xs tracking-wider uppercase">
            <div className="h-[1px] w-8 bg-gradient-to-l from-transparent to-slate-200 dark:to-slate-800" />
            <span>طُوِّر بواسطة أرق لتطوير البرمجيات</span>
            <div className="h-[1px] w-8 bg-gradient-to-r from-transparent to-slate-200 dark:to-slate-800" />
          </div>
        </div>
      </main>
    </div>
  );
});
