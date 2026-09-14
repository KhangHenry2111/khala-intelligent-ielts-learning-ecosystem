import { DataTable } from '../../../shared/ui/DataTable';
import { SectionHead } from '../../../shared/ui/SectionHead';
import { contentRows } from '../data';

export function ContentPage() {
  return (
    <div className="dashboard-container">
      <section className="glass-card">
        <SectionHead title="Content management" actionLabel="Review" />
        <DataTable
          columns={[
            { key: 'title', label: 'Title' },
            { key: 'type', label: 'Type' },
            { key: 'reason', label: 'Reason' },
            {
              key: 'status',
              label: 'Status',
              render: (row) => (
                <span className={`status-pill ${row.status === 'Removed' ? 'danger' : row.status === 'Under review' ? 'warning' : ''}`}>
                  {row.status}
                </span>
              ),
            },
          ]}
          rows={contentRows}
        />
      </section>
    </div>
  );
}
