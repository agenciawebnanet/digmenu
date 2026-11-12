export interface WhatsAppValidationResult {
  valid: boolean;
  normalized?: string; // e.g. 5511999887766
  formatted?: string;  // e.g. +55 (11) 99988-7766
  error?: string;
}

/**
 * Normalizes a Brazilian phone/WhatsApp number to international E.164 digits (55 + DDD + number).
 * Accepts inputs like "(11) 99988-7766", "11999887766", "+55 11 99988-7766", "011 999887766".
 */
export function normalizeBrazilianWhatsApp(raw: string): WhatsAppValidationResult {
  if (!raw || typeof raw !== 'string') {
    return { valid: false, error: 'Informe o número de WhatsApp com DDD.' };
  }

  let digits = raw.replace(/\D/g, '');

  // Strip international prefix 00 if provided
  if (digits.startsWith('0055') && digits.length >= 14) {
    digits = digits.slice(2);
  }

  // Strip Brazil country code if already present
  if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) {
    digits = digits.slice(2);
  }

  // Strip leading trunk 0: 12 digits (0 + DDD + 9-digit mobile) or 11 digits (0 + DDD + 8-digit landline starting 2-5)
  if (
    digits.startsWith('0') &&
    (digits.length === 12 || (digits.length === 11 && /^[2-5]$/.test(digits[3] || '')))
  ) {
    digits = digits.slice(1);
  }

  if (digits.length !== 10 && digits.length !== 11) {
    return {
      valid: false,
      error: 'Informe um WhatsApp brasileiro válido com DDD (10 ou 11 dígitos, ex: (11) 99988-7766).',
    };
  }

  const ddd = parseInt(digits.slice(0, 2), 10);
  if (Number.isNaN(ddd) || ddd < 11 || ddd > 99) {
    return {
      valid: false,
      error: 'DDD brasileiro inválido. Use um DDD entre 11 e 99.',
    };
  }

  const subscriber = digits.slice(2);
  if (subscriber.length === 9 && !subscriber.startsWith('9')) {
    return {
      valid: false,
      error: 'Números celulares de 11 dígitos devem começar com 9 após o DDD.',
    };
  }

  const normalized = `55${digits}`;
  const dddStr = digits.slice(0, 2);
  const formatted =
    subscriber.length === 9
      ? `+55 (${dddStr}) ${subscriber.slice(0, 5)}-${subscriber.slice(5)}`
      : `+55 (${dddStr}) ${subscriber.slice(0, 4)}-${subscriber.slice(4)}`;

  return { valid: true, normalized, formatted };
}

export function formatCentsBRL(cents: number): string {
  const value = (cents / 100).toFixed(2).replace('.', ',');
  const [intPart, decPart] = value.split(',');
  const withThousands = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `R$ ${withThousands},${decPart}`;
}

export interface WhatsAppOrderMessageInput {
  storeName: string;
  orderNumber: number;
  customerName: string;
  fulfillmentType: 'delivery' | 'pickup';
  items: Array<{
    quantity: number;
    productName: string;
    lineTotalCents: number;
  }>;
  neighborhoodName?: string | null;
  deliveryFeeCents: number;
  deliveryAddress?: string | null;
  pickupAddress?: string | null;
  totalCents: number;
  notes?: string | null;
}

export function buildWhatsAppOrderMessage(input: WhatsAppOrderMessageInput): string {
  const lines: string[] = [
    `Olá, ${input.storeName}! Quero confirmar o pedido #${input.orderNumber}.`,
    `👤 ${input.customerName}`,
  ];

  for (const item of input.items) {
    lines.push(`• ${item.quantity}× ${item.productName} — ${formatCentsBRL(item.lineTotalCents)}`);
  }

  if (input.fulfillmentType === 'delivery') {
    const bairro = input.neighborhoodName || 'Bairro informado';
    lines.push(`🛵 Entrega em ${bairro} — ${formatCentsBRL(input.deliveryFeeCents)}`);
    if (input.deliveryAddress) {
      lines.push(`📍 ${input.deliveryAddress}`);
    }
  } else {
    lines.push(`🛍️ Retirada no local — ${formatCentsBRL(0)}`);
    if (input.pickupAddress) {
      lines.push(`📍 ${input.pickupAddress}`);
    }
  }

  lines.push(`💰 Total — ${formatCentsBRL(input.totalCents)}`);

  if (input.notes && input.notes.trim().length > 0) {
    lines.push(`📝 ${input.notes.trim()}`);
  }

  return lines.join('\n');
}

export function buildWhatsAppUrl(whatsappE164: string, message: string): string {
  const cleanPhone = whatsappE164.replace(/\D/g, '');
  return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
}
