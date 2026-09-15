# Site de Estudos

Site para organizar PDFs e vídeos do YouTube por matéria. Feito para ser acessado
por várias pessoas (ex: em casa), com os dados salvos num banco online (Supabase).

⚠️ **Sem login**: qualquer pessoa com o link do site pode ver, adicionar e apagar
materiais. Isso é intencional para simplificar o uso em casa. Se quiser proteger
com senha no futuro, é só pedir.

## Passo 1 — Criar o banco de dados (Supabase, gratuito)

1. Crie uma conta em https://supabase.com e um novo projeto (escolha uma senha
   de banco de dados e guarde — não é a mesma coisa das chaves de API).
2. Espere o projeto terminar de ser criado (leva ~1 minuto).
3. No menu lateral, abra **SQL Editor** → **New query**.
4. Copie todo o conteúdo do arquivo `supabase-schema.sql` (deste projeto), cole
   e clique em **Run**.
5. No menu lateral, abra **Storage** → **New bucket**.
   - Nome: `study-files` (exatamente assim)
   - Marque **Public bucket**
   - Crie.
6. Volte ao **SQL Editor** e rode a última parte do `supabase-schema.sql`
   (o bloco que cria a política do `study-files`), caso ainda não tenha rodado.
7. No menu lateral, vá em **Project Settings → API**. Copie:
   - **Project URL**
   - **anon public key**

## Passo 2 — Configurar o projeto

1. Renomeie o arquivo `.env.example` para `.env`.
2. Cole a Project URL e a anon key nos respectivos campos.

## Passo 3 — Rodar localmente (opcional, para testar)

Precisa ter o Node.js instalado (https://nodejs.org).

```bash
npm install
npm run dev
```

Abra o endereço que aparecer no terminal (geralmente http://localhost:5173).

## Passo 4 — Publicar para todo mundo acessar

A forma mais simples é usar a **Vercel** (gratuita):

1. Crie uma conta em https://vercel.com (pode entrar com GitHub).
2. Suba esta pasta para um repositório no GitHub (crie um repositório novo e
   faça o upload dos arquivos, ou use `git init` / `git push` se souber git).
3. Na Vercel, clique em **Add New → Project** e selecione o repositório.
4. Em **Environment Variables**, adicione:
   - `VITE_SUPABASE_URL` = a mesma Project URL do passo 1
   - `VITE_SUPABASE_ANON_KEY` = a mesma anon key do passo 1
5. Clique em **Deploy**. Em cerca de 1 minuto você recebe um link público
   (algo como `site-de-estudos.vercel.app`) que pode compartilhar com quem
   quiser acessar de casa.

Qualquer atualização enviada ao repositório publica automaticamente uma nova
versão do site.

## Estrutura do projeto

- `src/App.jsx` — toda a interface e lógica do site
- `src/supabaseClient.js` — conexão com o Supabase
- `supabase-schema.sql` — script para criar as tabelas no banco
- `.env.example` — modelo das variáveis de ambiente necessárias
