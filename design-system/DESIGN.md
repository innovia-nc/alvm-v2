Asso SaaS est la plateforme d'administration d'associations qui organisent et supervisent des camps de vacances. Les personnes qui l'utilisent gèrent des enfants, des familles, des inscriptions et de l'argent : l'interface doit rassurer par sa clarté et rester chaleureuse, sans jamais ressembler à un tableur d'entreprise. Ce système remplace l'ancien bleu générique par une identité lagon et sable, pensée pour le Pacifique.

## Contenu et voix

Écrivez en français, au vouvoiement, avec des phrases courtes et concrètes. Un titre de liste commence par "Gestion des" suivi du nom de l'entité ("Gestion des camps", "Gestion des factures"). Un sous-titre tient en une phrase qui dit à quoi sert l'écran ("Créez et gérez les camps"). Un bouton d'ajout commence par "Nouveau" ou "Ajouter" ("Nouveau camp", "Ajouter un membre"). Un état vide dit ce qui manque et quoi faire ("Aucune activité à venir. Les prochains camps publiés apparaîtront ici.").

Ne mettez jamais en dur les mots Parents, Enfants, Camps ou Personnels. L'écran Vocabulaire permet à chaque association de choisir ses propres termes (Famille, Participants, Séjours, Équipe) et ils remplacent les libellés partout : menus, titres, boutons, messages. Tout composant reçoit ses textes en props et le consommateur les tire du vocabulaire de l'organisation.

Les montants sont en francs pacifiques, sans décimales, avec une espace insécable pour les milliers et le code `XPF` après le nombre ("184 500 XPF"). Les dates s'écrivent jj/mm/aaaa ("01/10/2026"). Les statuts tiennent en un mot ("Payée", "En attente", "En retard"). Aucun emoji, aucun point d'exclamation.

## Fondations visuelles

Posez toute page sur `bg`, le sable chaud, et placez le contenu dans des cartes `surface` bordées de `border` avec `shadow-card` et `radius-lg`. Le texte courant est en `ink` avec le style `body`, le texte secondaire en `ink-muted` avec `body-sm`. Le lagon `brand` est la seule couleur d'action : fond du bouton principal, avatar, éléments actifs. Les liens et le menu actif utilisent `brand-text` sur `brand-tint`. Le soleil `accent` sert une fois par écran au plus, pour attirer l'oeil sur une information positive ; `coral` et `brand-deep` sont réservés aux aplats décoratifs et ne portent jamais de texte.

Les statuts ont chacun une paire fond et encre : `success-bg` avec `success-ink`, `warning-bg` avec `warning-ink`, `danger-bg` avec `danger-ink`, `info-bg` avec `info-ink`. Un statut s'écrit toujours avec un mot, car le vert et le rouge seuls ne distinguent rien pour une personne daltonienne. Les boutons destructifs utilisent `danger` avec `on-danger`.

Les titres de page utilisent `page-title`, les titres de carte `section-title`, les libellés de champs et en-têtes de colonnes `label`, les titres de groupes du menu `eyebrow`. Bricolage Grotesque porte les titres et les grands chiffres (`stat-value`), Figtree porte le texte, JetBrains Mono porte les codes comptables et les montants (`code`, `amount`). Chargez les trois depuis Google Fonts ; `bundle.css` les importe déjà.

L'espacement suit l'échelle `space-1` à `space-8`. Une carte a un padding de `space-5`, l'écart entre cartes est `space-4`, la zone de contenu a une marge de `space-6`. Les boutons, champs et entrées de menu utilisent `radius-md`, les cartes `radius-lg`, les badges et l'avatar `radius-pill`.

Le focus clavier est un anneau plein de 2px en `focus`, décalé de 2px, visible sur chaque fond et sur chaque thème. Le thème sombre est un thème à part entière : fonds vert nuit, lagon éclairci, textes sur boutons assombris. Utilisez `data-theme="dark"` sur la racine et ne recolorez jamais à la main. Chaque paire texte et fond de ce système atteint 4,5:1 dans les deux thèmes, et les contours de champs 3:1.

## Mise en page

Un écran se compose d'un menu latéral fixe de 264px (`Sidebar`), d'une barre haute avec le nom de l'espace, le rôle de la session et l'avatar, puis d'une zone de contenu sur `bg`. Dans la zone de contenu, l'ordre est toujours le même : `PageHeader` avec l'action principale, cartes de filtres (`Select` dans une `Card`), `SearchBar`, puis `DataTable` ou `EmptyState`. Le tableau de bord remplace les filtres par une rangée de trois `StatCard` suivie d'une carte "Prochaines activités". Les écrans de configuration empilent des cartes de formulaire à largeur de lecture, sans tableau.

## Iconographie

Utilisez des icônes au trait de 1,75px, de 18px dans les menus et 16px dans les boutons, qui héritent la couleur du texte (`currentColor`). Le composant `Icon` fournit un jeu minimal dessiné pour ce système (home, users, calendar, tent, receipt, card, file, clock, edit, trash, search, plus). C'est un jeu de substitution : à terme, remplacez-le par la bibliothèque Lucide, qui correspond au trait de l'ancienne interface. Aucun emoji comme icône.

## Composants

Button, Badge, Field (avec Input, Select et SearchBar), StatCard, DataTable, EmptyState, Sidebar et PageHeader couvrent les quinze écrans du passeport : tableau de bord, listes de gestion (parents, enfants, comptes, personnels, camps, inscriptions, factures, paiements, avoirs, remboursements) et écrans de configuration. Chaque composant a sa fiche avec les props à fournir et les règles d'usage.
