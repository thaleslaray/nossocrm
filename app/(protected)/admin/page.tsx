'use client'

import dynamic from 'next/dynamic'
import { PageLoader } from '@/components/PageLoader'

const AdminDashboard = dynamic(
    () => import('@/features/admin/AdminDashboard'),
    { loading: () => <PageLoader />, ssr: false }
)

/**
 * Página de Administração Técnica
 * Dashboard com métricas do sistema, gestão de tarefas administrativas e ferramentas técnicas
 */
export default function AdminPage() {
    return <AdminDashboard />
}
