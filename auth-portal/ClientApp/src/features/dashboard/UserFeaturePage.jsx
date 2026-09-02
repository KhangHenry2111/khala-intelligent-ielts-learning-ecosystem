import { useParams } from 'react-router-dom';
import { useAuth } from '../../app/AuthContext';

const featureConfig = {
  'available-quiz': { title: 'Quiz có sẵn', description: 'Luyện tập với thư viện đề IELTS được tuyển chọn.', icon: 'Q', access: 'all', value: 'Không giới hạn' },
  'ai-quiz': { title: 'AI tạo quiz', description: 'Tạo bộ câu hỏi cá nhân hóa theo mục tiêu học tập.', icon: 'AI', access: 'all', values: { bronze: '8 lượt/tháng', silver: '60 lượt/tháng', gold: '250 lượt/tháng' } },
  'level-test': { title: 'Test trình độ', description: 'Đánh giá năng lực hiện tại và nhận lộ trình phù hợp.', icon: 'T', access: 'all', values: { bronze: '1 lần/tháng', silver: '4 lần/tháng', gold: '12 lần/tháng' } },
  upload: { title: 'Upload tài liệu', description: 'Đưa tài liệu cá nhân vào không gian học tập của bạn.', icon: 'U', access: 'all', values: { bronze: '5 MB', silver: '20 MB', gold: '50 MB' } },
  knowledge: { title: 'Kho tri thức', description: 'Khám phá nguồn tài liệu và kiến thức IELTS.', icon: 'K', access: 'all', values: { bronze: 'Cơ bản', silver: 'Đầy đủ', gold: 'Đầy đủ' } },
  results: { title: 'Kết quả', description: 'Theo dõi tiến bộ và nhận phân tích từ AI sau mỗi lần luyện tập.', icon: 'R', access: 'all', value: 'AI phân tích kết quả' },
};

function normalizeRank(value) {
  const rank = String(value || '').trim().toLowerCase();
  if (rank === 'gold' || rank === 'vàng') return 'gold';
  if (rank === 'silver' || rank === 'bạc') return 'silver';
  return 'bronze';
}

export function UserFeaturePage() {
  const { feature } = useParams();
  const { user } = useAuth();
  const config = featureConfig[feature] || featureConfig['available-quiz'];
  const rank = normalizeRank(user?.rank || user?.details?.Rank || user?.details?.rank);
  const value = config.values ? config.values[rank] : config.value;

  return (
    <div className="user-feature-page">
      <header className="feature-hero glass-card">
        <div className="feature-hero-icon">{config.icon}</div>
        <div>
          <span className="eyebrow">{rank === 'gold' ? 'Gói Vàng' : rank === 'silver' ? 'Gói Bạc' : 'Gói Đồng'}</span>
          <h1>{config.title}</h1>
          <p>{config.description}</p>
        </div>
      </header>
      <section className="feature-workspace glass-card">
        <div>
          <span className="eyebrow">Quyền lợi hiện tại</span>
          <h2>{value}</h2>
          <p>Bạn đang sử dụng quyền lợi theo gói {rank === 'gold' ? 'Vàng' : rank === 'silver' ? 'Bạc' : 'Đồng'}.</p>
        </div>
        <button className="feature-action" type="button">Bắt đầu ngay <span>→</span></button>
      </section>
    </div>
  );
}