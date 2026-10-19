import { isBulkAutoConfirm } from '../utils/bulkConfirm';
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { OperationStatusModal } from '../components/OperationStatusModal';
import { AppAlertModal } from '../components/AppAlertModal';
import { AppConfirmModal } from '../components/AppConfirmModal';
import { hasPermission } from '../utils/permissions';
import { dbService } from '../services/db';
import { UserRole } from '../types';

export class PermissionDeniedError extends Error {
  constructor(message = 'Acesso não autorizado: Esta operação está desabilitada para o seu perfil nas permissões do sistema.') {
    super(message);
    this.name = 'PermissionDeniedError';
  }
}

export interface GlobalOperationOptions {
  loadingMessage?: string;
  successMessage?: string;
  errorMessage?: string;
  errorDetails?: string;
  minDuration?: number;
  successDuration?: number;
  errorDuration?: number;
  requiredRule?: string;
  userRole?: string | UserRole;
  onSuccess?: () => void;
  onError?: (err: any) => void;
}

interface OperationState {
  isOpen: boolean;
  status: 'loading' | 'success' | 'error' | 'idle';
  loadingMessage: string;
  successMessage: string;
  errorMessage?: string;
  errorDetails?: string;
}

type OperationListener = (state: OperationState) => void;

class OperationEventManager {
  private listeners: Set<OperationListener> = new Set();
  private currentState: OperationState = {
    isOpen: false,
    status: 'idle',
    loadingMessage: 'A processar operação...',
    successMessage: 'Operação feita com sucesso!',
    errorMessage: 'Operação Não Realizada'
  };

  public subscribe(listener: OperationListener) {
    this.listeners.add(listener);
    listener(this.currentState);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public notify(newState: Partial<OperationState>) {
    this.currentState = { ...this.currentState, ...newState };
    this.listeners.forEach((listener) => {
      try {
        listener(this.currentState);
      } catch (err) {
        console.error('Erro ao notificar listener de operação:', err);
      }
    });
  }

  public getState() {
    return this.currentState;
  }
}

export const operationManager = new OperationEventManager();

// ---------------------------------------------------------------------------
// Caixa de diálogo personalizada (substitui o alert() nativo do navegador)
// ---------------------------------------------------------------------------

export interface AppAlertState {
  isOpen: boolean;
  title?: string;
  message: string;
  variant: 'info' | 'warning' | 'error';
}

type AlertListener = (state: AppAlertState) => void;

class AppAlertManager {
  private listeners: Set<AlertListener> = new Set();
  private currentState: AppAlertState = {
    isOpen: false,
    message: '',
    variant: 'warning'
  };

  public subscribe(listener: AlertListener) {
    this.listeners.add(listener);
    listener(this.currentState);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public notify(newState: Partial<AppAlertState>) {
    this.currentState = { ...this.currentState, ...newState };
    this.listeners.forEach((listener) => {
      try {
        listener(this.currentState);
      } catch (err) {
        console.error('Erro ao notificar listener de alerta:', err);
      }
    });
  }
}

export const appAlertManager = new AppAlertManager();

/**
 * Mostra uma caixa de diálogo personalizada do sistema BandMed, no lugar do
 * alert() nativo do navegador (que exibe o prefixo "localhost:3000 diz:").
 */
export function showAppAlert(message: string, options?: { title?: string; variant?: 'info' | 'warning' | 'error' }) {
  appAlertManager.notify({
    isOpen: true,
    message,
    title: options?.title,
    variant: options?.variant || 'warning'
  });
}

export function closeAppAlert() {
  appAlertManager.notify({ isOpen: false });
}

// ---------------------------------------------------------------------------
// Caixa de confirmação personalizada (substitui o window.confirm() nativo do
// navegador, que mostra o prefixo "localhost:3000 diz:" em vez da identidade
// visual do sistema BandMed).
// ---------------------------------------------------------------------------

export interface AppConfirmState {
  isOpen: boolean;
  title?: string;
  message: string;
  variant: 'info' | 'warning' | 'error';
  confirmLabel?: string;
  cancelLabel?: string;
}

type ConfirmListener = (state: AppConfirmState) => void;

class AppConfirmManager {
  private listeners: Set<ConfirmListener> = new Set();
  private currentState: AppConfirmState = {
    isOpen: false,
    message: '',
    variant: 'warning'
  };
  private pendingResolve: ((value: boolean) => void) | null = null;

  public subscribe(listener: ConfirmListener) {
    this.listeners.add(listener);
    listener(this.currentState);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public notify(newState: Partial<AppConfirmState>) {
    this.currentState = { ...this.currentState, ...newState };
    this.listeners.forEach((listener) => {
      try {
        listener(this.currentState);
      } catch (err) {
        console.error('Erro ao notificar listener de confirmação:', err);
      }
    });
  }

  public setPendingResolve(resolve: (value: boolean) => void) {
    this.pendingResolve = resolve;
  }

  public resolve(value: boolean) {
    const resolve = this.pendingResolve;
    this.pendingResolve = null;
    this.notify({ isOpen: false });
    if (resolve) resolve(value);
  }
}

export const appConfirmManager = new AppConfirmManager();

/**
 * Mostra uma caixa de confirmação (Sim/Não) do sistema BandMed, no lugar do
 * window.confirm() nativo do navegador. Devolve true se o utilizador confirmar.
 */
export function showAppConfirm(
  message: string,
  options?: { title?: string; variant?: 'info' | 'warning' | 'error'; confirmLabel?: string; cancelLabel?: string }
): Promise<boolean> {
  if (isBulkAutoConfirm()) return Promise.resolve(true);   // eliminação em lote já confirmada
  return new Promise((resolve) => {
    appConfirmManager.setPendingResolve(resolve);
    appConfirmManager.notify({
      isOpen: true,
      message,
      title: options?.title,
      variant: options?.variant || 'warning',
      confirmLabel: options?.confirmLabel,
      cancelLabel: options?.cancelLabel
    });
  });
}

export function resolveAppConfirm(value: boolean) {
  appConfirmManager.resolve(value);
}

/**
 * Função global para executar qualquer operação de inserção, alteração ou eliminação
 * com efeito de carregamento visual circular e mensagem de confirmação de sucesso (verde)
 * ou erro / bloqueio por permissão (vermelho: "Operação Não Realizada").
 */
export async function runGlobalOperation<T>(
  action: () => Promise<T> | T,
  options?: GlobalOperationOptions
): Promise<T> {
  const loadingMessage = options?.loadingMessage || 'A processar operação...';
  const successMessage = options?.successMessage || 'Operação feita com sucesso!';
  const errorMessage = options?.errorMessage || 'Operação Não Realizada';
  const bulk = isBulkAutoConfirm();   // eliminação em lote: sem pausas artificiais de 650 ms + 1,2 s por registo
  const minDuration = bulk ? 0 : (options?.minDuration ?? 650);
  const successDuration = bulk ? 0 : (options?.successDuration ?? 1200);
  const errorDuration = options?.errorDuration ?? 2200;

  // 1. Iniciar carregamento circular visual
  operationManager.notify({
    isOpen: true,
    status: 'loading',
    loadingMessage,
    successMessage,
    errorMessage
  });

  const startTime = Date.now();

  // 2. Verificação de permissões RBAC se especificada
  if (options?.requiredRule) {
    const role = options.userRole || dbService.getDatabase()?.currentUser?.role || 'admin';
    const isAllowed = hasPermission(role, options.requiredRule);

    if (!isAllowed) {
      // Manter o carregamento circular pelo tempo mínimo
      const elapsed = Date.now() - startTime;
      if (elapsed < minDuration) {
        await new Promise((resolve) => setTimeout(resolve, minDuration - elapsed));
      }

      // Apresentar modal vermelho com "Operação Não Realizada"
      operationManager.notify({
        isOpen: true,
        status: 'error',
        loadingMessage,
        successMessage: '',
        errorMessage: 'Operação Não Realizada',
        errorDetails:
          options?.errorDetails ||
          `Acesso bloqueado: A permissão [${options.requiredRule}] está desabilitada para o perfil [${role}].`
      });

      await new Promise((resolve) => setTimeout(resolve, errorDuration));

      operationManager.notify({
        isOpen: false,
        status: 'idle'
      });

      const err = new PermissionDeniedError(
        `Ação não permitida: A permissão [${options.requiredRule}] está desabilitada.`
      );
      if (options?.onError) {
        options.onError(err);
      }
      throw err;
    }
  }

  let result: T;

  try {
    result = await action();
    const elapsed = Date.now() - startTime;
    if (elapsed < minDuration) {
      await new Promise((resolve) => setTimeout(resolve, minDuration - elapsed));
    }

    // Sucesso verde
    operationManager.notify({
      isOpen: true,
      status: 'success',
      loadingMessage,
      successMessage,
      errorMessage: ''
    });

    await new Promise((resolve) => setTimeout(resolve, successDuration));

    operationManager.notify({
      isOpen: false,
      status: 'idle'
    });

    if (options?.onSuccess) {
      options.onSuccess();
    }

    return result;
  } catch (error: any) {
    const elapsed = Date.now() - startTime;
    if (elapsed < minDuration) {
      await new Promise((resolve) => setTimeout(resolve, minDuration - elapsed));
    }

    // Erro vermelho: "Operação Não Realizada"
    operationManager.notify({
      isOpen: true,
      status: 'error',
      loadingMessage,
      successMessage: '',
      errorMessage: options?.errorMessage || 'Operação Não Realizada',
      errorDetails: error?.message || options?.errorDetails || 'Não foi possível concluir a ação pretendida.'
    });

    await new Promise((resolve) => setTimeout(resolve, errorDuration));

    operationManager.notify({
      isOpen: false,
      status: 'idle'
    });

    if (options?.onError) {
      options.onError(error);
    }
    throw error;
  }
}

interface OperationContextType {
  runOperation: <T>(action: () => Promise<T> | T, options?: GlobalOperationOptions) => Promise<T>;
  isOperating: boolean;
  status: 'loading' | 'success' | 'error' | 'idle';
  loadingMessage: string;
  successMessage: string;
  errorMessage?: string;
  errorDetails?: string;
}

const OperationContext = createContext<OperationContextType>({
  runOperation: runGlobalOperation,
  isOperating: false,
  status: 'idle',
  loadingMessage: 'A processar operação...',
  successMessage: 'Operação feita com sucesso!',
  errorMessage: 'Operação Não Realizada'
});

export const OperationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [opState, setOpState] = useState<OperationState>(() => operationManager.getState());
  const [alertState, setAlertState] = useState<AppAlertState>({ isOpen: false, message: '', variant: 'warning' });
  const [confirmState, setConfirmState] = useState<AppConfirmState>({ isOpen: false, message: '', variant: 'warning' });

  useEffect(() => {
    return operationManager.subscribe((state) => {
      setOpState(state);
    });
  }, []);

  useEffect(() => {
    return appAlertManager.subscribe((state) => {
      setAlertState(state);
    });
  }, []);

  useEffect(() => {
    return appConfirmManager.subscribe((state) => {
      setConfirmState(state);
    });
  }, []);

  const runOperation = useCallback(
    <T,>(action: () => Promise<T> | T, options?: GlobalOperationOptions) => {
      return runGlobalOperation<T>(action, options);
    },
    []
  );

  return (
    <OperationContext.Provider
      value={{
        runOperation,
        isOperating: opState.status === 'loading',
        status: opState.status,
        loadingMessage: opState.loadingMessage,
        successMessage: opState.successMessage,
        errorMessage: opState.errorMessage,
        errorDetails: opState.errorDetails
      }}
    >
      {children}

      <OperationStatusModal
        isOpen={opState.isOpen && opState.status !== 'idle'}
        status={opState.status === 'loading' ? 'loading' : opState.status === 'error' ? 'error' : 'success'}
        loadingMessage={opState.loadingMessage}
        successMessage={opState.successMessage}
        errorMessage={opState.errorMessage}
        errorDetails={opState.errorDetails}
      />

      <AppAlertModal
        isOpen={alertState.isOpen}
        title={alertState.title}
        message={alertState.message}
        variant={alertState.variant}
        onClose={closeAppAlert}
      />

      <AppConfirmModal
        isOpen={confirmState.isOpen}
        title={confirmState.title}
        message={confirmState.message}
        variant={confirmState.variant}
        confirmLabel={confirmState.confirmLabel}
        cancelLabel={confirmState.cancelLabel}
        onConfirm={() => resolveAppConfirm(true)}
        onCancel={() => resolveAppConfirm(false)}
      />
    </OperationContext.Provider>
  );
};

export const useGlobalOperation = () => useContext(OperationContext);

export { AsyncButton } from '../components/AsyncButton';
