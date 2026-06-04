# Mini-Miguel — Avatar Desktop

Janela transparente, sem moldura e sempre-no-topo (Electron + Three.js) que mostra
o teu mini-eu 3D a andar sobre o desktop e a reagir ao estado do agente
(`idle` / `working` / `asking`), lido de `~/mini-miguel/data/state.json`.

## Pré-requisitos
- macOS
- Node.js + npm

## Instalação
```bash
cd ~/mini-miguel/avatar/desktop-app
npm install            # instala three + electron + electron-builder
```

## Coloca o modelo
Põe o teu GLB rigged (com clips **Idle** e **Walk**) em:
```
~/mini-miguel/avatar/model.glb
```
Os clips são detetados pelo nome (procura "idle"/"walk", com fallback para o 1.º/2.º).

## Correr
```bash
npm start
# ou, a partir de qualquer lado:
mm avatar start
```

## Controlos
- **Arrastar** — clica e arrasta a janela para a posicionar (a posição é guardada).
- **Clique esquerdo** (quando o avatar está a *perguntar*) — abre um Terminal com
  `tmux attach` ao agente mais recente da inbox.
- **Clique direito** — menu: ver pendentes · ocultar · som on/off · voltar ao canto · sair.
- **⌘⇧M** — mostrar/ocultar o avatar.
- **Badge vermelho** — n.º de notificações por rever (some quando corres `mm pending`).

## Notas
- Render limitado a ~30 fps para poupar bateria.
- Sons sintéticos (Web Audio) — **desligados por defeito**, liga no menu de contexto.
- Só depende de `three` + `electron` (e `electron-builder` para empacotar).
