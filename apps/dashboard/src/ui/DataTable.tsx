import { useMemo, useState, type ReactNode } from 'react';
import { cn } from '../lib/cn';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import { EmptyState } from './EmptyState';

export interface Column<T> {
  key: string;
  header: ReactNode;
  render: (row: T) => ReactNode;
  /** Enables click-to-sort on this column. */
  sortable?: boolean;
  /** Value used for sorting when `sortable`. Defaults to nothing (no sort). */
  sortValue?: (row: T) => string | number;
  align?: 'left' | 'right' | 'center';
  className?: string;
}

export interface DataTableProps<T> {
  columns: Array<Column<T>>;
  rows: T[];
  getRowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  /** Accessible label for a clickable row (used when onRowClick is set). */
  getRowLabel?: (row: T) => string;
  emptyTitle?: string;
  emptyDescription?: string;
  className?: string;
}

type SortDir = 'asc' | 'desc';

/** Generic, sortable, accessible table. Screens supply columns + rows. */
export function DataTable<T>({
  columns,
  rows,
  getRowKey,
  onRowClick,
  getRowLabel,
  emptyTitle,
  emptyDescription,
  className,
}: DataTableProps<T>) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const sortedRows = useMemo(() => {
    if (!sortKey) return rows;
    const col = columns.find((c) => c.key === sortKey);
    if (!col?.sortValue) return rows;
    const getValue = col.sortValue;
    return [...rows].sort((a, b) => {
      const av = getValue(a);
      const bv = getValue(b);
      if (av < bv) return sortDir === 'asc' ? -1 : 1;
      if (av > bv) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
  }, [rows, columns, sortKey, sortDir]);

  function toggleSort(col: Column<T>): void {
    if (!col.sortable || !col.sortValue) return;
    if (sortKey === col.key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(col.key);
      setSortDir('asc');
    }
  }

  if (rows.length === 0) {
    return <EmptyState title={emptyTitle ?? 'No records'} description={emptyDescription} />;
  }

  const alignClass = (a?: 'left' | 'right' | 'center') =>
    a === 'right' ? 'text-right' : a === 'center' ? 'text-center' : 'text-left';

  return (
    <div className={cn('overflow-x-auto rounded-card border border-border bg-card', className)}>
      <Table className="text-body">
        <TableHeader>
          <TableRow className="border-b border-border hover:bg-transparent">
            {columns.map((col) => {
              const active = sortKey === col.key;
              return (
                <TableHead
                  key={col.key}
                  scope="col"
                  aria-sort={
                    col.sortable ? (active ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none') : undefined
                  }
                  className={cn(
                    'h-auto whitespace-normal px-4 py-3 text-caption font-semibold uppercase tracking-wide text-text-muted',
                    alignClass(col.align),
                    col.className,
                  )}
                >
                  {col.sortable && col.sortValue ? (
                    <button
                      type="button"
                      onClick={() => toggleSort(col)}
                      className="inline-flex items-center gap-1 outline-none hover:text-text focus-visible:text-text"
                    >
                      <span>{col.header}</span>
                      <span aria-hidden="true">{active ? (sortDir === 'asc' ? '▲' : '▼') : '↕'}</span>
                    </button>
                  ) : (
                    col.header
                  )}
                </TableHead>
              );
            })}
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedRows.map((row) => (
            <TableRow
              key={getRowKey(row)}
              role={onRowClick ? 'button' : undefined}
              aria-label={onRowClick ? (getRowLabel?.(row) ?? 'View details') : undefined}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              tabIndex={onRowClick ? 0 : undefined}
              onKeyDown={
                onRowClick
                  ? (e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onRowClick(row);
                      }
                    }
                  : undefined
              }
              className={cn(
                'border-b border-border last:border-b-0 hover:bg-transparent',
                onRowClick &&
                  'cursor-pointer outline-none hover:bg-primary/5 focus-visible:bg-primary/5',
              )}
            >
              {columns.map((col) => (
                <TableCell
                  key={col.key}
                  className={cn('px-4 py-3 text-text whitespace-normal', alignClass(col.align), col.className)}
                >
                  {col.render(row)}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
