export function TableTools({query, onQuery, count, page, onPage, pageSize = 50, children}: {
  query: string; onQuery: (query: string) => void; count: number; page: number;
  onPage: (page: number) => void; pageSize?: number; children?: React.ReactNode;
}) {
  const pages = Math.max(1, Math.ceil(count / pageSize));
  return <div className="table-tools">
    <label>Search table<input type="search" value={query} placeholder="Filename, metadata, m/z…" onChange={event => {onQuery(event.target.value); onPage(0);}} /></label>
    {children}<span>{count} matching rows · Page {page + 1} of {pages}</span>
    <button className="secondary-button" type="button" disabled={page === 0} onClick={() => onPage(page - 1)}>Previous</button>
    <button className="secondary-button" type="button" disabled={page + 1 >= pages} onClick={() => onPage(page + 1)}>Next</button>
  </div>;
}
