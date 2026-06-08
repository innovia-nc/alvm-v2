# FEAT-005 : Auto-deduction des avoirs (credits futurs) sur la prochaine facture

> Source CDC : item D8 — effort M — COMPTABLE — contient des ARBITRAGES METIER a confirmer

## Hypothese (discovery)
We believe that **appliquer automatiquement les avoirs "credit futur" d'un parent sur sa prochaine facture**
For **le staff ALVM et les parents disposant d'un credit**
Will result in **la suppression de l'etape manuelle d'application du credit et la fiabilisation de la comptabilite associee**.
We will know we're right when **un parent avec un ParentCredit non expire voit sa prochaine facture deduite automatiquement, avec ecritures comptables coherentes, sans action manuelle**.

## User Story
**En tant que** staff ALVM emettant des factures
**Je veux** que les avoirs "credit futur" d'un parent soient deduits automatiquement de sa prochaine facture
**Afin d'** eviter l'application manuelle (oubliable) et garantir une compta exacte.

## Contexte technique (grounded)
- Le mecanisme existe mais est **100% manuel et non cable au front** :
  - Modele `ParentCredit { amountRemaining, expiresAt?, parentId }` (schema ~618)
  - Modele `CreditApplication` (schema ~636), modele `CreditNoteAllocation` (~654)
  - Procedure `registrations.applyCredit` (`server/routers/registrations.ts` ~1070) : lock `FOR UPDATE`, decremente `amountRemaining`, cree `CreditApplication`, met a jour `paidAmount`/`status` de la facture.
- ⚠️ **Dette comptable confirmee** : `applyCredit` ne genere AUCUNE ecriture comptable (aucun appel a `server/services/accounting.service.ts`). L'auto-application doit corriger cette coherence comptable.
- Comptabilite ALVM : ecritures generees en TypeScript dans `accounting.service.ts` (plus de triggers SQL). Voir `createInvoiceAccountingEntries()`, `createPaymentEntries()`.
- ⚠️ **Garde-fou** : ne JAMAIS toucher le taux TGC (= 0, exoneration legale art. LP 492).
- ⚠️ **Garde-fou CLAUDE.md** : ne PAS creer de `parent_credits` dans les services comptables (creation des credits gere cote router) — ici on **consomme** un credit existant, on ne le cree pas.

## ARBITRAGES METIER — hypotheses par defaut (A CONFIRMER avec le client)
| # | Question | Hypothese par defaut proposee | Statut |
|---|---|---|---|
| a | Deduction a la creation DRAFT ou a l'emission SENT ? | **A l'emission (SENT)** — coherent avec la generation des ecritures VE qui a lieu au passage SENT. Le DRAFT reste modifiable. | A CONFIRMER |
| b | Application partielle si credit > facture ? | **Oui** — appliquer min(amountRemaining total, montant facture). Le reliquat de credit reste disponible. Jamais de "sur-application" creant un solde negatif. | A CONFIRMER |
| c | Ordre si plusieurs credits ? | **FIFO** — le credit le plus ancien (createdAt) d'abord, en ignorant les credits expires (`expiresAt < now`). | A CONFIRMER |
| d | Notifier le parent ? | **Non au MVP** — affichage sur la facture suffit ; notification = backlog futur. | A CONFIRMER |
| e | Coherence comptable de l'application ? | **Generer les ecritures comptables** de l'application du credit dans `accounting.service.ts` (nouvelle fonction dediee), dans la meme transaction que la deduction. | A CONFIRMER (cadrage compta) |

> Tant que (a), (b), (c) et surtout (e) ne sont pas valides par le referent comptable/client,
> cette story reste **partiellement bloquee** sur le volet comptable (voir DoR).

## Criteres d'Acceptation (Gherkin) — bases sur les hypotheses ci-dessus
- [ ] **Scenario 1 : credit unique <= montant facture (emission)**
      Given un parent avec 1 ParentCredit non expire de 5000 XPF
      And une nouvelle facture de 8000 XPF pour ce parent
      When la facture passe a SENT
      Then 5000 XPF de credit sont appliques automatiquement
      And `amountRemaining` du credit passe a 0
      And une `CreditApplication` est creee
      And le reste a payer de la facture est de 3000 XPF.

- [ ] **Scenario 2 : credit > montant facture (application partielle)**
      Given un parent avec 1 ParentCredit non expire de 10000 XPF
      And une facture de 4000 XPF
      When la facture passe a SENT
      Then 4000 XPF sont appliques
      And `amountRemaining` du credit passe a 6000 XPF (reliquat conserve)
      And la facture est soldee.

- [ ] **Scenario 3 : plusieurs credits — ordre FIFO**
      Given un parent avec 2 credits non expires (ancien 2000, recent 5000)
      And une facture de 3000 XPF
      When la facture passe a SENT
      Then le credit ancien (2000) est consomme en totalite puis 1000 sur le recent
      And le reliquat du credit recent est 4000.

- [ ] **Scenario 4 : credit expire ignore**
      Given un parent avec un credit dont `expiresAt < maintenant`
      When la facture passe a SENT
      Then ce credit n'est PAS applique.

- [ ] **Scenario 5 : coherence comptable**
      Given une application automatique de credit sur une facture
      When l'application est effectuee
      Then les ecritures comptables correspondantes sont generees dans la meme transaction
      And aucune ecriture n'est creee si la transaction echoue (atomicite)
      And le taux TGC reste a 0.

- [ ] **Scenario 6 : aucun credit disponible**
      Given un parent sans credit (ou tous a 0/expires)
      When la facture passe a SENT
      Then aucune deduction n'est appliquee et la facture suit son cours normal.

- [ ] **Scenario 7 : concurrence (anti double-spend)**
      Given deux emissions concurrentes consommant le meme credit
      When elles s'executent
      Then le lock `FOR UPDATE` empeche la double consommation (amountRemaining jamais negatif).

## Regles Metier
- R1 : Ne consommer que des credits du **meme parent**, non expires, `amountRemaining > 0`.
- R2 : Application = min(somme credits disponibles, reste a payer de la facture).
- R3 : Atomicite : deduction credit + CreditApplication + maj facture + ecritures compta dans **une transaction**.
- R4 : TGC = 0 inchange (exoneration legale).
- R5 : Ne pas creer de `parent_credits` cote service comptable (consommation uniquement).

## Hors Perimetre
- Refonte du modele Avoir/Remboursement (item abandonne).
- Notification parent (backlog futur).
- Application sur factures deja emises avant la mise en prod (uniquement les nouvelles emissions).
- UI de gestion manuelle avancee (la procedure manuelle `applyCredit` reste disponible).

## Details techniques (indicatif)
- Hook dans le flux d'emission facture (router `invoices`, au passage SENT) : selectionner les ParentCredit eligibles (FIFO), appliquer, generer ecritures via `accounting.service.ts`.
- Reutiliser/factoriser la logique de `applyCredit` (lock FOR UPDATE) en l'enrichissant du volet comptable.
- Tests : mocker `$queryRawUnsafe` et `accountingEntry.create` (cf. CLAUDE.md tests compta).

## Metriques de Succes
- 100% des emissions avec credit eligible appliquent la deduction sans action manuelle.
- 0 ecart comptable detecte sur les applications (balance equilibree en test).

## Estimation
- **Complexite** : M (mais sensibilite comptable elevee)
- **Story Points** : 5 (8 si le cadrage comptable s'avere plus lourd — re-estimer apres validation des arbitrages)
- **Dependances** : sequencement avec FEAT-004 (les deux touchent `Invoice` / migration & flux). Pas bloquant mais a ordonner.

## INVEST Check
- [x] Independent (du reste du backlog)
- [x] Negotiable (arbitrages ouverts)
- [x] Valuable
- [x] Estimable (apres validation des arbitrages)
- [x] Small — 5 SP cible
- [x] Testable (Gherkin compta + concurrence)

## Definition of Ready
- [x] Discovery / besoin CDC
- [x] Hypothese + metric
- [x] User story
- [x] Criteres Gherkin testables
- [x] Regles metier
- [x] Hors perimetre
- [x] Pas de nouvelle UI bloquante
- [x] Dependances identifiees
- [x] <= 8 SP
- [x] INVEST
- [ ] **Pas de TBD critique** -> **NON** : arbitrages (a), (b), (c) et surtout (e) coherence comptable a valider par le referent comptable/client.

**Statut DoR : NON-READY (conditionnel)**
> Manque pour passer Ready : validation des arbitrages metier (a, b, c) et **cadrage du volet comptable (e)** par le referent comptable.
> Les hypotheses par defaut sont posees et raisonnables ; une fois confirmees, la story est Ready quasi en l'etat.
