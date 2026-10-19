import React, { useState, useEffect, useCallback } from 'react';
import { InstitutionSettings, UserRole } from '../../types';
import { dbService } from '../../services/db';
import { isGatewayConfigured } from '../../utils/notificationGateway';
import { isLikelyVapidKey } from '../../utils/pushNotifications';

interface TabIntegracoesProps {
  settings: InstitutionSettings;
  currentUserRole?: UserRole;
  onSaveAll: (options?: { loadingMessage?: string; successMessage?: string; requiredRule?: string }) => void;
  /** Estes separadores propagam as alterações em tempo real; nada há a recolher. */
  registerCommit?: (commit: (() => Partial<InstitutionSettings>) | null) => void;
}

export const TabIntegracoes: React.FC<TabIntegracoesProps> = ({
  settings,
  currentUserRole,
  onSaveAll,
  registerCommit
}) => {
  // Todos os parâmetros deste separador vivem em settings.integrations e são
  // gravados pelo botão «Guardar Alterações» do topo do módulo. Nada aqui é
  // fixo no código: a entidade EMIS configurada é a mesma que passa a compor as
  // referências Multicaixa das faturas emitidas na Tesouraria.
  const integrations = settings.integrations || {};

  const [emisEntity, setEmisEntity] = useState(integrations.emisEntity || '');
  const [emisClientId, setEmisClientId] = useState(integrations.emisClientId || '');
  const [emisSecretKey, setEmisSecretKey] = useState(integrations.emisSecretKey || '');
  const [sandboxMode, setSandboxMode] = useState(integrations.emisSandbox === true);
  const [agtCertificate, setAgtCertificate] = useState(integrations.agtSoftwareCertificate || '');
  const [agtSeries, setAgtSeries] = useState(integrations.agtInvoiceSeries || '');
  const [agtSeriesStart, setAgtSeriesStart] = useState(integrations.agtSeriesStartIso || '');
  const [smsProvider, setSmsProvider] = useState(integrations.smsProvider || '');
  const [smsSenderId, setSmsSenderId] = useState(integrations.smsSenderId || '');
  const [smsBalance, setSmsBalance] = useState<string>(
    integrations.smsBalance !== undefined ? String(integrations.smsBalance) : ''
  );
  const [smsNotifyCharges, setSmsNotifyCharges] = useState(integrations.smsNotifyCharges === true);
  const [smsNotifyAbsences, setSmsNotifyAbsences] = useState(integrations.smsNotifyAbsences === true);
  const [smsNotifyGrades, setSmsNotifyGrades] = useState(integrations.smsNotifyGrades === true);
  const [webhookUrl, setWebhookUrl] = useState(integrations.webhookUrl || '');
  const [notifyGatewayUrl, setNotifyGatewayUrl] = useState(integrations.notifyGatewayUrl || '');
  const [pushVapidPublicKey, setPushVapidPublicKey] = useState(integrations.pushVapidPublicKey || '');

  // O endereço do gateway só é aceite em HTTPS (ou http://localhost para desenvolvimento).
  const gatewayUrlTrimmed = notifyGatewayUrl.trim();
  const gatewayUrlValid = gatewayUrlTrimmed === '' || isGatewayConfigured({ url: gatewayUrlTrimmed });
  // Chave VAPID pública: texto base64url (≈87 caracteres).
  const vapidTrimmed = pushVapidPublicKey.trim();
  const vapidValid = vapidTrimmed === '' || isLikelyVapidKey(vapidTrimmed);

  const [showSecretKey, setShowSecretKey] = useState(false);
  const [copiedId, setCopiedId] = useState(false);
  const [testingPing, setTestingPing] = useState(false);
  const [pingSuccess, setPingSuccess] = useState<boolean | null>(null);
  const [pingReport, setPingReport] = useState<string[]>([]);

  const connectedCount =
    (emisEntity.trim() && emisClientId.trim() ? 1 : 0) +
    (agtCertificate.trim() ? 1 : 0) +
    (smsProvider.trim() && smsSenderId.trim() ? 1 : 0);

  // Recolha das alterações para o botão «Guardar Alterações» do topo.
  const buildPendingSettings = useCallback(
    (): Partial<InstitutionSettings> => ({
      integrations: {
        ...integrations,
        emisEntity: emisEntity.trim(),
        emisClientId: emisClientId.trim(),
        emisSecretKey: emisSecretKey.trim(),
        emisSandbox: sandboxMode,
        agtSoftwareCertificate: agtCertificate.trim(),
        agtInvoiceSeries: agtSeries.trim(),
        agtSeriesStartIso: agtSeriesStart,
        smsProvider: smsProvider.trim(),
        smsSenderId: smsSenderId.trim(),
        smsBalance: smsBalance.trim() === '' ? undefined : Number(smsBalance),
        smsNotifyCharges,
        smsNotifyAbsences,
        smsNotifyGrades,
        webhookUrl: webhookUrl.trim(),
        notifyGatewayUrl: gatewayUrlTrimmed,
        pushVapidPublicKey: vapidTrimmed
      }
    }),
    [
      integrations,
      emisEntity,
      emisClientId,
      emisSecretKey,
      sandboxMode,
      agtCertificate,
      agtSeries,
      agtSeriesStart,
      smsProvider,
      smsSenderId,
      smsBalance,
      smsNotifyCharges,
      smsNotifyAbsences,
      smsNotifyGrades,
      webhookUrl,
      gatewayUrlTrimmed,
      vapidTrimmed
    ]
  );

  useEffect(() => {
    registerCommit?.(buildPendingSettings);
    return () => registerCommit?.(null);
  }, [registerCommit, buildPendingSettings]);

  const copyToClipboard = (text: string) => {
    navigator.clipboard?.writeText(text);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  };

  /**
   * Verificação real das interfaces: em vez de simular um "200 OK", confirma o
   * que está efetivamente parametrizado na base de dados e regista o resultado
   * na trilha de auditoria.
   */
  const handleTestPing = () => {
    setTestingPing(true);
    const report: string[] = [];

    if (emisEntity.trim() && emisClientId.trim()) {
      report.push(
        `Multicaixa Express (EMIS): entidade ${emisEntity.trim()} configurada em modo ${sandboxMode ? 'SANDBOX' : 'PRODUÇÃO'}${emisSecretKey.trim() ? ' com chave secreta definida' : ' — falta a chave secreta'}.`
      );
    } else {
      report.push('Multicaixa Express (EMIS): sem entidade/Client ID configurados — as faturas ficam sem referência de pagamento.');
    }

    report.push(
      agtCertificate.trim()
        ? `AGT / SAF-T (AO): certificado ${agtCertificate.trim()}${agtSeries.trim() ? `, série ${agtSeries.trim()}` : ''}.`
        : 'AGT / SAF-T (AO): certificado de software por preencher.'
    );

    report.push(
      smsProvider.trim() && smsSenderId.trim()
        ? `SMS (${smsProvider.trim()}): remetente ${smsSenderId.trim()}${smsBalance.trim() ? `, saldo de ${smsBalance.trim()} mensagens` : ''}.`
        : 'Gateway SMS: operadora ou remetente por configurar — as notificações não são enviadas.'
    );

    report.push(
      gatewayUrlTrimmed
        ? gatewayUrlValid
          ? `Servidor de notificações: ${gatewayUrlTrimmed} (o envio real de SMS/WhatsApp fica ativo; o endereço não foi contactado neste teste).`
          : 'Servidor de notificações: endereço inválido — use HTTPS.'
        : 'Servidor de notificações: sem endereço — SMS/WhatsApp pelo servidor ficam desativados (o WhatsApp manual por wa.me continua a funcionar).'
    );
    report.push(
      vapidTrimmed
        ? vapidValid
          ? 'Push com a app fechada: chave pública VAPID definida (falta o emissor no servidor).'
          : 'Push: a chave VAPID não parece válida.'
        : 'Push com a app fechada: chave VAPID por preencher (só há avisos com a app aberta em segundo plano).'
    );

    setPingReport(report);
    setPingSuccess(connectedCount === 3);
    setTestingPing(false);

    try {
      dbService.addAuditLog({
        userName: dbService.getCurrentUser()?.name || 'Administrador',
        userRole: String(currentUserRole || 'admin'),
        action: 'Verificação de Integrações Externas',
        details: report.join(' | '),
        module: 'sistema',
        timestamp: new Date().toLocaleString('pt-PT'),
        badgeColor: '#0b1f3a'
      } as any);
    } catch {
      // auditoria best-effort
    }

    setTimeout(() => setPingSuccess(null), 8000);
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Top Header */}
      <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-slate-100 flex items-center justify-center text-[#0b1f3a] shrink-0">
            <span className="material-symbols-outlined text-[26px]">hub</span>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] uppercase tracking-wider text-[#ac332b] font-bold">Módulo 06</span>
              <span className="w-1 h-1 rounded-full bg-slate-300" />
              <span className="text-[11px] text-slate-500 font-medium">Integrações de API</span>
            </div>
            <h2 className="font-headline text-lg lg:text-xl font-bold text-slate-900">
              Gateways Bancários & Comunicações
            </h2>
          </div>
        </div>

        <button
          type="button"
          onClick={handleTestPing}
          className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs flex items-center gap-1.5 transition-colors self-start"
        >
          <span className="material-symbols-outlined text-[16px]">network_check</span>
          <span>{testingPing ? 'A testar conexões...' : 'Testar Conexões de API'}</span>
        </button>
      </div>

      {pingReport.length > 0 && pingSuccess !== null && (
        <div
          className={`p-3.5 rounded-xl text-xs flex flex-col gap-1.5 border ${
            pingSuccess
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-amber-50 border-amber-200 text-amber-900'
          }`}
        >
          <span className="font-bold flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px]">
              {pingSuccess ? 'check_circle' : 'warning'}
            </span>
            {pingSuccess
              ? 'Todas as interfaces estão parametrizadas na base de dados.'
              : 'Há interfaces por configurar — veja o detalhe abaixo.'}
          </span>
          {pingReport.map((line) => (
            <span key={line} className="pl-6">
              {line}
            </span>
          ))}
        </div>
      )}

      {/* Bloco 1: Conexões de Pagamento & Entidades em Angola */}
      <section className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs flex flex-col gap-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div>
            <h3 className="font-headline text-base lg:text-lg font-bold text-slate-900">
              1. Conexões de API
            </h3>
          </div>
          <span className="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200 font-mono text-[11px] font-bold">
            {connectedCount} DE 3 INTERFACES CONFIGURADAS
          </span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Multicaixa Express */}
          <div className="p-5 rounded-xl bg-slate-50 border border-slate-100 flex flex-col justify-between gap-4">
            <div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-[#ac332b] text-[22px]">contactless</span>
                  <span className="font-bold text-slate-900 text-sm">EMIS-MULTICAIXA</span>
                </div>
                <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 text-[10px] font-bold">
                  {sandboxMode ? 'SANDBOX' : 'PRODUÇÃO ATIVO'}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-2">
                Geração automática de referências de pagamento.
              </p>

              <div className="space-y-2 mt-3 text-xs">
                <div>
                  <span className="text-[10px] font-bold text-slate-500 uppercase">Entidade EMIS</span>
                  <input
                    type="text"
                    value={emisEntity}
                    onChange={(e) => setEmisEntity(e.target.value.replace(/\D/g, '').slice(0, 5))}
                    placeholder="ex: 00192"
                    className="w-full mt-0.5 p-1.5 font-mono font-bold text-slate-900 bg-white border border-slate-200 rounded-lg text-[11px]"
                  />
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-500 uppercase">Client ID</span>
                  <div className="flex items-center justify-between p-1.5 bg-white border border-slate-200 rounded-lg">
                    <input
                      type="text"
                      value={emisClientId}
                      onChange={(e) => setEmisClientId(e.target.value)}
                      placeholder="Client ID fornecido pela EMIS"
                      className="font-mono text-[11px] text-slate-800 truncate w-full border-0 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => copyToClipboard(emisClientId)}
                      className="text-slate-400 hover:text-slate-700"
                    >
                      <span className="material-symbols-outlined text-[15px]">content_copy</span>
                    </button>
                  </div>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-500 uppercase">Secret Key</span>
                  <div className="flex items-center justify-between p-1.5 bg-white border border-slate-200 rounded-lg">
                    <input
                      type={showSecretKey ? 'text' : 'password'}
                      value={emisSecretKey}
                      onChange={(e) => setEmisSecretKey(e.target.value)}
                      placeholder="Chave secreta da EMIS"
                      className="font-mono text-[11px] text-slate-800 truncate w-full border-0 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setShowSecretKey(!showSecretKey)}
                      className="text-slate-400 hover:text-slate-700"
                    >
                      <span className="material-symbols-outlined text-[15px]">
                        {showSecretKey ? 'visibility_off' : 'visibility'}
                      </span>
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-200 flex items-center justify-between text-xs">
              <span className="text-slate-500 font-mono text-[11px]">
                {emisEntity.trim() ? `Entidade ${emisEntity.trim()} activa` : 'Entidade por configurar'}
              </span>
              <button
                type="button"
                onClick={() => setSandboxMode(!sandboxMode)}
                className="text-[#0b1f3a] hover:text-[#ac332b] font-bold"
              >
                Alternar Sandbox
              </button>
            </div>
          </div>

          {/* SAF-T (AO) & AGT */}
          <div className="p-5 rounded-xl bg-slate-50 border border-slate-100 flex flex-col justify-between gap-4">
            <div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-[#0b1f3a] text-[22px]">verified_user</span>
                  <span className="font-bold text-slate-900 text-sm">AGT-SAFT</span>
                </div>
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                    agtCertificate.trim() ? 'bg-blue-50 text-[#0b1f3a]' : 'bg-amber-50 text-amber-800'
                  }`}
                >
                  {agtCertificate.trim() ? 'CERTIFICADO DECLARADO' : 'SEM CERTIFICADO'}
                </span>
              </div>
              

              <div className="space-y-2 mt-3 text-xs">
                <div>
                  <span className="text-[10px] font-bold text-slate-500 uppercase">Certificado de Software</span>
                  <input
                    type="text"
                    value={agtCertificate}
                    onChange={(e) => setAgtCertificate(e.target.value)}
                    placeholder="ex: 312/AGT/2024"
                    className="w-full mt-0.5 p-1.5 font-mono font-bold text-slate-900 bg-white border border-slate-200 rounded-lg text-[11px]"
                  />
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-500 uppercase">Série em Emissão</span>
                  <div className="flex gap-1.5 mt-0.5">
                    <input
                      type="text"
                      value={agtSeries}
                      onChange={(e) => setAgtSeries(e.target.value)}
                      placeholder="ex: FT 2026/A"
                      className="flex-1 p-1.5 font-mono text-[11px] text-slate-800 bg-white border border-slate-200 rounded-lg"
                    />
                    <input
                      type="date"
                      value={agtSeriesStart}
                      onChange={(e) => setAgtSeriesStart(e.target.value)}
                      className="p-1.5 font-mono text-[11px] text-slate-800 bg-white border border-slate-200 rounded-lg"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-200 flex items-center justify-between text-xs">
              <span className="text-[11px] text-amber-800 leading-snug">
                A validade fiscal exige software validado pela AGT. Para emitir documentos válidos e submeter o SAF-T (AO), use um programa de faturação certificado e registe aqui o seu número de certificado.
              </span>
            </div>
          </div>

          {/* Gateway SMS */}
          <div className="p-5 rounded-xl bg-slate-50 border border-slate-100 flex flex-col justify-between gap-4">
            <div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-[#0b1f3a] text-[22px]">sms</span>
                  <span className="font-bold text-slate-900 text-sm">{smsProvider.trim() || 'Gateway SMS'}</span>
                </div>
                <span className="px-2 py-0.5 rounded bg-blue-50 text-[#0b1f3a] font-bold text-[10px]">
                  {smsBalance.trim() ? `${Number(smsBalance).toLocaleString('pt-PT')} SMS` : 'SEM SALDO REGISTADO'}
                </span>
              </div>
             

              <div className="space-y-2 mt-3 text-xs">
                <div>
                  <span className="text-[10px] font-bold text-slate-500 uppercase">Operadora / Gateway</span>
                  <input
                    type="text"
                    value={smsProvider}
                    onChange={(e) => setSmsProvider(e.target.value)}
                    placeholder="ex: Unitel, Africell"
                    className="w-full mt-0.5 p-1.5 text-[11px] text-slate-800 bg-white border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-500 uppercase">Saldo de Mensagens</span>
                  <input
                    type="number"
                    min={0}
                    value={smsBalance}
                    onChange={(e) => setSmsBalance(e.target.value)}
                    placeholder="Saldo contratado com a operadora"
                    className="w-full mt-0.5 p-1.5 font-mono text-[11px] text-slate-800 bg-white border border-slate-200 rounded-lg"
                  />
                </div>

                <div>
                  <span className="text-[10px] font-bold text-slate-500 uppercase">Remetente Autorizado</span>
                  <input
                    type="text"
                    value={smsSenderId}
                    onChange={(e) => setSmsSenderId(e.target.value.toUpperCase().slice(0, 11))}
                    placeholder="ex: ESCOLA-AO"
                    className="w-full mt-0.5 p-1.5 font-mono text-xs font-bold text-slate-800 bg-white border border-slate-200 rounded-lg"
                  />
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-200 flex items-center justify-between text-xs">
              <span className="text-slate-500 text-[11px]">Entrega direta</span>
              <button
                type="button"
                onClick={() => alert('Para recarregar o pacote de SMS da escola, contate a operadora ou adicione via fatura.')}
                className="text-[#0b1f3a] hover:text-[#ac332b] font-bold"
              >
                Recarregar Pacote
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Webhooks e Comunicação de Eventos */}
      <section className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs flex flex-col gap-4">
        <div className="pb-3 border-b border-slate-100">
          <h3 className="font-headline text-base lg:text-lg font-bold text-slate-900">
            2. Webhooks & Notificações de Cobrança
          </h3>
          <p className="text-xs text-slate-500">
            Endpoints de notificação em tempo real para sincronização de pagamentos Multicaixa Express.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-100 flex flex-col gap-2">
            <span className="font-bold text-slate-900">Webhook de Confirmação Multicaixa Express</span>
            <div className="flex items-center justify-between p-2 bg-white border border-slate-200 rounded-lg font-mono text-[11px] text-slate-800">
              <input
                type="url"
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
                placeholder="https://.../payments/mcx/callback"
                className="truncate w-full border-0 focus:outline-none font-mono text-[11px]"
              />
              <button
                type="button"
                onClick={() => copyToClipboard(webhookUrl)}
                className="text-slate-400 hover:text-slate-700 ml-2"
              >
                <span className="material-symbols-outlined text-[15px]">content_copy</span>
              </button>
            </div>
            <span className="text-[11px] text-slate-500">
              Recebe confirmações instantâneas de pagamento de propinas e emite recibos automáticos.
            </span>
          </div>

          <div className="p-4 rounded-xl bg-slate-50 border border-slate-100 flex flex-col gap-2 md:col-span-2">
            <span className="font-bold text-slate-900">Servidor de Notificações (SMS/WhatsApp reais) e Push</span>
            <span className="text-[11px] text-slate-500">
              O navegador nunca guarda chaves do fornecedor: envia o pedido a este servidor (ver server/notify.ts), que valida
              quem pede e fala com o Twilio. As chaves do Twilio ficam só nas variáveis de ambiente do servidor.
            </span>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <span className="text-[10px] font-bold text-slate-500 uppercase">Endereço do servidor (HTTPS)</span>
                <input
                  type="url"
                  value={notifyGatewayUrl}
                  onChange={(e) => setNotifyGatewayUrl(e.target.value)}
                  placeholder="https://notificacoes.escola.exemplo.ao"
                  className={`w-full mt-0.5 p-1.5 font-mono text-[11px] text-slate-800 bg-white border rounded-lg ${gatewayUrlValid ? 'border-slate-200' : 'border-red-400'}`}
                />
                {!gatewayUrlValid && <span className="text-[10px] text-red-600 font-semibold">Use um endereço HTTPS válido.</span>}
                {!gatewayUrlTrimmed && (
                  <span className="text-[10px] text-slate-500 block">Sem endereço, o botão de envio real fica desativado.</span>
                )}
              </div>
              <div>
                <span className="text-[10px] font-bold text-slate-500 uppercase">Chave pública VAPID (push)</span>
                <input
                  type="text"
                  value={pushVapidPublicKey}
                  onChange={(e) => setPushVapidPublicKey(e.target.value)}
                  placeholder="Chave pública (nunca a privada)"
                  className={`w-full mt-0.5 p-1.5 font-mono text-[11px] text-slate-800 bg-white border rounded-lg ${vapidValid ? 'border-slate-200' : 'border-red-400'}`}
                />
                {!vapidValid && <span className="text-[10px] text-red-600 font-semibold">A chave não parece uma chave VAPID válida.</span>}
                <span className="text-[10px] text-slate-500 block">
                  Só a chave pública. Para push com a app fechada falta ainda um emissor web-push no servidor.
                </span>
              </div>
            </div>
            <div className="mt-3">
              <span className="text-[10px] font-bold text-slate-500 uppercase">Cópias de segurança</span>
              <span className="text-[10px] text-slate-500 block">
                Já não precisa de servidor externo: em Segurança &amp; Backups baixa-se um ficheiro com todos os dados da escola
                e carrega-se o mesmo ficheiro para restaurar (tudo feito pelo próprio Supabase).
              </span>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-slate-50 border border-slate-100 flex flex-col gap-2">
            <span className="font-bold text-slate-900">Disparos Automáticos de SMS</span>
            <div className="space-y-1.5 text-[11px] text-slate-600">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={smsNotifyCharges}
                  onChange={(e) => setSmsNotifyCharges(e.target.checked)}
                />
                <span>
                  Cobrança preventiva, antes do dia {settings.financialRules?.paymentDueDay ?? 10} de cada mês
                </span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={smsNotifyAbsences}
                  onChange={(e) => setSmsNotifyAbsences(e.target.checked)}
                />
                <span>Alerta de faltas injustificadas acumuladas no trimestre</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={smsNotifyGrades}
                  onChange={(e) => setSmsNotifyGrades(e.target.checked)}
                />
                <span>Publicação de Pautas: resumo das notas trimestrais</span>
              </label>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-white rounded-2xl border border-slate-200 shadow-xs">
        <div className="flex items-center gap-2 text-slate-500 text-xs">
          <span className="material-symbols-outlined text-slate-400">lock</span>
          <span>Tokens de API protegidos e compatíveis com a infraestrutura bancária de Angola.</span>
        </div>
        
      </div>
    </div>
  );
};
