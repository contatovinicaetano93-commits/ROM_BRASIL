# Spike: comissões Avec via API de Relatórios

**Data:** 2026-09-22  
**Pergunta:** a API `GET /reports/{id}` devolve o fechamento líquido (assistente, produtos, a pagar) como em `admin.avec.beauty/admin/financeiro/comissoes`?  
**Resposta:** **Sim.** Não precisa remontar o motor de regras no ROM.

Collection usada: [AVEC - Relatórios unidades](https://documenter.getpostman.com/view/12527228/2sA2xmUWJo) (230 reports).  
Teste ao vivo: unidade Brasil (`AVEC_UNIT_ID=40613`), período `01/09/2026`–`15/09/2026`, profissional Jefferson (tela Avec + `avec_pro_id=901877`).

---

## Veredito

| Report | Papel | HTTP | Serve a visão líquida? |
|--------|-------|------|-------------------------|
| **8123** | Profissionais e todas as comissões — **DETALHADO** | 200 | **Principal** — já traz `a_pagar`, `desconto_assistente`, `gasto_produtos`, `descontos`, taxas |
| **0123** | Todas as comissões (resumo) | 200 | Sim, mas sem split assistente/produtos |
| **0029** | Descontos linha a linha (exige `profissional_id`) | 200 | Detalhe do quadro “Descontos e Bônus” |
| **0028** | Comissões **pagas** + histórico | 200 | Status “Pagas” / pagamento |
| **4123** | Líquido cartão × outros | 200 | Split por forma de pagamento |
| **7123** | Comissão líquida item a item | 200 | Drill-down (não é o resumo da tela) |
| **5123** | Comissão bruta item a item | 200 | Complementar |
| **0022** | Assistentes (comissionamento **antigo**) | 200 | Legado; só se a unidade ainda usar |
| **0070** | Auditoria bônus/desconto | 200 | Compliance, não fechamento |
| **9123** | Split ativado | 200 | Só se split PSP estiver no fluxo |

**Espelho recomendado (MVP):** sync `8123` (ranking / Meu faturamento líquido) + opcional `0029` (linhas) + `0028` (pagas).

---

## Evidência — Jefferson × tela Avec

Na UI (foto): Desconto Assistente **-150**, Gastos com Produtos **-114,12**, etc.

Report **8123** no mesmo período (campos relevantes):

| Campo | Valor API |
|-------|-----------|
| `nome` | JEFFERSON POLICARPO DOS SANTOS |
| `cargo` | MULTIPLICADOR |
| `desconto_assistente` | **-150** |
| `gasto_produtos` | **-114.12** |
| `descontos` | -707.19 (agregado de outros lançamentos) |
| `a_pagar` | **6032.64** (líquido) |
| `valor_cobrado` / `rateio_servico` / `valor_casa` | bruto / rateio / casa |

Report **0029** com `profissional_id=901877`: linhas `categoria=Desconto Assistente` somando **-150** (−60 −45 −20 −12,5 −12,5) — bate o total da UI.

Conclusão: a tela de comissões **já é exportável** pelos reports; o ROM pode espelhar o resultado em vez de recalcular “meio a meio”, Baru, etc.

---

## Campos úteis (8123)

```
nome, cargo,
valor_cobrado,
rateio_servico, rateio_produtos, rateio_outros, caixinha,
gasto_produtos, taxa_cartao, taxa_adm,
desconto_assistente, descontos,
a_pagar, valor_casa
```

Vocabulário sugerido na UI ROM:

- **Produção / cobrado** → `valor_cobrado` (ou continuar `0021` como bruto de faturamento)
- **Rateio serviço** → `rateio_servico`
- **Abatimentos** → `desconto_assistente` + `gasto_produtos` + `descontos` + taxas
- **A pagar (líquido)** → `a_pagar`
- **Casa** → `valor_casa`

Manter KPI ausente como `null` (não forçar `0`).

---

## Params

| Report | Obrigatórios |
|--------|----------------|
| 8123 / 0123 / 0028 / 4123 | `inicio`, `fim` (+ `page`/`limit`) |
| 0029 / 7123 / 5123 | `profissional_id`, `inicio`, `fim` |
| 0029 sem `profissional_id` | HTTP 400 + `RequiredParams` |

`profissional_id` já existe no elenco ROM (`professionals.brasil.ts` / Iguatemi).

---

## O que o spike **não** fez

- Sync em produção / tabela nova  
- Tela “Comissões” no painel  
- Conferência centavo a centavo de todos os lançamentos “meio a meio” / Baru (só validou assistente −150 e produtos −114,12 via 8123)  
- Iguatemi (só Brasil)

---

## Próximo passo (se aprovado)

1. Registry: `8123` mapper `professionals_commissions` (daily/full).  
2. Persistir snapshot por dia âncora (mês MTD, igual P1).  
3. Estender Meu faturamento: bruto (`0021`) + líquido (`a_pagar` do `8123`).  
4. Opcional: drill `0029` + histórico `0028`.  
5. Teste: Jefferson (ou fixture) — `desconto_assistente === -150` no período de referência.

**Complexidade estimada do MVP:** baixa/média (mesmo padrão do sync P1) — **não** é rebuild do motor Avec.
