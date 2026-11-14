/**
 * 自动补全建议服务（已下沉到 @shared/core）
 *
 * 本文件保留为兼容层：历史导入路径 `@/services/suggestions` 与函数签名不变，
 * 实现由公共基座提供（基座版还会显式按 updatedAt 降序，确保"最近使用在前"）。
 */
export { getFieldSuggestions } from '@shared/core/utils/suggestions';
