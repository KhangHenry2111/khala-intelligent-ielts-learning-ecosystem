import { DataTable } from '../../../shared/ui/DataTable';
import { SectionHead } from '../../../shared/ui/SectionHead';
import { accountRows } from '../data';

export function AccountsPage() {
  return (
    <div className="dashboard-container">
      <section className="glass-card">
        <SectionHead title="Account management" actionLabel="+ Create teacher" />
        <DataTable
          columns={[
            { key: 'name', label: 'Name' },
            { key: 'role', label: 'Role' },
            {
              key: 'status',
              label: 'Status',
              render: (row) => (
                <span className={`status-pill ${row.status === 'Suspended' ? 'danger' : row.status === 'Pending' ? 'warning' : ''}`}>
                  {row.status}
                </span>
              ),
            },
            { key: 'lastSeen', label: 'Last active' },
          ]}
          rows={accountRows}
        />
      </section>
    </div>
  );
}
