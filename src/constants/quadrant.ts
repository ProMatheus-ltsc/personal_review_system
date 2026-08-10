/**
 * 自我管理矩阵（四象限）常量配置
 *
 * 参考《高效能人士的七个习惯》习惯三「要事第一」的时间管理矩阵：
 * 以「重要 / 紧急」两个维度把事项归入四个象限，核心是把更多时间
 * 主动投入到不紧急但重要的第二象限 —— 它是提升长期效能的杠杆。
 *
 * 本文件提供：
 * - DEFAULT_QUADRANTS：四象限的默认配置（名称 / 典型事项 / 处理原则 / 指导建议 / 视觉样式）
 * - EMPTY_QUADRANT_MATRIX()：返回全新的空矩阵（避免多个字段共享同一引用）
 * - isQuadrantMatrix()：判断一个值是否为四象限矩阵结构
 */
import type { QuadrantKey, QuadrantMatrix, QuadrantConfig } from '@/types';

export const QUADRANT_KEYS: QuadrantKey[] = ['q1', 'q2', 'q3', 'q4'];

/** 返回一个全新的空矩阵（每个象限为空数组） */
export function EMPTY_QUADRANT_MATRIX(): QuadrantMatrix {
  return { q1: [], q2: [], q3: [], q4: [] };
}

/** 判断值是否为四象限矩阵结构（用于校验与导出兜底） */
export function isQuadrantMatrix(val: unknown): val is QuadrantMatrix {
  if (typeof val !== 'object' || val === null) return false;
  const obj = val as Record<string, unknown>;
  return QUADRANT_KEYS.every((k) => Array.isArray(obj[k]));
}

/**
 * 默认四象限配置
 *
 * 指导建议要点（《高效能人士的七个习惯》）：
 * - Q1 紧急且重要：立即做，但要持续减少 —— 很多危机本可通过第二象限预防
 * - Q2 不紧急但重要：主动预留时间，是效能提升的关键象限（规划、预防、关系、成长、锻炼）
 * - Q3 紧急但不重要：授权 / 简化 / 说"不"，识别"别人的优先级"
 * - Q4 不紧急也不重要：尽量减少或避免，有节制地休息
 */
export const DEFAULT_QUADRANTS: QuadrantConfig[] = [
  {
    key: 'q1',
    label: '紧急且重要',
    action: '立即做',
    typical: '危机、紧急问题、临期任务、截止日期迫近的工作',
    advice: '立即处理、专注完成，避免拖延。同时反思：其中有多少本可以提前预防？第二象限投入越多，这里的"火情"越少。',
    placeholder: '记录一件紧急且重要的事',
    ratio: '不宜长期占主导',
    dotClass: 'bg-rose-500',
    borderClass: 'border-rose-200',
    adviceClass: 'bg-rose-50 text-rose-700',
  },
  {
    key: 'q2',
    label: '不紧急但重要',
    action: '主动投入',
    typical: '规划与预防、目标拆解、关系经营、学习成长、锻炼健康、深度思考',
    advice: '为它主动预留固定时间（每天 30-60 分钟 / 每周固定时段）。它不紧迫，却决定长期结果 —— 是提升效能的杠杆象限。',
    placeholder: '记录一件不紧急但重要的事',
    ratio: '40-50%（核心）',
    dotClass: 'bg-emerald-500',
    borderClass: 'border-emerald-300',
    adviceClass: 'bg-emerald-50 text-emerald-700',
    ringClass: 'ring-emerald-200',
  },
  {
    key: 'q3',
    label: '紧急但不重要',
    action: '授权 / 简化 / 说不',
    typical: '不必要的中断、临时会议、他人强加的"紧急"、过度查看消息',
    advice: '授权、简化、礼貌地说"不"。很多"看起来紧急"的事，只是别人的优先级，别让它们挤占你的要事时间。',
    placeholder: '记录一件紧急但不重要的事',
    ratio: '<15%',
    dotClass: 'bg-amber-500',
    borderClass: 'border-amber-200',
    adviceClass: 'bg-amber-50 text-amber-700',
  },
  {
    key: 'q4',
    label: '不紧急也不重要',
    action: '尽量减少 / 避免',
    typical: '无目的刷手机、闲聊消磨、无意义娱乐、拖延式"休息"',
    advice: '尽量减少或避免。适度休息是必要的，但要有意识地控制时间，别让它悄悄占据一天的大半。',
    placeholder: '记录一件浪费时间的活动',
    ratio: '<5%',
    dotClass: 'bg-slate-400',
    borderClass: 'border-slate-200',
    adviceClass: 'bg-slate-50 text-slate-500',
  },
];
