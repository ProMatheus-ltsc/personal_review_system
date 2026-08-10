/**
 * 投资检查清单模板 — 三角色独立模板
 *
 * 投资全生命周期拆分为三种独立模板（templateId 各不相同）：
 * - investment_checklist_buy：买入决策 + 冷静期后买入复盘
 * - investment_checklist_sell：卖出决策 + 冷静期后卖出复盘
 * - investment_checklist_position：持有中定期检查 + 清仓后投资周期复盘
 *
 * 共享设计：三个模板共用同一套 sections 定义（字段配置），
 * 各自只包含所需的 sections 子集和独立的 phases 配置。
 */
import type { FormTemplate, FormSection } from '@/types';

/**
 * 数字字段校验：金额/价格/数量等仅允许非负数字（可带小数），
 * 拦截字母、符号、空格与负数；min 0 保证非负。
 */
const NON_NEGATIVE_NUM_RE = /^\d+(\.\d+)?$/;
const NON_NEGATIVE_NUM_VALIDATION = {
  pattern: NON_NEGATIVE_NUM_RE,
  patternMessage: '请输入有效的非负数字（如 12.5）',
  min: 0,
};

// ============================================================
// 共享 Sections 定义
// ============================================================

const sectionBeforeBuying: FormSection = {
  id: 'before_buying',
  title: '买入前',
  description: '买入决策前的系统化检查',
  fields: [
    { id: 'buy_understand_business', label: '我了解这家公司的商业模式吗？', type: 'checkbox', emphasis: true, priority: 'required' },
    { id: 'buy_safety_margin', label: '我有安全边际吗？（价格vs价值）', type: 'checkbox', emphasis: true, priority: 'required', hint: '好的投资需要足够的安全边际来应对判断错误' },
    { id: 'buy_position_size', label: '这笔投资占我总资产的比例合适吗？', type: 'checkbox', emphasis: true, priority: 'required', hint: '单只个股通常不超过总资产20%' },
    { id: 'buy_hold_duration', label: '我能持有3-5年不动吗？', type: 'checkbox', emphasis: true, priority: 'required' },
    { id: 'buy_panic_test', label: '如果价格下跌50%，我会恐慌卖出吗？', type: 'checkbox', emphasis: true, priority: 'required', hint: '如果答案是\'会\'，说明仓位可能过重' },
    { id: 'buy_company_name', label: '投资标的（股票代码）', type: 'text', priority: 'required', autocomplete: true,
      placeholder: '如 AAPL / 00700 / 600519',
      hint: '输入股票代码：仅允许大写英文字母和数字（如 AAPL、00700、600519）',
      validation: { pattern: /^[A-Z0-9]+$/, patternMessage: '股票代码仅支持大写字母和数字' } },
    { id: 'buy_date', label: '买入日期', type: 'date', priority: 'required', defaultValue: 'auto_today' },
    { id: 'buy_currency', label: '交易币种', type: 'radio', priority: 'required', options: [
        { value: 'USD', label: '美元(USD)' }, { value: 'CNY', label: '人民币(CNY)' },
      ], hint: '选择该笔交易使用的货币，后续价格字段将据此标注' },
    { id: 'buy_price', label: '买入价格', type: 'text', priority: 'required', placeholder: '输入买入价格', hintDependsOn: 'buy_currency', conditionalPlaceholders: { 'USD': '例：180.50 美元', 'CNY': '例：25.80 人民币' }, validation: NON_NEGATIVE_NUM_VALIDATION },
    { id: 'buy_quantity', label: '买入数量/金额', type: 'text', priority: 'required', placeholder: '例：100股', hint: '剩余持仓的计算会用到这个数量，请填写具体股数（如 100），不要填金额', hintDependsOn: 'buy_currency', conditionalPlaceholders: { 'USD': '例：100股', 'CNY': '例：100股' }, validation: NON_NEGATIVE_NUM_VALIDATION },
    { id: 'buy_thesis', label: '核心买入逻辑', type: 'textarea', priority: 'required', hint: '写下买入的1-3个核心理由，卖出时回头看', placeholder: '为什么买？这是将来复盘最重要的参考' },
    { id: 'buy_stop_loss_price', label: '止损价格', type: 'text', priority: 'required', hint: '在什么价格你愿意承认错误并退出？', hintDependsOn: 'buy_currency', conditionalPlaceholders: { 'USD': '输入美元止损价', 'CNY': '输入人民币止损价' }, validation: NON_NEGATIVE_NUM_VALIDATION },
    { id: 'buy_target_price_num', label: '目标价格', type: 'text', priority: 'required', hint: '基于你的估值逻辑', hintDependsOn: 'buy_currency', conditionalPlaceholders: { 'USD': '输入美元目标价', 'CNY': '输入人民币目标价' }, validation: NON_NEGATIVE_NUM_VALIDATION },
    { id: 'buy_risk_reward', label: '风险回报比', type: 'text', priority: 'recommended', hint: '(目标价-买入价)÷(买入价-止损价)，建议≥2:1', computed: {
        dependsOn: ['buy_price', 'buy_stop_loss_price', 'buy_target_price_num'],
        formula: (values) => {
          const buyPrice = parseFloat(values['buy_price'] as string);
          const stopLoss = parseFloat(values['buy_stop_loss_price'] as string);
          const target = parseFloat(values['buy_target_price_num'] as string);
          if (isNaN(buyPrice) || isNaN(stopLoss) || isNaN(target)) return '';
          const denominator = buyPrice - stopLoss;
          if (denominator === 0) return '__ERROR__';
          const ratio = (target - buyPrice) / denominator;
          return ratio.toFixed(2) + ' : 1';
        },
        placeholder: '自动计算（需填写买入价、止损价和目标价）',
        errorText: '无法计算（买入价与止损价相同）',
      } },
    { id: 'buy_position_percent', label: '仓位占比(%)', type: 'number', priority: 'recommended', defaultValue: 10, validation: { min: 0, max: 100 } },
    { id: 'buy_emotion_state', label: '买入时情绪', type: 'radio', priority: 'required', options: [
        { value: '1-恐惧', label: '1-恐惧' }, { value: '2-焦虑', label: '2-焦虑' }, { value: '3-平静', label: '3-平静' }, { value: '4-乐观', label: '4-乐观' }, { value: '5-兴奋', label: '5-兴奋' },
      ], hint: '恐惧可能是好时机，兴奋需警惕' },
    { id: 'buy_confidence', label: '信心水平', type: 'radio', priority: 'required', options: [
        { value: '1-很低', label: '1-很低' }, { value: '2-偏低', label: '2-偏低' }, { value: '3-中等', label: '3-中等' }, { value: '4-偏高', label: '4-偏高' }, { value: '5-很高', label: '5-很高' },
      ], hint: '事后验证你的信心是否校准准确' },
    { id: 'buy_strategy_tag', label: '投资策略', type: 'radio', priority: 'recommended', options: [
        { value: '价值投资', label: '价值投资' }, { value: '趋势跟踪', label: '趋势跟踪' }, { value: '事件驱动', label: '事件驱动' }, { value: '技术分析', label: '技术分析' }, { value: '指数定投', label: '指数定投' }, { value: '其他', label: '其他' },
      ] },
    { id: 'buy_strategy_other', label: '其他策略说明', type: 'text', priority: 'optional', condition: { dependsOn: 'buy_strategy_tag', showWhen: '其他' } },
    { id: 'buy_catalyst', label: '预期催化剂', type: 'textarea', priority: 'optional', hint: '什么因素可能推动价格向你预期方向移动？' },
    { id: 'buy_risk_factors', label: '主要风险因素', type: 'textarea', priority: 'optional', hint: '可能证明你错误的因素有哪些？' },
    { id: 'buy_timeframe', label: '预期持有周期', type: 'radio', priority: 'recommended', options: [
        { value: '1周内', label: '1周内' }, { value: '1-4周', label: '1-4周' }, { value: '1-3个月', label: '1-3个月' }, { value: '3-12个月', label: '3-12个月' }, { value: '1年以上', label: '1年以上' }, { value: '3年以上', label: '3年以上' },
      ] },
  ],
};

const sectionWhileHolding: FormSection = {
  id: 'while_holding',
  title: '持有中',
  description: '持有期间的定期检查',
  repeatable: true,
  repeatLabel: '+ 添加一次持有检查',
  fields: [
    { id: 'hold_check_fundamentals', label: '已确认：公司基本面没有恶化', type: 'checkbox', emphasis: true, priority: 'required', hint: '如果无法勾选，需要认真考虑是否继续持有' },
    { id: 'hold_check_thesis', label: '已确认：我的买入逻辑仍然成立', type: 'checkbox', emphasis: true, priority: 'required', hint: '重读你买入时写的逻辑，是否还说得通？' },
    { id: 'hold_check_no_better', label: '已确认：没有明显更好的投资机会', type: 'checkbox', emphasis: true, priority: 'required', hint: '如果有更好的机会，是否值得换仓？' },
    { id: 'hold_check_date', label: '检查日期', type: 'date', priority: 'required', defaultValue: 'auto_today' },
    { id: 'hold_current_price', label: '当前价格', type: 'text', priority: 'recommended',
      placeholder: '输入当前市场价格',
      hint: '填写后自动计算浮盈/浮亏和止损距离',
      validation: NON_NEGATIVE_NUM_VALIDATION },
    { id: 'hold_unrealized_pnl', label: '当前浮盈/浮亏(%)', type: 'text', priority: 'recommended', computed: {
        dependsOn: ['hold_current_price'],
        externalDeps: ['buy_price'],
        formula: (values) => {
          const currentPrice = parseFloat(values['hold_current_price'] as string);
          const buyPrice = parseFloat(values['buy_price'] as string);
          if (isNaN(currentPrice) || isNaN(buyPrice) || buyPrice === 0) return '';
          const pnl = ((currentPrice - buyPrice) / buyPrice) * 100;
          return pnl.toFixed(2);
        },
        placeholder: '自动计算（需填写当前价格）',
      } },
    { id: 'hold_stop_loss_hit', label: '止损价触及状态', type: 'text', priority: 'recommended', computed: {
        dependsOn: ['hold_current_price'],
        externalDeps: ['buy_stop_loss_price'],
        formula: (values) => {
          const currentPrice = parseFloat(values['hold_current_price'] as string);
          const stopLoss = parseFloat(values['buy_stop_loss_price'] as string);
          if (isNaN(currentPrice) || isNaN(stopLoss) || stopLoss === 0) return '';
          if (currentPrice <= stopLoss) return '⚠️ 已触及止损价';
          const distance = ((currentPrice - stopLoss) / stopLoss) * 100;
          if (distance <= 5) return `⚡ 接近止损价（距离 ${distance.toFixed(1)}%）`;
          return `✅ 未触及（距离止损 ${distance.toFixed(1)}%）`;
        },
        placeholder: '自动计算（需填写当前价格）',
      } },
    { id: 'hold_stop_loss_action', label: '触及止损后的行动', type: 'textarea', priority: 'optional', hint: '如果已触及或接近止损价，你打算怎么做？' },
    { id: 'hold_fundamentals_detail', label: '基本面变化详情', type: 'radio', priority: 'recommended', options: [
        { value: '无变化', label: '无变化' }, { value: '有正面变化', label: '有正面变化' }, { value: '有负面变化', label: '有负面变化' },
      ] },
    { id: 'hold_fundamentals_note', label: '变化说明', type: 'textarea', priority: 'recommended', condition: { dependsOn: 'hold_fundamentals_detail', showWhen: ['有正面变化', '有负面变化'] } },
    { id: 'hold_current_emotion', label: '当前情绪', type: 'radio', priority: 'recommended', options: [
        { value: '1-恐惧', label: '1-恐惧' }, { value: '2-焦虑', label: '2-焦虑' }, { value: '3-平静', label: '3-平静' }, { value: '4-乐观', label: '4-乐观' }, { value: '5-兴奋', label: '5-兴奋' },
      ], hint: '对比买入时的情绪' },
    { id: 'hold_current_confidence', label: '当前信心', type: 'radio', priority: 'recommended', options: [
        { value: '1-很低', label: '1-很低' }, { value: '2-偏低', label: '2-偏低' }, { value: '3-中等', label: '3-中等' }, { value: '4-偏高', label: '4-偏高' }, { value: '5-很高', label: '5-很高' },
      ] },
    { id: 'hold_notes', label: '持有期间备注', type: 'textarea', priority: 'optional', hint: '任何值得记录的观察' },
  ],
};

const sectionWhenSelling: FormSection = {
  id: 'when_selling',
  title: '卖出时',
  description: '卖出决策时的检查',
  fields: [
    { id: 'sell_check_reason', label: '已确认：卖出是因为逻辑改变，而非情绪驱动', type: 'checkbox', emphasis: true, priority: 'required', hint: '区分理性卖出和恐慌/贪婪卖出' },
    { id: 'sell_check_rebuy', label: '已确认：如果今天没有持仓，我不会买入', type: 'checkbox', emphasis: true, priority: 'required', hint: '这是检验持有逻辑最有力的问题' },
    { id: 'sell_date', label: '卖出日期', type: 'date', priority: 'required', defaultValue: 'auto_today' },
    { id: 'sell_exit_price', label: '卖出价格', type: 'text', priority: 'required', placeholder: '输入卖出价格', hintDependsOn: 'buy_currency', conditionalPlaceholders: { 'USD': '例：220.00 美元', 'CNY': '例：30.50 人民币' }, validation: NON_NEGATIVE_NUM_VALIDATION },
    { id: 'sell_quantity', label: '卖出数量/份额', type: 'text', priority: 'recommended', placeholder: '例：60股',
      hint: '部分卖出时填写本笔卖出数量，系统会自动汇总剩余持仓并计算平均卖出价', validation: NON_NEGATIVE_NUM_VALIDATION },
    { id: 'sell_reason', label: '卖出原因', type: 'radio', priority: 'required', options: [
        { value: '到达目标价', label: '到达目标价' }, { value: '触发止损', label: '触发止损' }, { value: '买入逻辑改变', label: '买入逻辑改变' },
        { value: '基本面恶化', label: '基本面恶化' }, { value: '找到更好机会', label: '找到更好机会' }, { value: '情绪驱动（恐慌/贪婪）', label: '情绪驱动（恐慌/贪婪）' },
        { value: '需要用钱', label: '需要用钱' }, { value: '其他', label: '其他' },
      ] },
    { id: 'sell_reason_other', label: '其他原因说明', type: 'textarea', priority: 'recommended', condition: { dependsOn: 'sell_reason', showWhen: '其他' } },
    { id: 'sell_pnl_percent', label: '盈亏百分比(%)', type: 'number', priority: 'required', computed: {
        dependsOn: ['buy_price', 'sell_exit_price'],
        formula: (values) => {
          const buyPrice = parseFloat(values['buy_price'] as string);
          const sellPrice = parseFloat(values['sell_exit_price'] as string);
          if (isNaN(buyPrice) || isNaN(sellPrice) || buyPrice === 0) return '';
          const pnl = ((sellPrice - buyPrice) / buyPrice) * 100;
          return pnl.toFixed(2);
        },
        placeholder: '自动计算（需填写买入价格和卖出价格）',
        errorText: '无法计算（买入价格无效）',
      } },
    { id: 'sell_hold_days', label: '持有天数', type: 'number', priority: 'recommended', computed: {
        dependsOn: ['buy_date', 'sell_date'],
        formula: (values) => {
          const buyDate = values['buy_date'] as string;
          const sellDate = values['sell_date'] as string;
          if (!buyDate || !sellDate) return '';
          const start = new Date(buyDate);
          const end = new Date(sellDate);
          if (isNaN(start.getTime()) || isNaN(end.getTime())) return '';
          const days = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
          return String(days);
        },
        placeholder: '自动计算（需填写买入日期和卖出日期）',
      } },
    { id: 'sell_emotion_state', label: '卖出时情绪', type: 'radio', priority: 'recommended', options: [
        { value: '1-恐惧', label: '1-恐惧' }, { value: '2-焦虑', label: '2-焦虑' }, { value: '3-平静', label: '3-平静' }, { value: '4-乐观', label: '4-乐观' }, { value: '5-兴奋', label: '5-兴奋' },
      ], hint: '对比买入时的情绪变化' },
  ],
};

const sectionSellReview: FormSection = {
  id: 'sell_review',
  title: '卖出复盘',
  description: '卖出也是一种决策，值得单独反思 — 本笔卖出的复盘会自动关联，无需手动选择',
  fields: [
    { id: 'sell_review_date', label: '复盘日期', type: 'date', priority: 'required', defaultValue: 'auto_today' },
    { id: 'sell_thesis_valid', label: '买入逻辑验证', type: 'radio', priority: 'required', options: [
        { value: '完全正确', label: '完全正确' }, { value: '部分正确', label: '部分正确' }, { value: '完全错误', label: '完全错误' },
      ], hint: '诚实面对——逻辑正确但亏了(运气差)，还是逻辑错了但赚了(运气好)？' },
    { id: 'sell_post_sell_trend', label: '卖出后走势', type: 'radio', priority: 'recommended', options: [
        { value: '继续大涨', label: '继续大涨' }, { value: '继续小涨', label: '继续小涨' },
        { value: '震荡持平', label: '震荡持平' }, { value: '下跌', label: '下跌' },
      ], hint: '卖出后继续上涨可能说明卖出过早，用于识别过早卖出' },
    { id: 'sell_what_was_right', label: '做对了什么？', type: 'textarea', priority: 'required', hint: '强化正确的判断模式' },
    { id: 'sell_what_was_wrong', label: '做错了什么？', type: 'textarea', priority: 'required', hint: '诚实面对，不美化' },
    { id: 'sell_lesson', label: '核心教训', type: 'textarea', priority: 'required', hint: '提炼一条可复用的经验', autocomplete: true },
    { id: 'sell_would_repeat', label: '同样的机会再来，你还会做吗？', type: 'radio', priority: 'recommended', options: [
        { value: '一定会', label: '一定会' }, { value: '会，但会调整', label: '会，但会调整' }, { value: '不会', label: '不会' },
      ] },
    { id: 'sell_adjustment', label: '下次如何调整？', type: 'textarea', priority: 'optional', condition: { dependsOn: 'sell_would_repeat', showWhen: '会，但会调整' } },
    { id: 'sell_profit_result', label: '盈亏结果', type: 'radio', priority: 'recommended', options: [
        { value: '盈利', label: '盈利' }, { value: '亏损', label: '亏损' }, { value: '持平', label: '持平' },
      ], computed: {
        dependsOn: ['sell_pnl_percent'],
        formula: (values) => {
          const pnl = parseFloat(values['sell_pnl_percent'] as string);
          if (isNaN(pnl)) return '';
          if (pnl > 0) return '盈利';
          if (pnl < 0) return '亏损';
          return '持平';
        },
        placeholder: '自动判断（根据盈亏百分比）',
      } },
  ],
};

const sectionPositionReview: FormSection = {
  id: 'position_review',
  title: '投资周期复盘',
  description: '整个投资周期结束后的完整复盘 — 投资逻辑、执行过程、最终结果',
  fields: [
    { id: 'position_review_date', label: '复盘日期', type: 'date', priority: 'required', defaultValue: 'auto_today' },
    { id: 'position_original_thesis', label: '原始投资逻辑回顾', type: 'textarea', priority: 'required',
      hint: '回顾买入时的核心逻辑，它是否经得起时间检验？', autocomplete: true },
    { id: 'position_thesis_result', label: '逻辑验证结果', type: 'radio', priority: 'required', options: [
        { value: '完全正确', label: '完全正确' }, { value: '部分正确', label: '部分正确' }, { value: '完全错误', label: '完全错误' },
      ], hint: '逻辑正确但亏了(运气差)，还是逻辑错了但赚了(运气好)？' },
    { id: 'position_biggest_success', label: '最大成功', type: 'textarea', priority: 'required',
      hint: '这次投资做得最好的一点是什么？' },
    { id: 'position_biggest_mistake', label: '最大失误', type: 'textarea', priority: 'required',
      hint: '最该避免重犯的错误是什么？' },
    { id: 'position_lesson', label: '核心教训', type: 'textarea', priority: 'required',
      hint: '提炼一条可复用的投资经验', autocomplete: true },
    { id: 'position_conclusion', label: '投资总结', type: 'textarea', priority: 'required',
      hint: '如果用一句话总结这次投资周期，你会说什么？' },
  ],
};

const sectionBuyReview: FormSection = {
  id: 'buy_review',
  title: '买入复盘',
  description: '买入决策 30 天后的反思 — 为什么买？判断是否正确？',
  fields: [
    { id: 'buy_review_date', label: '复盘日期', type: 'date', priority: 'required', defaultValue: 'auto_today' },
    { id: 'buy_review_thesis_valid', label: '买入逻辑验证', type: 'radio', priority: 'required', options: [
        { value: '完全正确', label: '完全正确' }, { value: '部分正确', label: '部分正确' }, { value: '完全错误', label: '完全错误' },
      ], hint: '诚实面对——逻辑正确但跌了(运气差)，还是逻辑错了但涨了(运气好)？' },
    { id: 'buy_review_what_was_right', label: '做对了什么？', type: 'textarea', priority: 'required',
      hint: '买入判断中最正确的一点是什么？' },
    { id: 'buy_review_what_was_wrong', label: '做错了什么？', type: 'textarea', priority: 'required',
      hint: '买入时忽略了什么？诚实面对，不美化' },
    { id: 'buy_review_lesson', label: '核心教训', type: 'textarea', priority: 'required',
      hint: '提炼一条可复用的买入经验', autocomplete: true },
    { id: 'buy_review_would_repeat', label: '同样的机会再来，你还会买吗？', type: 'radio', priority: 'recommended', options: [
        { value: '一定会', label: '一定会' }, { value: '会，但会调整', label: '会，但会调整' }, { value: '不会', label: '不会' },
      ] },
    { id: 'buy_review_adjustment', label: '下次如何调整？', type: 'textarea', priority: 'optional', condition: { dependsOn: 'buy_review_would_repeat', showWhen: '会，但会调整' } },
  ],
};

// ============================================================
// 三个独立模板
// ============================================================

export type InvestmentRecordRole = 'position' | 'buy' | 'sell';

/** 各场景复盘等待期配置键（settings store，值 = 天数） */
export const COOLDOWN_SETTINGS = {
  BUY: 'cooldown_days_buy',
  SELL: 'cooldown_days_sell',
  POSITION: 'cooldown_days_position',
  DECISION: 'cooldown_days_decision',
} as const;

/** 默认冷静期（天） */
export const DEFAULT_COOLDOWN_DAYS = 30;

/** 共享模板元数据 */
const sharedMeta = {
  icon: '✅' as const,
  timing: { frequency: '交易时', suggestion: '买入/定期检查/卖出' },
};

/** 买入单模板 */
export const investmentBuyTemplate: FormTemplate = {
  id: 'investment_checklist_buy',
  name: '投资检查清单 · 买入',
  description: '记录一次买入决策，冷静期后复盘买入是否正确',
  ...sharedMeta,
  sections: [sectionBeforeBuying, sectionBuyReview],
  phases: [
    {
      id: 'buying',
      label: '买入阶段',
      icon: '🎯',
      sectionIndices: [0],
      completionFields: ['buy_company_name', 'buy_thesis', 'buy_understand_business'],
      completesRecord: true,
    },
    {
      id: 'buy_review',
      label: '买入复盘',
      icon: '🔍',
      sectionIndices: [1],
      completionFields: ['buy_review_thesis_valid', 'buy_review_lesson'],
      unlockAfterDays: DEFAULT_COOLDOWN_DAYS,
      unlockAfterField: 'buy_date',
    },
  ],
};

/** 卖出单模板 */
export const investmentSellTemplate: FormTemplate = {
  id: 'investment_checklist_sell',
  name: '投资检查清单 · 卖出',
  description: '记录一次卖出决策，冷静期后复盘卖点是否合理',
  ...sharedMeta,
  sections: [sectionWhenSelling, sectionSellReview],
  phases: [
    {
      id: 'selling',
      label: '卖出阶段',
      icon: '💰',
      sectionIndices: [0],
      completionFields: ['sell_exit_price', 'sell_reason'],
      completesRecord: true,
    },
    {
      id: 'sell_review',
      label: '卖出复盘',
      icon: '🔍',
      sectionIndices: [1],
      completionFields: ['sell_thesis_valid', 'sell_lesson'],
      unlockAfterDays: DEFAULT_COOLDOWN_DAYS,
      unlockAfterField: 'sell_date',
    },
  ],
};

/** 持有/仓位单模板 */
export const investmentPositionTemplate: FormTemplate = {
  id: 'investment_checklist_position',
  name: '投资检查清单 · 持有',
  description: '持仓记录 — 持有中定期检查 + 全部卖出后的整体复盘',
  ...sharedMeta,
  sections: [sectionWhileHolding, sectionPositionReview],
  phases: [
    {
      id: 'holding',
      label: '持有中',
      icon: '⏳',
      sectionIndices: [0],
      completionFields: [],
    },
    {
      id: 'position_review',
      label: '投资周期复盘',
      icon: '🔍',
      sectionIndices: [1],
      completionFields: ['position_lesson'],
      unlockAfterDays: DEFAULT_COOLDOWN_DAYS,
      unlockAfterField: 'sell_date',
    },
  ],
};

/**
 * 按 record_role 获取对应的角色模板。
 */
export function getTemplateForRole(role: string | undefined): FormTemplate {
  if (role === 'buy') return investmentBuyTemplate;
  if (role === 'sell') return investmentSellTemplate;
  if (role === 'position') return investmentPositionTemplate;
  return investmentBuyTemplate;
}
