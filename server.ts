import express from 'express';
import { fileURLToPath } from 'url';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function startServer() {
  const app = express();
  app.use(express.json());

  const isProduction = process.env.NODE_ENV === 'production';
  const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

  // Initialize Gemini AI
  const apiKey = process.env.GEMINI_API_KEY;
  const ai = new GoogleGenAI(apiKey ? { apiKey } : {});

  // API endpoint for AI description generation
  app.post('/api/generate-description', async (req, res) => {
    try {
      const { dishName, category, ingredients, style } = req.body;
      
      const prompt = `Crie uma descrição gastronômica muito apetitosa, vendedora e profissional para o prato "${dishName}" (categoria: ${category}, ingredientes principais: ${ingredients || 'ingredientes selecionados'}). Estilo: ${style || 'moderno e apetitoso'}. Responda em português do Brasil com no máximo 3 frases, focando em despertar desejo no cliente.`;

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
      });

      const description = response.text?.trim() || 'Delicioso prato preparado com ingredientes frescos e selecionados com carinho para você.';
      res.json({ success: true, description });
    } catch (error: any) {
      console.error('Gemini API Error:', error);
      res.status(500).json({ success: false, error: error.message || 'Erro ao gerar descrição com IA' });
    }
  });

  // Vite middleware for development
  if (!isProduction) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`DigMenu SaaS Server running on http://localhost:${port}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
});
