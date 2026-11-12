import React from 'react';
import { ArrowLeft, UtensilsCrossed } from 'lucide-react';

interface LegalPagesProps {
  page: 'termos' | 'privacidade' | 'suporte';
  onNavigate: (path: string) => void;
}

export const LegalPages: React.FC<LegalPagesProps> = ({ page, onNavigate }) => {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <button
            type="button"
            onClick={() => onNavigate('/')}
            className="inline-flex items-center gap-2 text-sm font-semibold text-slate-700 hover:text-slate-900 min-h-[44px] cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Voltar ao DigMenu</span>
          </button>
          <div className="flex items-center gap-2">
            <span className="w-8 h-8 rounded-lg bg-orange-600 text-white flex items-center justify-center">
              <UtensilsCrossed className="w-4 h-4" />
            </span>
            <span className="font-display font-bold text-slate-900">DigMenu</span>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-10">
        <div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 space-y-5">
          {page === 'termos' && (
            <>
              <h1 className="font-display text-2xl font-bold text-slate-900">Termos de Uso (Prévia)</h1>
              <p className="text-sm text-slate-600 leading-relaxed">
                Esta instância do DigMenu é um ambiente de prévia isolado destinado à validação de fluxo,
                cadastro de lojas fictícias, cardápios digitais e simulação do ciclo anual de assinatura.
              </p>
              <div className="space-y-3 text-sm text-slate-700 leading-relaxed">
                <p>
                  1. <strong>Ciclo de assinatura:</strong> O DigMenu adota assinatura exclusivamente anual com ciclo de 12 meses e renovação automática. Na prévia, nenhuma cobrança real é efetuada.
                </p>
                <p>
                  2. <strong>Responsabilidade sobre o catálogo:</strong> Cada restaurante cadastrado é responsável pelas informações de produtos, preços, bairros, horários e número de WhatsApp informados no painel.
                </p>
                <p>
                  3. <strong>Cancelamento da renovação:</strong> Ao cancelar a renovação automática, o acesso da loja permanece preservado até o encerramento do período anual vigente.
                </p>
              </div>
            </>
          )}

          {page === 'privacidade' && (
            <>
              <h1 className="font-display text-2xl font-bold text-slate-900">Política de Privacidade</h1>
              <p className="text-sm text-slate-600 leading-relaxed">
                Os dados desta prévia são armazenados em banco de dados separado da produção.
              </p>
              <div className="space-y-3 text-sm text-slate-700 leading-relaxed">
                <p>
                  1. <strong>Isolamento entre empresas:</strong> Dados administrativos, pedidos e assinaturas são isolados por loja e protegidos por sessão autenticada no servidor.
                </p>
                <p>
                  2. <strong>Dados públicos do cardápio:</strong> A rota pública exibe exclusivamente nome, endereço de retirada, horários, bairros ativos e produtos disponíveis da loja consultada.
                </p>
                <p>
                  3. <strong>Credenciais e tokens:</strong> Senhas são protegidas por derivação criptográfica (scrypt) e sessões utilizam cookies HttpOnly.
                </p>
              </div>
            </>
          )}

          {page === 'suporte' && (
            <>
              <h1 className="font-display text-2xl font-bold text-slate-900">Suporte e Orientações da Prévia</h1>
              <p className="text-sm text-slate-600 leading-relaxed">
                Utilize as rotas abaixo para testar o fluxo completo do DigMenu nesta prévia:
              </p>
              <div className="space-y-3 text-sm text-slate-700 leading-relaxed">
                <p>
                  • <strong>Criar nova loja de teste:</strong> Acesse <button onClick={() => onNavigate('/cadastro')} className="text-orange-700 font-semibold underline cursor-pointer">/cadastro</button>, informe os dados do restaurante e um WhatsApp com DDD.
                </p>
                <p>
                  • <strong>Acessar lojas de exemplo no painel:</strong> Acesse <button onClick={() => onNavigate('/entrar')} className="text-orange-700 font-semibold underline cursor-pointer">/entrar</button> e selecione uma das contas fictícias pré-preenchidas.
                </p>
                <p>
                  • <strong>Simular assinatura anual:</strong> No painel da loja, acesse <strong>Assinatura</strong> (<span className="font-mono">/painel/assinatura</span>) para testar ativação, renovação de 12 meses, pagamento em atraso, cancelamento da renovação e expiração.
                </p>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
};
