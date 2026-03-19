/**
 * 为了向后兼容，从 formatters.ts 统一导出日期/时间工具。
 * 新代码请直接 import from '@/lib/formatters'。
 */
export { formatDate, formatTime, getRelativeTime, generateId } from './formatters';
