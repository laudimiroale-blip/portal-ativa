/**
 * Mapeamento parametrizável: Produto → Tipos de Garantia compatíveis
 *
 * Para adicionar, remover ou alterar garantias de um produto, edite apenas
 * este arquivo. O wizard, filtros e validações consomem este mapa automaticamente.
 */

export const PRODUTOS = [
  "Home Equity",
  "Auto Equity",
  "Rural Equity",
  "Crédito para Construção / Término de Obra",
] as const;

export type Produto = (typeof PRODUTOS)[number];

export const GARANTIAS_POR_PRODUTO: Record<Produto, readonly string[]> = {
  "Home Equity": [
    "Casa de Rua",
    "Casa em Condomínio",
    "Apartamento",
    "Cobertura",
    "Sobrado",
    "Studio",
    "Flat",
    "Casa de Praia",
    "Casa de Campo",
    "Chácara",
    "Sítio",
    "Sala Comercial",
    "Loja",
    "Galpão",
    "Prédio Comercial",
    "Terreno Residencial",
    "Terreno Comercial",
    "Terreno Industrial",
  ],

  "Auto Equity": [
    "Veículo Leve",
    "Veículo Utilitário",
    "Veículo Pesado",
    "Caminhão",
    "Cavalo Mecânico",
    "Carreta",
    "Semirreboque",
    "Ônibus",
    "Van",
    "Máquina Agrícola",
    "Máquina de Construção",
    "Frota",
  ],

  "Rural Equity": [
    "Fazenda",
    "Sítio Rural",
    "Chácara Rural",
    "Área Rural",
    "Gleba Rural",
    "Terra Agrícola",
    "Terra para Pecuária",
    "Propriedade Mista Agrícola e Pecuária",
    "Haras",
    "Granja",
    "Usina",
    "Armazém Rural",
    "Galpão Agrícola",
  ],

  "Crédito para Construção / Término de Obra": [
    "Terreno Residencial",
    "Terreno em Condomínio",
    "Terreno Urbano",
    "Terreno Comercial",
    "Lote Urbano",
    "Imóvel em Fase Inicial de Construção",
    "Casa em Construção",
    "Casa em Condomínio em Construção",
    "Sobrado em Construção",
    "Prédio Residencial em Construção",
    "Imóvel Comercial em Construção",
    "Galpão em Construção",
    "Obra Paralisada",
    "Obra em Fase de Acabamento",
  ],
};

/**
 * Retorna as garantias compatíveis com um produto.
 * Retorna lista vazia se o produto não for reconhecido.
 */
export function getGarantiasPorProduto(produto: string): readonly string[] {
  return GARANTIAS_POR_PRODUTO[produto as Produto] ?? [];
}

/**
 * Verifica se um tipo de garantia é compatível com um produto.
 */
export function isGarantiaCompativel(produto: string, tipoGarantia: string): boolean {
  return getGarantiasPorProduto(produto).includes(tipoGarantia);
}

/**
 * Retorna todos os tipos de garantia únicos (de todos os produtos).
 * Útil para filtros globais e autocomplete.
 */
export const TODAS_GARANTIAS: readonly string[] = Array.from(
  new Set(Object.values(GARANTIAS_POR_PRODUTO).flat()),
).sort();
