# Plan — Rémunération du tuteur en cas d'annulation tardive par le client

> Statut : **PLAN, à valider. Aucun code écrit.** Touche des paiements réels
> (Stripe, virements Stripe Connect) : validation du plan obligatoire avant
> toute implémentation, puis vérification complète sur le staging.

## 1. Situation actuelle (vérifiée dans le code, 2026-11-27)

| Événement | Client | Tuteur |
|---|---|---|
| Client annule ≥ 48 h avant | remboursé 100 % | 0 $ |
| Client annule 24–48 h avant | remboursé 50 % | **0 $** |
| Client annule < 24 h avant | remboursé 0 % | **0 $** |
| Tuteur annule (tout délai) | remboursé 100 % | 0 $ |
| Élève absent (tuteur présent) | payé 100 % | **payé 100 %** |
| Séance réalisée | payé 100 % | payé 100 % |

Mécanique : `cancelBookingWithRefund` (src/services/cancellationPolicy.ts)
calcule le palier client (`calculateCancellationRefund`), puis, étape 8,
**annule toujours le `TutorEarning`** s'il n'a pas encore été viré, quel que
soit le palier. Résultat : sur une annulation tardive, FutureTutor conserve le
montant payé et le tuteur, qui avait bloqué son créneau, ne reçoit rien —
alors qu'une absence de l'élève lui est payée en entier. L'Entente §68 renvoie
aux « règles d'annulation et de rémunération applicables » sans les préciser.

## 2. Règle proposée

Le tuteur reçoit, sur sa rémunération prévue, **la même part que celle que le
client n'a pas récupérée** :

| Le client annule… | Client remboursé | Tuteur payé |
|---|---|---|
| ≥ 48 h avant | 100 % | 0 % |
| 24–48 h avant | 50 % | **50 %** de sa rémunération |
| < 24 h avant | 0 % | **100 %** de sa rémunération |

Inchangé : annulation par le tuteur (0 %), absence de l'élève (100 %), séance
réalisée (100 %).

Formule : `rémunération = arrondi(rémunération prévue × (1 − pourcentage remboursé))`.
La marge de FutureTutor reste proportionnelle ; aucun scénario ne verse au
tuteur plus que ce que le client a réellement payé.

## 3. Décisions à prendre par la direction

1. **La règle ci-dessus.**
2. **Annulation par un administrateur** (au nom du client, ou pour une raison
   opérationnelle) : proposition — l'administrateur choisit explicitement
   « au nom du client » (palier appliqué, tuteur payé selon la règle) ou
   « annulation de service » (client remboursé 100 %, tuteur payé 0 %, ou
   montant saisi). Par défaut aujourd'hui : palier client, tuteur 0 %.
3. **Délai de versement** : même délai de sécurité que pour une séance
   réalisée (24 h après l'heure prévue de fin), pour absorber une contestation
   éventuelle.
4. **Texte contractuel** : ajouter la règle à l'Entente du tuteur (§68) et aux
   Conditions d'utilisation (côté client, la règle de remboursement ne change
   pas). Proposition : nouvelle version de l'Entente avec réacceptation à la
   prochaine connexion, comme le prévoit déjà le mécanisme FG-LEGAL2.
5. **Application** : uniquement aux réservations annulées après la mise en
   production (pas de rattrapage rétroactif).

## 4. Conception technique

### 4.1 Données
- `TutorEarning` : ajouter `plannedAmountCents` (montant initial, figé) et
  `cancellationCompensationPercent` (0–100, nul hors annulation). `amountCents`
  reste le montant réellement dû.
- Nouveau motif d'admissibilité dans `tutorEarningConvergence.ts` :
  `ELIGIBLE_AT_VIA_LATE_CUSTOMER_CANCELLATION`. Les gardes existantes
  (« le temps seul ne rend jamais un gain admissible ») sont conservées : le
  gain devient admissible parce que l'annulation est enregistrée et que le
  paiement client est capturé, pas par le seul passage du temps.
- Migration additive uniquement.

### 4.2 Étape 8 de `cancelBookingWithRefund`
- Annulation client avec palier `PARTIAL_REFUND` ou `NO_REFUND` et gain non
  viré : au lieu d'annuler le gain, le ramener à
  `plannedAmountCents × (1 − refundPercent)` et poser `eligibleAt` = fin
  prévue de la séance + délai de sécurité. Journal d'audit dédié
  (`tutor_earning.late_cancellation_compensation`).
- Palier `FULL_REFUND`, annulation tuteur, ou montant résultant nul :
  comportement actuel (gain annulé).
- Gain déjà viré : comportement actuel (exposition absorbée, journalisée).
- Toujours dans la même transaction Serializable qu'aujourd'hui.

### 4.3 Paiement client
- Vérifier que la convergence de paiement capture bien le montant non
  remboursé (palier 50 % : capture puis remboursement partiel ; palier 0 % :
  capture totale) **avant** que le gain ne devienne admissible au virement. Le
  gain ne doit jamais être viré si la capture a échoué (même règle que pour
  une séance réalisée).

### 4.4 Virements
- Aucun changement : `tutorTransfers.ts` vire les gains `ELIGIBLE` ; le
  montant réduit est pris tel quel.

### 4.5 Communication
- Courriel au tuteur lors d'une annulation tardive : montant qui lui sera
  versé. Affichage dans « Versements » et dans l'historique de la réservation.
- Module 6 de la formation : enseigner la règle.

## 5. Vérification

- Tests unitaires : formule, paliers aux bornes exactes (48 h, 24 h), arrondis,
  montant nul.
- Tests d'intégration (base réelle) : annulation client à 47 h et à 2 h →
  gain réduit / plein, admissible après capture ; annulation tuteur → gain
  annulé ; gain déjà viré → inchangé ; concurrence annulation / virement.
- Staging : parcours complet en mode test Stripe (paiement, annulation
  tardive, capture, virement vers un compte Connect de test).
- Aucun test en mode live sans autorisation explicite.

## 6. Risques

| Risque | Parade |
|---|---|
| Verser un gain sur un paiement non capturé | Admissibilité conditionnée à la capture |
| Double versement en cas de course | Transaction Serializable existante + garde sur l'existence d'un virement |
| Litige client après versement | Délai de sécurité ; exposition absorbée et journalisée (politique H.8) |
| Règle non connue des tuteurs | Nouvelle version de l'Entente + formation + courriel |

## 7. Synthèse

- PRÊT : analyse de l'existant, règle proposée, conception.
- BLOQUANTS : décisions §3 (1 à 5).
- HORS PÉRIMÈTRE : remboursement client (inchangé), absences, frais Stripe.
