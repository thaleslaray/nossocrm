/**
 * @fileoverview Layout Principal da Aplicação
 *
 * Componente de layout que fornece estrutura base para todas as páginas,
 * incluindo sidebar de navegação, header e área de conteúdo.
 *
 * @module components/Layout
 *
 * Recursos de Acessibilidade:
 * - Skip link para navegação por teclado
 * - Navegação com aria-current para página ativa
 * - Ícones decorativos com aria-hidden
 * - Suporte a prefetch em hover/focus
 *
 * @example
 * ```tsx
 * function App() {
 *   return (
 *     <Layout>
 *       <PageContent />
 *     </Layout>
```
 * }
 * ```
 */

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  KanbanSquare,
  Users,
  Settings,
  Sun,
  Moon,
  BarChart3,
  Inbox,
  MessageSquare,
  Sparkles,
  LogOut,
  User,
  Bug,
  CheckSquare,
  PanelLeftClose,
  PanelLeftOpen
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useUIState } from '@/store/uiState';
import { prefetchRoute, RouteName } from '@/lib/prefetch';
import { isDebugMode, enableDebugMode, disableDebugMode } from '@/lib/debug';
import { SkipLink } from '@/lib/a11y';
import { useResponsiveMode } from '@/hooks/useResponsiveMode';
import { BottomNav, MoreMenuSheet, NavigationRail } from '@/components/navigation';
import { useUnreadCount } from '@/lib/query/hooks/useConversationsQuery';

// Lazy load AI Assistant (deprecated - using UIChat now)
// const AIAssistant = lazy(() => import('./AIAssistant'));
import { UIChat } from './ai/UIChat';

import { NotificationPopover } from './notifications/NotificationPopover';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';

/**
 * Props do componente Layout
 * @interface LayoutProps
 * @property {React.ReactNode} children - Conteúdo da página
 */
const PAGE_TITLES: Record<string, string> = {
  '/inbox': 'Inbox',
  '/messaging': 'Mensagens',
  '/dashboard': 'Visão Geral',
  '/boards': 'Boards',
  '/pipeline': 'Boards',
  '/contacts': 'Contatos',
  '/activities': 'Atividades',
  '/decisions': 'Decisões',
  '/reports': 'Relatórios',
  '/settings': 'Configurações',
  '/profile': 'Perfil',
  '/ai': 'Assistente IA',
};

const getPageTitle = (pathname: string): string => {
  // Exact match first
  if (PAGE_TITLES[pathname]) return PAGE_TITLES[pathname];
  // Prefix match (e.g., /settings/ai → Configurações)
  const prefix = Object.keys(PAGE_TITLES).find(key => pathname.startsWith(key + '/'));
  return prefix ? PAGE_TITLES[prefix] : '';
};

interface LayoutProps {
  children: React.ReactNode;
}

/**
 * Item de navegação da sidebar
 *
 * @param props - Props do item de navegação
 * @param props.to - Rota de destino
 * @param props.icon - Componente de ícone Lucide
 * @param props.label - Label exibido
 * @param props.prefetch - Nome da rota para prefetch
 * @param props.clickedPath - Path que foi clicado (para manter highlight durante transição)
 * @param props.onItemClick - Callback quando o item é clicado
 * @param props.badge - Badge count to display
 */
const NavItem = ({
  to,
  icon: Icon,
  label,
  prefetch,
  clickedPath,
  onItemClick,
  badge,
}: {
  to: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  prefetch?: RouteName;
  clickedPath?: string;
  onItemClick?: (path: string) => void;
  badge?: number;
}) => {
  const pathname = usePathname();
  const isActive = pathname === to || (to === '/boards' && pathname === '/pipeline');
  const wasJustClicked = clickedPath === to;

  // If user clicked on a DIFFERENT item, immediately deactivate this one
  // This prevents the delay showing both items as active
  const anotherItemWasClicked = clickedPath && clickedPath !== to;
  const isActuallyActive = anotherItemWasClicked ? false : (isActive || wasJustClicked);

  return (
    <Link
      href={to}
      onMouseEnter={prefetch ? () => prefetchRoute(prefetch) : undefined}
      onFocus={prefetch ? () => prefetchRoute(prefetch) : undefined}
      onClick={() => onItemClick?.(to)}
      className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium focus-visible-ring
    ${isActuallyActive
          ? 'bg-primary-500/10 text-primary-600 dark:text-primary-400 border border-primary-200 dark:border-primary-900/50'
          : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-white'
        }`}
    >
      <div className="relative">
        <Icon size={20} className={isActuallyActive ? 'text-primary-500' : ''} aria-hidden="true" />
        {(badge ?? 0) > 0 && (
          <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] flex items-center justify-center px-1 text-[10px] font-bold text-white bg-red-500 rounded-full shadow-sm">
            {badge! > 99 ? '99+' : badge}
          </span>
        )}
      </div>
      <span className="font-display tracking-wide">{label}</span>
    </Link>
  );
};


/**
 * Layout principal da aplicação
 *
 * Fornece estrutura com sidebar fixa, header responsivo e área de conteúdo.
 * Inclui navegação, controles de tema e acesso ao assistente de IA.
 *
 * @param {LayoutProps} props - Props do componente
 * @returns {JSX.Element} Estrutura de layout completa
 */
const Layout: React.FC<LayoutProps> = ({ children }) => {
  const { darkMode, toggleDarkMode } = useTheme();
  const { isGlobalAIOpen, setIsGlobalAIOpen, sidebarCollapsed, setSidebarCollapsed } = useUIState();
  const { user, loading, profile, signOut } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const { mode } = useResponsiveMode();
  const isMobile = mode === 'mobile';
  const isTablet = mode === 'tablet';
  const isDesktop = mode === 'desktop';
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  // Hydration safety: `isDebugMode()` reads localStorage. On SSR it is always false.
  // Initialize deterministically and sync on mount to avoid hydration mismatch warnings.
  const [debugEnabled, setDebugEnabled] = useState(false);

  // Messaging unread count for notification badge
  const { data: unreadMessagesCount = 0 } = useUnreadCount();

  useEffect(() => {
    setDebugEnabled(isDebugMode());
  }, []);

  // If the user signed out (or session expired), leave protected shell ASAP.
  // This prevents rendering fallbacks like "Usuário" while unauthenticated.
  useEffect(() => {
    if (loading) return;
    if (!user) router.replace('/login');
  }, [loading, user, router]);

  // Expose sidebar width as a global CSS var so modals/overlays can "shrink" on desktop
  // instead of covering the navigation sidebar (works even for portals).
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const width =
      isDesktop ? (sidebarCollapsed ? '5rem' : '16rem')
        : isTablet ? '5rem'
          : '0px';
    document.documentElement.style.setProperty('--app-sidebar-width', width);
  }, [isDesktop, isTablet, sidebarCollapsed]);

  // Cleanup on unmount (e.g. leaving the app shell).
  useEffect(() => {
    return () => {
      if (typeof document === 'undefined') return;
      document.documentElement.style.setProperty('--app-sidebar-width', '0px');
    };
  }, []);

  // Expose bottom nav height so the content can pad itself and avoid being covered.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.style.setProperty('--app-bottom-nav-height', isMobile ? '56px' : '0px');
  }, [isMobile]);

  // Close "More" menu when route changes.
  useEffect(() => {
    setIsMoreOpen(false);
  }, [pathname]);

  // Track the last clicked menu item to maintain highlight during Suspense transitions
  const [clickedPath, setClickedPath] = useState<string | undefined>(undefined);

  // Clear clickedPath only when the clicked route actually becomes active
  React.useEffect(() => {
    if (clickedPath) {
      // Check if the clicked path is now the active route (or its alias)
      const isNowActive = pathname === clickedPath ||
        (clickedPath === '/boards' && pathname === '/pipeline') ||
        (clickedPath === '/pipeline' && pathname === '/boards');

      if (isNowActive) {
        // Route is now active, safe to clear the "clicked" state
        setClickedPath(undefined);
      }
    }
  }, [pathname, clickedPath]);

  const toggleDebugMode = () => {
    if (debugEnabled) {
      disableDebugMode();
      setDebugEnabled(false);
    } else {
      enableDebugMode();
      setDebugEnabled(true);
    }
  };

  // Gera iniciais do email
  const userInitials = profile?.email?.substring(0, 2).toUpperCase() || 'U';

  if (!loading && !user) return null;

  return (
    <div className="flex h-screen overflow-hidden bg-surface-bg bg-dots">
      {/* Skip Link for keyboard users */}
      <SkipLink targetId="main-content" />

      {/* Tablet rail (shows full icon set; no "More" sheet needed) */}
      {isTablet ? <NavigationRail /> : null}

      {/* Sidebar - Collapsible */}
      {isDesktop ? (
      <aside
        className={`hidden md:flex flex-col z-20 glass border-r border-[var(--color-border-subtle)] transition-all duration-300 ease-in-out ${sidebarCollapsed ? 'w-20 items-center' : 'w-64'
          }`}
        aria-label="Menu principal"
      >
        <div className={`h-16 flex items-center border-b border-[var(--color-border-subtle)] transition-all duration-300 px-5 ${sidebarCollapsed ? 'justify-center px-0' : 'justify-between'}`}>
          <div className={`flex items-center transition-all duration-300 ${sidebarCollapsed ? 'gap-0 justify-center' : 'gap-3'}`}>
            <div className="w-9 h-9 bg-gradient-to-br from-primary-500 to-primary-700 rounded-xl flex items-center justify-center text-white font-bold text-lg shadow-lg shadow-primary-500/20 shrink-0" aria-hidden="true">
              N
            </div>
            <span className={`text-xl font-bold font-display tracking-tight text-slate-900 dark:text-white whitespace-nowrap overflow-hidden transition-all duration-300 ${sidebarCollapsed ? 'w-0 opacity-0' : 'w-auto opacity-100'}`}>
              NossoCRM
            </span>
          </div>

          {/* Header Toggle Button - Only visible when expanded */}
          {!sidebarCollapsed && (
            <button
              onClick={() => setSidebarCollapsed(true)}
              className="text-slate-400 hover:text-slate-600 dark:hover:text-white transition-colors p-1 rounded-md hover:bg-slate-100 dark:hover:bg-white/5"
              title="Recolher Menu"
            >
              <PanelLeftClose size={20} />
            </button>
          )}
        </div>

        <nav className={`flex-1 p-4 space-y-2 flex flex-col ${sidebarCollapsed ? 'items-center px-2' : ''}`} aria-label="Navegação do sistema">
          {[
            { to: '/inbox', icon: Inbox, label: 'Inbox', prefetch: 'inbox' as const, badge: undefined },
            { to: '/messaging', icon: MessageSquare, label: 'Mensagens', prefetch: undefined, badge: unreadMessagesCount },
            { to: '/dashboard', icon: LayoutDashboard, label: 'Visão Geral', prefetch: 'dashboard' as const, badge: undefined },
            { to: '/boards', icon: KanbanSquare, label: 'Boards', prefetch: 'boards' as const, badge: undefined },
            { to: '/contacts', icon: Users, label: 'Contatos', prefetch: 'contacts' as const, badge: undefined },
            { to: '/activities', icon: CheckSquare, label: 'Atividades', prefetch: 'activities' as const, badge: undefined },
            { to: '/reports', icon: BarChart3, label: 'Relatórios', prefetch: 'reports' as const, badge: undefined },
            { to: '/settings', icon: Settings, label: 'Configurações', prefetch: 'settings' as const, badge: undefined },
          ].map((item) => {
            if (sidebarCollapsed) {
              return (
                <TooltipProvider key={item.to} delayDuration={200}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Link
                        href={item.to}
                        onMouseEnter={() => item.prefetch && prefetchRoute(item.prefetch)}
                        onClick={() => setClickedPath(item.to)}
                        className={(() => {
                          const isActive = pathname === item.to || (item.to === '/boards' && pathname === '/pipeline');
                          const wasJustClicked = clickedPath === item.to;
                          // If user clicked on a DIFFERENT item, immediately deactivate this one
                          const anotherItemWasClicked = clickedPath && clickedPath !== item.to;
                          const isActuallyActive = anotherItemWasClicked ? false : (isActive || wasJustClicked);
                          return `relative w-10 h-10 rounded-lg flex items-center justify-center ${isActuallyActive
                            ? 'bg-primary-500/10 text-primary-600 dark:text-primary-400 border border-primary-200 dark:border-primary-900/50'
                            : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-white'
                            }`;
                        })()}
                      >
                        <item.icon size={20} />
                        {(item.badge ?? 0) > 0 && (
                          <span className="absolute -top-1 -right-1 min-w-[16px] h-[16px] flex items-center justify-center px-0.5 text-[9px] font-bold text-white bg-red-500 rounded-full shadow-sm">
                            {item.badge! > 99 ? '99+' : item.badge}
                          </span>
                        )}
                      </Link>
                    </TooltipTrigger>
                    <TooltipContent side="right">
                      {item.label}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              );
            }

            return (
              <NavItem
                key={item.to}
                to={item.to}
                icon={item.icon}
                label={item.label}
                prefetch={item.prefetch}
                clickedPath={clickedPath}
                onItemClick={setClickedPath}
                badge={item.badge}
              />
            );
          })}
        </nav>

        {/* Sidebar Toggle Button (Footer) - Only visible when collapsed */}
        {sidebarCollapsed && (
          <div className="px-4 pb-2 flex justify-center">
            <button
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              className="flex items-center justify-center w-10 h-10 p-2 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5 transition-all"
              title="Expandir Menu"
            >
              <PanelLeftOpen size={20} />
            </button>
          </div>
        )}

        <div className={`p-4 border-t border-[var(--color-border-subtle)] ${sidebarCollapsed ? 'flex justify-center' : ''}`}>
          <div className="relative">
            {/* User Card - Clickable */}
            <button
              onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
              className={`flex items-center gap-3 rounded-xl bg-slate-50/50 dark:bg-white/5 border border-slate-100 dark:border-white/5 hover:bg-slate-100 dark:hover:bg-white/10 transition-all group focus-visible-ring ${sidebarCollapsed ? 'p-0 w-10 h-10 justify-center' : 'w-full p-3'
                }`}
            >
              {profile?.avatar_url ? (
                <Image
                  src={profile.avatar_url}
                  alt=""
                  width={40}
                  height={40}
                  className="w-10 h-10 rounded-full object-cover ring-2 ring-white dark:ring-slate-800 shadow-lg"
                  unoptimized
                />
              ) : (
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary-500 to-primary-600 flex items-center justify-center text-white font-bold text-sm ring-2 ring-white dark:ring-slate-800 shadow-lg shrink-0" aria-hidden="true">
                  {profile?.first_name && profile?.last_name
                    ? `${profile.first_name[0]}${profile.last_name[0]}`.toUpperCase()
                    : profile?.nickname?.substring(0, 2).toUpperCase() || userInitials}
                </div>
              )}

              {!sidebarCollapsed && (
                <>
                  <div className="flex-1 min-w-0 text-left">
                    <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                      {profile?.nickname || profile?.first_name || profile?.email?.split('@')[0] || 'Usuário'}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                      {profile?.email || ''}
                    </p>
                  </div>
                  <svg
                    className={`w-4 h-4 text-slate-400 transition-transform ${isUserMenuOpen ? 'rotate-180' : ''}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    aria-hidden="true"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                  </svg>
                </>
              )}
            </button>

            {/* Dropdown Menu */}
            {isUserMenuOpen && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setIsUserMenuOpen(false)}
                  aria-hidden="true"
                />
                <div
                  className={`absolute bottom-full mb-2 z-50 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 overflow-hidden animate-in slide-in-from-bottom-2 fade-in duration-150 ${sidebarCollapsed ? 'left-0 w-48' : 'left-0 right-0'}`}
                >
                  <div className="p-1">
                    <Link
                      href="/profile"
                      onClick={() => setIsUserMenuOpen(false)}
                      className="flex items-center gap-3 px-3 py-2.5 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/50 rounded-lg transition-colors focus-visible-ring"
                    >
                      <User className="w-4 h-4 text-slate-400" />
                      Editar Perfil
                    </Link>
                    <button
                      onClick={() => {
                        setIsUserMenuOpen(false);
                        signOut();
                      }}
                      className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors focus-visible-ring"
                    >
                      <LogOut className="w-4 h-4" />
                      Sair da conta
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </aside>
      ) : null}

      {/* Main Content Wrapper */}
      <div className="flex-1 flex min-w-0 overflow-hidden relative">
        {/* Middle Content (Header + Page) */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
          {/* Ambient background glow */}
          <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none" aria-hidden="true">
            <div className="absolute -top-[20%] -left-[10%] w-[50%] h-[50%] bg-primary-500/10 rounded-full blur-[100px]"></div>
            <div className="absolute top-[40%] right-[0%] w-[40%] h-[40%] bg-purple-500/10 rounded-full blur-[100px]"></div>
          </div>

          {/* Header */}
          <header className="h-16 glass border-b border-[var(--color-border-subtle)] flex items-center justify-between px-6 z-40 shrink-0" role="banner">
            <h1 className="text-lg font-semibold font-display text-slate-900 dark:text-white">
              {getPageTitle(pathname)}
            </h1>
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={() => setIsGlobalAIOpen(!isGlobalAIOpen)}
                className={`p-2 rounded-full transition-all active:scale-95 focus-visible-ring ${isGlobalAIOpen
                  ? 'text-primary-600 bg-primary-50 dark:text-primary-400 dark:bg-primary-900/20'
                  : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10'
                  }`}
              >
                <Sparkles size={20} aria-hidden="true" />
              </button>

              {process.env.NODE_ENV === 'development' && (
                <button
                  type="button"
                  onClick={toggleDebugMode}
                  className={`p-2 rounded-full transition-all active:scale-95 focus-visible-ring ${debugEnabled
                    ? 'text-purple-600 bg-purple-100 dark:text-purple-400 dark:bg-purple-900/30 ring-2 ring-purple-400/50'
                    : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10'
                    }`}
                >
                  <Bug size={20} aria-hidden="true" />
                </button>
              )}

              <NotificationPopover />
              <button
                type="button"
                onClick={toggleDarkMode}
                className="p-2 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10 rounded-full transition-all active:scale-95 focus-visible-ring"
              >
                {darkMode ? <Sun size={20} aria-hidden="true" /> : <Moon size={20} aria-hidden="true" />}
              </button>
            </div>
          </header>

          <main
            id="main-content"
            className={`flex-1 overflow-auto relative scroll-smooth ${
              pathname === '/messaging' || pathname.startsWith('/messaging/')
                ? 'p-0'
                : 'p-6 pb-[calc(1.5rem+var(--app-bottom-nav-height,0px)+var(--app-safe-area-bottom,0px))]'
            }`}
            tabIndex={-1}
          >
            {children}
          </main>
        </div>

        {/* Right Sidebar (AI Assistant) */}
        <aside
          aria-label="Assistente de IA"
          aria-hidden={!isGlobalAIOpen}
          className={`border-l border-[var(--color-border)] bg-surface transition-all duration-300 ease-in-out overflow-hidden flex flex-col ${isGlobalAIOpen ? 'w-96 opacity-100' : 'w-0 opacity-0'}`}
        >
          <div className="w-96 h-full">
            {isGlobalAIOpen && (
              <UIChat />
            )}
          </div>
        </aside>
      </div>

      {/* Mobile app shell */}
      <BottomNav onOpenMore={() => setIsMoreOpen(true)} />
      <MoreMenuSheet isOpen={isMoreOpen} onClose={() => setIsMoreOpen(false)} />
    </div>
  );
};

export default Layout;
