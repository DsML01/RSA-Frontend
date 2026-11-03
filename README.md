# RSA Project - Frontend

Interface web em React + TypeScript com Vite para interação com o sistema de avaliação e testes RSA.

## Tecnologias
- **Framework**: React 18
- **Linguagem**: TypeScript
- **Build tool**: Vite
- **Hospedagem Recomendada**: Vercel

## Estrutura do Projeto
```
RSA-Frontend/
├── src/
│   ├── App.tsx          # Componente principal da aplicação
│   ├── main.tsx         # Ponto de entrada React
│   └── styles.css       # Estilos da aplicação
├── index.html           # Template HTML Vite
├── package.json         # Dependências e scripts
├── vite.config.ts       # Configuração do Vite
├── tsconfig.json        # Configuração do TypeScript
└── .env.example         # Exemplo de variáveis de ambiente
```

## Como Rodar Localmente

1. Crie o arquivo `.env`:
   ```bash
   cp .env.example .env
   ```
2. Instale as dependências:
   ```bash
   npm install
   ```
3. Inicie o servidor de desenvolvimento:
   ```bash
   npm run dev
   ```

Acesse em `http://localhost:5173`.

## Deploy na Vercel

1. Suba este repositório para o seu GitHub.
2. Acesse [vercel.com](https://vercel.com) e importe o repositório `RSA-Frontend`.
3. Framework Preset: **Vite**.
4. Em **Environment Variables**, adicione:
   - `VITE_API_URL`: URL pública da sua API (ex: `https://api.seudominio.com/api/v1` ou `https://seu-tunnel.trycloudflare.com/api/v1`).
5. Clique em **Deploy**.
