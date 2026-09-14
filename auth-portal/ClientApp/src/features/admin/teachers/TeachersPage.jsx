import { SectionHead } from '../../../shared/ui/SectionHead';

export function TeachersPage() {
  return (
    <div className="dashboard-container">
      <section className="glass-card admin-create-teacher">
        <SectionHead title="Create teacher account" actionLabel="Save account" />
        <div className="teacher-form-grid">
          <label>Full name<input type="text" placeholder="Enter teacher name" /></label>
          <label>Email<input type="email" placeholder="teacher@ielts.ai" /></label>
          <label>Phone number<input type="tel" placeholder="0987 654 321" /></label>
          <label>Specialization<input type="text" placeholder="Speaking / Writing / General" /></label>
          <label>Qualification<input type="text" placeholder="IELTS 8.5 / CELTA" /></label>
          <label>
            Access level
            <select defaultValue="teacher">
              <option value="teacher">Teacher</option>
              <option value="editor">Content editor</option>
              <option value="reviewer">Reviewer</option>
            </select>
          </label>
        </div>
      </section>
    </div>
  );
}
