'use client';

import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, CheckCircle2, Loader2, ExternalLink, Sparkles, Pause, Info, RefreshCw } from 'lucide-react';
import { AnimatePresence, motion, useMotionValue, useSpring } from 'framer-motion';
import {
  loadInstallState,
  saveInstallState,
  clearInstallState,
  createInstallState,
  updateStepStatus,
  canResumeInstallation,
  getProgressSummary,
  type InstallState,
} from '@/lib/installer/installState';
import { validateInstallerPassword } from '@/lib/installer/passwordPolicy';

// Types
type InstallerMeta = { enabled: boolean; requiresToken: boolean };
type ProjectInfo = { id: string; name: string; teamId?: string; url?: string };
type SupabaseProjectOption = {
  ref: string;
  name: string;
  region?: string;
  status?: string;
  supabaseUrl: string;
  organizationSlug?: string;
};
type SupabaseOrgOption = { slug: string; name: string; id?: string; plan?: string };
type Step = { id: string; status: 'ok' | 'error' | 'warning' | 'running'; message?: string };
type FunctionResult =
  | { slug: string; ok: true; response: unknown }
  | { slug: string; ok: false; error: string; status?: number; response?: unknown };
type RunResult = { ok: boolean; steps: Step[]; functions?: FunctionResult[]; error?: string };

type PreflightOrg = {
  slug: string;
  name: string;
  plan?: string;
  activeCount: number;
  activeProjects: SupabaseProjectOption[];
};

// Constants & Helpers
const STORAGE_TOKEN = 'crm_install_token';
const STORAGE_PROJECT = 'crm_install_project';
const STORAGE_INSTALLER_TOKEN = 'crm_install_installer_token';
const STORAGE_USER_NAME = 'crm_install_user_name';
const STORAGE_USER_EMAIL = 'crm_install_user_email';
const STORAGE_USER_PASS_HASH = 'crm_install_user_pass_hash';
const STORAGE_SUPABASE_TOKEN = 'crm_install_supabase_token';
const STORAGE_VERCEL_DEPLOYMENT_ID = 'crm_install_vercel_deployment_id';

const STEP_LABELS: Record<string, string> = {
  resolve_keys: 'Conectando ao Supabase',
  setup_envs: 'Configurando variáveis na Vercel',
  wait_project: 'Aguardando Supabase ficar ativo',
  wait_storage: 'Aguardando Storage do Supabase',
  migrations: 'Aplicando estrutura do banco (migrations)',
  edge_secrets: 'Configurando funções (segredos)',
  edge_deploy: 'Publicando funções (edge)',
  bootstrap: 'Criando usuário administrador',
  redeploy: 'Iniciando redeploy na Vercel',
  wait_vercel_deploy: 'Aguardando redeploy na Vercel (etapa final)',
};

async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password + '_crm_salt_2024');
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

function generateStrongPassword(length = 20) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*_-+=';
  const bytes = new Uint8Array(Math.max(12, Math.min(64, length)));
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => chars[b % chars.length]).join('');
}

function suggestProjectName(existingNames: string[]) {
  const base = 'nossocrm';
  const lower = new Set(existingNames.map((n) => (n || '').toLowerCase().trim()).filter(Boolean));
  if (!lower.has(base)) return base;
  for (let i = 2; i < 50; i++) {
    const candidate = `${base}v${i}`;
    if (!lower.has(candidate)) return candidate;
  }
  return `${base}v${Math.floor(Date.now() / 1000)}`;
}

function humanizeError(message: string) {
  const lower = String(message || '').toLowerCase();
  if (lower.includes('maximum limits') || lower.includes('2 project limit') || lower.includes('limit of 2 active projects')) {
    return 'Limite do plano Free atingido. Pause um projeto existente para continuar.';
  }
  return message;
}

function isSupabaseFreeGlobalLimitError(message: string) {
  const lower = String(message || '').toLowerCase();
  return (
    lower.includes('2 project limit') ||
    lower.includes('maximum limits') ||
    lower.includes('limit of 2 active projects')
  );
}

function buildDbUrl(projectRef: string, dbPassword: string, region?: string) {
  // Usa o pooler regional do Supabase que é mais confiável que db.xxx.supabase.co
  // O user precisa incluir o projectRef: postgres.projectRef
  const regionSlug = region || 'us-east-1';
  const poolerHost = `aws-0-${regionSlug}.pooler.supabase.com`;
  return `postgresql://postgres.${projectRef}:${encodeURIComponent(dbPassword)}@${poolerHost}:6543/postgres?sslmode=require`;
}

function inferProjectRef(url: string): string | null {
  try {
    const host = new URL(url).hostname.toLowerCase();
    const m = host.match(/^([a-z0-9-]+)\.supabase\.(co|in)$/i);
    return m?.[1] || null;
    } catch {
      return null;
    }
}

// Mapeia fases do stream para step IDs do installState
const PHASE_TO_STEP: Record<string, string> = {
  coordinates: 'health_check',
  signal: 'resolve_keys',
  station: 'migrations',
  comms: 'edge_functions',
  contact: 'bootstrap',
  landing: 'redeploy',
};


export default function InstallWizardPage() {
  const router = useRouter();
  
  // Meta & Hydration
  const [meta, setMeta] = useState<InstallerMeta | null>(null);
  const [metaError, setMetaError] = useState<string | null>(null);
  const [isHydrated, setIsHydrated] = useState(false);
  
  // Vercel
  const [installerToken, setInstallerToken] = useState('');
  const [vercelToken, setVercelToken] = useState('');
  const [project, setProject] = useState<ProjectInfo | null>(null);

  // Supabase
  const [supabaseAccessToken, setSupabaseAccessToken] = useState('');
  const [supabaseUrl, setSupabaseUrl] = useState('');
  const [supabaseAnonKey, setSupabaseAnonKey] = useState('');
  const [supabaseServiceKey, setSupabaseServiceKey] = useState('');
  const [supabaseDbUrl, setSupabaseDbUrl] = useState('');
  const [supabaseRegion, setSupabaseRegion] = useState<string | null>(null);
  const [supabaseProjectRef, setSupabaseProjectRef] = useState('');
  const [supabaseDeployEdgeFunctions] = useState(true);
  const [supabaseCreateDbPass, setSupabaseCreateDbPass] = useState('');
  
  // Supabase UI state
  const [supabaseOrgs, setSupabaseOrgs] = useState<SupabaseOrgOption[]>([]);
  const [supabaseOrgsLoading, setSupabaseOrgsLoading] = useState(false);
  const [supabaseOrgsError, setSupabaseOrgsError] = useState<string | null>(null);
  const [supabaseCreating, setSupabaseCreating] = useState(false);
  const [supabaseCreateError, setSupabaseCreateError] = useState<string | null>(null);
  const [supabaseProvisioning, setSupabaseProvisioning] = useState(false);
  const [supabaseProvisioningStatus, setSupabaseProvisioningStatus] = useState<string | null>(null);
  const [supabaseResolving, setSupabaseResolving] = useState(false);
  const [pausePolling, setPausePolling] = useState(false);
  const [pauseStartedAt, setPauseStartedAt] = useState<number | null>(null);
  const [pauseAttempts, setPauseAttempts] = useState(0);
  const [pauseLastStatus, setPauseLastStatus] = useState('');
  const [supabaseResolveError, setSupabaseResolveError] = useState<string | null>(null);
  const [supabaseResolvedOk, setSupabaseResolvedOk] = useState(false);
  const [supabasePausingRef, setSupabasePausingRef] = useState<string | null>(null);
  const [needSpaceReason, setNeedSpaceReason] = useState<'global_limit' | 'no_slot' | null>(null);
  const orgProjectNamesCacheRef = useRef<Record<string, string[]>>({});
  
  // Preflight
  const [supabasePreflight, setSupabasePreflight] = useState<{
    freeGlobalLimitHit: boolean;
    suggestedOrganizationSlug: string | null;
    organizations: PreflightOrg[];
  } | null>(null);
  const [supabasePreflightLoading, setSupabasePreflightLoading] = useState(false);
  
  // Timers
  const provisioningTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const provisioningTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resolveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resolveAttemptsRef = useRef(0);
  
  // Admin (carregado do localStorage - coletado no /install/start)
  const [userName, setUserName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');

  // Trocar senha (garante compatibilidade com policy nova + evita travar no login)
  const [showChangePasswordModal, setShowChangePasswordModal] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [newPasswordConfirm, setNewPasswordConfirm] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [changePasswordError, setChangePasswordError] = useState<string | null>(null);
  
  // Primeiro nome para personalização
  const firstName = useMemo(() => userName.split(' ')[0] || 'você', [userName]);
  
  // Mensagens cinematográficas para provisioning (estilo Interstellar)
  const provisioningMessages = useMemo(() => [
    { title: 'Calibrando coordenadas', subtitle: 'Definindo rota para o novo mundo...' },
    { title: 'Estabelecendo conexão', subtitle: 'Abrindo canal de comunicação...' },
    { title: 'Construindo infraestrutura', subtitle: 'Montando a estação orbital...' },
    { title: 'Ativando sistemas', subtitle: 'Inicializando núcleo de dados...' },
    { title: 'Sincronizando órbita', subtitle: 'Alinhando com a base de operações...' },
    { title: 'Verificando integridade', subtitle: 'Checando sistemas de segurança...' },
    { title: 'Preparando pouso', subtitle: 'Quase lá, comandante...' },
  ], []);
  
  // Estado para mensagem atual de provisioning
  const [provisioningMsgIndex, setProvisioningMsgIndex] = useState(0);
  const [provisioningProgress, setProvisioningProgress] = useState(0);
  const [provisioningStartTime, setProvisioningStartTime] = useState<number | null>(null);
  
  // Efeito para rotacionar mensagens durante provisioning
  useEffect(() => {
    if (!supabaseProvisioning) {
      setProvisioningMsgIndex(0);
      setProvisioningProgress(0);
      setProvisioningStartTime(null);
      return;
    }
    
    if (!provisioningStartTime) {
      setProvisioningStartTime(Date.now());
    }
    
    // Rotaciona mensagens a cada 12 segundos
    const msgInterval = setInterval(() => {
      setProvisioningMsgIndex((i) => (i + 1) % provisioningMessages.length);
    }, 12000);
    
    // Atualiza progresso baseado no tempo (estimativa de 100s)
    const progressInterval = setInterval(() => {
      if (provisioningStartTime) {
        const elapsed = (Date.now() - provisioningStartTime) / 1000;
        const progress = Math.min(95, (elapsed / 100) * 100);
        setProvisioningProgress(progress);
      }
    }, 500);
    
    return () => {
      clearInterval(msgInterval);
      clearInterval(progressInterval);
    };
  }, [supabaseProvisioning, provisioningStartTime, provisioningMessages.length]);
  
  // Wizard - começa no passo 1 (Supabase), pois Vercel já foi validada no /install/start
  const [currentStep, setCurrentStep] = useState(1);
  const [supabaseUiStep, setSupabaseUiStep] = useState<'pat' | 'deciding' | 'needspace' | 'creating' | 'done'>('pat');
  
  // Install
  const [installing, setInstalling] = useState(false);
  const [result, setResult] = useState<RunResult | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [showInstallOverlay, setShowInstallOverlay] = useState(false);
  const [cinePhase, setCinePhase] = useState<'preparing' | 'running' | 'success' | 'error'>('preparing');
  const [cineMessage, setCineMessage] = useState('Preparando a decolagem…');
  const [cineSubtitle, setCineSubtitle] = useState('');
  const [cineProgress, setCineProgress] = useState(0);
  const [cineStepLabel, setCineStepLabel] = useState<string>('');
  const [vercelDeploymentId, setVercelDeploymentId] = useState<string | null>(null);
  const [finalizing, setFinalizing] = useState(false);
  
  // Estado persistente para instalação resumível
  const [installState, setInstallState] = useState<InstallState | null>(null);
  const [showResumeModal, setShowResumeModal] = useState(false);
  const installStateRef = useRef<InstallState | null>(null);

  const commitInstallState = (next: InstallState | null) => {
    setInstallState(next);
    installStateRef.current = next;
    if (next) saveInstallState(next);
  };

  
  // Parallax
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const mxSpring = useSpring(mx, { stiffness: 120, damping: 30, mass: 0.6 });
  const mySpring = useSpring(my, { stiffness: 120, damping: 30, mass: 0.6 });

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    mx.set(((e.clientX - rect.left) / rect.width - 0.5) * 14);
    my.set(((e.clientY - rect.top) / rect.height - 0.5) * 10);
  };

  const sceneVariants = {
    initial: { opacity: 0, y: 20, filter: 'blur(8px)' },
    animate: { opacity: 1, y: 0, filter: 'blur(0px)' },
    exit: { opacity: 0, y: -10, filter: 'blur(6px)' },
  };
  const sceneTransition = { type: 'tween' as const, ease: [0.22, 1, 0.36, 1] as [number, number, number, number], duration: 0.4 };
  
  // Derived state
  const vercelReady = Boolean(vercelToken.trim() && project?.id);
  const supabaseReady = Boolean(supabaseUrl.trim() && supabaseResolvedOk && !supabaseProvisioning);
  // Admin já foi coletado no /install/start - userName serve como "companyName"
  const adminReady = Boolean(userName.trim() && adminEmail.trim() && validateInstallerPassword(adminPassword).ok);
  const canInstall = Boolean(meta?.enabled && vercelReady && supabaseReady && adminReady);
  
  const allFreeActiveProjects = useMemo(() => {
    const orgs = supabasePreflight?.organizations || [];
    const all: (SupabaseProjectOption & { orgName: string })[] = [];
    for (const o of orgs) {
      if ((o.plan || '').toLowerCase() !== 'free') continue;
      for (const p of o.activeProjects || []) {
        all.push({ ...p, orgName: o.name });
      }
    }
    return all;
  }, [supabasePreflight]);
  
  // Verifica se a instância já está inicializada (bloqueia acesso após instalação)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/installer/check-initialized', { cache: 'no-store' });
        const data = await res.json();
        if (!cancelled && data?.initialized === true) {
          // Instância já inicializada: redireciona para dashboard
          router.replace('/dashboard');
          return;
        }
      } catch (err) {
        // Fail-safe: em caso de erro, não bloqueia o acesso ao wizard
        console.warn('[wizard] Error checking initialization:', err);
      }
    })();
    return () => { cancelled = true; };
  }, [router]);

  // Effects
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/installer/meta');
        const data = await res.json();
        if (!cancelled) setMeta(data);

        // Se o instalador estiver desabilitado, tenta "auto-unlock" usando o token da Vercel já salvo
        if (!cancelled && data && data.enabled === false) {
          const savedToken = localStorage.getItem(STORAGE_TOKEN);
          const savedProject = localStorage.getItem(STORAGE_PROJECT);
          if (savedToken && savedProject) {
            try {
              const p = JSON.parse(savedProject) as { id: string; teamId?: string };
              console.warn('[wizard] Installer disabled. Attempting auto-unlock...');
              await fetch('/api/installer/unlock', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                  vercel: { token: savedToken.trim(), projectId: p.id, teamId: p.teamId },
                }),
              });
              // Recarrega meta após unlock
              const res2 = await fetch('/api/installer/meta');
              const data2 = await res2.json();
              if (!cancelled) setMeta(data2);
            } catch (unlockErr) {
              console.error('[wizard] Auto-unlock failed:', unlockErr);
            }
          }
        }
      } catch (err) {
        if (!cancelled) setMetaError(err instanceof Error ? err.message : 'Erro ao carregar');
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const savedToken = localStorage.getItem(STORAGE_TOKEN);
    const savedProject = localStorage.getItem(STORAGE_PROJECT);
    const savedInstallerToken = localStorage.getItem(STORAGE_INSTALLER_TOKEN);
    const savedUserName = localStorage.getItem(STORAGE_USER_NAME);
    const savedUserEmail = localStorage.getItem(STORAGE_USER_EMAIL);
    const savedSupabaseToken = localStorage.getItem(STORAGE_SUPABASE_TOKEN);

    // Precisa ter completado o /install/start
    if (!savedToken || !savedProject || !savedUserName || !savedUserEmail) {
      router.replace('/install/start');
      return;
    }

    try {
      setVercelToken(savedToken);
      setProject(JSON.parse(savedProject));
      if (savedInstallerToken) setInstallerToken(savedInstallerToken);
      
      // Dados do usuário (coletados no /install/start)
      setUserName(savedUserName);
      setAdminEmail(savedUserEmail);
      // A senha real é recuperada do sessionStorage ou pedimos de novo
      const sessionPass = sessionStorage.getItem('crm_install_user_pass');
      if (sessionPass) setAdminPassword(sessionPass);
      
      // Se já tem token Supabase, preenche e auto-avança
      if (savedSupabaseToken) {
        setSupabaseAccessToken(savedSupabaseToken);
      }
      
      // Verifica se há instalação em andamento que pode ser resumida
      const savedInstallState = loadInstallState();
      if (savedInstallState && canResumeInstallation(savedInstallState)) {
        // Se o estado está "resumível" mas não tem progresso real, evita ferrar a UX com modal 0%
        const summary = getProgressSummary(savedInstallState);
        const hasRealProgress =
          Boolean(summary.currentStepName) || (typeof summary.percentage === 'number' && summary.percentage > 0);

        if (!hasRealProgress) {
          console.warn('[wizard] Ignoring empty resumable installState (0%). Clearing.');
          clearInstallState();
        } else {
          commitInstallState(savedInstallState);
        setShowResumeModal(true);
        console.log('[wizard] Found resumable installation:', summary);
        }
      }
      
      setIsHydrated(true);
    } catch {
      router.replace('/install/start');
    }
  }, [router]);

  useEffect(() => {
    installStateRef.current = installState;
  }, [installState]);

  useEffect(() => {
    if (installerToken.trim()) localStorage.setItem(STORAGE_INSTALLER_TOKEN, installerToken.trim());
  }, [installerToken]);

  useEffect(() => {
    if (!supabaseCreateDbPass) setSupabaseCreateDbPass(generateStrongPassword(20));
  }, [supabaseCreateDbPass]);

  useEffect(() => {
    setSupabaseOrgs([]);
    setSupabaseOrgsError(null);
    setSupabaseUrl('');
    setSupabaseProjectRef('');
    setSupabaseRegion(null);
    setSupabaseResolvedOk(false);
    setSupabaseResolveError(null);
    setSupabaseUiStep('pat');
    setSupabasePreflight(null);
    setSupabaseCreateError(null);
  }, [supabaseAccessToken]);

  useEffect(() => {
    if (supabaseUiStep !== 'pat') return;
    const pat = supabaseAccessToken.trim();
    if (!/^sbp_[A-Za-z0-9_-]{20,}$/.test(pat)) return;
    if (supabaseOrgsLoading || supabaseOrgs.length > 0 || supabaseOrgsError) return;
    
    const handle = setTimeout(() => void loadOrgsAndDecide(), 400);
    return () => clearTimeout(handle);
  }, [supabaseUiStep, supabaseAccessToken, supabaseOrgsLoading, supabaseOrgs.length, supabaseOrgsError]);
  
  useEffect(() => {
    if (!supabaseAccessToken.trim() || !supabaseUrl.trim()) return;
    if (supabaseResolving || supabaseResolvedOk || supabaseResolveError) return;
    // Não dispara resolve enquanto o projeto ainda está provisionando
    if (supabaseProvisioning) return;
    
    if (resolveTimerRef.current) clearTimeout(resolveTimerRef.current);
    resolveTimerRef.current = setTimeout(() => void resolveKeys('auto'), 600);
    
    return () => { if (resolveTimerRef.current) clearTimeout(resolveTimerRef.current); };
  }, [supabaseAccessToken, supabaseUrl, supabaseResolving, supabaseResolvedOk, supabaseResolveError, supabaseProvisioning]);
  
  // API Functions
  const loadOrgsAndDecide = async () => {
    if (supabaseOrgsLoading || supabasePreflightLoading) return;
    setSupabaseOrgsError(null);
    setSupabaseOrgsLoading(true);
    setSupabasePreflightLoading(true);
    setSupabaseUiStep('deciding');
    
    try {
      const orgsRes = await fetch('/api/installer/supabase/organizations', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ installerToken: installerToken.trim() || undefined, accessToken: supabaseAccessToken.trim() }),
      });
      const orgsData = await orgsRes.json();
      if (!orgsRes.ok) throw new Error(orgsData?.error || 'Erro');
      const orgs = (orgsData?.organizations || []) as SupabaseOrgOption[];
      setSupabaseOrgs(orgs);
      
      const preflightRes = await fetch('/api/installer/supabase/preflight', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ installerToken: installerToken.trim() || undefined, accessToken: supabaseAccessToken.trim() }),
      });
      const preflightData = await preflightRes.json();
      if (!preflightRes.ok) throw new Error(preflightData?.error || 'Erro');
      
      const preflight = {
        freeGlobalLimitHit: Boolean(preflightData?.freeGlobalLimitHit),
        suggestedOrganizationSlug: preflightData?.suggestedOrganizationSlug || null,
        organizations: (preflightData?.organizations || []) as PreflightOrg[],
      };
      setSupabasePreflight(preflight);
      
      await decideAndCreate(orgs, preflight);
      
    } catch (err) {
      setSupabaseOrgsError(err instanceof Error ? err.message : 'Erro');
      setSupabaseUiStep('pat');
    } finally {
      setSupabaseOrgsLoading(false);
      setSupabasePreflightLoading(false);
    }
  };
  
  const decideAndCreate = async (orgs: SupabaseOrgOption[], preflight: typeof supabasePreflight) => {
    if (!preflight) return;
    
    console.log('🔍 [SUPABASE] Preflight:', JSON.stringify(preflight, null, 2));
    
    const paidOrg = preflight.organizations.find((o) => (o.plan || '').toLowerCase() !== 'free');
    if (paidOrg) {
      console.log('💰 [SUPABASE] Usando org PAGA:', paidOrg.slug);
      setNeedSpaceReason(null);
      await createProjectInOrg(paidOrg.slug, paidOrg.activeProjects.map((p) => p.name));
      return;
    }

    // Em contas FREE, o limite pode ser GLOBAL por usuário (não por organização).
    // Se o preflight indicar que o usuário já atingiu o limite global, não tente criar projeto.
    if (preflight.freeGlobalLimitHit) {
      console.log('🚫 [SUPABASE] Limite global FREE atingido (usuário). Indo para needspace.');
      setNeedSpaceReason('global_limit');
      setSupabaseUiStep('needspace');
      return;
    }
    
    const freeOrgWithSlot = preflight.organizations.find(
      (o) => (o.plan || '').toLowerCase() === 'free' && o.activeCount < 2
    );
    if (freeOrgWithSlot) {
      console.log('🆓 [SUPABASE] Usando org FREE com slot:', freeOrgWithSlot.slug, '- Projetos ativos:', freeOrgWithSlot.activeCount);
      setNeedSpaceReason(null);
      await createProjectInOrg(freeOrgWithSlot.slug, freeOrgWithSlot.activeProjects.map((p) => p.name));
      return;
    }
    
    console.log('🚫 [SUPABASE] Sem slots disponíveis');
    setNeedSpaceReason('no_slot');
    setSupabaseUiStep('needspace');
  };
  
  const createProjectInOrg = async (orgSlug: string, existingNames: string[]) => {
    if (supabaseCreating) return;
    setSupabaseCreateError(null);
    setSupabaseCreating(true);
    setNeedSpaceReason(null);
    // Pula direto para 'done' (tela de provisioning cinematográfica) - não mostra 'creating'
    setSupabaseUiStep('done');
    setSupabaseProvisioning(true);
    setSupabaseProvisioningStatus('PREPARING');

    const createStart = Date.now();

    try {
      const names = new Set(existingNames);

      // Pré-carrega nomes já existentes (inclui INACTIVE) para evitar cascata de 409.
      if (!orgProjectNamesCacheRef.current[orgSlug]) {
        try {
          const orgProjectsRes = await fetch('/api/installer/supabase/organization-projects', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              installerToken: installerToken.trim() || undefined,
              accessToken: supabaseAccessToken.trim(),
              organizationSlug: orgSlug,
            }),
          });
          const orgProjectsData = await orgProjectsRes.json().catch(() => null);
          if (orgProjectsRes.ok) {
            const allNames = Array.isArray(orgProjectsData?.projects)
              ? (orgProjectsData.projects as any[])
                  .map((p) => (typeof p?.name === 'string' ? p.name.trim() : ''))
                  .filter(Boolean)
              : [];
            orgProjectNamesCacheRef.current[orgSlug] = allNames;
          } else {
            orgProjectNamesCacheRef.current[orgSlug] = [];
            console.warn('[SUPABASE] Failed to list org projects for name seeding:', orgProjectsData?.error);
          }
        } catch {
          orgProjectNamesCacheRef.current[orgSlug] = [];
        }
      }

      for (const n of orgProjectNamesCacheRef.current[orgSlug] || []) {
        names.add(n);
      }
      let ref = '';
      let url = '';
      let lastErr = '';

      for (let attempt = 0; attempt < 30; attempt++) {
        const projectName = suggestProjectName(Array.from(names));

        console.log('🚀 [SUPABASE] Criando projeto:', projectName, 'na org:', orgSlug);
        console.log('⏱️ [SUPABASE] Início:', new Date().toLocaleTimeString());

        const res = await fetch('/api/installer/supabase/create-project', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            installerToken: installerToken.trim() || undefined,
            accessToken: supabaseAccessToken.trim(),
            organizationSlug: orgSlug,
            name: projectName,
            dbPass: supabaseCreateDbPass,
            regionSmartGroup: 'americas',
          }),
        });

        const data = await res.json().catch(() => ({}));

        console.log('📦 [SUPABASE] Resposta create-project:', JSON.stringify(data));
        console.log('⏱️ [SUPABASE] create-project levou:', ((Date.now() - createStart) / 1000).toFixed(1), 'segundos');

        if (res.ok) {
          ref = String(data?.projectRef || '');
          url = String(data?.supabaseUrl || '');
          break;
        }

        lastErr = String(data?.error || data?.details?.message || 'Erro');

        // Nome já existe: tenta automaticamente o próximo (nossocrm -> nossocrmv2 -> ...)
        if (res.status === 409 && String(data?.code || '') === 'PROJECT_EXISTS') {
          const existingName = String(data?.existingProject?.name || '').trim();
          if (existingName) names.add(existingName);
          names.add(projectName);
          continue;
        }

        if (lastErr.toLowerCase().includes('already exists')) {
          names.add(projectName);
          continue;
        }

        throw new Error(lastErr);
      }

      if (!ref) throw new Error(lastErr || 'Erro');

      setSupabaseProjectRef(ref);
      setSupabaseUrl(url || `https://${ref}.supabase.co`);
      setSupabaseDbUrl(buildDbUrl(ref, supabaseCreateDbPass, 'us-east-1'));

      setSupabaseProvisioning(true);
      setSupabaseProvisioningStatus('COMING_UP');

      let pollCount = 0;
      const poll = async () => {
        pollCount++;
        try {
          const st = await fetch('/api/installer/supabase/project-status', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              installerToken: installerToken.trim() || undefined,
              accessToken: supabaseAccessToken.trim(),
              projectRef: ref,
            }),
          });
          const stData = await st.json().catch(() => null);
          const status = stData?.status || '';
          setSupabaseProvisioningStatus(status);

          console.log(`📊 [SUPABASE] Poll #${pollCount}: ${status} (${((Date.now() - createStart) / 1000).toFixed(0)}s)`);

          if (status.toUpperCase().startsWith('ACTIVE')) {
            const totalTime = ((Date.now() - createStart) / 1000).toFixed(1);
            console.log('✅ [SUPABASE] Projeto ATIVO!');
            console.log('⏱️ [SUPABASE] TEMPO TOTAL:', totalTime, 'segundos');

            setSupabaseProvisioning(false);
            if (provisioningTimerRef.current) clearInterval(provisioningTimerRef.current);
            if (provisioningTimeoutRef.current) clearTimeout(provisioningTimeoutRef.current);
            setSupabaseUiStep('done');
            void resolveKeys('auto');
          }
        } catch {}
      };

      void poll();
      provisioningTimerRef.current = setInterval(poll, 4000);
      provisioningTimeoutRef.current = setTimeout(() => {
        setSupabaseProvisioning(false);
        setSupabaseResolveError('Projeto ainda está subindo. Aguarde.');
        if (provisioningTimerRef.current) clearInterval(provisioningTimerRef.current);
      }, 210_000);
    } catch (err) {
      console.error('❌ [SUPABASE] Erro:', err);
      const rawMsg = err instanceof Error ? err.message : 'Erro';
      if (isSupabaseFreeGlobalLimitError(rawMsg)) {
        setNeedSpaceReason('global_limit');
      }
      setSupabaseCreateError(humanizeError(rawMsg));
      setSupabaseUiStep('needspace');
    } finally {
      setSupabaseCreating(false);
    }

  };
  
  const fetchProjectStatus = async (projectRef: string): Promise<{ rawStatus: string; normalized: string }> => {
    const res = await fetch('/api/installer/supabase/project-status', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        installerToken: installerToken.trim() || undefined,
        accessToken: supabaseAccessToken.trim(),
        projectRef,
      }),
    });
    const data = await res.json().catch(() => null);
    const rawStatus = String(data?.status ?? '').trim();
    const normalized = rawStatus.toUpperCase();
    return { rawStatus, normalized };
  };

  const isPausedProjectStatus = (normalized: string) => {
    // Docs confirm INACTIVE; in practice we may see variants or "PAUSED"
    return (
      normalized === 'INACTIVE' ||
      normalized.startsWith('INACTIVE') ||
      normalized === 'PAUSED' ||
      normalized.includes('PAUSED')
    );
  };

  const pollProjectStatus = async (
    projectRef: string,
    mode: 'pause' | 'pausing'
  ): Promise<{ finalStatus: string; paused: boolean }> => {
    const maxMs = 180_000; // 3min (pausar pode demorar)
    const intervalMs = 2000;
    const maxAttempts = Math.ceil(maxMs / intervalMs);

    let attempts = 0;
    while (attempts < maxAttempts) {
      try {
        const { rawStatus, normalized } = await fetchProjectStatus(projectRef);
        console.log(`[pollProjectStatus:${mode}] Attempt ${attempts + 1}: status = ${rawStatus || '(null)'}`);
        setPauseAttempts(attempts + 1);
        setPauseLastStatus(rawStatus || '');

        const paused = isPausedProjectStatus(normalized);
        if (paused) return { finalStatus: 'INACTIVE', paused: true };

        const isPausing = normalized.includes('PAUSING');
        if (mode === 'pausing' && !isPausing) {
          // Saiu de PAUSING pra outro estado (ex: ACTIVE_HEALTHY). Destrava UI.
          return { finalStatus: normalized || 'UNKNOWN', paused: false };
        }
      } catch (err) {
        console.error(`[pollProjectStatus:${mode}] Error:`, err);
      }

      attempts++;
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }

    throw new Error('Timeout aguardando projeto pausar (3min)');
  };
  
  const pauseProject = async (projectRef: string) => {
    if (supabasePausingRef) return;
    setSupabasePausingRef(projectRef);
    setPausePolling(true);
    setPauseStartedAt(Date.now());
    setPauseAttempts(0);
    setPauseLastStatus('');
    setSupabaseCreateError(null);
    
    try {
      const res = await fetch('/api/installer/supabase/pause-project', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ installerToken: installerToken.trim() || undefined, accessToken: supabaseAccessToken.trim(), projectRef }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || 'Falha ao pausar');

      await pollProjectStatus(projectRef, 'pause');
      
      setSupabaseUiStep('deciding');
      
      const preflightRes = await fetch('/api/installer/supabase/preflight', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ installerToken: installerToken.trim() || undefined, accessToken: supabaseAccessToken.trim() }),
      });
      const preflightData = await preflightRes.json();
      
      const preflight = {
        freeGlobalLimitHit: Boolean(preflightData?.freeGlobalLimitHit),
        suggestedOrganizationSlug: preflightData?.suggestedOrganizationSlug || null,
        organizations: (preflightData?.organizations || []) as PreflightOrg[],
      };
      setSupabasePreflight(preflight);
      
      await decideAndCreate(supabaseOrgs, preflight);
      
    } catch (err) {
      setSupabaseCreateError(err instanceof Error ? err.message : 'Erro');
    } finally {
      setSupabasePausingRef(null);
      setPausePolling(false);
      setPauseStartedAt(null);
    }
  };
  
  const resolveKeys = async (mode: 'auto' | 'manual' = 'manual') => {
    if (supabaseResolving) return;
    const pat = supabaseAccessToken.trim();
    const url = supabaseUrl.trim();
    const ref = supabaseProjectRef.trim() || inferProjectRef(url);
    
    if (!pat || (!url && !ref)) {
      if (mode === 'manual') setSupabaseResolveError('Informe o PAT e selecione um projeto.');
      return;
    }
    
    if (resolveTimerRef.current) clearTimeout(resolveTimerRef.current);
    setSupabaseResolveError(null);
    setSupabaseResolving(true);
    setSupabaseResolvedOk(false);
    
    try {
      const res = await fetch('/api/installer/supabase/resolve', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ installerToken: installerToken.trim() || undefined, accessToken: pat, supabaseUrl: url || undefined, projectRef: ref || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Erro');
      
      if (data?.projectRef) setSupabaseProjectRef(data.projectRef);
      if (data?.publishableKey) setSupabaseAnonKey(data.publishableKey);
      if (data?.secretKey) setSupabaseServiceKey(data.secretKey);

      // IMPORTANT: For fresh projects we already know the DB password (supabaseCreateDbPass).
      // The CLI login-role URL can lack privileges for schema `storage`, causing false 'storage not ready' stalls.
      // So: keep postgres.<ref> user with our known password, but reuse the pooler host/port from the resolver.
      if (data?.dbUrl) {
        try {
          const resolvedRef = String(data?.projectRef || ref || '').trim();
          const haveCreatePass = Boolean(supabaseCreateDbPass && supabaseCreateDbPass.length >= 12);
          const u = new URL(String(data.dbUrl));
          const hostPort = u.host;
          const dbName = u.pathname?.replace(/^\//, '') || 'postgres';
          const pgbouncer = u.searchParams.get('pgbouncer') || 'true';
          const sslmode = u.searchParams.get('sslmode') || 'require';

          if (haveCreatePass && resolvedRef) {
            const user = `postgres.${resolvedRef}`;
            const rebuilt =
              `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(supabaseCreateDbPass)}` +
              `@${hostPort}/${dbName}?sslmode=${encodeURIComponent(sslmode)}&pgbouncer=${encodeURIComponent(pgbouncer)}`;
            setSupabaseDbUrl(rebuilt);
          } else if (!supabaseDbUrl.trim()) {
            setSupabaseDbUrl(String(data.dbUrl));
          }
        } catch {
          if (!supabaseDbUrl.trim()) setSupabaseDbUrl(String(data.dbUrl));
        }
      }
      
      const warnings = data?.warnings || [];
      const hasDbUrl = Boolean(supabaseDbUrl.trim() || data?.dbUrl);
      const isOnlyDbWarnings = warnings.length > 0 && warnings.every((w: string) => w.toLowerCase().startsWith('db:'));
      
      if (warnings.length > 0 && !hasDbUrl && isOnlyDbWarnings) {
        resolveAttemptsRef.current += 1;
        if (resolveAttemptsRef.current < 6 && mode === 'auto') {
          setSupabaseResolveError(`Aguardando banco ficar pronto… (${resolveAttemptsRef.current}/6)`);
          resolveTimerRef.current = setTimeout(() => void resolveKeys('auto'), 2000 * resolveAttemptsRef.current);
          return;
        }
        setSupabaseResolveError('Banco ainda não está pronto.');
      } else if (warnings.length > 0 && !isOnlyDbWarnings) {
        setSupabaseResolveError(`Alguns itens não foram resolvidos: ${warnings.join(' | ')}`);
      } else {
        resolveAttemptsRef.current = 0;
        setSupabaseResolvedOk(true);
        // Vai direto pro próximo passo — sem tela de confirmação
        setCurrentStep(2);
      }
    } catch (err) {
      setSupabaseResolveError(err instanceof Error ? err.message : 'Erro');
    } finally {
      setSupabaseResolving(false);
    }
  };
  
  const runInstaller = async () => {
    if (!canInstall || installing || !project) return;
    setInstalling(true);
    setRunError(null);
    setResult(null);
    setShowInstallOverlay(true);
    setCinePhase('preparing');
    setCineMessage('Analisando destino');
    setCineSubtitle('Verificando estado do projeto...');
    setCineProgress(0);
    

    // 🎮 Cria o estado inicial do "save game"
    const newInstallState = createInstallState({
      vercelProjectId: project.id,
      supabaseProjectRef: supabaseProjectRef.trim() || undefined,
      supabaseUrl: supabaseUrl.trim() || undefined,
      adminEmail: adminEmail.trim(),
    });
    commitInstallState(newInstallState);

    try {
      // 🧠 Health Check Inteligente - detecta o que pode ser pulado
      let healthCheck: { 
        skipWaitProject?: boolean; 
        skipWaitStorage?: boolean; 
        skipMigrations?: boolean; 
        skipBootstrap?: boolean;
        estimatedSeconds?: number;
      } | undefined;
      
      try {
        const healthRes = await fetch('/api/installer/health-check', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            supabase: {
              url: supabaseUrl.trim(),
              accessToken: supabaseAccessToken.trim(),
              projectRef: supabaseProjectRef.trim() || undefined,
              dbUrl: supabaseDbUrl.trim() || undefined,
            },
          }),
        });
        
        if (healthRes.ok) {
          const healthData = await healthRes.json();
          if (healthData.ok) {
            healthCheck = {
              skipWaitProject: healthData.skipWaitProject,
              skipWaitStorage: healthData.skipWaitStorage,
              skipMigrations: healthData.skipMigrations,
              skipBootstrap: healthData.skipBootstrap,
              estimatedSeconds: healthData.estimatedSeconds,
            };
            console.log('[wizard] Health check result:', healthCheck);
            
            // Mensagem personalizada baseada no que foi detectado
            const skippedCount = [
              healthCheck.skipWaitProject,
              healthCheck.skipWaitStorage,
              healthCheck.skipMigrations,
              healthCheck.skipBootstrap,
            ].filter(Boolean).length;
            
            if (skippedCount >= 3) {
              setCineSubtitle('Projeto detectado! Instalação rápida...');
            } else if (skippedCount >= 1) {
              setCineSubtitle('Otimizando rota de instalação...');
            }
          }
        }
      } catch (healthErr) {
        console.warn('[wizard] Health check failed, proceeding with full install:', healthErr);
      }
      
      await new Promise((r) => setTimeout(r, 800));
      
      // Contagem regressiva épica
      setCineMessage('3');
      setCineSubtitle('Motores acionados');
      await new Promise((r) => setTimeout(r, 1000));
      setCineMessage('2');
      setCineSubtitle('Sistemas online');
      await new Promise((r) => setTimeout(r, 1000));
      setCineMessage('1');
      setCineSubtitle('Ignição');
      await new Promise((r) => setTimeout(r, 800));
      setCineMessage('Decolagem!');
      setCineSubtitle('');
      await new Promise((r) => setTimeout(r, 600));
      
      setCinePhase('running');
      
      const res = await fetch('/api/installer/run-stream', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          installerToken: installerToken.trim() || undefined,
          vercel: { token: vercelToken.trim(), teamId: project.teamId, projectId: project.id, targets: ['production', 'preview'] },
          supabase: {
            url: supabaseUrl.trim(),
            anonKey: supabaseAnonKey.trim() || undefined,
            serviceRoleKey: supabaseServiceKey.trim() || undefined,
            dbUrl: supabaseDbUrl.trim() || undefined,
            accessToken: supabaseAccessToken.trim() || undefined,
            projectRef: supabaseProjectRef.trim() || undefined,
            deployEdgeFunctions: supabaseDeployEdgeFunctions,
          },
          admin: { companyName: userName.trim(), email: adminEmail.trim(), password: adminPassword },
          healthCheck, // Passa o resultado do health check para pular etapas
        }),
      });
      
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData?.error || 'Erro ao iniciar instalação');
      }
      
      const reader = res.body?.getReader();
      if (!reader) throw new Error('Streaming não suportado');
      
      const decoder = new TextDecoder();
      let buffer = '';
      
      while (true) {
        let chunk;
        try {
          chunk = await reader.read();
        } catch (readErr) {
          throw new Error('Conexão instável durante a instalação. Recarregue a página e retome a partir do ponto salvo.');
        }
        const { done, value } = chunk;
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';
        
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const event = JSON.parse(line.slice(6));
            
            if (event.type === 'phase') {
              // 🎮 Salva checkpoint a cada fase
              const stepId = event.phase ? PHASE_TO_STEP[event.phase] : null;
              const current = installStateRef.current;
              if (stepId && current) {
                const updated = updateStepStatus(current, stepId, 'running');
                commitInstallState(updated);
              }
              // UI: mostra etapa (mais prescritivo que só %)
              const explicitStepId = typeof event.stepId === 'string' ? event.stepId : null;
              if (explicitStepId) {
                setCineStepLabel(STEP_LABELS[explicitStepId] || explicitStepId);
              } else {
                setCineStepLabel('');
              }
              setCineMessage(event.title || 'Processando...');
              setCineSubtitle(event.subtitle || '');
              setCineProgress(event.progress || 0);
            } else if (event.type === 'vercel_deploy') {
              const id = typeof event.deploymentId === 'string' ? event.deploymentId : null;
              if (id) {
                setVercelDeploymentId(id);
                localStorage.setItem(STORAGE_VERCEL_DEPLOYMENT_ID, id);
              }
            } else if (event.type === 'step_complete') {
              const stepId = String(event.stepId || '');
              const current = installStateRef.current;
              if (stepId && current) {
                const updated = updateStepStatus(current, stepId, 'completed');
                commitInstallState(updated);
              }
            } else if (event.type === 'retry') {
              // Show retry feedback without interrupting flow
              const retryMsg = `Tentativa ${event.retryCount}/${event.maxRetries}...`;
              setCineSubtitle(retryMsg);
              console.log(`[wizard] Retry: ${event.stepId} - ${retryMsg}`);
            } else if (event.type === 'skip') {
              // Log skipped steps
              console.log('[wizard] Skipped steps:', event.skipped);
            } else if (event.type === 'complete' && event.ok) {
              setCineProgress(100);
              setCineMessage(event.title || `Missão cumprida, ${firstName}!`);
              setCineSubtitle('Aterrissagem confirmada');
              await new Promise((r) => setTimeout(r, 800));
              setCinePhase('success');
              setCineSubtitle(event.subtitle || 'Bem-vindo ao novo mundo.');
              setResult({ ok: true, steps: [] });
              // 🎮 Limpa o save game - instalação completa!
              clearInstallState();
              commitInstallState(null);
              localStorage.removeItem(STORAGE_VERCEL_DEPLOYMENT_ID);
            } else if (event.type === 'error') {
              throw new Error(event.error || 'Erro durante a instalação');
            }
          } catch (parseErr) {
            console.warn('SSE parse error:', parseErr);
          }
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro';
      setRunError(message);
      setCinePhase('error');
      setCineMessage('Falha na missão');
      setCineSubtitle(message);
      // 🎮 Salva o erro no save game para retry posterior
      const current = installStateRef.current;
      if (current) {
        const errorState = { ...current, error: message };
        commitInstallState(errorState);
      }
    } finally {
      setInstalling(false);
    }
  };

  const isRedeployStillRunningError = (msg: string) => {
    const m = String(msg || '').toLowerCase();
    return m.includes('redeploy disparado') && m.includes('ainda não finalizou');
  };

  const finalizeRedeploy = async () => {
    if (!project) return;
    const deploymentId =
      vercelDeploymentId ||
      (typeof window !== 'undefined' ? localStorage.getItem(STORAGE_VERCEL_DEPLOYMENT_ID) : null);
    if (!deploymentId) return;

    setFinalizing(true);
    setRunError(null);
    setCinePhase('running');
    setCineMessage('Etapa final');
    setCineStepLabel('Aguardando redeploy na Vercel (etapa final)');
    setCineSubtitle('Verificando status do deploy…');
    setCineProgress(Math.max(0, Math.min(99, cineProgress || 0)));

    try {
      const res = await fetch('/api/installer/finalize', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          installerToken: installerToken.trim() || undefined,
          vercel: {
            token: vercelToken.trim(),
            projectId: project.id,
            teamId: project.teamId,
            targets: ['production', 'preview'],
            deploymentId,
          },
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || 'O redeploy ainda está finalizando. Aguarde e tente novamente.');
      }

      setCineProgress(100);
      setCineMessage(`Missão cumprida, ${firstName}!`);
      setCineSubtitle('Aterrissagem confirmada');
      await new Promise((r) => setTimeout(r, 600));
      setCinePhase('success');
      setCineSubtitle('Bem-vindo ao novo mundo.');
      clearInstallState();
      commitInstallState(null);
      localStorage.removeItem(STORAGE_VERCEL_DEPLOYMENT_ID);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Erro';
      setRunError(msg);
      setCinePhase('error');
      setCineMessage('Quase lá…');
      setCineSubtitle(msg);
    } finally {
      setFinalizing(false);
    }
  };

  const clearInstallerLocalData = () => {
    localStorage.removeItem('crm_install_token');
    localStorage.removeItem('crm_install_project');
    localStorage.removeItem('crm_install_installer_token');
    localStorage.removeItem('crm_install_user_name');
    localStorage.removeItem('crm_install_user_email');
    localStorage.removeItem('crm_install_user_pass_hash');
    localStorage.removeItem('crm_install_supabase_token');
    localStorage.removeItem('crm_install_session_locked');
    localStorage.removeItem(STORAGE_VERCEL_DEPLOYMENT_ID);
    sessionStorage.removeItem('crm_install_user_pass');
    clearInstallState();
    commitInstallState(null);
  };

  const buildErrorHelp = (msg: string | null) => {
    const text = String(msg || '').trim();
    const lower = text.toLowerCase();

    const help: {
      title: string;
      steps: string[];
      primaryAction?: { label: string; run: () => void };
      secondaryAction?: { label: string; run: () => void };
    } = {
      title: 'Como resolver',
      steps: [],
    };

    // Same-origin / CSRF guard
    if (lower === 'forbidden' || lower.includes('csrf') || lower.includes('same-origin')) {
      help.steps.push('Use o domínio de Produção da Vercel (não Preview).');
      help.steps.push('Vá em Vercel → Project → Domains e abra o domínio principal.');
      help.steps.push('Recarregue e tente novamente.');
      help.primaryAction = { label: 'Ir para o início do Wizard', run: () => router.push('/install/start') };
      return help;
    }

    if (lower.includes('invalid installer token')) {
      help.steps.push('O Installer Token informado está incorreto.');
      help.steps.push('Volte ao início do wizard e cole o token correto (se sua instalação exigir token).');
      help.primaryAction = { label: 'Voltar ao início do Wizard', run: () => router.push('/install/start') };
      help.secondaryAction = { label: 'Limpar dados e recomeçar', run: clearInstallerLocalData };
      return help;
    }

    if (lower.includes('installer disabled')) {
      help.steps.push('O instalador foi desativado neste projeto.');
      help.steps.push('Se já está instalado, entre pelo /login.');
      help.primaryAction = { label: 'Ir para Login', run: () => (window.location.href = '/login') };
      return help;
    }

    // Vercel token / permissão / escopo
    if (
      lower.includes('token da vercel') ||
      lower.includes('invalid token') ||
      lower.includes('sem permissao') ||
      lower.includes('not authorized') ||
      lower.includes('missing_scope') ||
      lower.includes('insufficient_scope')
    ) {
      help.steps.push('Gere um novo token na Vercel com permissão “Full Account”.');
      help.steps.push('Volte ao início do wizard e cole o token novo.');
      help.steps.push('Faça a instalação no domínio de Produção.');
      help.primaryAction = { label: 'Voltar ao início do Wizard', run: () => router.push('/install/start') };
      help.secondaryAction = { label: 'Limpar dados e recomeçar', run: clearInstallerLocalData };
      return help;
    }

    // Supabase token
    if (lower.includes('supabase') && (lower.includes('unauthorized') || lower.includes('token'))) {
      help.steps.push('Confirme que você colou o token do Supabase (começa com `sbp_`).');
      help.steps.push('Se expirou, gere um novo em Supabase → Account → Access Tokens.');
      help.primaryAction = { label: 'Voltar ao início do Wizard', run: () => router.push('/install/start') };
      return help;
    }

    // SSE / rede instável
    if (lower.includes('conexão instável') || lower.includes('network')) {
      help.steps.push('Recarregue a página (o wizard tenta retomar do ponto salvo).');
      help.steps.push('Se estiver em rede instável, tente outra conexão.');
      help.primaryAction = { label: 'Recarregar', run: () => window.location.reload() };
      return help;
    }

    // Fallback
    help.steps.push('Clique em “Tentar novamente”.');
    help.steps.push('Se persistir, volte ao início do wizard e confira tokens/credenciais.');
    help.primaryAction = { label: 'Voltar ao início do Wizard', run: () => router.push('/install/start') };
    help.secondaryAction = { label: 'Limpar dados e recomeçar', run: clearInstallerLocalData };
    return help;
  };

  const applyNewInstallerPassword = useCallback(async () => {
    const pass = newPassword;
    const confirm = newPasswordConfirm;

    setChangePasswordError(null);

    const check = validateInstallerPassword(pass);
    if (!check.ok) {
      setChangePasswordError(check.error);
      return;
    }
    if (pass !== confirm) {
      setChangePasswordError('As senhas não conferem');
      return;
    }

    const hash = await hashPassword(pass);
    localStorage.setItem(STORAGE_USER_PASS_HASH, hash);
    sessionStorage.setItem('crm_install_user_pass', pass);
    setAdminPassword(pass);
    setNewPassword('');
    setNewPasswordConfirm('');
    setShowNewPassword(false);
    setShowChangePasswordModal(false);
  }, [newPassword, newPasswordConfirm]);

  if (!isHydrated) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-cyan-400 animate-spin" />
      </div>
    );
  }
  
  const goNext = () => setCurrentStep((s) => Math.min(s + 1, 2));
  const goBack = () => router.push('/install/start');

  

  return (
    <div
      className="min-h-screen flex items-center justify-center bg-slate-950 relative overflow-hidden"
      onMouseMove={handleMouseMove}
      onMouseLeave={() => { mx.set(0); my.set(0); }}
    >
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.03)_0%,transparent_42%,rgba(2,6,23,0.95)_100%)]" />
        <motion.div
          className="absolute -top-[20%] -right-[10%] w-[50%] h-[50%] rounded-full blur-[120px] bg-cyan-500/15"
          style={{ x: mxSpring, y: mySpring }}
        />
        <motion.div
          className="absolute top-[40%] -left-[10%] w-[40%] h-[40%] rounded-full blur-[100px] bg-teal-500/12"
          style={{ x: mxSpring, y: mySpring }}
        />
      </div>

      <div className="w-full max-w-lg relative z-10 px-4">
        <div className="flex justify-center gap-2 mb-8">
          {[1, 2].map((i) => (
            <div
              key={i}
              className={`h-2 rounded-full transition-all duration-300 ${
                i === currentStep ? 'w-8 bg-cyan-400' : i < currentStep ? 'w-2 bg-cyan-400/60' : 'w-2 bg-white/20'
              }`}
            />
          ))}
              </div>

        <AnimatePresence mode="wait">
          {currentStep === 1 && (
            <motion.div key="step-supabase" variants={sceneVariants} initial="initial" animate="animate" exit="exit" transition={sceneTransition}>
              <AnimatePresence mode="wait">
                {supabaseUiStep === 'pat' && (
                  <motion.div key="supabase-pat" variants={sceneVariants} initial="initial" animate="animate" exit="exit" transition={sceneTransition} className="text-center">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 mb-6">
                      <Sparkles className="w-8 h-8 text-emerald-400" />
                  </div>
                    <h1 className="text-2xl font-bold text-white mb-2">Conectar Supabase</h1>
                    <p className="text-slate-400 mb-6">Cole seu token de acesso para continuar.</p>
                    <input type="password" value={supabaseAccessToken} onChange={(e) => setSupabaseAccessToken(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-4 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-400/50 focus:border-transparent mb-4" placeholder="sbp_..." autoFocus />
                    <a href="https://supabase.com/dashboard/account/tokens" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-sm text-cyan-400 hover:text-cyan-300 mb-6">Gerar token <ExternalLink className="w-4 h-4" /></a>
                    {supabaseOrgsError && <div className="rounded-xl bg-red-500/10 border border-red-500/20 p-4 text-red-400 text-sm">{supabaseOrgsError}</div>}
                  </motion.div>
                )}
                
                {supabaseUiStep === 'deciding' && (
                  <motion.div key="supabase-deciding" variants={sceneVariants} initial="initial" animate="animate" exit="exit" transition={sceneTransition} className="text-center py-12">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 mb-6">
                      <Loader2 className="w-8 h-8 text-cyan-400 animate-spin" />
                        </div>
                    <h1 className="text-2xl font-bold text-white mb-2">Preparando seu projeto</h1>
                    <p className="text-slate-400">Verificando sua conta Supabase…</p>
                  </motion.div>
                )}
                
                {supabaseUiStep === 'needspace' && (
                  <motion.div key="supabase-needspace" variants={sceneVariants} initial="initial" animate="animate" exit="exit" transition={sceneTransition}>
                    <div className="text-center mb-6">
                      <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 mb-6">
                        <Pause className="w-8 h-8 text-amber-400" />
                      </div>
                      <h1 className="text-2xl font-bold text-white mb-2">Precisamos de espaço</h1>
                      <p className="text-slate-400">
                        {needSpaceReason === 'global_limit' || supabasePreflight?.freeGlobalLimitHit
                          ? (
                            <>
                              Você atingiu o limite do plano Free no Supabase (máximo de 2 projetos ativos por usuário).<br />
                              Pause 1 projeto para continuar:
                            </>
                          )
                          : (
                            <>
                              Seu plano permite 2 projetos ativos.<br />
                              Pause 1 projeto para continuar:
                            </>
                          )}
                      </p>
                    </div>

                    {pausePolling || Boolean(supabasePausingRef) ? (
                      <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4">
                        <div className="flex items-center gap-3 text-amber-400">
                          <Loader2 className="w-5 h-5 animate-spin shrink-0" />
                          <div className="text-sm">
                            <div>O projeto está sendo pausado. Isso pode levar até ~3 minutos.</div>
                            <div className="text-amber-200/80 mt-1">
                              {pauseStartedAt ? `Tempo: ${Math.max(0, Math.round((Date.now() - pauseStartedAt) / 1000))}s` : null}
                              {pauseAttempts ? ` • Tentativas: ${pauseAttempts}` : null}
                              {pauseLastStatus ? ` • Status: ${pauseLastStatus}` : null}
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="space-y-3 mb-6">
                          {allFreeActiveProjects.map((p) => (
                            <div key={p.ref} className="flex items-center justify-between gap-4 bg-white/5 border border-white/10 rounded-xl p-4">
                              <div className="min-w-0">
                                <div className="text-white font-medium truncate">{p.name}</div>
                                <div className="text-slate-500 text-sm truncate">{p.orgName}</div>
                              </div>
                              <button
                                onClick={() => void pauseProject(p.ref)}
                                disabled={supabasePausingRef === p.ref || pausePolling}
                                className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-white font-medium text-sm transition-all disabled:opacity-50 shrink-0"
                              >
                                {supabasePausingRef === p.ref ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Pausar'}
                              </button>
                            </div>
                          ))}
                        </div>

                        <div className="flex items-start gap-3 bg-white/5 border border-white/10 rounded-xl p-4 text-sm text-slate-400">
                          <Info className="w-5 h-5 text-cyan-400 shrink-0 mt-0.5" />
                          <span>Você pode reativar a qualquer momento no painel do Supabase.</span>
                        </div>
                      </>
                    )}

                    {supabaseCreateError && <div className="mt-4 rounded-xl bg-red-500/10 border border-red-500/20 p-4 text-red-400 text-sm">{supabaseCreateError}</div>}
                  </motion.div>
                )}
                
                {supabaseUiStep === 'done' && supabaseProvisioning && (
                  <motion.div key="supabase-provisioning" variants={sceneVariants} initial="initial" animate="animate" exit="exit" transition={sceneTransition} className="text-center py-8">
                    {/* Animação central - Radar/Pulso */}
                    <div className="relative inline-flex items-center justify-center w-32 h-32 mb-8">
                      {/* Ondas de radar expandindo */}
                      <motion.div 
                        className="absolute inset-0 rounded-full border border-cyan-400/20"
                        animate={{ scale: [1, 2.5], opacity: [0.6, 0] }}
                        transition={{ duration: 3, repeat: Infinity, ease: 'easeOut' }}
                      />
                      <motion.div 
                        className="absolute inset-0 rounded-full border border-cyan-400/20"
                        animate={{ scale: [1, 2.5], opacity: [0.6, 0] }}
                        transition={{ duration: 3, repeat: Infinity, ease: 'easeOut', delay: 1 }}
                      />
                      <motion.div 
                        className="absolute inset-0 rounded-full border border-cyan-400/20"
                        animate={{ scale: [1, 2.5], opacity: [0.6, 0] }}
                        transition={{ duration: 3, repeat: Infinity, ease: 'easeOut', delay: 2 }}
                      />
                      
                      {/* Anel externo rotacionando */}
                      <motion.div 
                        className="absolute inset-2 rounded-full border-2 border-dashed border-cyan-400/30"
                        animate={{ rotate: 360 }}
                        transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}
                      />
                      
                      {/* Anel interno com glow */}
                      <motion.div 
                        className="absolute inset-4 rounded-full bg-gradient-to-br from-cyan-500/20 to-teal-500/20 border border-cyan-400/50"
                        animate={{ 
                          boxShadow: ['0 0 20px rgba(34,211,238,0.3)', '0 0 40px rgba(34,211,238,0.5)', '0 0 20px rgba(34,211,238,0.3)']
                        }}
                        transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                      />
                      
                      {/* Ícone central */}
                      <motion.div 
                        className="relative w-16 h-16 rounded-full bg-slate-900/80 flex items-center justify-center border border-cyan-400/50"
                        animate={{ scale: [1, 1.05, 1] }}
                        transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                      >
                        <Loader2 className="w-8 h-8 text-cyan-400 animate-spin" />
                      </motion.div>
                    </div>
                    
                    {/* Mensagem rotativa com animação */}
                    <AnimatePresence mode="wait">
                      <motion.div
                        key={provisioningMsgIndex}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        transition={{ duration: 0.5 }}
                        className="mb-6"
                      >
                        <h1 className="text-2xl font-bold text-white mb-2">
                          {provisioningMessages[provisioningMsgIndex]?.title || 'Preparando...'}
                        </h1>
                        <p className="text-slate-400">
                          {provisioningMessages[provisioningMsgIndex]?.subtitle || ''}
                        </p>
                      </motion.div>
                    </AnimatePresence>
                    
                    {/* Barra de progresso estilizada */}
                    <div className="relative w-full mb-4">
                      <div className="h-2 bg-white/5 rounded-full overflow-hidden backdrop-blur-sm border border-white/10">
                        <motion.div 
                          className="h-full bg-gradient-to-r from-cyan-500 via-teal-400 to-cyan-500 rounded-full"
                          style={{ width: `${provisioningProgress}%` }}
                          animate={{ 
                            backgroundPosition: ['0% 50%', '100% 50%', '0% 50%']
                          }}
                          transition={{ 
                            backgroundPosition: { duration: 3, repeat: Infinity, ease: 'linear' }
                          }}
                        />
                      </div>
                      {/* Glow effect under progress */}
                      <motion.div 
                        className="absolute -bottom-2 left-0 h-4 bg-cyan-400/20 rounded-full blur-md"
                        style={{ width: `${provisioningProgress}%` }}
                      />
                    </div>
                    
                    {/* Telemetria fake */}
                    <div className="flex justify-center gap-8 text-xs text-slate-500 font-mono mb-6">
                      <motion.span
                        animate={{ opacity: [0.5, 1, 0.5] }}
                        transition={{ duration: 2, repeat: Infinity }}
                      >
                        SYS: {provisioningProgress.toFixed(0)}%
                      </motion.span>
                      <motion.span
                        animate={{ opacity: [0.5, 1, 0.5] }}
                        transition={{ duration: 2, repeat: Infinity, delay: 0.3 }}
                      >
                        NET: ONLINE
                      </motion.span>
                      <motion.span
                        animate={{ opacity: [0.5, 1, 0.5] }}
                        transition={{ duration: 2, repeat: Infinity, delay: 0.6 }}
                      >
                        DB: {supabaseProvisioningStatus || 'INIT'}
                      </motion.span>
                    </div>
                    
                    {/* Partículas flutuando */}
                    <div className="absolute inset-0 pointer-events-none overflow-hidden">
                      {[...Array(6)].map((_, i) => (
                        <motion.div
                          key={i}
                          className="absolute w-1 h-1 bg-cyan-400/40 rounded-full"
                          style={{
                            left: `${20 + i * 12}%`,
                            top: '60%',
                          }}
                          animate={{
                            y: [-20, -60, -20],
                            opacity: [0, 1, 0],
                            scale: [0.5, 1, 0.5],
                          }}
                          transition={{
                            duration: 3 + i * 0.5,
                            repeat: Infinity,
                            delay: i * 0.4,
                            ease: 'easeInOut',
                          }}
                        />
                      ))}
                    </div>
                    
                    <p className="text-slate-600 text-sm">
                      Não feche esta página
                    </p>
                  </motion.div>
                )}
                
                {supabaseUiStep === 'done' && !supabaseProvisioning && (
                  <motion.div key="supabase-done" variants={sceneVariants} initial="initial" animate="animate" exit="exit" transition={sceneTransition} className="text-center">
                    {supabaseResolving ? (
                      <>
                        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 mb-6"><Loader2 className="w-8 h-8 text-cyan-400 animate-spin" /></div>
                        <h1 className="text-2xl font-bold text-white mb-2">Configurando chaves</h1>
                        <p className="text-slate-400">Aguarde um momento…</p>
                      </>
                    ) : supabaseResolvedOk ? (
                      <>
                        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 mb-6"><CheckCircle2 className="w-8 h-8 text-emerald-400" /></div>
                        <h1 className="text-2xl font-bold text-white mb-2">Supabase configurado</h1>
                        <p className="text-slate-400 mb-8">Projeto pronto para usar.</p>
                        <button onClick={goNext} className="w-full py-4 rounded-2xl bg-cyan-500 hover:bg-cyan-400 text-white font-semibold text-lg transition-all shadow-lg shadow-cyan-500/25">Continuar</button>
                      </>
                    ) : supabaseResolveError ? (
                      <>
                        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 mb-6"><AlertCircle className="w-8 h-8 text-amber-400" /></div>
                        <h1 className="text-2xl font-bold text-white mb-2">Quase lá</h1>
                        <p className="text-slate-400 mb-4">{supabaseResolveError}</p>
                        <button onClick={() => void resolveKeys('manual')} className="w-full py-4 rounded-2xl bg-cyan-500 hover:bg-cyan-400 text-white font-semibold transition-all">Tentar novamente</button>
                      </>
                    ) : (
                      <>
                        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 mb-6"><Loader2 className="w-8 h-8 text-cyan-400 animate-spin" /></div>
                        <h1 className="text-2xl font-bold text-white mb-2">Finalizando</h1>
                        <p className="text-slate-400">Resolvendo configurações…</p>
                      </>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}
          
          {currentStep === 2 && (
            <motion.div key="step-launch" variants={sceneVariants} initial="initial" animate="animate" exit="exit" transition={sceneTransition} className="text-center">
              <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-br from-cyan-400 to-teal-400 mb-6"><Sparkles className="w-10 h-10 text-white" /></div>
              <h1 className="text-3xl font-bold text-white mb-2">Tudo pronto, {firstName}!</h1>
              <p className="text-slate-400 mb-8">Sua jornada está prestes a começar.</p>
              {!validateInstallerPassword(adminPassword).ok && (
                <div className="mb-6 rounded-2xl bg-amber-500/10 border border-amber-500/20 p-4 text-left">
                  <div className="text-amber-200 font-medium">Só falta fortalecer sua senha</div>
                  <div className="text-slate-400 text-sm mt-1">Use 8+ caracteres com pelo menos 1 letra e 1 número.</div>
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const p = generateStrongPassword(16);
                        setNewPassword(p);
                        setNewPasswordConfirm(p);
                        setShowChangePasswordModal(true);
                      }}
                      className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-white text-sm font-semibold"
                    >
                      Gerar senha sugerida
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowChangePasswordModal(true)}
                      className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-sm"
                    >
                      Ajustar senha
                    </button>
                  </div>
                </div>
              )}

              <button onClick={runInstaller} disabled={!canInstall || installing} className="w-full py-5 rounded-2xl bg-gradient-to-r from-cyan-500 to-teal-500 hover:from-cyan-400 hover:to-teal-400 text-white font-bold text-xl transition-all shadow-xl shadow-cyan-500/30 disabled:opacity-50">
                {installing ? <span className="flex items-center justify-center gap-3"><Loader2 className="w-6 h-6 animate-spin" />Iniciando…</span> : '🚀 Iniciar viagem'}
              </button>
              {runError && !showInstallOverlay && <div className="mt-4 rounded-xl bg-red-500/10 border border-red-500/20 p-4 text-red-400 text-sm">{runError}</div>}
            </motion.div>
          )}
        </AnimatePresence>
        
        {currentStep === 1 && supabaseUiStep === 'pat' && (
          <button onClick={goBack} className="mt-6 w-full py-3 text-slate-400 hover:text-white transition-colors">← Voltar</button>
        )}
                    </div>
      
      <AnimatePresence>
        {showInstallOverlay && (
          <motion.div key="install-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950">
            {/* Background cinematográfico */}
            <div className="absolute inset-0 overflow-hidden">
              {/* Gradiente pulsante */}
              <motion.div 
                className="absolute top-1/2 left-1/2 w-[800px] h-[800px] -translate-x-1/2 -translate-y-1/2" 
                animate={{ 
                  background: [
                    'radial-gradient(circle, rgba(34,211,238,0.12) 0%, transparent 60%)', 
                    'radial-gradient(circle, rgba(45,212,191,0.15) 0%, transparent 65%)', 
                    'radial-gradient(circle, rgba(34,211,238,0.12) 0%, transparent 60%)'
                  ] 
                }} 
                transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }} 
              />
              {/* Estrelas em movimento */}
              {cinePhase === 'running' && (
                <motion.div 
                  className="absolute inset-0" 
                  style={{ 
                    backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.4) 1px, transparent 1px)', 
                    backgroundSize: '50px 50px' 
                  }} 
                  animate={{ backgroundPositionY: ['0px', '-300px'] }} 
                  transition={{ duration: 8, repeat: Infinity, ease: 'linear' }} 
                />
              )}
              {/* Vignette */}
              <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,rgba(2,6,23,0.8)_100%)]" />
            </div>
            
            <div className="relative text-center px-4 max-w-md">
              {/* Contagem regressiva - números gigantes */}
              {cinePhase === 'preparing' && ['3', '2', '1', 'Decolagem!'].includes(cineMessage) && (
                <AnimatePresence mode="wait">
                  <motion.div
                    key={cineMessage}
                    initial={{ scale: 0.5, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 1.5, opacity: 0 }}
                    transition={{ duration: 0.3 }}
                    className="mb-8"
                  >
                    <span className={`font-bold text-transparent bg-clip-text bg-gradient-to-b from-white to-cyan-400 ${
                      cineMessage === 'Decolagem!' ? 'text-6xl' : 'text-[120px] leading-none'
                    }`}>
                      {cineMessage}
                    </span>
                  </motion.div>
                </AnimatePresence>
              )}
              
              {/* Ícone central - só mostra quando não é contagem */}
              {!(cinePhase === 'preparing' && ['3', '2', '1', 'Decolagem!'].includes(cineMessage)) && (
                <div className="relative inline-flex items-center justify-center w-32 h-32 mb-8">
                  {cinePhase === 'preparing' || cinePhase === 'running' ? (
                    <>
                      {/* Anéis pulsantes estilo radar */}
                      <motion.div 
                        className="absolute inset-0 rounded-full border border-cyan-400/20" 
                        animate={{ scale: [1, 2, 2], opacity: [0.6, 0, 0] }} 
                        transition={{ duration: 2.5, repeat: Infinity, ease: 'easeOut' }} 
                      />
                      <motion.div 
                        className="absolute inset-0 rounded-full border border-cyan-400/20" 
                        animate={{ scale: [1, 2, 2], opacity: [0.6, 0, 0] }} 
                        transition={{ duration: 2.5, repeat: Infinity, ease: 'easeOut', delay: 0.8 }} 
                      />
                      <motion.div 
                        className="absolute inset-0 rounded-full border border-cyan-400/20" 
                        animate={{ scale: [1, 2, 2], opacity: [0.6, 0, 0] }} 
                        transition={{ duration: 2.5, repeat: Infinity, ease: 'easeOut', delay: 1.6 }} 
                      />
                      {/* Círculo central com spinner */}
                      <div className="w-24 h-24 rounded-full bg-gradient-to-br from-cyan-500/20 to-teal-500/20 border border-cyan-400/30 flex items-center justify-center backdrop-blur-sm">
                        <Loader2 className="w-10 h-10 text-cyan-400 animate-spin" />
                      </div>
                    </>
                  ) : cinePhase === 'success' ? (
                    <>
                      {/* Explosão de partículas no sucesso */}
                      <motion.div className="absolute inset-0 pointer-events-none">
                        {Array.from({ length: 32 }).map((_, i) => {
                          const angle = (Math.PI * 2 * i) / 32;
                          const distance = 100 + Math.random() * 120;
                          return (
                            <motion.div 
                              key={i} 
                              className="absolute left-1/2 top-1/2 w-2 h-2 rounded-full bg-gradient-to-r from-cyan-400 to-emerald-400" 
                              initial={{ x: 0, y: 0, opacity: 1, scale: 1 }} 
                              animate={{ 
                                x: Math.cos(angle) * distance, 
                                y: Math.sin(angle) * distance, 
                                opacity: 0,
                                scale: 0.3
                              }} 
                              transition={{ duration: 1.5, delay: i * 0.02, ease: 'easeOut' }} 
                            />
                          );
                        })}
                      </motion.div>
                      {/* Segundo anel de partículas */}
                      <motion.div className="absolute inset-0 pointer-events-none">
                        {Array.from({ length: 16 }).map((_, i) => {
                          const angle = (Math.PI * 2 * i) / 16 + 0.2;
                          const distance = 80 + Math.random() * 60;
                          return (
                            <motion.div 
                              key={`inner-${i}`} 
                              className="absolute left-1/2 top-1/2 w-3 h-3 rounded-full bg-gradient-to-r from-emerald-300 to-teal-300" 
                              initial={{ x: 0, y: 0, opacity: 1, scale: 1 }} 
                              animate={{ 
                                x: Math.cos(angle) * distance, 
                                y: Math.sin(angle) * distance, 
                                opacity: 0,
                                scale: 0.2
                              }} 
                              transition={{ duration: 1.2, delay: 0.1 + i * 0.03, ease: 'easeOut' }} 
                            />
                          );
                        })}
                      </motion.div>
                      <motion.div 
                        initial={{ scale: 0, rotate: -180 }} 
                        animate={{ scale: 1, rotate: 0 }} 
                        transition={{ type: 'spring', stiffness: 200, damping: 15 }} 
                        className="w-32 h-32 rounded-full bg-gradient-to-br from-emerald-400 to-cyan-400 flex items-center justify-center shadow-2xl shadow-emerald-500/40"
                      >
                        <CheckCircle2 className="w-16 h-16 text-white" />
                      </motion.div>
                    </>
                  ) : (
                    <motion.div 
                      initial={{ scale: 0.8 }} 
                      animate={{ scale: 1 }}
                      className="w-32 h-32 rounded-full bg-red-500/20 border border-red-500/30 flex items-center justify-center"
                    >
                      <AlertCircle className="w-16 h-16 text-red-400" />
                    </motion.div>
                  )}
                </div>
              )}
              
              {/* Título principal - esconde durante contagem */}
              {!(cinePhase === 'preparing' && ['3', '2', '1', 'Decolagem!'].includes(cineMessage)) && (
                <AnimatePresence mode="wait">
                  <motion.h1 
                    key={cineMessage} 
                    initial={{ opacity: 0, y: 20 }} 
                    animate={{ opacity: 1, y: 0 }} 
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.4 }}
                    className={`font-bold text-white mb-3 ${cinePhase === 'success' ? 'text-4xl' : 'text-3xl'}`}
                  >
                    {cineMessage}
                  </motion.h1>
                </AnimatePresence>
              )}
              
              {/* Subtítulo */}
              <AnimatePresence mode="wait">
                <motion.p 
                  key={cineSubtitle} 
                  initial={{ opacity: 0 }} 
                  animate={{ opacity: 1 }} 
                  exit={{ opacity: 0 }}
                  className={`mb-6 h-6 ${cinePhase === 'success' ? 'text-emerald-400 text-lg' : 'text-slate-400'}`}
                >
                  {cineSubtitle}
                </motion.p>
              </AnimatePresence>
              
              {/* Barra de progresso (só durante running) */}
              {cinePhase === 'running' && (
                <div className="w-full max-w-xs mx-auto mb-8">
                  <div className="h-1 bg-white/10 rounded-full overflow-hidden">
                    <motion.div 
                      className="h-full bg-gradient-to-r from-cyan-400 to-teal-400 rounded-full"
                      initial={{ width: '0%' }}
                      animate={{ width: `${cineProgress}%` }}
                      transition={{ duration: 0.5, ease: 'easeOut' }}
                    />
                  </div>
                  <p className="text-xs text-slate-500 mt-2">
                    {cineProgress}%{cineStepLabel ? ` • ${cineStepLabel}` : ''}
                  </p>
                </div>
              )}
              
              {/* Botões de ação */}
              {cinePhase === 'success' && (
                <motion.div 
                  initial={{ opacity: 0, y: 20 }} 
                  animate={{ opacity: 1, y: 0 }} 
                  transition={{ delay: 0.8 }}
                  className="space-y-6"
                >
                  <p className="text-slate-300">
                    Seu novo mundo está pronto.<br />
                    <span className="text-slate-500 text-sm">Tudo está pronto — você já pode entrar. (Se parecer desatualizado, recarregue a página.)</span>
                  </p>
                  <button 
                    onClick={() => {
                      clearInstallerLocalData();
                      window.location.href = '/login';
                    }} 
                    className="px-10 py-5 rounded-2xl bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 text-white font-bold text-xl shadow-2xl shadow-emerald-500/30 transition-all transform hover:scale-105"
                  >
                    🌍 Explorar o novo mundo
                  </button>
                </motion.div>
              )}
              
              {cinePhase === 'error' && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
                  <p className="text-red-400/80">{runError || 'Algo deu errado durante a instalação.'}</p>

                  {(() => {
                    const h = buildErrorHelp(runError);
                    if (!h.steps.length) return null;
                    return (
                      <div className="rounded-2xl bg-white/5 border border-white/10 p-4 text-left">
                        <div className="text-white font-semibold mb-2">{h.title}</div>
                        <ol className="list-decimal list-inside space-y-1 text-sm text-slate-300">
                          {h.steps.map((s, idx) => (
                            <li key={idx}>{s}</li>
                          ))}
                        </ol>
                        {(h.primaryAction || h.secondaryAction) && (
                          <div className="mt-4 flex flex-wrap gap-3">
                            {h.primaryAction && (
                              <button
                                onClick={h.primaryAction.run}
                                className="px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-white text-sm font-semibold"
                              >
                                {h.primaryAction.label}
                              </button>
                            )}
                            {h.secondaryAction && (
                              <button
                                onClick={h.secondaryAction.run}
                                className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-sm"
                              >
                                {h.secondaryAction.label}
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  <div className="flex gap-4 justify-center">
                    <button 
                      onClick={() => {
                        setShowInstallOverlay(false);
                        // Mantém o "save game" para retry/retomada; use o botão de limpar acima se necessário.
                      }} 
                      className="px-8 py-4 rounded-2xl bg-white/10 hover:bg-white/20 text-white font-semibold transition-all"
                    >
                      Voltar
                    </button>
                    {isRedeployStillRunningError(runError || '') && (vercelDeploymentId || (typeof window !== 'undefined' && localStorage.getItem(STORAGE_VERCEL_DEPLOYMENT_ID))) ? (
                      <button
                        onClick={() => void finalizeRedeploy()}
                        disabled={finalizing}
                        className="px-8 py-4 rounded-2xl bg-amber-500 hover:bg-amber-400 text-white font-semibold transition-all flex items-center gap-2 disabled:opacity-50"
                      >
                        {finalizing ? <Loader2 className="w-5 h-5 animate-spin" /> : <RefreshCw className="w-5 h-5" />}
                        Verificar de novo (Vercel)
                      </button>
                    ) : (
                    <button 
                      onClick={() => {
                        setShowInstallOverlay(false);
                        setCinePhase('preparing');
                        setCineProgress(0);
                        setRunError(null);
                        // Retry
                        setTimeout(() => runInstaller(), 100);
                      }} 
                      className="px-8 py-4 rounded-2xl bg-gradient-to-r from-cyan-500 to-teal-500 hover:from-cyan-400 hover:to-teal-400 text-white font-semibold transition-all flex items-center gap-2"
                    >
                      <RefreshCw className="w-5 h-5" />
                      Tentar novamente
                    </button>
                    )}
                  </div>
                </motion.div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      
      {/* Modal: Trocar senha */}
      <AnimatePresence>
        {showChangePasswordModal && (
          <motion.div
            key="change-password-modal"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[62] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-slate-900/95 border border-white/10 rounded-3xl p-8 max-w-md w-full shadow-2xl"
            >
              <div className="text-center mb-6">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 mb-4">
                  <Sparkles className="w-8 h-8 text-cyan-300" />
                </div>
                <h2 className="text-2xl font-bold text-white mb-2">Trocar senha</h2>
                <p className="text-slate-400">Vamos garantir seu acesso antes de concluir a missão.</p>
              </div>

              <div className="space-y-3">
                <input
                  type={showNewPassword ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-4 text-white text-center text-lg placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-400/50 focus:border-transparent"
                  placeholder="Nova senha"
                  autoFocus
                />
                <input
                  type={showNewPassword ? 'text' : 'password'}
                  value={newPasswordConfirm}
                  onChange={(e) => setNewPasswordConfirm(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void applyNewInstallerPassword();
                  }}
                  className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-4 text-white text-center text-lg placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-400/50 focus:border-transparent"
                  placeholder="Confirmar senha"
                />

                <button
                  type="button"
                  onClick={() => setShowNewPassword((v) => !v)}
                  className="w-full py-3 rounded-2xl bg-white/5 hover:bg-white/10 text-slate-200 text-sm transition-all"
                >
                  {showNewPassword ? 'Ocultar senha' : 'Mostrar senha'}
                </button>

                {changePasswordError && (
                  <div className="rounded-2xl bg-red-500/10 border border-red-500/20 p-4 text-red-300 text-sm text-center">
                    {changePasswordError}
                  </div>
                )}

                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowChangePasswordModal(false);
                      setChangePasswordError(null);
                    }}
                    className="flex-1 py-3 rounded-2xl bg-white/10 hover:bg-white/20 text-white font-medium transition-all"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={() => void applyNewInstallerPassword()}
                    className="flex-1 py-3 rounded-2xl bg-gradient-to-r from-cyan-500 to-teal-500 hover:from-cyan-400 hover:to-teal-400 text-white font-semibold transition-all"
                  >
                    Salvar
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modal de Resumir Instalação */}
      <AnimatePresence>
        {showResumeModal && installState && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-slate-900/95 border border-white/10 rounded-3xl p-8 max-w-md w-full shadow-2xl"
            >
              <div className="text-center mb-6">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 mb-4">
                  <RefreshCw className="w-8 h-8 text-amber-400" />
                </div>
                <h2 className="text-2xl font-bold text-white mb-2">Instalação em andamento</h2>
                <p className="text-slate-400">
                  Encontramos uma instalação anterior que não foi concluída.
                </p>
              </div>
              
              <div className="bg-white/5 rounded-xl p-4 mb-6">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-slate-400 text-sm">Progresso</span>
                  <span className="text-cyan-400 font-medium">{getProgressSummary(installState).percentage}%</span>
                </div>
                <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-gradient-to-r from-cyan-500 to-teal-500 rounded-full" 
                    style={{ width: `${getProgressSummary(installState).percentage}%` }}
                  />
                </div>
                {getProgressSummary(installState).currentStepName && (
                  <p className="text-xs text-slate-500 mt-2">
                    Último passo: {getProgressSummary(installState).currentStepName}
                  </p>
                )}
              </div>
              
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    clearInstallState();
                    setInstallState(null);
                    setShowResumeModal(false);
                  }}
                  className="flex-1 py-3 rounded-xl bg-white/10 hover:bg-white/20 text-white font-medium transition-all"
                >
                  Recomeçar
                </button>
                <button
                  onClick={() => {
                    setShowResumeModal(false);
                    // Vai direto para a instalação
                    setCurrentStep(2);
                    setTimeout(() => runInstaller(), 100);
                  }}
                  className="flex-1 py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-teal-500 hover:from-cyan-400 hover:to-teal-400 text-white font-medium transition-all"
                >
                  Continuar
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}