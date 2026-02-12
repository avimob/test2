# Catalogo Imobiliario com Supabase

Site completo de imobiliaria em HTML, CSS e JavaScript puro, com:

- catalogo responsivo de imoveis
- filtros em tempo real (valor, bairro, quartos e tipo)
- botao de contato via WhatsApp em cada card
- painel administrativo (login, cadastro, edicao e remocao)
- upload multiplo de fotos com compressao automatica no navegador
- selecao de foto principal (capa do imovel)
- persistencia de dados e imagens no Supabase

## Arquivos principais

- `index.html`: pagina publica do catalogo
- `admin/index.html`: pagina do painel administrativo (rota `/admin`)
- `styles.css`: tema visual e responsividade
- `catalog.js`: logica da pagina publica (filtros + catalogo)
- `app.js`: logica da pagina admin (catalogo + auth admin + CRUD + uploads)
- `supabase-config.js`: chaves do Supabase (editar este arquivo)
- `supabase-schema.sql`: schema do banco + politicas RLS + bucket storage

## 1) Configurar Supabase

1. Crie um projeto no Supabase.
2. No SQL Editor, execute o arquivo `supabase-schema.sql`.
3. Em Authentication, crie um usuario admin (e-mail + senha).
4. Copie sua URL e chave anon:
   - Project Settings -> API -> `URL`
   - Project Settings -> API -> `anon public`
5. Edite `supabase-config.js`:

```js
window.SUPABASE_URL = "https://SEU-PROJETO.supabase.co";
window.SUPABASE_ANON_KEY = "SUA_CHAVE_ANON";
window.SUPABASE_STORAGE_BUCKET = "property-images";
```

## 2) Rodar localmente

Use um servidor local simples (evita bloqueios de CORS/ESM):

```powershell
cd c:\Users\Jota\Documents\catalogo
python -m http.server 5500
```

Abra `http://localhost:5500`.

- Catalogo publico: `http://localhost:5500/`
- Painel admin: `http://localhost:5500/admin/`
- O painel admin nao aparece com link na home (acesso direto pela rota).

## 3) Fluxo de uso

1. Clientes usam os filtros e clicam em `Falar no WhatsApp`.
2. Corretor entra na URL `/admin` com e-mail/senha do Supabase Auth.
3. No painel:
   - adiciona dados do imovel
   - seleciona varias fotos do celular
   - define a capa (foto principal)
   - salva, edita ou remove imoveis

## Observacoes

- As imagens sao convertidas para WebP e redimensionadas automaticamente antes do upload.
- Para WhatsApp, informe o numero com codigo do pais (ex: `5511999999999`).
- As politicas do SQL deixam o catalogo publico e restringem alteracoes a usuarios autenticados.
