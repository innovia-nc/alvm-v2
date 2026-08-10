-- ============================================================================
-- Diagnostic 2026-08-10 (TD-003) — divergence entre les deux vues du solde
-- d'un avoir. LECTURE SEULE : ce script ne modifie RIEN.
--
-- Contexte
-- --------
-- Le solde restant d'un avoir se lisait de deux façons qui pouvaient diverger :
--   (A) chemin manuel (payments.create) : |invoices.total_amount| moins la
--       somme des credit_note_allocations — il ne décrémentait PAS
--       parent_credits.amount_remaining ;
--   (B) chemin automatique (US-FACT-02) : parent_credits.amount_remaining.
--
-- Conséquence avant correctif : un avoir consommé à la main restait « plein »
-- pour l'imputation automatique, qui pouvait le réimputer sur une autre
-- facture. Le compte 4191 se retrouvait alors débité de plus qu'il n'avait été
-- crédité.
--
-- Le code tient désormais les deux vues à jour dans les deux sens (imputation
-- ET suppression de règlement). Reste à vérifier qu'aucune donnée ANTÉRIEURE
-- au correctif ne porte déjà un écart.
--
-- Usage : exécuter sur un clone du dump de prod, puis sur la prod (lecture
-- seule, sans risque). Si la requête ne renvoie AUCUNE ligne, il n'y a rien à
-- reprendre. Sinon, voir la note de correction en fin de fichier.
-- ============================================================================

SELECT
    cn.invoice_number                          AS avoir,
    pc.id                                      AS parent_credit_id,
    pc.amount_original                         AS montant_initial,
    pc.amount_remaining                        AS solde_vue_automatique,
    ABS(cn.total_amount) - COALESCE(alloc.total_alloue, 0)
                                               AS solde_vue_allocations,
    COALESCE(alloc.total_alloue, 0)            AS total_alloue,
    COALESCE(app.total_historise, 0)           AS total_historise,
    pc.amount_remaining
      - (ABS(cn.total_amount) - COALESCE(alloc.total_alloue, 0))
                                               AS ecart
FROM parent_credits pc
JOIN invoices cn
  ON cn.id = pc.credit_note_id
LEFT JOIN (
    SELECT credit_note_id, SUM(amount) AS total_alloue
    FROM credit_note_allocations
    GROUP BY credit_note_id
) alloc
  ON alloc.credit_note_id = pc.credit_note_id
LEFT JOIN (
    SELECT parent_credit_id, SUM(amount_used) AS total_historise
    FROM credit_applications
    GROUP BY parent_credit_id
) app
  ON app.parent_credit_id = pc.id
-- On ne remonte que les avoirs réellement incohérents.
WHERE pc.amount_remaining
      <> ABS(cn.total_amount) - COALESCE(alloc.total_alloue, 0)
ORDER BY ABS(
    pc.amount_remaining
      - (ABS(cn.total_amount) - COALESCE(alloc.total_alloue, 0))
) DESC;

-- ============================================================================
-- Si des lignes remontent
-- ============================================================================
-- La vue « allocations » fait foi : elle est alimentée depuis l'origine par le
-- chemin manuel, alors que amount_remaining n'était mis à jour par personne
-- avant US-FACT-02. La correction consiste donc à réaligner amount_remaining
-- sur le solde calculé — MAIS elle ne doit être appliquée qu'après lecture des
-- lignes ci-dessus et validation métier (un écart peut aussi signaler un avoir
-- saisi à la main hors application).
--
-- Requête de correction, à n'exécuter QUE dans ce cas, sur clone d'abord :
--
--   UPDATE parent_credits pc
--   SET amount_remaining = GREATEST(0, LEAST(
--         pc.amount_original,
--         ABS(cn.total_amount) - COALESCE((
--           SELECT SUM(a.amount) FROM credit_note_allocations a
--           WHERE a.credit_note_id = pc.credit_note_id
--         ), 0)
--       ))
--   FROM invoices cn
--   WHERE cn.id = pc.credit_note_id
--     AND pc.amount_remaining <> ABS(cn.total_amount) - COALESCE((
--           SELECT SUM(a.amount) FROM credit_note_allocations a
--           WHERE a.credit_note_id = pc.credit_note_id
--         ), 0);
--
-- Aucune écriture comptable n'est concernée : le compte 4191 est alimenté par
-- les écritures BQ, que ce réalignement ne touche pas.
-- ============================================================================
