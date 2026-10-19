/**
 * REFERÊNCIAS MULTICAIXA (EMIS)
 * =============================
 *
 * A entidade usada nas referências deixa de ser um número fixo no código e
 * passa a ser a que estiver configurada em Configurações → 6. Integrações & AGT
 * (`settings.integrations.emisEntity`). Enquanto a instituição não registar a
 * sua entidade EMIS, as faturas ficam sem referência — e o ecrã da Tesouraria
 * mostra "Balcão / Caixa", que é a verdade: só se pode pagar presencialmente.
 *
 * A referência é DETERMINÍSTICA: a mesma fatura produz sempre a mesma
 * referência (antes era gerada ao acaso a cada emissão, o que tornava
 * impossível reconciliar um pagamento com a fatura correspondente).
 */

/** Normaliza a entidade EMIS registada pela instituição. */
export function normalizeEmisEntity(entity?: string): string {
  return (entity || '').trim();
}

/**
 * Compõe a referência de 9 dígitos a partir do número da fatura e do montante,
 * com dígito de controlo — o mesmo princípio das referências Multicaixa reais.
 */
export function buildMulticaixaReference(invoiceNumber: string, amountKz: number, emisEntity?: string): string {
  const entity = normalizeEmisEntity(emisEntity);
  if (!entity) return '';

  const seedSource = `${entity}|${invoiceNumber}|${Math.round(Number(amountKz) || 0)}`;
  let hash = 0;
  for (let i = 0; i < seedSource.length; i += 1) {
    hash = (hash * 31 + seedSource.charCodeAt(i)) % 100_000_000;
  }

  const base = String(hash).padStart(8, '0');
  // Dígito de controlo simples (módulo 10 ponderado), estável e verificável.
  let sum = 0;
  for (let i = 0; i < base.length; i += 1) {
    sum += Number(base[i]) * (i % 2 === 0 ? 3 : 1);
  }
  const check = (10 - (sum % 10)) % 10;
  const digits = `${base}${check}`;

  return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6, 9)}`;
}

/** Entidade + referência prontas a gravar numa fatura. */
export function buildMulticaixaFields(
  invoiceNumber: string,
  amountKz: number,
  emisEntity?: string
): { multicaixaEntity?: string; multicaixaRef?: string } {
  const entity = normalizeEmisEntity(emisEntity);
  if (!entity) return {};
  return {
    multicaixaEntity: entity,
    multicaixaRef: buildMulticaixaReference(invoiceNumber, amountKz, entity)
  };
}
