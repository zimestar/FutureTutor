# FutureTutor — Stratégie d'acquisition : SEO, mesure et publicité (GROWTH-1)

> Document de stratégie à valider par la direction. Prolonge les travaux
> existants (docs/seo/SEO-1 à SEO-4B, docs/analytics/DATA-1 et DATA-2) sans
> les refaire. Aucune donnée de volume de recherche n'est inventée.

## 1. Où nous en sommes

**Déjà en place :**
- SEO technique : pages publiques bilingues, `hreflang`, `canonical`, sitemap
  par langue, `robots.txt`, pages privées en `noindex`, redirection `www`,
  données structurées (Organization, FAQPage), Search Console vérifiée.
- Contenu : 10 pages matières, page locale Edmonton, 6 articles « ressources »,
  page de recrutement des tuteurs.
- Mesure : Google Tag Manager + GA4, chargés **seulement** sur les pages
  publiques et **seulement** après consentement « analytique » ; 11 événements
  de conversion définis (recherche de tuteur, inscription, devenir tuteur…).

**Ce qui manque pour une acquisition comparable à Preply :**
1. Le **suivi publicitaire** (pixel Meta, balise Google Ads) qui permet de
   recibler un visiteur sur Facebook, Instagram et Google.
2. Une **catégorie de consentement « publicité »** : la loi 25 du Québec exige
   un consentement explicite avant tout traceur publicitaire, distinct du
   consentement analytique. Sans elle, installer un pixel serait illégal au
   Québec et risqué partout au Canada.
3. Un **plan de contenu** régulier et une présence locale (Google Business
   Profile) pour le référencement naturel.

## 2. Principes non négociables

- **Consentement d'abord.** Aucun pixel publicitaire avant un « oui » explicite
  à la catégorie « publicité ». Refuser reste aussi simple qu'accepter.
- **Jamais sur les pages privées.** Tableaux de bord, messagerie, classe
  virtuelle, pages famille : aucun traceur (règle déjà appliquée à GA4).
- **Mineurs.** Les publicités visent les **parents** et les **adultes**
  (18 ans et plus) ; aucun ciblage d'élèves mineurs. Aucune donnée d'élève
  n'est envoyée à une plateforme publicitaire.
- **Données minimales.** Aucun nom, courriel ou téléphone dans les traceurs.
  La « Conversions API » (envoi serveur) n'est envisagée qu'avec un
  consentement explicite et des identifiants hachés, dans une phase ultérieure.

## 3. Suivi publicitaire : ce qui sera construit

| Élément | Rôle | Déclenché par |
|---|---|---|
| Consentement « publicité » | Nouveau choix dans la bannière et la page Témoins | Le visiteur |
| Pixel Meta (via GTM) | Reciblage Facebook/Instagram, audiences similaires | Consentement publicité, pages publiques |
| Balise Google Ads (via GTM) | Reciblage Google/YouTube, suivi des conversions | Consentement publicité, pages publiques |
| Événements de conversion | `Lead` (inscription parent/élève), `CompleteRegistration` (compte créé), `SubmitApplication` (candidature tuteur), `Search` (recherche de tuteur) | Les 11 événements DATA-2 existants, réutilisés |
| Mise à jour de la Politique sur les témoins | Décrire Meta et Google Ads, durées, retrait du consentement | — |

Tout passe par **Google Tag Manager**, déjà installé : les identifiants Meta et
Google Ads se configurent dans GTM, sans redéploiement du site. Le code du site
n'ajoute que la catégorie de consentement et la transmet à GTM (« Consent Mode
v2 » de Google : `ad_storage`, `ad_user_data`, `ad_personalization`).

### Ce que la direction doit créer (comptes à son nom)
1. **Meta Business Manager** + un **pixel Meta** (Gestionnaire d'événements).
2. **Google Ads** (compte relié à GA4 et à Search Console).
3. Facultatif plus tard : TikTok Ads, LinkedIn (recrutement de tuteurs).

Je fournirai la configuration GTM pas à pas ; aucun identifiant n'est à
coller dans le code.

## 4. Campagnes recommandées au lancement

| Campagne | Cible | Message | Indicateur |
|---|---|---|---|
| Recherche Google (mots-clés locaux) | Parents, Edmonton puis Alberta | « Tuteur de maths à Edmonton — en ligne ou à domicile » | Coût par inscription |
| Reciblage Meta | Visiteurs du site (30 jours) | Rappel + preuve (tuteurs approuvés, prix affiché avant réservation) | Coût par inscription |
| Recrutement de tuteurs (Meta + Google) | Étudiants universitaires, enseignants | « Donnez des cours sur FutureTutor » | Coût par candidature soumise |
| Audiences similaires (Meta) | À partir des inscrits | — | Coût par inscription |

**Ordre recommandé :** recrutement de tuteurs d'abord (l'offre conditionne
tout), puis recherche Google locale, puis reciblage.

## 5. Référencement naturel : feuille de route

### 5.1 Local (impact rapide)
- **Google Business Profile** « FutureTutor — Tutorat » à Edmonton (adresse
  postale de FYRA Services), catégories « Service de tutorat », lien vers la
  page Edmonton, avis des familles après les premières séances.
- Données structurées `LocalBusiness` / `EducationalOrganization` sur la page
  Edmonton.

### 5.2 Pages commerciales (selon l'offre réelle)
Règle existante maintenue : **aucune page matière × ville sans tuteurs réels**
(pages vides = pénalité). Dès qu'une matière compte au moins 3 tuteurs
approuvés dans une ville, créer la page « Tuteur de <matière> à <ville> ».

### 5.3 Contenu (rythme : 2 articles par mois)
Priorité aux intentions « parents » et « recrutement », dans les deux langues :
- « Comment aider mon enfant en maths au secondaire »
- « Combien coûte un tuteur au Canada » (sans chiffres inventés)
- « Tutorat en ligne ou en personne : que choisir »
- « Devenir tuteur pendant ses études : guide »
- « Préparer les examens provinciaux (Alberta) »

### 5.4 Autorité (liens entrants)
- Annuaires éducatifs canadiens et associations de parents (Edmonton).
- Partenariats avec des associations étudiantes (recrutement de tuteurs).
- Communiqués lors du lancement.

### 5.5 Technique (à faire pendant la refonte)
- Images en WebP/AVIF, poids réduits ; Core Web Vitals verts sur mobile.
- Données structurées `Person`/`Offer` sur les profils publics de tuteurs.
- Fil d'Ariane (`BreadcrumbList`) sur les pages matières et articles.

## 6. Mesure du succès

| Indicateur | Outil | Fréquence |
|---|---|---|
| Inscriptions parents/élèves, candidatures tuteurs | GA4 (événements DATA-2) | Hebdomadaire |
| Coût par inscription / par candidature | Meta, Google Ads | Hebdomadaire |
| Impressions et clics organiques par page | Search Console | Mensuelle |
| Taux de consentement analytique / publicité | Bannière (agrégé) | Mensuelle |

## 7. Étapes de réalisation

1. **GROWTH-1A — consentement « publicité » + Consent Mode v2 + Politique sur
   les témoins** (code, tests, mise à jour juridique à valider).
2. **GROWTH-1B — configuration GTM** : pixel Meta et Google Ads, événements de
   conversion (après création des comptes par la direction).
3. **GROWTH-1C — Google Business Profile** et données structurées locales.
4. **GROWTH-1D — calendrier de contenu** : 2 articles/mois, bilingues.

## 8. Décisions attendues

1. Valider les principes du §2 (en particulier : pas de ciblage de mineurs).
2. Créer les comptes Meta Business et Google Ads (§3).
3. Budget publicitaire mensuel de départ (recommandation : commencer modeste,
   mesurer le coût par candidature tuteur et par inscription pendant 4 semaines).
4. Valider l'ordre des campagnes (§4).
