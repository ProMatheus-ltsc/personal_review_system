/**
 * 情绪觉察模板
 *
 * 用途：记录和处理情绪事件，包括情绪记录、调节步骤、自我反思与关系模式检查
 * 频率：随时，建议在情绪波动或人际冲突后使用
 * 设计理由：按照"记录→处理→反思→关系"的自然流，帮助用户从具体事件出发，
 *   逐步深入理解自己的情绪反应模式，提高情绪管理能力
 *
 * 特殊机制：
 * - 条件字段：如「冲突风格」为非理性反应时自动展示「最近冲突反应」详细记录字段
 */
import type { FormTemplate } from '@/types';

export const emotionalAwarenessTemplate: FormTemplate = {
  id: 'emotional_awareness',
  name: '情绪觉察',
  icon: '🧠',
  description: '情绪记录、调节与自我反思 — 从事件到洞察的完整觉察流程',
  timing: { frequency: '随时', suggestion: '情绪波动或冲突后' },
  sections: [
    {
      id: 'emotion_record',
      title: '情绪记录',
      fields: [
        { id: 'emotion_date', label: '日期', type: 'date', priority: 'required', defaultValue: 'auto_today' },
        { id: 'emotion_trigger', label: '触发事件', type: 'textarea', priority: 'required', hint: '什么事件、人物或想法引发了这个情绪？尽量具体', placeholder: '例：下午开会时被同事当众质疑方案，感到愤怒和委屈', autocomplete: true },
        { id: 'emotion_dominant', label: '主导情绪', type: 'radio', priority: 'required', hint: '选择最突出的一种情绪', options: [
          { value: '喜悦', label: '喜悦' },
          { value: '平静', label: '平静' },
          { value: '焦虑', label: '焦虑' },
          { value: '愤怒', label: '愤怒' },
          { value: '悲伤', label: '悲伤' },
          { value: '恐惧', label: '恐惧' },
          { value: '厌倦', label: '厌倦' },
          { value: '兴奋', label: '兴奋' },
          { value: '其他', label: '其他' },
        ]},
        { id: 'emotion_dominant_other', label: '其他情绪描述', type: 'text', priority: 'recommended', condition: { dependsOn: 'emotion_dominant', showWhen: '其他' } },
        { id: 'emotion_intensity', label: '情绪强度', type: 'radio', priority: 'required', hint: '1=几乎没感觉，5=完全被情绪淹没', options: [
          { value: '1-微弱', label: '1-微弱' },
          { value: '2-轻度', label: '2-轻度' },
          { value: '3-中等', label: '3-中等' },
          { value: '4-强烈', label: '4-强烈' },
          { value: '5-overwhelming', label: '5-overwhelming' },
        ]},
        { id: 'emotion_body_signal', label: '身体信号', type: 'checkbox', priority: 'recommended', hint: '情绪发生时身体有什么感觉？', options: [
          { value: '胸闷', label: '胸闷' }, { value: '肩膀紧', label: '肩膀紧' },
          { value: '胃不舒服', label: '胃不舒服' }, { value: '心跳加速', label: '心跳加速' },
          { value: '头痛', label: '头痛' }, { value: '手抖', label: '手抖' },
          { value: '呼吸急促', label: '呼吸急促' }, { value: '肌肉紧张', label: '肌肉紧张' },
          { value: '出汗', label: '出汗' }, { value: '其他', label: '其他' },
        ]},
      ],
    },
    {
      id: 'emotion_regulation',
      title: '情绪调节记录',
      fields: [
        { id: 'regulate_step1_pause', label: 'Step 1 暂停：我做到离开现场了吗？', type: 'radio', priority: 'required', hint: '离开现场，给自己物理空间是第一步', options: [
          { value: '做到了', label: '做到了' },
          { value: '部分做到', label: '部分做到' },
          { value: '没做到', label: '没做到' },
        ]},
        { id: 'regulate_step3_explore', label: 'Step 2 探索：这个情绪在告诉我什么？', type: 'textarea', priority: 'required', hint: '每个情绪都有信息——愤怒可能意味着边界被侵犯，焦虑可能是对不确定性的恐惧', placeholder: '例：我的愤怒告诉我——我需要被尊重...' },
        { id: 'regulate_step4_choose', label: 'Step 3 选择：我想要什么结果？', type: 'textarea', priority: 'required', hint: '在冲动行动之前，先想清楚理想的结果是什么', placeholder: '例：我希望对方理解我的感受，而不是赢得争论' },
        { id: 'regulate_step5_action', label: 'Step 4 行动：我实际采取了什么行动？', type: 'textarea', priority: 'required', hint: '记录你实际做了什么——无论好坏，诚实记录' },
        { id: 'regulate_effectiveness', label: '调节效果', type: 'radio', priority: 'recommended', options: [
          { value: '很有效，情绪平复了', label: '很有效，情绪平复了' },
          { value: '有一定效果', label: '有一定效果' },
          { value: '效果不明显', label: '效果不明显' },
          { value: '完全无效', label: '完全无效' },
        ]},
        { id: 'regulate_next_time', label: '下次可以怎么做得更好？', type: 'textarea', priority: 'recommended', hint: '复盘调节过程，提炼改进点', autocomplete: true },
      ],
    },
    {
      id: 'self_reflection',
      title: '自我觉察与反思',
      fields: [
        { id: 'emotion_thought', label: '当时脑中的自动念头', type: 'textarea', priority: 'recommended', hint: '不加过滤地写下情绪出现时的第一个想法', placeholder: "例：'他们都不理解我'、'我不够好'" },
        { id: 'emotion_pattern', label: '这个反应模式和过去什么经历有关？', type: 'textarea', priority: 'required', hint: '尝试追溯：这种情绪反应是否重复出现过？最早是什么时候？', placeholder: '例：小时候被父母否定时的感觉很像...', autocomplete: true },
        { id: 'pattern_core_need', label: '背后的核心需求', type: 'textarea', priority: 'optional', hint: "情绪背后通常有未被满足的需求——安全感？被认可？掌控感？连接感？", placeholder: "例：我反复感到焦虑，背后可能是对'不够好'的恐惧..." },
        { id: 'pattern_growth_note', label: '成长记录', type: 'textarea', priority: 'optional', hint: '相比过去，你在情绪管理上有什么进步？哪怕是微小的', autocomplete: true },
      ],
    },
    {
      id: 'relationship_patterns',
      title: '关系模式检查',
      fields: [
        { id: 'rel_give_receive', label: '我在关系中通常是付出多还是接受多？', type: 'radio', priority: 'required', emphasis: false, hint: '长期不平衡的关系容易产生怨恨或依赖', options: [
          { value: '明显付出多', label: '明显付出多' },
          { value: '稍微付出多', label: '稍微付出多' },
          { value: '基本平衡', label: '基本平衡' },
          { value: '稍微接受多', label: '稍微接受多' },
          { value: '明显接受多', label: '明显接受多' },
        ]},
        { id: 'rel_give_detail', label: '具体表现', type: 'textarea', priority: 'recommended', hint: '举一个最近的例子', placeholder: '例：总是我主动联系、主动安排...' },
        { id: 'rel_attraction', label: '我容易对什么样的人产生好感？', type: 'textarea', priority: 'required', hint: '不仅是外在特征，更关注性格、行为模式。你被吸引的人有什么共同点？', placeholder: '例：有主见的、强势的、需要我照顾的...', autocomplete: true },
        { id: 'rel_conflict_style', label: '我在冲突中通常的反应是什么？', type: 'radio', priority: 'required', hint: '没有标准答案，诚实面对自己的模式', options: [
          { value: '回避（沉默/退缩）', label: '回避（沉默/退缩）' },
          { value: '迎合（妥协/讨好）', label: '迎合（妥协/讨好）' },
          { value: '对抗（争辩/攻击）', label: '对抗（争辩/攻击）' },
          { value: '理性分析（冷静沟通）', label: '理性分析（冷静沟通）' },
          { value: '情绪爆发后后悔', label: '情绪爆发后后悔' },
        ]},
        { id: 'rel_conflict_example', label: '最近一次冲突的反应', type: 'textarea', priority: 'recommended', hint: '描述事件和你的反应，事后你觉得可以如何改进？', condition: { dependsOn: 'rel_conflict_style', showWhen: ['回避（沉默/退缩）', '迎合（妥协/讨好）', '对抗（争辩/攻击）', '情绪爆发后后悔'] } },
        { id: 'rel_ideal_relationship', label: '我理想的亲密关系是什么样的？', type: 'textarea', priority: 'required', hint: '描述你心目中健康关系的样子——沟通方式、相处模式、彼此的角色', placeholder: '例：互相尊重、能坦诚沟通、有各自空间但也有亲密时刻...' },
        { id: 'rel_current_gap', label: '现实与理想的差距', type: 'textarea', priority: 'optional', hint: '当前关系（或过去关系）与理想的差距在哪？你可以做什么？' },
        { id: 'rel_boundary', label: '我的边界清晰吗？', type: 'radio', priority: 'recommended', hint: '健康的关系需要清晰的个人边界', options: [
          { value: '非常清晰', label: '非常清晰' },
          { value: '比较清晰', label: '比较清晰' },
          { value: '模糊', label: '模糊' },
          { value: '几乎没有边界', label: '几乎没有边界' },
        ]},
      ],
    },
  ],
};
