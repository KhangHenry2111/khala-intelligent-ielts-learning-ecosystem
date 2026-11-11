import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { quizApi } from '../../../shared/api';
import { FeatureShell } from '../../../shared/ui/FeatureShell';
import { userRank } from '../../../shared/lib/roles';
import { useAuth } from '../../../shared/auth/AuthContext';
import { useLanguage } from '../../../shared/i18n/LanguageContext';

const quotas = { bronze: 'Basic', silver: 'Full', gold: 'Full' };

function getFileName(fileUrl) {
  if (!fileUrl) return '';
  return fileUrl.split(/[\\/]/).pop()?.split('?')[0] || fileUrl;
}

export function KnowledgeBasePage() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadDocuments = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await quizApi.myKnowledgeDocuments(user?.accessToken);
      setDocuments(result.items || []);
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }, [user?.accessToken]);

  useEffect(() => {
    loadDocuments();
  }, [loadDocuments]);

  return (
    <FeatureShell
      icon="K"
      title="Knowledge base"
      description="Explore IELTS resources and study content from one place."
      accessValue={quotas[userRank(user)]}
    >
      <section className="knowledge-base-list" aria-live="polite">
        <header className="knowledge-base-heading">
          <h2>{t('Your saved resources')}</h2>
          <button className="quiz-close" type="button" onClick={loadDocuments} disabled={loading}>
            {t(loading ? 'Loading…' : 'Refresh')}
          </button>
        </header>

        {loading ? <p role="status">{t('Loading knowledge base…')}</p> : null}
        {!loading && error ? (
          <div className="knowledge-base-message" role="alert">
            <p>{t('Unable to load your knowledge base.')}</p>
            <p>{error}</p>
            <button className="feature-action" type="button" onClick={loadDocuments}>{t('Try again')}</button>
          </div>
        ) : null}
        {!loading && !error && documents.length === 0 ? (
          <div className="knowledge-base-message">
            <p>{t('No saved resources yet.')}</p>
            <p>{t('Completed AI quizzes will appear here.')}</p>
            <Link className="feature-action" to="/user/ai-quiz">{t('Create an AI quiz')} <span>→</span></Link>
          </div>
        ) : null}

        {!loading && !error && documents.length > 0 ? (
          <div className="knowledge-base-grid">
            {documents.map((document) => {
              const isExternalFile = /^https?:\/\//i.test(document.fileUrl || '');
              const fileName = getFileName(document.fileUrl);
              return (
                <article className="knowledge-base-card" key={document.docId}>
                  <span className="eyebrow">{t(document.category || 'Study resource')}</span>
                  <h3>{document.title}</h3>
                  <p>{document.content || t('No description available.')}</p>
                  <footer>
                    <time dateTime={document.createdAt}>
                      {new Date(document.createdAt).toLocaleDateString()}
                    </time>
                    {fileName ? (
                      isExternalFile
                        ? <a href={document.fileUrl} target="_blank" rel="noreferrer">{t('Open resource')}</a>
                        : <span>{fileName}</span>
                    ) : null}
                  </footer>
                </article>
              );
            })}
          </div>
        ) : null}
      </section>
    </FeatureShell>
  );
}
