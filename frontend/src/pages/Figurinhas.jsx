import React from 'react';
import { GridMidias } from './Biblioteca.jsx';

/* ─── Figurinhas Vittalis — categorias da espec da gestão ─────────────────── */
const CATEGORIAS = ['Bom dia', 'Boa tarde', 'Boa noite', 'Datas comemorativas', 'Vacinas', 'Consultas', 'Terapias', 'Pós-vacinal', 'Agradecimento', 'Indicações'];

export default function Figurinhas() {
  return (
    <GridMidias
      tipoFixo="figurinha"
      categorias={CATEGORIAS}
      titulo="💟 Figurinhas Vittalis"
      subtitulo="Biblioteca de stickers por categoria — enviadas com um clique no Chat"
    />
  );
}
