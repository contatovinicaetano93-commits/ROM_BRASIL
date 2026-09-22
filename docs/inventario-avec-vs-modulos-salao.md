# Inventário: módulos de salão × API Avec × ROM

**Objetivo:** decidir o que vale *ler* do Avec, o que já cobrimos no ROM, e o que exigiria *substituir* o Avec (escrever operação).  
**Escopo da API usada hoje:** Relatórios `GET https://api.avec.beauty/reports/{id}` + webhooks de evento.  
**Fonte no código:** `src/lib/avec/registry.ts`, sync P1/P2/P3/estoque, `webhook-ingest.ts`, Omie, fiscal-split.

Legenda de **papel**:

| Papel | Significado |
|-------|-------------|
| **Fonte** | Avec (ou Omie/PSP) é a verdade operacional |
| **Espelho** | ROM só lê/replica para KPI/painel |
| **Próprio** | ROM já opera sem precisar do Avec para aquele fluxo |
| **Buraco** | Precisa existir no salão; não vem (ou não basta) da API de relatórios |

Legenda de **cobertura API**:

| Status | Significado |
|--------|-------------|
| ✅ Sync ativo | Relatório no registry + entra no cron/sync |
| 🟡 Parcial | Dados agregados / sem escrita / campos incompletos |
| ⚪ Não usado | Relatório pode existir na collection Postman; ROM não synca |
| ❌ Fora da API Reports | Não resolve com `/reports/*` (precisa produto Avec, Omie, PSP, SEFAZ…) |

---

## 1. Mapa rápido (decisão)

```
                    ┌──────────────────────────────────────────┐
                    │           OPERAÇÃO DO SALÃO              │
                    │  agenda · comanda · caixa · NF · estoque │
                    │           = AVEC (fonte)                 │
                    └──────────────────┬───────────────────────┘
                                       │ reports + webhooks
                                       ▼
┌─────────────┐    ┌──────────────────────────────────────────┐    ┌────────────┐
│ Omie        │───▶│              ROM (espelho + cérebro)     │◀───│ WhatsApp   │
│ Contas a    │    │  KPI · contatos · estoque leitura · WA   │    │ (próprio)  │
│ pagar       │    │  pós-venda · diretoria · intranet/flow   │    └────────────┘
└─────────────┘    └──────────────────┬───────────────────────┘
                                       │
                                       ▼
                              Fiscal split (PSP) — buraco Avec
```

**Conclusão em uma linha:** o ROM já é forte em *visão e comunicação*; fraco (de propósito) em *escrita operacional e fiscal*. Clonar Avec = preencher a coluna **Buraco / ❌**.

---

## 2. Inventário por módulo de salão

### 2.1 Clientes / CRM

| Capacidade | Avec | ROM hoje | API | Papel |
|------------|------|----------|-----|-------|
| Cadastro cliente (CRUD) | Admin Avec | Contatos + webhook `client.*` | 🟡 0004 dump + webhook | Fonte Avec / espelho ROM |
| Telefone, e-mail, preferências | Avec | Preferência manicure/cabeleireiro no sync | 🟡 | Espelho |
| Histórico de serviços | Avec | `client_services` | ✅ 0002 + webhook | Espelho |
| Aniversariantes | Relatório | KPI comercial | ✅ 0001 | Espelho |
| Como nos conheceram | Relatório | KPI | ✅ 0003 | Espelho |
| Campanhas / CRM marketing Avec | Avec | — | ❌ / ⚪ | Buraco se sair do Avec |
| LGPD / consentimento / opt-out | Avec (?) | Eventos WA próprios | ❌ | Buraco se substituir |

**Notas:** 0004 no full `catalog`. Webhook normaliza `client.created|updated`. ROM **não** é master de cadastro.

---

### 2.2 Agenda e atendimento

| Capacidade | Avec | ROM hoje | API | Papel |
|------------|------|----------|-----|-------|
| Criar/editar/cancelar horário | Avec | Pipeline/Hoje/Recepção **só leitura** | ❌ escrita | Fonte Avec |
| Lista agendamentos | Relatório 0051 | Sync fast + full agenda | ✅ 0051 | Espelho |
| Atendidos / finalizados | 0002 | Sync + visitas diretoria | ✅ 0002 | Espelho |
| Cancel / no-show | 0052 | KPI | ✅ 0052 | Espelho |
| Status comanda (aberta/paga) | Avec | Spans `salon_comanda_spans` via webhook | 🟡 webhook | Espelho parcial |
| Encaixes, bloqueios, folga | Avec UI | — | ❌ | Buraco |
| Multi-cadeira / recurso físico | Avec | — | ❌ | Buraco |
| App do profissional (agenda própria) | Avec | Meu faturamento (KPI mês) | ❌ agenda | Buraco |
| WhatsApp agendar / reagendar | — | Canal próprio (IA) | n/a | **Próprio** (ainda depende do Avec para gravar horário se for o master) |

**Relatórios usados:** `0051`, `0002`, `0052`.  
**Webhooks:** `appointment.*`, `service.completed` / `atendimento.finalizado`.

---

### 2.3 Catálogo (serviços, pacotes, preços)

| Capacidade | Avec | ROM hoje | API | Papel |
|------------|------|----------|-----|-------|
| Cadastro serviço / duração / preço | Avec | Inferência categoria no sync | ❌ CRUD | Fonte Avec |
| Pacotes vendidos (volume/receita) | 0061 | P2 analytics | ✅ 0061 | Espelho |
| Vender/consumir pacote no caixa | Avec | — | ❌ | Buraco |
| Tabela de preços / promoção | Avec | — | ❌ | Buraco |
| Top serviços | 0032 | P1 | ✅ 0032 | Espelho |

---

### 2.4 Caixa / PDV / formas de pagamento

| Capacidade | Avec | ROM hoje | API | Papel |
|------------|------|----------|-----|-------|
| Abrir/fechar comanda | Avec | KPI “hoje” lê pago | ❌ | Fonte Avec |
| Receber PIX / cartão / dinheiro | Avec + maquineta | — | ❌ TEF | Buraco |
| Mix de formas de pagamento | 0081 | Financeiro + conciliação receita↔mix | ✅ 0081 | Espelho agregado |
| Conciliação dia (receita vs mix) | — | `reconcileRevenueToPayments` | n/a (cálculo ROM) | **Próprio** sobre espelho |
| Sangria, troco, fechamento de caixa | Avec | — | ❌ | Buraco |
| Chargeback / contestação | Adquirente | — | ❌ | Buraco |
| “Strike” / retenção / split pagamento | PSP / fiscal | `finance_fiscal_splits` | ❌ Avec | **Próprio** via API fiscal (não Avec) |

**Explícito no registry:** *“Comissões e NF ficam de fora.”*

---

### 2.5 Faturamento e KPIs comerciais

| Capacidade | Avec | ROM hoje | API | Papel |
|------------|------|----------|-----|-------|
| Faturamento diário | 0088 | `salon_daily_metrics`, Hoje, Financeiro | ✅ 0088 | Espelho |
| Evolução / curva | 0088 | Dashboard | ✅ | Espelho |
| Fat. por profissional | 0021 | P1, Meu faturamento, relatório diretoria | ✅ 0021 | Espelho |
| Ocupação | 0126 | P1 | ✅ 0126 | Espelho |
| Taxa de retorno | 0007 / 0011 | P3 + diretoria | ✅ | Espelho |
| Sem retorno / reativação | 0107 | Pós-venda + WA | ✅ 0107 | Espelho + **próprio** WA |
| Novos no período | 0017 | P3 | ✅ 0017 | Espelho |
| Canais de agenda | 0056 | P2 | ✅ 0056 | Espelho |
| Avaliações | 0104 | P2 | ✅ 0104 | Espelho |

---

### 2.6 Comissões e folha do profissional

| Capacidade | Avec | ROM hoje | API | Papel |
|------------|------|----------|-----|-------|
| Regra de comissão (% serviço/produto) | Avec | — | ❌ / fora do registry | Buraco |
| Fechamento comissão do mês | Avec | — | ❌ | Buraco |
| Visão “meu faturamento” (receita bruta) | 0021 | Página dedicada | ✅ leitura | Espelho (não é comissão líquida) |
| Vale / adiantamento / RH | — | Módulos RH/intranet rasos | ❌ | Buraco / intranet |

---

### 2.7 Fiscal / impostos / NF

| Capacidade | Avec | ROM hoje | API | Papel |
|------------|------|----------|-----|-------|
| Emissão NF-e / NFS-e / NFC-e | Avec (ou integração Avec) | — | ❌ Reports | Buraco Avec |
| Cadastro fiscal (CFOP, CST, ISS) | Avec / contador | — | ❌ | Buraco |
| Split CBS/IBS / arranjos PXA…TEF | Plataforma pública / PSP | `fiscal-split` + tabela | ❌ Avec | **Próprio** (API separada) |
| Documento fiscal no split | campo `docFiscal` no PSP | armazenado se vier | 🟡 PSP | Espelho PSP |
| Omie Contas a Pagar (despesas) | — | Sync cron Omie 2 CNPJs | n/a | **Próprio** (Omie) |

**Impostos e strike de pagamento:** não se resolvem “varrendo” `/reports`. Já estão modelados como integrações **fora** do Avec.

---

### 2.8 Estoque e compras

| Capacidade | Avec | ROM hoje | API | Papel |
|------------|------|----------|-----|-------|
| Posição de estoque | 0149 | `/estoque` | ✅ | Espelho |
| Alerta mínimo | 0046 | Alertas WA | ✅ | Espelho |
| Movimentação | 0044 | Histórico | ✅ | Espelho |
| Entrada por pedido de compra | 0323 | Sync full | ✅ | Espelho |
| Valorização (total/cat/marca/%) | 0045, 0243, 0242, 0142 | Snapshots | ✅ | Espelho |
| Inventário físico / ajuste | Avec | — | ❌ escrita | Buraco |
| Pedido de compra (criar) | Avec | — | ❌ | Buraco |
| Baixa automática no uso do serviço | Avec | — | ❌ | Buraco |

**Cron:** `/api/estoque/sync` a cada 3h + full diário. Fonte da verdade = Avec (API-first, sem webhook de estoque).

---

### 2.9 Comunicação e pós-venda

| Capacidade | Avec | ROM hoje | API | Papel |
|------------|------|----------|-----|-------|
| WhatsApp operacional / IA | — | Webhook Cloud API | n/a | **Próprio** |
| Aftercare templates | — | Cron reminders | n/a | **Próprio** |
| Reativação (“sem retorno”) | lista 0107 | Filas pós-venda | ✅ lista + WA | Híbrido |
| SMS / e-mail marketing Avec | Avec | — | ⚪/❌ | Buraco se sair |

---

### 2.10 Multiunidade, permissões, intranet

| Capacidade | Avec | ROM hoje | API | Papel |
|------------|------|----------|-----|-------|
| Duas unidades (Brasil / Iguatemi) | 2 contas Avec | 2 deploys + Cérebro | token/unit | Espelho |
| Roles staff/admin | — | Auth ROM + módulos intranet | n/a | **Próprio** |
| Flow (aprovações / NF despesa) | — | Rom Flow | n/a | **Próprio** |
| Onboarding / notícias / RH shells | — | Intranet | n/a | **Próprio** |

---

## 3. Catálogo de relatórios já no ROM

### Core (`registry` CORE)

| ID | Nome | Tier | Schedule | Mapper |
|----|------|------|----------|--------|
| 0051 | Agendamentos | A | fast | appointments |
| 0002 | Atendidos | A | fast | attendances |
| 0088 | Faturamento / evolução | A/B | fast/daily | revenue / revenue_curve |
| 0052 | Cancelados / no-show | A | fast | cancellations |
| 0004 | Clientes | A | daily (catalog) | clients |
| 0021 | Fat. por profissional | B | daily | professionals_revenue |
| 0126 | Ocupação | B | daily | professionals_occupancy |
| 0032 | Top serviços | B | daily | top_services |
| 0107 | Sem retorno | B | daily | reactivation |
| 0011 | Retorno por profissional | B | on_demand | director_return |
| 0003 | Como nos conheceram | B | daily | acquisition |
| 0007 | Taxa de retorno | B | daily | return_rate |
| 0017 | Novos no período | B | daily | new_clients_period |
| 0056 | Agenda por canal | C | daily | booking_channels |
| 0061 | Pacotes | C | daily | packages |
| 0104 | Avaliações | C | daily | ratings |
| 0001 | Aniversariantes | C | daily | birthdays |
| 0081 | Formas de pagamento | C | daily | payment_mix |

### Estoque (`registry` STOCK)

| ID | Nome | Schedule |
|----|------|----------|
| 0149 | Posição | fast |
| 0046 | Abaixo do mínimo | fast |
| 0044 | Entradas/saídas | daily |
| 0323 | Entradas por pedido | daily |
| 0045 | Custo total | daily |
| 0243 | Custo por categoria | daily |
| 0242 | Custo por marca | daily |
| 0142 | Categorias % | daily |

### Webhooks (push, não relatório)

| Evento normalizado | Efeito no ROM |
|--------------------|---------------|
| `client.upsert` | Contato |
| `appointment.created\|updated\|cancelled` | Agenda / status |
| `service.completed` | Serviço feito + comanda |

---

## 4. O que a varredura da API **não** entrega (mesmo “completa”)

Mesmo listando todos os IDs da collection Postman, a API de **Relatórios** continua sendo:

1. **Somente leitura** — não cria horário, não fecha caixa, não emite NF.  
2. **Agregada / paginada** — boa para KPI; ruim como motor transacional.  
3. **Sem comissão e sem NF** (já assumido no registry).  
4. **Sem TEF / adquirente / strike** — isso é PSP + fiscal-split.  
5. **Sem Contas a Pagar contábil** — no ROM isso é **Omie**, não Avec.  
6. **Sem UI/workflows** — bloqueio de agenda, permissões de caixa, auditoria de PDV.

Varredura útil = inventariar *mais espelhos* (relatórios ainda ⚪).  
Varredura **não** = blueprint para clonar o Avec.

---

## 5. Matriz de decisão (o que fazer com cada buraco)

| Módulo | Manter Avec | Aprofundar espelho ROM | Substituir (construir) | Comentário |
|--------|-------------|------------------------|------------------------|------------|
| Agenda / PDV / comanda | ✅ padrão | webhooks + 0051 | ❌ caro / risco caixa | Fonte deve continuar Avec |
| Clientes | ✅ | 0004 + qualidade telefone | só se CRM próprio for master | Hoje híbrido WA+Avec |
| Estoque leitura | ✅ | já forte | ❌ escrita | Alertas WA já agregam valor |
| Mix pagamento / conciliação | ✅ 0081 | ✅ já tem | — | Não é TEF |
| Comissões | ✅ Avec | tentar achar report ⚪ | só se regra ROM for lei | Fora do registry hoje |
| NF / impostos | Avec ou contador | — | só com motor fiscal | Não é Reports |
| Split / strike pagamento | — | ✅ fiscal-split | evoluir PSP | Já separado do Avec |
| Despesas | Omie | ✅ sync | — | Já separado |
| Pós-venda / WA | — | ✅ | já é ROM | Diferencial real |
| Cérebro multiunidade | — | ✅ | já é ROM | Diferencial real |

---

## 6. Lacunas candidatas a “próximo espelho” (baixo risco)

Se a meta for **conhecer mais o Avec sem sair dele**, ordem sugerida:

1. **Comissões** — vasculhar collection Postman por reports de comissão/repasse (hoje conscientemente fora).  
2. **Produtos vendidos no atendimento** (além de estoque 0149) — se existir report de venda de produto.  
3. **Profissionais / escala** — se houver report de horas/bloqueios (hoje só ocupação 0126).  
4. **Assinaturas / créditos de pacote restantes** — 0061 é venda; saldo de pacote pode ser outro ID.  
5. **Documentar IDs ⚪** da Postman que testamos e descartamos (evitar redescoberta).

Cada item = 1 report + mapper + teste; **não** é clone.

---

## 7. Lacunas que só um “Avec ROM” resolveria (alto risco)

Para paridade operacional real seriam necessários, no mínimo:

- Motor de agenda com conflito e recursos  
- PDV + integração adquirente (PIX/TEF)  
- Emissor fiscal + certificado + contingência  
- Regras de comissão e fechamento  
- Estoque com baixa na comanda e inventário  
- Migração de histórico + treinamento da casa + fallback se cair  

Isso é **plataforma**, não sprint de sync. O inventário acima mostra que ~70% do valor *analítico* já está espelhado; o que falta para “100% Avec” é quase todo o valor *transacional*.

---

## 8. Resposta direta às perguntas anteriores

| Pergunta | Resposta com base neste inventário |
|----------|-----------------------------------|
| Dá para varrer a API e mapear o Avec? | **Sim, o lado Reports** — e a maior parte útil já está no registry. |
| Inclui impostos e strike de pagamento? | **Não via Avec.** Impostos/NF ≠ Reports; strike/split = PSP (`fiscal-split`). Despesas = Omie. |
| Copiar 100% é possível? | **Não pela API.** Só construindo o buraco ❌ (PDV/agenda/fiscal/comissões). |
| Onde o ROM já “ganhou” do Avec? | WhatsApp/IA, pós-venda, intranet/Flow, Cérebro, conciliação KPI, leitura de estoque+financeiro unificados. |

---

## 9. Próximo passo sugerido (análise)

Escolher **uma** linha da §5 para aprofundar na próxima conversa:

- **A)** inventário Postman dos reports ainda ⚪ (comissões/produtos/pacote saldo)  
- **B)** desenho de saída parcial (ex.: só pós-venda+CRM no ROM, Avec só caixa)  
- **C)** requisitos mínimos de um PDV próprio (o que quebraria no D+1 sem Avec)

Sem essa escolha, o inventário já serve para matar a hipótese “clonar 100% via API”.
