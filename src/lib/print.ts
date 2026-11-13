import {
  OrderRecord,
  StoreSummary,
  FULFILLMENT_LABELS,
  PAYMENT_METHOD_LABELS,
  formatBRL,
  formatDateTimeBR,
} from '../types';

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Gera uma comanda térmica (80mm) pronta para impressão pelo diálogo nativo do navegador.
 * Impressão silenciosa direta ESC/POS requer ponte local dedicada (ex: QZ Tray).
 */
export function printOrderTicket(order: OrderRecord, store: StoreSummary, mode: 'kitchen' | 'receipt' = 'receipt'): void {
  if (typeof window === 'undefined') return;

  const fulfillmentLabel = FULFILLMENT_LABELS[order.fulfillment_type] || order.fulfillment_type;
  const paymentLabel = order.payment_method ? PAYMENT_METHOD_LABELS[order.payment_method] : 'A combinar';

  const itemsHtml = order.items
    .map((item) => {
      const sizeText = item.selectedSize?.name ? ` (${escapeHtml(item.selectedSize.name)})` : '';
      const addonsText =
        item.selectedAddons && item.selectedAddons.length > 0
          ? `<div style="font-size:11px;margin-left:14px;color:#333;">+ ${item.selectedAddons
              .map((a) => escapeHtml(a.name))
              .join(', ')}</div>`
          : '';
      return `
        <div style="margin-bottom:6px;">
          <div style="display:flex;justify-content:space-between;gap:8px;font-weight:600;">
            <span>${item.quantity}x ${escapeHtml(item.product_name_snapshot)}${sizeText}</span>
            ${mode === 'receipt' ? `<span>${escapeHtml(formatBRL(item.line_total_cents))}</span>` : ''}
          </div>
          ${addonsText}
        </div>
      `;
    })
    .join('');

  const html = `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <title>${mode === 'kitchen' ? 'Comanda Cozinha' : 'Cupom Pedido'} #${order.order_number}</title>
  <style>
    @page { size: 80mm auto; margin: 4mm; }
    body {
      font-family: 'Courier New', monospace;
      font-size: 12px;
      color: #000;
      width: 72mm;
      margin: 0 auto;
      padding: 4px;
    }
    .center { text-align: center; }
    .divider { border-top: 1px dashed #000; margin: 8px 0; }
    .big { font-size: 18px; font-weight: 800; }
    .row { display: flex; justify-content: space-between; margin: 3px 0; }
  </style>
</head>
<body>
  <div class="center">
    <div style="font-weight:700;font-size:14px;">${escapeHtml(store.name)}</div>
    <div>${mode === 'kitchen' ? 'COMANDA DE PRODUÇÃO (COZINHA)' : 'COMPROVANTE DE PEDIDO'}</div>
    <div class="big">#${order.order_number}</div>
    <div style="font-size:11px;">${escapeHtml(formatDateTimeBR(order.created_at))}</div>
  </div>
  <div class="divider"></div>
  <div><strong>Cliente:</strong> ${escapeHtml(order.customer_name)}</div>
  <div><strong>Modalidade:</strong> ${escapeHtml(fulfillmentLabel)}${
    order.table_label ? ` — ${escapeHtml(order.table_label)}` : ''
  }</div>
  ${
    order.fulfillment_type === 'delivery' && order.delivery_address
      ? `<div><strong>Endereço:</strong> ${escapeHtml(order.delivery_address)} (${escapeHtml(
          order.neighborhood_name || ''
        )})</div>`
      : ''
  }
  ${order.notes ? `<div style="margin-top:4px;"><strong>OBS:</strong> ${escapeHtml(order.notes)}</div>` : ''}
  <div class="divider"></div>
  ${itemsHtml}
  ${
    mode === 'receipt'
      ? `
    <div class="divider"></div>
    <div class="row"><span>Subtotal:</span><span>${escapeHtml(formatBRL(order.subtotal_cents))}</span></div>
    ${
      order.delivery_fee_cents > 0
        ? `<div class="row"><span>Taxa de entrega:</span><span>${escapeHtml(formatBRL(order.delivery_fee_cents))}</span></div>`
        : ''
    }
    <div class="row" style="font-size:15px;font-weight:800;margin-top:4px;">
      <span>TOTAL:</span><span>${escapeHtml(formatBRL(order.total_cents))}</span>
    </div>
    <div class="divider"></div>
    <div><strong>Pagamento:</strong> ${escapeHtml(paymentLabel)} (${
          order.payment_status === 'paid' ? 'PAGO' : 'PENDENTE'
        })</div>
  `
      : ''
  }
  <div class="divider"></div>
  <div class="center" style="font-size:10px;">DigMenu — Gestão para Restaurantes</div>
</body>
</html>`;

  // Use a hidden print iframe so we never depend on window.open popup blockers inside iframes
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow?.document;
  if (!doc) {
    document.body.removeChild(iframe);
    return;
  }
  doc.open();
  doc.write(html);
  doc.close();

  setTimeout(() => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } finally {
      setTimeout(() => {
        if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
      }, 1500);
    }
  }, 150);
}
