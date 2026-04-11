'use client';

/**
 * @fileoverview AI Modes Test Page
 *
 * Página de teste para validar todos os modos de AI.
 * Acesse em: /test/ai-modes
 *
 * @module app/(app)/test/ai-modes/page
 */

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Zap,
  LayoutTemplate,
  Brain,
  Settings2,
  Play,
  Trash2,
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertCircle,
} from 'lucide-react';

type AIMode = 'zero_config' | 'template' | 'auto_learn' | 'advanced';

interface StatusData {
  status: string;
  organizationId: string;
  config: {
    mode: string;
    templateId: string | null;
    hasLearnedPatterns: boolean;
    provider: string;
    hasApiKey: boolean;
    enabled: boolean;
  };
  stageConfigs: {
    count: number;
  };
  templates: Array<{ id: string; name: string; displayName: string; isSystem: boolean }>;
  data: {
    conversations: number;
    deals: number;
  };
  modes: Record<AIMode, { description: string; ready: boolean }>;
}

interface TestResult {
  success: boolean;
  mode: string;
  modeInfo: Record<string, unknown>;
  input: string;
  response: string;
  metrics: {
    duration: number;
    tokens: number;
    model: string;
    provider: string;
  };
}

const MODE_INFO: Record<AIMode, { icon: React.ReactNode; title: string; description: string }> = {
  zero_config: {
    icon: <Zap className="h-5 w-5" />,
    title: 'Automático (Zero Config)',
    description: 'BANT automático, sem configuração manual',
  },
  template: {
    icon: <LayoutTemplate className="h-5 w-5" />,
    title: 'Template',
    description: 'Usa metodologia pré-definida (BANT, SPIN, etc)',
  },
  auto_learn: {
    icon: <Brain className="h-5 w-5" />,
    title: 'Auto-Learn',
    description: 'Aprende padrões de conversas de sucesso',
  },
  advanced: {
    icon: <Settings2 className="h-5 w-5" />,
    title: 'Avançado',
    description: 'Configuração manual por estágio',
  },
};

export default function AIModesTestPage() {
  const [status, setStatus] = useState<StatusData | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedMode, setSelectedMode] = useState<AIMode>('zero_config');
  const [selectedTemplate, setSelectedTemplate] = useState('BANT');
  const [testMessage, setTestMessage] = useState('Olá! Vi que vocês oferecem serviços de CRM. Gostaria de saber mais.');
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [logs, setLogs] = useState<string[]>([]);

  const addLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs((prev) => [...prev, `[${timestamp}] ${message}`]);
  };

  const fetchStatus = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/test/ai-modes');
      const data = await res.json();
      setStatus(data);
      addLog(`Status loaded: mode=${data.config?.mode}, stageConfigs=${data.stageConfigs?.count}`);
    } catch (error) {
      addLog(`Error fetching status: ${error}`);
    } finally {
      setLoading(false);
    }
  };

  const cleanupData = async () => {
    setLoading(true);
    addLog('Cleaning up test data...');
    try {
      const res = await fetch('/api/test/cleanup', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        addLog(`Cleanup complete: ${JSON.stringify(data.cleaned)}`);
        await fetchStatus();
      } else {
        addLog(`Cleanup failed: ${data.error}`);
      }
    } catch (error) {
      addLog(`Error: ${error}`);
    } finally {
      setLoading(false);
    }
  };

  const setupMode = async (mode: AIMode) => {
    setLoading(true);
    addLog(`Setting up mode: ${mode}`);
    try {
      const res = await fetch('/api/test/setup-mode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode,
          templateName: mode === 'template' ? selectedTemplate : undefined,
        }),
      });
      const data = await res.json();
      if (data.success) {
        addLog(`Mode ${mode} configured: ${JSON.stringify(data.setup)}`);
        await fetchStatus();
      } else {
        addLog(`Setup failed: ${data.error}`);
      }
    } catch (error) {
      addLog(`Error: ${error}`);
    } finally {
      setLoading(false);
    }
  };

  const runTest = async () => {
    setLoading(true);
    setTestResult(null);
    addLog(`Testing mode: ${selectedMode} with message: "${testMessage.substring(0, 30)}..."`);
    try {
      const res = await fetch('/api/test/ai-modes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: selectedMode, testMessage }),
      });
      const data = await res.json();
      if (data.success) {
        setTestResult(data);
        addLog(
          `Response received (${data.metrics.duration}ms, ${data.metrics.tokens} tokens): "${data.response.substring(0, 50)}..."`
        );
      } else {
        addLog(`Test failed: ${data.error}`);
      }
    } catch (error) {
      addLog(`Error: ${error}`);
    } finally {
      setLoading(false);
    }
  };

  const runAllTests = async () => {
    const modes: AIMode[] = ['zero_config', 'template', 'auto_learn', 'advanced'];
    addLog('=== Running all mode tests ===');

    for (const mode of modes) {
      addLog(`\n--- Testing ${mode} ---`);
      await setupMode(mode);
      setSelectedMode(mode);
      await runTest();
      await new Promise((r) => setTimeout(r, 1000)); // Small delay between tests
    }

    addLog('=== All tests complete ===');
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  return (
    <div className="container mx-auto py-8 px-4 max-w-6xl">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold">AI Modes Test Panel</h1>
          <p className="text-muted-foreground">Teste todos os modos de IA do sistema</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={fetchStatus} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button variant="destructive" onClick={cleanupData} disabled={loading}>
            <Trash2 className="h-4 w-4 mr-2" />
            Clean Data
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Status Card */}
        <Card>
          <CardHeader>
            <CardTitle>Current Status</CardTitle>
            <CardDescription>Estado atual da configuração de AI</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {status ? (
              <>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Mode:</span>
                    <Badge variant="outline" className="ml-2">
                      {status.config.mode}
                    </Badge>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Provider:</span>
                    <Badge variant="secondary" className="ml-2">
                      {status.config.provider}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">API Key:</span>
                    {status.config.hasApiKey ? (
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                    ) : (
                      <XCircle className="h-4 w-4 text-red-500" />
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">Learned Patterns:</span>
                    {status.config.hasLearnedPatterns ? (
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                    ) : (
                      <XCircle className="h-4 w-4 text-gray-400" />
                    )}
                  </div>
                  <div>
                    <span className="text-muted-foreground">Stage Configs:</span>
                    <Badge className="ml-2">{status.stageConfigs.count}</Badge>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Conversations:</span>
                    <Badge variant="outline" className="ml-2">
                      {status.data.conversations}
                    </Badge>
                  </div>
                </div>

                <div className="border-t pt-4 mt-4">
                  <h4 className="font-medium mb-2">Mode Readiness</h4>
                  <div className="grid grid-cols-2 gap-2">
                    {Object.entries(status.modes).map(([mode, info]) => (
                      <div key={mode} className="flex items-center gap-2">
                        {info.ready ? (
                          <CheckCircle2 className="h-4 w-4 text-green-500" />
                        ) : (
                          <AlertCircle className="h-4 w-4 text-yellow-500" />
                        )}
                        <span className="text-sm">{mode}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <p className="text-muted-foreground">Loading...</p>
            )}
          </CardContent>
        </Card>

        {/* Test Controls Card */}
        <Card>
          <CardHeader>
            <CardTitle>Test Controls</CardTitle>
            <CardDescription>Configure e teste cada modo</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Modo</label>
              <select
                value={selectedMode}
                onChange={(e) => setSelectedMode(e.target.value as AIMode)}
                className="w-full p-2 border rounded-md bg-background"
              >
                {(Object.keys(MODE_INFO) as AIMode[]).map((mode) => (
                  <option key={mode} value={mode}>
                    {MODE_INFO[mode].title}
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">{MODE_INFO[selectedMode].description}</p>
            </div>

            {selectedMode === 'template' && (
              <div className="space-y-2">
                <label className="text-sm font-medium">Template</label>
                <select
                  value={selectedTemplate}
                  onChange={(e) => setSelectedTemplate(e.target.value)}
                  className="w-full p-2 border rounded-md bg-background"
                >
                  {status?.templates?.map((t) => (
                    <option key={t.id} value={t.name}>
                      {t.displayName || t.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="space-y-2">
              <label className="text-sm font-medium">Test Message</label>
              <input
                type="text"
                value={testMessage}
                onChange={(e) => setTestMessage(e.target.value)}
                placeholder="Mensagem do lead..."
                className="w-full p-2 border rounded-md bg-background"
              />
            </div>

            <div className="flex gap-2">
              <Button onClick={() => setupMode(selectedMode)} disabled={loading} variant="outline">
                Setup Mode
              </Button>
              <Button onClick={runTest} disabled={loading}>
                <Play className="h-4 w-4 mr-2" />
                Test
              </Button>
              <Button onClick={runAllTests} disabled={loading} variant="secondary">
                Run All
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Result Card */}
        {testResult && (
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                Test Result
                <Badge>{testResult.mode}</Badge>
              </CardTitle>
              <CardDescription>
                {testResult.metrics.duration}ms | {testResult.metrics.tokens} tokens |{' '}
                {testResult.metrics.model}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h4 className="font-medium text-sm text-muted-foreground mb-1">Input</h4>
                <p className="bg-muted p-3 rounded">{testResult.input}</p>
              </div>
              <div>
                <h4 className="font-medium text-sm text-muted-foreground mb-1">AI Response</h4>
                <p className="bg-green-50 dark:bg-green-900/20 p-3 rounded border border-green-200 dark:border-green-800">
                  {testResult.response}
                </p>
              </div>
              <div>
                <h4 className="font-medium text-sm text-muted-foreground mb-1">Mode Info</h4>
                <pre className="bg-muted p-3 rounded text-xs overflow-auto">
                  {JSON.stringify(testResult.modeInfo, null, 2)}
                </pre>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Logs Card */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Logs</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="bg-slate-950 text-slate-50 p-4 rounded font-mono text-xs h-64 overflow-auto">
              {logs.length === 0 ? (
                <span className="text-slate-500">No logs yet...</span>
              ) : (
                logs.map((log, i) => (
                  <div key={i} className="mb-1">
                    {log}
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
