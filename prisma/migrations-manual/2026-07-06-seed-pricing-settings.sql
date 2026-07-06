-- ============================================================================
-- Data-fix 2026-07-06 — Réglages pricing manquants dans app_settings (prod)
--
-- La catégorie `pricing` n'a jamais été seedée en prod : getPricingSetting()
-- retombait sur le défaut codé (tax_rate 11) → TGC facturée à tort alors
-- qu'ALVM est EXONÉRÉE (article LP 492 — Loi du pays N°2016-14 du 30/09/2016).
-- tax_rate = 0 est volontaire et légal (cf. CLAUDE.md projet).
--
-- Idempotent : ON CONFLICT (category, key) DO NOTHING — ne modifie jamais un
-- réglage déjà présent (ajusté ensuite via l'écran admin Settings).
-- ============================================================================

INSERT INTO app_settings (category, key, value, description) VALUES
  ('pricing', 'currency',                     '"XPF"', 'Devise (code ISO)'),
  ('pricing', 'currency_symbol',              '"XPF"', 'Symbole de devise affiché'),
  ('pricing', 'default_camp_price',           '5000',  'Prix par défaut par jour de camp (en XPF)'),
  ('pricing', 'tax_rate',                     '0',     'Taux de TGC en pourcentage (0 = exonération LP 492)'),
  ('pricing', 'payment_terms_days',           '30',    'Délai de paiement par défaut (jours)'),
  ('pricing', 'credit_expiry_days',           '365',   'Durée de validité des avoirs (jours)'),
  ('pricing', 'payment_method_inactive_days', '30',    'Inactivité avant désactivation méthode de paiement (jours)')
ON CONFLICT (category, key) DO NOTHING;
