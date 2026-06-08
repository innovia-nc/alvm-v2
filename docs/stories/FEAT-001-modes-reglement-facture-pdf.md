# FEAT-001 : Afficher les modes de reglement sur la facture PDF

> Source CDC : item D4 — effort S

## Hypothese (discovery)
We believe that **afficher les modes de paiement sur le PDF facture**
For **les parents / clients qui recoivent la facture et la comptabilite ALVM**
Will result in **une facture plus claire et conforme aux attentes (tracabilite du reglement : cheque, especes, aides...)**.
We will know we're right when **toute facture comportant au moins un paiement affiche un bloc "Modes de reglement" exact**.

## User Story
**En tant que** parent / client recevant une facture
**Je veux** voir sur le PDF par quels moyens mon reglement a ete effectue (cheque, especes, aides...)
**Afin de** disposer d'un justificatif complet et lisible du paiement.

## Contexte technique (grounded)
- Lib PDF : `@react-pdf/renderer`, template `lib/pdf/invoice-pdf.tsx`.
- La mutation `generatePDF` (`server/routers/invoices.ts` ~691-779) charge `parent` + `lines` mais **PAS** les `payments`.
- Relations existantes : `Invoice -> payments[] -> paymentMethod { name, code }`.
- A faire : (1) ajouter `payments` (avec `select` whitelist : montant, date, `paymentMethod.name`) dans la requete Prisma de `generatePDF` ; (2) ajouter un bloc "Modes de reglement" dans `invoice-pdf.tsx`.

## Criteres d'Acceptation (Gherkin)
- [ ] **Scenario 1 : facture avec un paiement**
      Given une facture avec un paiement par cheque
      When je genere le PDF
      Then un bloc "Modes de reglement" liste "Cheque" avec le montant et la date du paiement.

- [ ] **Scenario 2 : facture avec plusieurs paiements de modes differents**
      Given une facture reglee partiellement en especes et partiellement par aide
      When je genere le PDF
      Then chaque mode de reglement est liste avec son montant respectif.

- [ ] **Scenario 3 : facture sans paiement**
      Given une facture sans aucun paiement enregistre
      When je genere le PDF
      Then le bloc "Modes de reglement" est masque (ou affiche "Aucun reglement enregistre"), sans erreur de rendu.

- [ ] **Scenario 4 : montants et exoneration TGC**
      Given une facture ALVM (TGC = 0, exoneration art. LP 492)
      When je genere le PDF
      Then les totaux et la mention d'exoneration restent inchanges et le bloc paiement n'altere pas le calcul.

## Regles Metier
- R1 : Afficher le libelle lisible du mode (`paymentMethod.name`), pas le code technique.
- R2 : Ne JAMAIS recalculer ni modifier le taux TGC (= 0, exoneration legale ALVM). Bloc purement informatif.
- R3 : `select` whitelist sur `payments` — ne pas charger de champs sensibles.

## Hors Perimetre
- Pas de refonte de la mise en page globale du PDF.
- Pas de modification de la logique de paiement / comptabilite.
- Pas de gestion d'echeancier ou de paiement futur (hors champ).

## Metriques de Succes
- 100% des factures avec paiement affichent le bloc correct (verifie en test de snapshot/contenu PDF).

## Estimation
- **Complexite** : S
- **Story Points** : 2
- **Dependances** : aucune

## INVEST Check
- [x] Independent
- [x] Negotiable (format du bloc discutable)
- [x] Valuable
- [x] Estimable
- [x] Small — 2 SP
- [x] Testable (assertion sur contenu PDF / data passee au template)

## Definition of Ready
- [x] Discovery / besoin CDC confirme
- [x] Hypothese + metric
- [x] User story
- [x] Criteres Gherkin testables
- [x] Regles metier (dont garde-fou TGC=0)
- [x] Hors perimetre
- [x] Maquette : bloc simple, layout texte (pas de nouvelle UI complexe — OK sans wireframe formel)
- [x] Dependances : aucune
- [x] <= 8 SP
- [x] INVEST valide
- [x] Pas de TBD critique

**Statut DoR : READY**
