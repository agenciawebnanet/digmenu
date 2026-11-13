import React from 'react';
import {
  CheckCircle2,
  Clock,
  AlertTriangle,
  PauseCircle,
  XCircle,
} from 'lucide-react';
import { SubscriptionStatus } from '../types';

interface BadgeSpec {
  label: string;
  shortLabel: string;
  description: string;
  badgeClass: string;
  iconClass: string;
  Icon: React.ComponentType<{ className?: string }>;
}

export const SUBSCRIPTION_BADGE_MAP: Record<SubscriptionStatus, BadgeSpec> = {
  ativa: {
    label: 'Ativa',
    shortLabel: 'Ativa',
    description: 'Acesso completo liberado e cardápio público recebendo pedidos normalmente.',
    badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    iconClass: 'text-emerald-600',
    Icon: CheckCircle2,
  },
  pendente: {
    label: 'Pendente',
    shortLabel: 'Pendente',
    description: 'Aguardando confirmação do pagamento anual para liberar os pedidos públicos.',
    badgeClass: 'bg-amber-50 text-amber-900 border-amber-200',
    iconClass: 'text-amber-600',
    Icon: Clock,
  },
  pagamento_em_atraso: {
    label: 'Em atraso',
    shortLabel: 'Em atraso',
    description: 'Pagamento anual em atraso. Regularize para evitar pausa automática do cardápio.',
    badgeClass: 'bg-rose-50 text-rose-900 border-rose-200',
    iconClass: 'text-rose-600',
    Icon: AlertTriangle,
  },
  renovacao_cancelada: {
    label: 'Renovação cancelada',
    shortLabel: 'Cancelada',
    description: 'Sem renovação automática; o acesso continua ativo até o fim do ciclo atual.',
    badgeClass: 'bg-slate-100 text-slate-800 border-slate-300',
    iconClass: 'text-slate-600',
    Icon: PauseCircle,
  },
  expirada: {
    label: 'Expirada',
    shortLabel: 'Expirada',
    description: 'Ciclo encerrado. Catálogo e pedidos preservados; novos pedidos pausados até renovar.',
    badgeClass: 'bg-red-100 text-red-900 border-red-300',
    iconClass: 'text-red-700',
    Icon: XCircle,
  },
};

interface SubscriptionBadgeProps {
  status: SubscriptionStatus;
  size?: 'sm' | 'md' | 'lg';
  compact?: boolean;
}

export const SubscriptionBadge: React.FC<SubscriptionBadgeProps> = ({
  status,
  size = 'md',
  compact = false,
}) => {
  const spec = SUBSCRIPTION_BADGE_MAP[status] || SUBSCRIPTION_BADGE_MAP.pendente;
  const Icon = spec.Icon;

  const sizeClass =
    size === 'sm'
      ? 'px-2 py-0.5 text-[11px] gap-1 rounded-lg'
      : size === 'lg'
      ? 'px-3.5 py-2 text-xs sm:text-sm gap-2 rounded-xl'
      : 'px-2.5 py-1 text-xs gap-1.5 rounded-xl';

  const iconSize = size === 'sm' ? 'w-3.5 h-3.5' : size === 'lg' ? 'w-4 h-4' : 'w-3.5 h-3.5';

  return (
    <span
      className={`inline-flex items-center font-bold border whitespace-nowrap shrink-0 ${sizeClass} ${spec.badgeClass}`}
    >
      <Icon className={`${iconSize} shrink-0 ${spec.iconClass}`} aria-hidden="true" />
      <span>{compact ? spec.shortLabel : spec.label}</span>
    </span>
  );
};

interface SubscriptionHealthCardsProps {
  currentStatus: SubscriptionStatus;
}

const CORE_HEALTH_STATES: SubscriptionStatus[] = [
  'ativa',
  'pendente',
  'pagamento_em_atraso',
  'renovacao_cancelada',
  'expirada',
];

export const SubscriptionHealthOverview: React.FC<SubscriptionHealthCardsProps> = ({
  currentStatus,
}) => {
  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
        <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
          Indicadores de saúde financeira do acesso
        </p>
        <p className="text-xs text-slate-500">
          Estado atual destacado abaixo
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
        {CORE_HEALTH_STATES.map((stateKey) => {
          const spec = SUBSCRIPTION_BADGE_MAP[stateKey];
          const Icon = spec.Icon;
          const isCurrent = currentStatus === stateKey;

          return (
            <div
              key={stateKey}
              className={`p-3 rounded-xl border transition-all ${
                isCurrent
                  ? `${spec.badgeClass} ring-2 ring-offset-1 ring-slate-900/15 shadow-xs`
                  : 'bg-slate-50/70 border-slate-200 text-slate-500 opacity-75'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  <Icon
                    className={`w-4 h-4 shrink-0 ${isCurrent ? spec.iconClass : 'text-slate-400'}`}
                    aria-hidden="true"
                  />
                  <span className="text-xs font-bold truncate">{spec.label}</span>
                </div>
                {isCurrent && (
                  <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-white/80 text-slate-900 border border-black/10 shrink-0">
                    Atual
                  </span>
                )}
              </div>
              <p className="text-[11px] leading-snug mt-1.5">
                {spec.description}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
};
