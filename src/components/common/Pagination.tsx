import { useI18n } from "../../i18n/I18nProvider";
import { getPageWindow, PAGE_SIZES } from "../../utils/pagination";

interface PaginationProps {
  totalItems: number;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  showPageSize?: boolean;
}

export function Pagination({
  totalItems,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
  showPageSize = true,
}: PaginationProps) {
  const { t } = useI18n();
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  if (totalItems <= pageSize && pageSize === PAGE_SIZES[2]) return null;
  const from = totalItems ? (page - 1) * pageSize + 1 : 0;
  const to = Math.min(page * pageSize, totalItems);
  const pageWindow = getPageWindow(page, totalPages);

  return (
    <div className="pagination">
      <span className="info">
        {from}-{to} {t("common.of")} {totalItems}
      </span>
      <div className="controls">
        <button
          type="button"
          className="page-btn"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          ‹
        </button>
        {pageWindow.map((item, index) =>
          item === "..." ? (
            <span className="ellipsis" key={`ellipsis-after-${pageWindow[index - 1] ?? "start"}`}>
              …
            </span>
          ) : (
            <button
              type="button"
              className={`page-btn ${item === page ? "active" : ""}`}
              key={item}
              onClick={() => onPageChange(item)}
            >
              {item}
            </button>
          ),
        )}
        <button
          type="button"
          className="page-btn"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          ›
        </button>
      </div>
      {showPageSize ? (
        <label className="pagesize">
          {t("common.pageSize")}
          <select
            value={pageSize}
            onChange={(event) => onPageSizeChange(Number(event.target.value))}
          >
            {PAGE_SIZES.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </label>
      ) : null}
    </div>
  );
}
