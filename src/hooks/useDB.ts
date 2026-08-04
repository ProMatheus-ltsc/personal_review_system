/**
 * 数据库操作 Hooks
 *
 * 封装 IndexedDB 服务层的一组 React Hooks，
 * 提供加载状态管理、错误处理和自动刷新等能力。
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { FormRecord } from '@/types';
import * as db from '@/services/db';

/**
 * 获取记录列表的 Hook
 *
 * 自动加载指定模板（或全部）的记录，并提供手动刷新方法。
 *
 * @param templateId - 可选，按模板 ID 筛选；不传则返回所有记录
 * @returns 返回对象包含：
 *   - records: 记录数组（按 updatedAt 降序）
 *   - loading: 是否正在加载
 *   - error: 错误信息，无错误时为 null
 *   - refresh: 手动重新加载数据的函数
 *
 * @example
 * ```tsx
 * const { records, loading, refresh } = useRecords('weekly_review');
 * // 删除记录后手动刷新列表
 * await deleteRecord(id);
 * refresh();
 * ```
 */
export function useRecords(templateId?: string) {
  const [records, setRecords] = useState<FormRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadRecords = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await db.getAllRecords(templateId);
      setRecords(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load records');
    } finally {
      setLoading(false);
    }
  }, [templateId]);

  useEffect(() => {
    loadRecords();
  }, [loadRecords]);

  return { records, loading, error, refresh: loadRecords };
}

/**
 * 获取单条记录的 Hook
 *
 * 根据 ID 加载单条记录，内置组件卸载时的请求取消逻辑。
 *
 * @param id - 记录 ID，传 undefined 表示无需加载
 * @returns 返回对象包含：
 *   - record: 记录对象，未找到或未加载时为 null
 *   - loading: 是否正在加载
 *   - error: 错误信息
 *
 * @example
 * ```tsx
 * const { record, loading } = useRecord(recordId);
 * if (loading) return <Spinner />;
 * if (!record) return <NotFound />;
 * ```
 */
export function useRecord(id: string | undefined) {
  const [record, setRecord] = useState<FormRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) {
      setRecord(null);
      setLoading(false);
      return;
    }

    let cancelled = false;

    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await db.getRecord(id);
        if (!cancelled) {
          setRecord(data ?? null);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Failed to load record');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [id]);

  return { record, loading, error };
}

/**
 * 保存记录的 Hook
 *
 * 提供异步保存函数和保存状态；保存失败时会向上抛出异常。
 *
 * @returns 返回对象包含：
 *   - save: 保存记录的异步函数，失败时会 throw
 *   - saving: 是否正在保存
 *   - error: 保存失败的错误信息
 *
 * @example
 * ```tsx
 * const { save, saving } = useSaveRecord();
 * await save(record);
 * ```
 */
export function useSaveRecord() {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = useCallback(async (record: FormRecord) => {
    try {
      setSaving(true);
      setError(null);
      await db.saveRecord(record);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save record');
      throw e;
    } finally {
      setSaving(false);
    }
  }, []);

  return { save, saving, error };
}

/**
 * 删除记录的 Hook
 *
 * 提供异步删除函数和删除状态；删除失败时会向上抛出异常。
 *
 * @returns 返回对象包含：
 *   - remove: 删除记录的异步函数（传入记录 ID），失败时会 throw
 *   - deleting: 是否正在删除
 *   - error: 删除失败的错误信息
 *
 * @example
 * ```tsx
 * const { remove, deleting } = useDeleteRecord();
 * await remove(recordId);
 * refresh(); // 刷新列表
 * ```
 */
export function useDeleteRecord() {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const remove = useCallback(async (id: string) => {
    try {
      setDeleting(true);
      setError(null);
      await db.deleteRecord(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete record');
      throw e;
    } finally {
      setDeleting(false);
    }
  }, []);

  return { remove, deleting, error };
}

/**
 * 批量删除记录的 Hook
 *
 * 提供异步批量删除函数和删除状态。
 *
 * @returns 返回对象包含：
 *   - removeMany: 批量删除记录的异步函数（传入记录 ID 数组），失败时会 throw
 *   - deleting: 是否正在删除
 *   - error: 删除失败的错误信息
 */
export function useDeleteRecords() {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const removeMany = useCallback(async (ids: string[]) => {
    try {
      setDeleting(true);
      setError(null);
      await db.deleteRecords(ids);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete records');
      throw e;
    } finally {
      setDeleting(false);
    }
  }, []);

  return { removeMany, deleting, error };
}

/**
 * 搜索记录的 Hook（带防抖）
 *
 * 内置 300ms 防抖逻辑，避免用户输入时频繁触发搜索。
 * 输入为空字符串时自动清空结果。
 *
 * @returns 返回对象包含：
 *   - results: 搜索结果数组
 *   - search: 触发搜索的函数（query, templateId?）
 *   - searching: 是否正在搜索
 *
 * @example
 * ```tsx
 * const { results, search, searching } = useSearchRecords();
 * <input onChange={(e) => search(e.target.value, 'weekly_review')} />
 * ```
 */
export function useSearchRecords() {
  const [results, setResults] = useState<FormRecord[]>([]);
  const [searching, setSearching] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = useCallback((query: string, templateId?: string) => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }

    if (!query.trim()) {
      setResults([]);
      setSearching(false);
      return;
    }

    setSearching(true);

    timerRef.current = setTimeout(async () => {
      try {
        const data = await db.searchRecords(query, templateId);
        setResults(data);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
  }, []);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  return { results, search, searching };
}
