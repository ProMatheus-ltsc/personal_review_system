/**
 * FormTabs — 表单 section tab 导航栏（已下沉到 @shared/core）
 *
 * 本文件保留为兼容层：历史默认导入路径与 props（sections/activeTab/
 * shouldHide/isLocked/isReadOnly/hasErrors/onTabChange）全部不变，
 * 实现由基座提供（基座额外支持 tabs 简写与整条 tab 栏折叠，均为可选项）。
 */
import { FormTabs as SharedFormTabs } from '@shared/core/components/form/FormTabs';
import type { FormSection } from '@/types';

interface FormTabsProps {
  sections: FormSection[];
  activeTab: number;
  shouldHide: (index: number) => boolean;
  isLocked: (index: number) => boolean;
  isReadOnly: (index: number) => boolean;
  hasErrors: (index: number) => boolean;
  onTabChange: (index: number) => void;
}

export default function FormTabs(props: FormTabsProps) {
  return <SharedFormTabs {...props} />;
}
