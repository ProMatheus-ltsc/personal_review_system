/**
 * 表单验证工具集（已下沉到 @shared/core）
 *
 * 本文件保留为兼容层：历史导入路径 `@/utils/formValidation` 与全部导出名不变，
 * 实现由公共基座提供（基座为超集，另含 buildInitialValues / getScopedMissingFields 等）。
 *
 * 说明：基座把参数类型从 any 收紧为 unknown、getPhaseTimeLockInfo 的 phase 用
 * Pick<PhaseConfig, ...> 收窄，均为更严格的等价类型，调用方无需改动。
 */
export {
  getCurrentPhaseIndex,
  getPhaseTimeLockInfo,
  getSectionPhaseIndex,
  isFieldEmpty,
  validateRequiredFields,
} from '@shared/core/utils/formValidation';
export type { ValidationError } from '@shared/core/utils/formValidation';
