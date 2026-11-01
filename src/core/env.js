// Ambiente de execução. Na versão publicada como artefato do claude.ai (build com
// VITE_ARTIFACT=1) não há servidor do jogo nem acesso ao microfone: o jogo roda só no
// modo solo e os comandos são digitados.
export const ARTIFACT = import.meta.env?.VITE_ARTIFACT === '1';
