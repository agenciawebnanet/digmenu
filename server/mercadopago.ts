import crypto from 'crypto';

export interface MercadoPagoConfigStatus {
  configured: boolean;
  isTestCredential: boolean;
  mode: 'mercadopago_test' | 'mercadopago_live' | 'unconfigured';
  simulatorEnabled: boolean;
  missingEnvVars: string[];
  warning?: string;
}

export function isSubscriptionSimulatorEnabled(): boolean {
  if (process.env.ENABLE_SUBSCRIPTION_SIMULATOR === 'true') return true;
  if (process.env.ENABLE_SUBSCRIPTION_SIMULATOR === 'false') return false;
  return process.env.NODE_ENV !== 'production';
}

export function getMercadoPagoConfig(): MercadoPagoConfigStatus {
  const token = process.env.MERCADOPAGO_ACCESS_TOKEN?.trim() || '';
  const webhookSecret = process.env.MERCADOPAGO_WEBHOOK_SECRET?.trim() || '';
  const annualPrice = Number(process.env.ANNUAL_PLAN_PRICE_CENTS || 0);
  const simulatorEnabled = isSubscriptionSimulatorEnabled();

  const missingEnvVars: string[] = [];
  if (!token) missingEnvVars.push('MERCADOPAGO_ACCESS_TOKEN');
  if (!webhookSecret) missingEnvVars.push('MERCADOPAGO_WEBHOOK_SECRET');
  if (!annualPrice || annualPrice <= 0) missingEnvVars.push('ANNUAL_PLAN_PRICE_CENTS');

  if (!token) {
    return {
      configured: false,
      isTestCredential: false,
      mode: 'unconfigured',
      simulatorEnabled,
      missingEnvVars,
    };
  }

  const isTest = token.startsWith('TEST-');
  const allowLive = process.env.NODE_ENV === 'production' || process.env.MERCADOPAGO_ALLOW_LIVE === 'true';

  if (!isTest && !allowLive) {
    return {
      configured: false,
      isTestCredential: false,
      mode: 'unconfigured',
      simulatorEnabled,
      missingEnvVars,
      warning:
        'Token de produção detectado fora do modo de produção. Use um token TEST-... ou defina MERCADOPAGO_ALLOW_LIVE=true.',
    };
  }

  return {
    configured: true,
    isTestCredential: isTest,
    mode: isTest ? 'mercadopago_test' : 'mercadopago_live',
    simulatorEnabled,
    missingEnvVars,
  };
}

export async function createAnnualPreapprovalCheckout(params: {
  storeId: string;
  storeName: string;
  payerEmail: string;
  annualPriceCents: number;
  backUrl: string;
}): Promise<{ checkoutUrl: string; providerSubscriptionId: string }> {
  const cfg = getMercadoPagoConfig();
  const token = process.env.MERCADOPAGO_ACCESS_TOKEN?.trim() || '';
  if (!cfg.configured || !token) {
    throw new Error(
      'Integração Mercado Pago pendente de configuração (defina MERCADOPAGO_ACCESS_TOKEN).'
    );
  }
  if (!params.annualPriceCents || params.annualPriceCents <= 0) {
    throw new Error(
      'Defina ANNUAL_PLAN_PRICE_CENTS no servidor antes de gerar cobrança no Mercado Pago.'
    );
  }

  const planId = process.env.MERCADOPAGO_PREAPPROVAL_PLAN_ID?.trim();
  const transactionAmount = Number((params.annualPriceCents / 100).toFixed(2));

  const body: Record<string, unknown> = {
    reason: `DigMenu Anual — ${params.storeName}`,
    external_reference: params.storeId,
    payer_email: params.payerEmail,
    back_url: params.backUrl,
    auto_recurring: {
      frequency: 12,
      frequency_type: 'months',
      transaction_amount: transactionAmount,
      currency_id: 'BRL',
    },
    status: 'pending',
  };

  if (planId) {
    body.preapproval_plan_id = planId;
  }

  const resp = await fetch('https://api.mercadopago.com/preapproval', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const data = (await resp.json()) as Record<string, any>;
  if (!resp.ok) {
    throw new Error(data?.message || 'Falha ao criar assinatura anual no Mercado Pago.');
  }

  return {
    checkoutUrl:
      cfg.isTestCredential && data.sandbox_init_point
        ? data.sandbox_init_point
        : data.init_point || data.sandbox_init_point || params.backUrl,
    providerSubscriptionId: String(data.id),
  };
}

export async function fetchMercadoPagoPreapproval(preapprovalId: string): Promise<{
  id: string;
  status: string;
  externalReference?: string;
  amountCents: number;
}> {
  const cfg = getMercadoPagoConfig();
  const token = process.env.MERCADOPAGO_ACCESS_TOKEN?.trim() || '';
  if (!cfg.configured || !token) {
    throw new Error('Credenciais do Mercado Pago não configuradas no servidor.');
  }

  const resp = await fetch(
    `https://api.mercadopago.com/preapproval/${encodeURIComponent(preapprovalId)}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  const data = (await resp.json()) as Record<string, any>;
  if (!resp.ok) {
    throw new Error(data?.message || 'Não foi possível consultar a assinatura no Mercado Pago.');
  }

  const amount = Number(data?.auto_recurring?.transaction_amount || 0);
  return {
    id: String(data.id),
    status: String(data.status || 'pending'),
    externalReference: data.external_reference ? String(data.external_reference) : undefined,
    amountCents: Math.round(amount * 100),
  };
}

/**
 * Validates Mercado Pago x-signature header (ts=...,v1=...) against MERCADOPAGO_WEBHOOK_SECRET.
 */
export function verifyMercadoPagoWebhookSignature(params: {
  xSignatureHeader?: string;
  xRequestIdHeader?: string;
  dataId?: string;
}): boolean {
  const secret = process.env.MERCADOPAGO_WEBHOOK_SECRET?.trim();
  if (!secret) return false;
  if (!params.xSignatureHeader || !params.dataId) return false;

  const parts = params.xSignatureHeader.split(',');
  let ts = '';
  let v1 = '';
  for (const part of parts) {
    const [k, v] = part.split('=').map((s) => s.trim());
    if (k === 'ts') ts = v || '';
    if (k === 'v1') v1 = v || '';
  }

  if (!ts || !v1) return false;

  const manifest = `id:${params.dataId};request-id:${params.xRequestIdHeader || ''};ts:${ts};`;
  const expected = crypto.createHmac('sha256', secret).update(manifest).digest('hex');

  const a = Buffer.from(v1, 'hex');
  const b = Buffer.from(expected, 'hex');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
