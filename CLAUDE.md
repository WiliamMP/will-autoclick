# will-autoclick

Auto clicker para Windows, tema **Neon**. Mesma base do will-repo: Tauri 2 + Rust no backend, React 19 + TypeScript + shadcn/ui na interface. Licença MIT.

O dono vem do **Delphi** e está aprendendo Rust e React: ao explicar código novo, dê uma analogia curta com Delphi/Pascal. Responda em **português**.

## Arquitetura

- `src-tauri/src/clicker.rs`: loop de cliques numa thread (`SendInput`, `SetCursorPos` para posição fixa). Config chega do front por `set_config`; `toggle` inicia/para e emite o evento `running`.
- `src-tauri/src/lib.rs`: plugins, atalhos globais (F6 = iniciar/parar, F7 = capturar posição do mouse, evento `picked`) e `close_splash`. **Comando novo precisa entrar no `generate_handler!`.**
- `src/App.tsx`: a tela inteira. Config salva em localStorage.
- `src/lib/splash.ts` + `splashscreen.html` + `src/splash.ts`: janela de splash. `src/lib/updater.ts`: atualização automática.

## Convenções

- Interface em **português**; código, nomes e comentários em **inglês**.
- Ícones só do **lucide-react**. Visual: tokens Neon do `src/index.css`, fontes Geist.
- Atalhos deliberados levam um comentário `ponytail:` com o limite e o caminho de melhoria.
- Commits em Conventional Commits, em português.

## Testes

```bash
cd src-tauri && cargo test
npx tsc --noEmit -p .
```

Teste visual: `npm run tauri dev`.

## Versão e release

Versão em três lugares: `package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`. Depois `git tag vX.Y.Z && git push origin vX.Y.Z`: o workflow *Release* compila, assina (segredos `TAURI_SIGNING_PRIVATE_KEY*`, chave em `~/.tauri/will-autoclick.key`) e publica. A chave privada **nunca** vai para o repositório. Use `/release`.
