import { dailyReviewTemplate } from './dailyReview';
import { weeklyReviewTemplate } from './weeklyReview';
import { monthlyReviewTemplate } from './monthlyReview';
import { annualReviewTemplate } from './annualReview';
import { emotionalAwarenessTemplate } from './emotionalAwareness';
import { caseStudyTemplate } from './caseStudy';
import { decisionLogTemplate } from './decisionLog';
import { investmentBuyTemplate, investmentSellTemplate, investmentPositionTemplate } from './investmentChecklist';
import type { FormTemplate } from '@/types';

export { dailyReviewTemplate, weeklyReviewTemplate, monthlyReviewTemplate, annualReviewTemplate, emotionalAwarenessTemplate, caseStudyTemplate, decisionLogTemplate, investmentBuyTemplate, investmentSellTemplate, investmentPositionTemplate };

export const templates: FormTemplate[] = [
  dailyReviewTemplate,
  weeklyReviewTemplate,
  monthlyReviewTemplate,
  annualReviewTemplate,
  emotionalAwarenessTemplate,
  caseStudyTemplate,
  decisionLogTemplate,
  investmentBuyTemplate,
  investmentSellTemplate,
  investmentPositionTemplate,
];
