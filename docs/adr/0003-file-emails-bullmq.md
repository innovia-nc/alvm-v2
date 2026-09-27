# ADR 0003 — Emails envoyés par une file BullMQ (`alvm-email`) et un worker

- **Statut** : accepté — 2026-09-27
- **Règles InnovIA** : CLAUDE.md §5.11 (BullMQ + Redis, cas obligatoire : envoi d'emails)

## Contexte

Les deux envois (facture au client, lien de réinitialisation) étaient
synchrones dans la requête : appel HTTP au fournisseur (Resend) pendant la
transaction RLS, génération du PDF comprise — lent depuis Nouméa, sans reprise
en cas d'échec transitoire, sans historique.

## Décision

- File `alvm-email` (Redis 7, BullMQ 5). L'API vérifie les préconditions puis,
  **en dernier dans la transaction du tenant**, crée la ligne `email_messages`
  (QUEUED) et programme le job ; un échec Redis annule la ligne.
- Worker séparé (`node dist/worker.js`, même image que le back) : exécute chaque
  job dans le contexte RLS du tenant porté par le job, régénère le contenu
  (PDF compris) depuis l'état courant, envoie hors transaction, met à jour la
  ligne (SENT / FAILED). 3 tentatives, backoff exponentiel, 2 envois/s.
- Jamais de corps ni de jeton en base ; le job ne porte que des identifiants
  (et le lien de réinitialisation, éphémère : job supprimé même en échec).
- Garantie « au moins une fois » (pas de clé d'idempotence : le PDF régénéré
  n'est pas identique octet pour octet).

Détail d'exploitation et vérifications : `docs/file-emails.md`.

## Conséquences

- Redis devient une dépendance de production (requis au boot en production).
- Un service `worker` de plus au déploiement (`docs/deploiement-ovh.md`).
- `invoices.sendEmail` répond « envoi programmé » ; l'historique des envois est
  visible sur la fiche facture.
