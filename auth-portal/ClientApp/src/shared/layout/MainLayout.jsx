import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { animate, stagger } from 'animejs';
import { useAuth } from '../auth/AuthContext';
import { normalizeRole } from '../lib/roles';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';

export function MainLayout({ children }) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const role = normalizeRole(user?.userType);
  const [menuOpen, setMenuOpen] = useState(false);
  const contentRef = useRef(null);

  useEffect(() => {
    const items = contentRef.current?.querySelectorAll(':scope > *');
    if (!items?.length || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;
    const entrance = animate(items, {
      opacity: [0, 1],
      translateY: [14, 0],
      duration: 520,
      delay: stagger(65),
      ease: 'outCubic',
    });
    return () => entrance.revert();
  }, [pathname]);

  return (
    <div className={`main-layout${menuOpen ? ' menu-open' : ''}`}>
      <Sidebar
        role={role}
        user={user}
        onLogout={() => {
          signOut();
          setMenuOpen(false);
          navigate(`/${role}/login`);
        }}
        onNavigate={() => setMenuOpen(false)}
      />
      <div className="main-content">
        <Topbar role={role} user={user} onMenuToggle={() => setMenuOpen((open) => !open)} menuOpen={menuOpen} />
        {menuOpen && <button className="mobile-nav-backdrop" aria-label="Close navigation menu" onClick={() => setMenuOpen(false)} />}
        <main className="content-area" ref={contentRef}>{children}</main>
      </div>
    </div>
  );
}
