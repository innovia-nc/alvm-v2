# Cohérence des écrans et composants

La seconde passe étend l’harmonisation aux espaces administrateur, personnel et parent : listes, création et édition, fiches de détail, compte, documents et paramètres. Elle conserve les champs, validations, autorisations et opérations métier existants.

## Conventions communes

| Usage                                   | Composant et convention                                                                                                                                                                                             |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Titre de page                           | `PageHeader` : un titre principal, une description facultative et des actions qui se réorganisent sur mobile.                                                                                                       |
| Sections d’une fiche ou d’un formulaire | `Card`, `CardHeader`, `CardTitle`, `CardContent` : mêmes surfaces, rayons et espacements ; titres de section en `h2`.                                                                                               |
| Retour                                  | `BackButton` : lien avec présentation de bouton secondaire et libellé explicite.                                                                                                                                    |
| Pied de formulaire                      | `FormActions` : annulation avant validation dans le DOM comme à l’écran ; boutons empilés sur mobile. `LoadingButton` signale la soumission en cours.                                                               |
| Filtres                                 | `FilterBar` : groupe nommé, surface et espacements communs, retour à la ligne sans débordement.                                                                                                                     |
| Listes                                  | `DataTable` / `DataTableServer` : même surface, tri accessible au clavier et annonce du sens de tri. La recherche serveur reste explicitement validée ; une réinitialisation externe efface aussi le terme affiché. |
| Absence de données                      | `EmptyState` : icône, titre, explication et action facultative. Les mentions courtes intégrées à une fiche restent du texte.                                                                                        |
| Attente et erreur                       | `LoadingState` annonce le chargement ; `ErrorState` annonce l’erreur et propose une nouvelle tentative lorsque disponible. Les squelettes restent adaptés aux contenus connus.                                      |
| Statut métier                           | `StatusBadge` conserve les libellés et couleurs centralisés, y compris sur les détails des factures et inscriptions parent.                                                                                         |
| Fenêtres modales                        | `Dialog` / `AlertDialog` : marges et hauteur adaptées à l’écran, défilement interne, fermeture accessible et retour du focus au bouton d’ouverture, même sans `DialogTrigger`.                                      |
| Champs et documents                     | Composants de saisie communs, erreurs annoncées, zone de dépôt accessible au clavier, noms accessibles des actions sans texte.                                                                                      |
| Couleurs et texte long                  | Couleurs sémantiques (`bg-card`, `text-muted-foreground`, etc.) pour les thèmes clair et sombre ; boutons et contenus capables de revenir à la ligne.                                                               |

Les composants partagés évitent de recopier les mêmes styles dans chaque page. Les variantes métier restent explicites : un paiement, une inscription et une fiche enfant conservent leur contenu et leurs actions propres.

## Contrôles

`test/unit/ui-consistency.spec.tsx` couvre les annonces des états, la nouvelle tentative sans soumission involontaire, l’ordre des actions, le tri clavier, la synchronisation d’une recherche réinitialisée et le retour du focus des dialogues avec ou sans déclencheur Radix.

`test/integration/ui-consistency.mjs` inventorie les pages du dashboard à partir du dépôt. Avec des comptes synthétiques pour chaque rôle, il charge les routes accessibles sur mobile clair (390 px) et ordinateur sombre (1 440 px), vérifie le titre principal, l’absence de débordement horizontal et d’erreur JavaScript. Il contrôle la lisibilité des cellules sur mobile, les liens d’édition des fiches personnel et une fenêtre de paramètres sur un écran de 390 × 680 px et la réinitialisation des filtres. Le compte est vérifié pour les trois rôles ; `/dashboard` est la route de redirection empruntée à la connexion.

Cette recette vérifie le rendu des routes avec les données fictives disponibles. Elle est complétée par les campagnes existantes de navigation et de régression ; elle ne couvre pas toutes les combinaisons de données ni les services externes.

Pour rejouer après préparation de la base synthétique et démarrage de l’application (instructions dans le dossier parent) :

```sh
UI_CONSISTENCY_OUTPUT=/private/tmp/alvm-consistency/browser node test/integration/ui-consistency.mjs
```

Les résultats et captures de la recette finale accompagnent ce document. Aucun mot de passe ni fichier de session n’est ajouté au dépôt.

## Résultats et captures

La recette finale compte **195 contrôles réussis** : 192 rendus (96 parcours de pages/rôles dans deux formats) et 3 interactions complémentaires. Le dépôt contient 95 pages dashboard : 93 pages propres aux rôles, le compte commun vérifié avec chaque rôle et la redirection `/dashboard`. Aucun débordement ni erreur JavaScript dans cette campagne finale.

- [Compte sur mobile](account-mobile.png)
- [Création d’un parent sur mobile](form-mobile.png)
- [Fiche de camp en thème sombre](camp-dark.png)
- [Facture parent sur mobile](invoice-mobile.png)
- [Dialogue de paramètres sur mobile](dialog-mobile.png)

Une erreur d’hydratation React (#418) a été observée une fois sur la liste des inscriptions personnel pendant une campagne de navigation menée en parallèle. Elle n’a pas été reproduite par la campagne complète finale (46 contrôles), le parcours personnel en développement, ni 30 rechargements ciblés en développement. Sa cause reste non établie ; les résultats passants ne permettent pas de garantir son absence future.
