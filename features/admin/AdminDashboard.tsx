'use client'

import React, { useState } from 'react'
import {
  Settings,
  BarChart3,
  CheckSquare,
  Users,
  Database,
  Activity,
  AlertCircle,
  TrendingUp,
  Clock,
  FileText,
  Zap,
  Plus
} from 'lucide-react'

interface AdminTask {
  id: string
  title: string
  category: 'system' | 'data' | 'users' | 'maintenance' | 'development'
  priority: 'low' | 'medium' | 'high' | 'urgent'
  status: 'pending' | 'in_progress' | 'completed' | 'blocked'
  assignedTo?: string
  dueDate?: string
  description?: string
  createdAt: string
}

interface SystemMetric {
  label: string
  value: string | number
  change?: string
  trend?: 'up' | 'down' | 'stable'
  status?: 'good' | 'warning' | 'critical'
}

/**
 * Dashboard de Administração Técnica
 * Centraliza gestão de tarefas administrativas, métricas do sistema e ferramentas técnicas
 */
export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState<'overview' | 'tasks' | 'metrics' | 'system'>('overview')
  const [showNewTaskModal, setShowNewTaskModal] = useState(false)

  // Métricas do sistema (mockadas por enquanto)
  const systemMetrics: SystemMetric[] = [
    { label: 'Total de Usuários', value: 42, change: '+12%', trend: 'up', status: 'good' },
    { label: 'Deals Ativos', value: 127, change: '+8%', trend: 'up', status: 'good' },
    { label: 'Taxa de Conversão', value: '24%', change: '+3%', trend: 'up', status: 'good' },
    { label: 'Tarefas Pendentes', value: 18, change: '-5%', trend: 'down', status: 'warning' },
    { label: 'Uso de Storage', value: '2.4 GB', change: '+15%', trend: 'up', status: 'good' },
    { label: 'Performance API', value: '98ms', trend: 'stable', status: 'good' },
  ]

  // Tarefas administrativas (mockadas)
  const [adminTasks, setAdminTasks] = useState<AdminTask[]>([
    {
      id: '1',
      title: 'Revisar permissões de usuários',
      category: 'users',
      priority: 'high',
      status: 'pending',
      assignedTo: 'Admin',
      dueDate: '2026-01-25',
      description: 'Verificar e atualizar níveis de acesso',
      createdAt: '2026-01-20'
    },
    {
      id: '2',
      title: 'Backup do banco de dados',
      category: 'system',
      priority: 'urgent',
      status: 'in_progress',
      assignedTo: 'Sistema',
      dueDate: '2026-01-23',
      description: 'Backup semanal agendado',
      createdAt: '2026-01-15'
    },
    {
      id: '3',
      title: 'Otimizar queries lentas',
      category: 'development',
      priority: 'medium',
      status: 'pending',
      assignedTo: 'Dev Team',
      dueDate: '2026-01-30',
      description: 'Identificar e otimizar queries com performance > 500ms',
      createdAt: '2026-01-18'
    }
  ])

  const getCategoryIcon = (category: AdminTask['category']) => {
    switch (category) {
      case 'system': return <Zap className="w-4 h-4" />
      case 'data': return <Database className="w-4 h-4" />
      case 'users': return <Users className="w-4 h-4" />
      case 'maintenance': return <Settings className="w-4 h-4" />
      case 'development': return <Activity className="w-4 h-4" />
    }
  }

  const getPriorityColor = (priority: AdminTask['priority']) => {
    switch (priority) {
      case 'urgent': return 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/30'
      case 'high': return 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/30'
      case 'medium': return 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/30'
      case 'low': return 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30'
    }
  }

  const getStatusColor = (status: AdminTask['status']) => {
    switch (status) {
      case 'completed': return 'bg-green-500/10 text-green-600 dark:text-green-400'
      case 'in_progress': return 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
      case 'blocked': return 'bg-red-500/10 text-red-600 dark:text-red-400'
      case 'pending': return 'bg-slate-500/10 text-slate-600 dark:text-slate-400'
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white">
            Administração Técnica
          </h1>
          <p className="text-slate-600 dark:text-slate-400 mt-1">
            Gerencie tarefas administrativas, métricas do sistema e configurações técnicas
          </p>
        </div>
        <button
          onClick={() => setShowNewTaskModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors"
        >
          <Plus className="w-5 h-5" />
          Nova Tarefa Admin
        </button>
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-200 dark:border-slate-700">
        <nav className="flex gap-6">
          {[
            { id: 'overview', label: 'Visão Geral', icon: BarChart3 },
            { id: 'tasks', label: 'Tarefas Admin', icon: CheckSquare },
            { id: 'metrics', label: 'Métricas', icon: TrendingUp },
            { id: 'system', label: 'Sistema', icon: Settings },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 px-4 py-3 border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                  : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <tab.icon className="w-5 h-5" />
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Content */}
      <div>
        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Métricas rápidas */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {systemMetrics.map((metric, index) => (
                <div
                  key={index}
                  className="glass rounded-xl p-4 border border-slate-200 dark:border-slate-700"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm text-slate-600 dark:text-slate-400">
                        {metric.label}
                      </p>
                      <p className="text-2xl font-bold text-slate-900 dark:text-white mt-1">
                        {metric.value}
                      </p>
                    </div>
                    {metric.status && (
                      <span
                        className={`px-2 py-1 rounded-full text-xs ${
                          metric.status === 'good'
                            ? 'bg-green-500/10 text-green-600'
                            : metric.status === 'warning'
                            ? 'bg-yellow-500/10 text-yellow-600'
                            : 'bg-red-500/10 text-red-600'
                        }`}
                      >
                        {metric.status === 'good' ? '✓' : '!'}
                      </span>
                    )}
                  </div>
                  {metric.change && (
                    <div className="flex items-center gap-2 mt-2">
                      {metric.trend === 'up' && (
                        <TrendingUp className="w-4 h-4 text-green-500" />
                      )}
                      {metric.trend === 'down' && (
                        <TrendingUp className="w-4 h-4 text-red-500 rotate-180" />
                      )}
                      <span
                        className={`text-sm ${
                          metric.trend === 'up'
                            ? 'text-green-600'
                            : metric.trend === 'down'
                            ? 'text-red-600'
                            : 'text-slate-600'
                        }`}
                      >
                        {metric.change}
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Tarefas urgentes */}
            <div className="glass rounded-xl p-6 border border-slate-200 dark:border-slate-700">
              <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-4">
                Tarefas Urgentes
              </h2>
              <div className="space-y-3">
                {adminTasks
                  .filter((t) => t.priority === 'urgent' || t.priority === 'high')
                  .map((task) => (
                    <div
                      key={task.id}
                      className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800/50 rounded-lg"
                    >
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-slate-200 dark:bg-slate-700 rounded-lg">
                          {getCategoryIcon(task.category)}
                        </div>
                        <div>
                          <p className="font-medium text-slate-900 dark:text-white">
                            {task.title}
                          </p>
                          <p className="text-sm text-slate-600 dark:text-slate-400">
                            {task.assignedTo} • {task.dueDate}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span
                          className={`px-3 py-1 rounded-full text-xs font-medium border ${getPriorityColor(
                            task.priority
                          )}`}
                        >
                          {task.priority}
                        </span>
                        <span
                          className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(
                            task.status
                          )}`}
                        >
                          {task.status}
                        </span>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        )}

        {/* Tasks Tab */}
        {activeTab === 'tasks' && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <button className="px-4 py-2 bg-slate-100 dark:bg-slate-800 rounded-lg text-sm font-medium">
                Todas
              </button>
              <button className="px-4 py-2 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-sm font-medium">
                Pendentes
              </button>
              <button className="px-4 py-2 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-sm font-medium">
                Em Progresso
              </button>
              <button className="px-4 py-2 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-sm font-medium">
                Concluídas
              </button>
            </div>

            <div className="glass rounded-xl border border-slate-200 dark:border-slate-700 divide-y divide-slate-200 dark:divide-slate-700">
              {adminTasks.map((task) => (
                <div key={task.id} className="p-6 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-4 flex-1">
                      <div className="p-3 bg-slate-100 dark:bg-slate-800 rounded-xl">
                        {getCategoryIcon(task.category)}
                      </div>
                      <div className="flex-1">
                        <h3 className="font-semibold text-slate-900 dark:text-white">
                          {task.title}
                        </h3>
                        {task.description && (
                          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                            {task.description}
                          </p>
                        )}
                        <div className="flex items-center gap-4 mt-3 text-sm text-slate-600 dark:text-slate-400">
                          {task.assignedTo && (
                            <span className="flex items-center gap-1">
                              <Users className="w-4 h-4" />
                              {task.assignedTo}
                            </span>
                          )}
                          {task.dueDate && (
                            <span className="flex items-center gap-1">
                              <Clock className="w-4 h-4" />
                              {new Date(task.dueDate).toLocaleDateString('pt-BR')}
                            </span>
                          )}
                          <span className="flex items-center gap-1 capitalize">
                            <FileText className="w-4 h-4" />
                            {task.category}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 ml-4">
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-medium border ${getPriorityColor(
                          task.priority
                        )}`}
                      >
                        {task.priority}
                      </span>
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(
                          task.status
                        )}`}
                      >
                        {task.status}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Metrics Tab */}
        {activeTab === 'metrics' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {systemMetrics.map((metric, index) => (
              <div
                key={index}
                className="glass rounded-xl p-6 border border-slate-200 dark:border-slate-700"
              >
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="font-semibold text-slate-900 dark:text-white">
                      {metric.label}
                    </h3>
                    <p className="text-3xl font-bold text-slate-900 dark:text-white mt-2">
                      {metric.value}
                    </p>
                  </div>
                  {metric.status && (
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-medium ${
                        metric.status === 'good'
                          ? 'bg-green-500/10 text-green-600'
                          : metric.status === 'warning'
                          ? 'bg-yellow-500/10 text-yellow-600'
                          : 'bg-red-500/10 text-red-600'
                      }`}
                    >
                      {metric.status}
                    </span>
                  )}
                </div>
                {metric.change && (
                  <div className="flex items-center gap-2">
                    {metric.trend === 'up' && (
                      <TrendingUp className="w-5 h-5 text-green-500" />
                    )}
                    {metric.trend === 'down' && (
                      <TrendingUp className="w-5 h-5 text-red-500 rotate-180" />
                    )}
                    <span
                      className={`text-sm font-medium ${
                        metric.trend === 'up'
                          ? 'text-green-600'
                          : metric.trend === 'down'
                          ? 'text-red-600'
                          : 'text-slate-600'
                      }`}
                    >
                      {metric.change} vs. período anterior
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* System Tab */}
        {activeTab === 'system' && (
          <div className="space-y-6">
            <div className="glass rounded-xl p-6 border border-slate-200 dark:border-slate-700">
              <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-4">
                Informações do Sistema
              </h2>
              <div className="space-y-4">
                <div className="flex items-center justify-between py-3 border-b border-slate-200 dark:border-slate-700">
                  <span className="text-slate-600 dark:text-slate-400">Versão</span>
                  <span className="font-medium text-slate-900 dark:text-white">1.0.0</span>
                </div>
                <div className="flex items-center justify-between py-3 border-b border-slate-200 dark:border-slate-700">
                  <span className="text-slate-600 dark:text-slate-400">Ambiente</span>
                  <span className="font-medium text-slate-900 dark:text-white">Production</span>
                </div>
                <div className="flex items-center justify-between py-3 border-b border-slate-200 dark:border-slate-700">
                  <span className="text-slate-600 dark:text-slate-400">Última atualização</span>
                  <span className="font-medium text-slate-900 dark:text-white">22/01/2026</span>
                </div>
                <div className="flex items-center justify-between py-3">
                  <span className="text-slate-600 dark:text-slate-400">Status</span>
                  <span className="px-3 py-1 bg-green-500/10 text-green-600 rounded-full text-sm font-medium">
                    Operacional
                  </span>
                </div>
              </div>
            </div>

            <div className="glass rounded-xl p-6 border border-slate-200 dark:border-slate-700">
              <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-4">
                Ações Rápidas
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <button className="flex items-center gap-3 p-4 bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors text-left">
                  <Database className="w-5 h-5 text-primary-500" />
                  <div>
                    <p className="font-medium text-slate-900 dark:text-white">Backup Manual</p>
                    <p className="text-sm text-slate-600 dark:text-slate-400">Criar backup do banco</p>
                  </div>
                </button>
                <button className="flex items-center gap-3 p-4 bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors text-left">
                  <Activity className="w-5 h-5 text-primary-500" />
                  <div>
                    <p className="font-medium text-slate-900 dark:text-white">Logs do Sistema</p>
                    <p className="text-sm text-slate-600 dark:text-slate-400">Ver logs recentes</p>
                  </div>
                </button>
                <button className="flex items-center gap-3 p-4 bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors text-left">
                  <Users className="w-5 h-5 text-primary-500" />
                  <div>
                    <p className="font-medium text-slate-900 dark:text-white">Gestão de Usuários</p>
                    <p className="text-sm text-slate-600 dark:text-slate-400">Gerenciar permissões</p>
                  </div>
                </button>
                <button className="flex items-center gap-3 p-4 bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors text-left">
                  <Settings className="w-5 h-5 text-primary-500" />
                  <div>
                    <p className="font-medium text-slate-900 dark:text-white">Configurações</p>
                    <p className="text-sm text-slate-600 dark:text-slate-400">Ajustes do sistema</p>
                  </div>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Modal Nova Tarefa (placeholder) */}
      {showNewTaskModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 max-w-2xl w-full">
            <h3 className="text-xl font-semibold text-slate-900 dark:text-white mb-4">
              Nova Tarefa Administrativa
            </h3>
            <p className="text-slate-600 dark:text-slate-400 mb-6">
              Funcionalidade em desenvolvimento. Em breve você poderá criar e gerenciar tarefas administrativas completas.
            </p>
            <button
              onClick={() => setShowNewTaskModal(false)}
              className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors"
            >
              Fechar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
