export interface StoreHourRow {
  day_of_week: number; // 0 = Domingo, 1 = Segunda ... 6 = Sabado
  open_time: string;   // "HH:MM"
  close_time: string;  // "HH:MM"
  is_closed: number;   // 0 | 1
}

export type SubscriptionStatus =
  | 'pendente'
  | 'ativa'
  | 'pagamento_em_atraso'
  | 'renovacao_cancelada'
  | 'expirada';

export interface StoreOperationalStatus {
  canAcceptOrders: boolean;
  isOpenBySchedule: boolean;
  isPaused: boolean;
  isSubscriptionBlocked: boolean;
  isPlatformBlocked?: boolean;
  badgeLabel: 'Aberto' | 'Fechado' | 'Pausado' | 'Assinatura expirada' | 'Assinatura pendente' | 'WhatsApp pendente' | 'Loja bloqueada';
  reason: string;
  currentLocalTime: string;
  currentDayOfWeek: number;
}

const WEEKDAY_MAP: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

export const DAY_NAMES_PT = [
  'Domingo',
  'Segunda-feira',
  'Terça-feira',
  'Quarta-feira',
  'Quinta-feira',
  'Sexta-feira',
  'Sábado',
];

function parseTimeToMinutes(hhmm: string): number {
  const [hStr, mStr] = hhmm.split(':');
  const h = parseInt(hStr || '0', 10);
  const m = parseInt(mStr || '0', 10);
  return h * 60 + m;
}

export function getStoreLocalClock(timezone: string, now = new Date()): {
  dayOfWeek: number;
  minutesSinceMidnight: number;
  formattedTime: string;
} {
  let tz = timezone || 'America/Sao_Paulo';
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz }).format(now);
  } catch {
    tz = 'America/Sao_Paulo';
  }

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now);

  const weekdayStr = parts.find((p) => p.type === 'weekday')?.value || 'Mon';
  let hour = parseInt(parts.find((p) => p.type === 'hour')?.value || '0', 10);
  if (hour === 24) hour = 0;
  const minute = parseInt(parts.find((p) => p.type === 'minute')?.value || '0', 10);

  const dayOfWeek = WEEKDAY_MAP[weekdayStr] ?? 1;
  const minutesSinceMidnight = hour * 60 + minute;
  const formattedTime = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;

  return { dayOfWeek, minutesSinceMidnight, formattedTime };
}

export function isEffectiveSubscriptionExpired(
  status: SubscriptionStatus | undefined,
  currentPeriodEnd: string | null | undefined,
  now = new Date()
): { effectiveStatus: SubscriptionStatus; allowsOrders: boolean; message?: string } {
  const st: SubscriptionStatus = status || 'pendente';

  if (st === 'expirada') {
    return {
      effectiveStatus: 'expirada',
      allowsOrders: false,
      message: 'A assinatura anual desta loja expirou. Novos pedidos estão pausados até a regularização.',
    };
  }

  if (st === 'pendente') {
    return {
      effectiveStatus: 'pendente',
      allowsOrders: false,
      message: 'A assinatura anual desta loja ainda está pendente de ativação.',
    };
  }

  if (st === 'renovacao_cancelada' && currentPeriodEnd) {
    const endTs = Date.parse(currentPeriodEnd);
    if (!Number.isNaN(endTs) && now.getTime() > endTs) {
      return {
        effectiveStatus: 'expirada',
        allowsOrders: false,
        message: 'O período vigente da assinatura cancelada terminou. Novos pedidos estão pausados até a renovação.',
      };
    }
  }

  return { effectiveStatus: st, allowsOrders: true };
}

export function evaluateStoreOperationalStatus(params: {
  timezone: string;
  hours: StoreHourRow[];
  isPaused: boolean;
  pauseReason?: string | null;
  whatsappE164?: string | null;
  subscriptionStatus?: SubscriptionStatus;
  subscriptionPeriodEnd?: string | null;
  isPlatformBlocked?: boolean;
  platformBlockReason?: string | null;
  now?: Date;
}): StoreOperationalStatus {
  const now = params.now || new Date();
  const { dayOfWeek, minutesSinceMidnight, formattedTime } = getStoreLocalClock(params.timezone, now);

  if (params.isPlatformBlocked) {
    return {
      canAcceptOrders: false,
      isOpenBySchedule: false,
      isPaused: params.isPaused,
      isSubscriptionBlocked: false,
      isPlatformBlocked: true,
      badgeLabel: 'Loja bloqueada',
      reason:
        params.platformBlockReason?.trim() ||
        'Este cardápio está temporariamente suspenso pela administração da plataforma.',
      currentLocalTime: formattedTime,
      currentDayOfWeek: dayOfWeek,
    };
  }

  const subCheck = isEffectiveSubscriptionExpired(
    params.subscriptionStatus,
    params.subscriptionPeriodEnd,
    now
  );

  const byDay = new Map<number, StoreHourRow>();
  for (const h of params.hours) {
    byDay.set(h.day_of_week, h);
  }

  let isOpenBySchedule = false;
  let scheduleReason = 'Sem horários configurados para hoje.';

  const todayRow = byDay.get(dayOfWeek);
  const yesterdayDay = (dayOfWeek + 6) % 7;
  const yesterdayRow = byDay.get(yesterdayDay);

  // 1. Check if yesterday's schedule crosses midnight into today
  if (yesterdayRow && !yesterdayRow.is_closed) {
    const yOpen = parseTimeToMinutes(yesterdayRow.open_time);
    const yClose = parseTimeToMinutes(yesterdayRow.close_time);
    if (yClose <= yOpen && minutesSinceMidnight < yClose) {
      isOpenBySchedule = true;
      scheduleReason = `Aberto no turno de ${DAY_NAMES_PT[yesterdayDay]} até ${yesterdayRow.close_time}.`;
    }
  }

  // 2. Check today's schedule
  if (!isOpenBySchedule && todayRow) {
    if (todayRow.is_closed) {
      scheduleReason = `Fechado às ${DAY_NAMES_PT[dayOfWeek].toLowerCase()}s.`;
    } else {
      const tOpen = parseTimeToMinutes(todayRow.open_time);
      const tClose = parseTimeToMinutes(todayRow.close_time);
      if (tClose > tOpen) {
        // Same-day window
        if (minutesSinceMidnight >= tOpen && minutesSinceMidnight < tClose) {
          isOpenBySchedule = true;
          scheduleReason = `Aberto hoje até ${todayRow.close_time}.`;
        } else if (minutesSinceMidnight < tOpen) {
          scheduleReason = `Abre hoje às ${todayRow.open_time}.`;
        } else {
          scheduleReason = `Encerrado hoje às ${todayRow.close_time}.`;
        }
      } else {
        // Cross-midnight window starting today (e.g. 18:00 -> 02:00)
        if (minutesSinceMidnight >= tOpen) {
          isOpenBySchedule = true;
          scheduleReason = `Aberto hoje das ${todayRow.open_time} até ${todayRow.close_time}.`;
        } else {
          scheduleReason = `Abre hoje às ${todayRow.open_time}.`;
        }
      }
    }
  }

  if (!subCheck.allowsOrders) {
    return {
      canAcceptOrders: false,
      isOpenBySchedule,
      isPaused: params.isPaused,
      isSubscriptionBlocked: true,
      badgeLabel: subCheck.effectiveStatus === 'pendente' ? 'Assinatura pendente' : 'Assinatura expirada',
      reason: subCheck.message || 'Assinatura inativa para novos pedidos.',
      currentLocalTime: formattedTime,
      currentDayOfWeek: dayOfWeek,
    };
  }

  if (!params.whatsappE164) {
    return {
      canAcceptOrders: false,
      isOpenBySchedule,
      isPaused: params.isPaused,
      isSubscriptionBlocked: false,
      badgeLabel: 'WhatsApp pendente',
      reason: 'O restaurante ainda não configurou um número de WhatsApp válido para receber pedidos.',
      currentLocalTime: formattedTime,
      currentDayOfWeek: dayOfWeek,
    };
  }

  if (params.isPaused) {
    return {
      canAcceptOrders: false,
      isOpenBySchedule,
      isPaused: true,
      isSubscriptionBlocked: false,
      badgeLabel: 'Pausado',
      reason: params.pauseReason?.trim() || 'Pedidos pausados manualmente pelo restaurante no momento.',
      currentLocalTime: formattedTime,
      currentDayOfWeek: dayOfWeek,
    };
  }

  if (!isOpenBySchedule) {
    return {
      canAcceptOrders: false,
      isOpenBySchedule: false,
      isPaused: false,
      isSubscriptionBlocked: false,
      badgeLabel: 'Fechado',
      reason: `Fora do horário de atendimento (${formattedTime}). ${scheduleReason}`,
      currentLocalTime: formattedTime,
      currentDayOfWeek: dayOfWeek,
    };
  }

  return {
    canAcceptOrders: true,
    isOpenBySchedule: true,
    isPaused: false,
    isSubscriptionBlocked: false,
    badgeLabel: 'Aberto',
    reason: scheduleReason,
    currentLocalTime: formattedTime,
    currentDayOfWeek: dayOfWeek,
  };
}
