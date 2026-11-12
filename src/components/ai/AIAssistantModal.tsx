import React, { useState } from 'react';
import { Sparkles, X, Loader2 } from 'lucide-react';

interface AIAssistantModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectDescription: (desc: string) => void;
}

export const AIAssistantModal: React.FC<AIAssistantModalProps> = ({ isOpen, onClose, onSelectDescription }) => {
  const [dishName, setDishName] = useState('');
  const [category, setCategory] = useState('Prato Principal');
  const [ingredients, setIngredients] = useState('');
  const [style, setStyle] = useState('Apetitoso e sofisticado');
  const [loading, setLoading] = useState(false);
  const [generatedText, setGeneratedText] = useState('');

  if (!isOpen) return null;

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setGeneratedText('');

    try {
      const response = await fetch('/api/generate-description', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dishName, category, ingredients, style })
      });
      const data = await response.json();
      if (data.success) {
        setGeneratedText(data.description);
      } else {
        setGeneratedText('Não foi possível gerar a descrição. Tente novamente.');
      }
    } catch (err) {
      console.error(err);
      setGeneratedText('Erro de conexão ao gerar descrição.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden">
        <div className="bg-gradient-to-r from-purple-600 to-indigo-600 p-6 text-white">
          <button 
            onClick={onClose}
            className="absolute top-4 right-4 text-white/80 hover:text-white p-1 rounded-full hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2.5 bg-white/15 rounded-xl">
              <Sparkles className="w-6 h-6 text-amber-300 animate-pulse" />
            </div>
            <h3 className="text-xl font-bold tracking-tight">Gerador de Descrição com IA</h3>
          </div>
          <p className="text-purple-100 text-sm">
            Crie textos irresistíveis para aumentar seus pedidos no WhatsApp.
          </p>
        </div>

        <form onSubmit={handleGenerate} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">Nome do Prato / Produto</label>
            <input
              type="text"
              required
              value={dishName}
              onChange={(e) => setDishName(e.target.value)}
              placeholder="Ex: Burger Bacon Supremo"
              className="w-full px-4 py-2.5 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">Categoria</label>
              <input
                type="text"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="Ex: Lanches"
                className="w-full px-3 py-2.5 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">Estilo do Texto</label>
              <select
                value={style}
                onChange={(e) => setStyle(e.target.value)}
                className="w-full px-3 py-2.5 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white"
              >
                <option value="Apetitoso e sofisticado">Apetitoso & Sofisticado</option>
                <option value="Focado em artesanal e caseiro">Artesanal & Caseiro</option>
                <option value="Rápido e direto ao ponto">Direto ao Ponto</option>
                <option value="Divertido e informal">Divertido & Jovem</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">Ingredientes Principais</label>
            <input
              type="text"
              value={ingredients}
              onChange={(e) => setIngredients(e.target.value)}
              placeholder="Ex: Blend 180g, cheddar cremoso, bacon crocante, pão brioche"
              className="w-full px-4 py-2.5 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-semibold rounded-xl shadow-lg shadow-purple-600/20 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            {loading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Criando descrição mágica...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-5 h-5" />
                <span>Gerar Descrição Irresistível</span>
              </>
            )}
          </button>

          {generatedText && (
            <div className="mt-4 p-4 bg-purple-50 border border-purple-200 rounded-xl space-y-3">
              <span className="text-xs font-semibold text-purple-800 uppercase tracking-wider">Sugestão Pronta:</span>
              <p className="text-sm text-purple-900 italic font-medium leading-relaxed">"{generatedText}"</p>
              <button
                type="button"
                onClick={() => {
                  onSelectDescription(generatedText);
                  onClose();
                }}
                className="w-full py-2 bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer"
              >
                Usar esta Descrição no Prato
              </button>
            </div>
          )}
        </form>
      </div>
    </div>
  );
};
