# Design system Asso SaaS (lagon et sable)

Refonte visuelle de l'interface d'administration, issue de l'artifact "Asso SaaS" de claude.ai.

- `DESIGN.md` : regles d'usage (voix, couleurs, typographie, mise en page, iconographie). A lire avant toute modification d'interface.
- `tokens.json` : source de verite des tokens (couleurs clair et sombre, espacements, rayons, ombres, typographie).
- `shadcn-theme.css` : traduction des tokens en variables shadcn/ui (HSL) et variables `--as-*`. Pour l'adopter, remplacer le bloc `:root` et `.dark` de `app/globals.css`, charger Bricolage Grotesque, Figtree et JetBrains Mono via `next/font`, puis remplacer Inter dans `app/layout.tsx`.
- `components/` : apercus HTML, fiches d'usage et bundle de reference des huit composants (Button, Badge, Field, StatCard, DataTable, EmptyState, Sidebar, PageHeader). Le code de production reste dans `components/ui` et `components/shared` (notamment `StatusBadge`).

Ce dossier n'est pas encore branche dans l'application : aucun fichier de l'app n'a ete modifie.
