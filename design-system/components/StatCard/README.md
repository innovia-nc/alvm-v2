La carte indicateur résume un chiffre clé et mène à la liste correspondante. Elle sert sur le tableau de bord, trois par ligne, dans l'ordre : inscriptions en attente, montant restant à encaisser, factures en retard.

Le consommateur fournit `label`, `value`, `caption` et `href`. Les montants portent l'unité `XPF` dans `unit`, les nombres sont groupés avec une espace insécable. Passez `alert` quand la valeur demande une action (factures en retard supérieures à zéro) : le chiffre passe en `danger-ink`. Quand tout va bien, la légende le dit ("Aucune échéance dépassée").
