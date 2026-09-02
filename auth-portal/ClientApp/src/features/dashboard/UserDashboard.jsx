export function UserDashboard() {
  const plans = [
    { name: 'Đồng', price: 'Miễn phí', tone: 'bronze' },
    { name: 'Bạc', price: '199.000đ / tháng', tone: 'silver', featured: true },
    { name: 'Vàng', price: '399.000đ / tháng', tone: 'gold' },
  ];

  const features = [
    ['Quiz có sẵn', 'Không giới hạn', 'Không giới hạn', 'Không giới hạn'],
    ['AI tạo quiz', '8 lượt/tháng', '60 lượt/tháng', '250 lượt/tháng'],
    ['Test trình độ', '1 lần/tháng', '4 lần/tháng', '12 lần/tháng'],
    ['Upload tài liệu', '5 MB', '20 MB', '50 MB'],
    ['Kho tri thức', 'Cơ bản', 'Đầy đủ', 'Đầy đủ'],
    ['AI phân tích kết quả', '✓', '✓', '✓'],
    ['Speaking AI', '✗', '✓', '✓'],
    ['Speaking giáo viên', '✗', '✗', '✓'],
    ['Writing AI', 'Giới hạn', '✓', '✓'],
    ['Writing giáo viên', '✗', '✗', '✓'],
  ];

  return (
    <div className="plans-page">
      <header className="plans-heading">
        <span className="eyebrow">IELTS AI learning</span>
        <h1>Chọn gói học phù hợp với bạn</h1>
        <p>Tập trung vào những công cụ giúp bạn tiến bộ đều đặn mỗi ngày.</p>
      </header>

      <div className="plan-cards" aria-label="Các gói học">
        {plans.map((plan) => (
          <article className={`plan-card ${plan.featured ? 'featured' : ''}`} key={plan.name}>
            {plan.featured && <span className="plan-ribbon">Phổ biến nhất</span>}
            <div className={`plan-icon ${plan.tone}`}>{plan.name[0]}</div>
            <h2>{plan.name}</h2>
            <p className="plan-price">{plan.price}</p>
            <button className={`plan-button ${plan.featured ? 'primary' : ''}`} type="button">
              {plan.featured ? 'Nâng cấp gói' : 'Đang xem gói'}
            </button>
          </article>
        ))}
      </div>

      <section className="feature-table-wrap" aria-label="So sánh quyền lợi các gói">
        <div className="feature-table-head">
          <div>
            <span className="eyebrow">So sánh quyền lợi</span>
            <h2>Mọi công cụ bạn cần để luyện thi</h2>
          </div>
          <span className="feature-count">10 quyền lợi</span>
        </div>
        <div className="feature-table" role="table">
          <div className="feature-row feature-row-header" role="row">
            <span role="columnheader">Tính năng</span>
            {plans.map((plan) => <span role="columnheader" key={plan.name}>{plan.name}</span>)}
          </div>
          {features.map(([label, ...values]) => (
            <div className="feature-row" role="row" key={label}>
              <span className="feature-label" role="rowheader">{label}</span>
              {values.map((value, index) => (
                <span className={`${value === '✓' ? 'feature-yes' : value === '✗' ? 'feature-no' : ''}`} role="cell" key={`${label}-${index}`}>
                  {value}
                </span>
              ))}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
