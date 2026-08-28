import type { LegalDocumentContent } from "./types";

/** FG-LEGAL1A — traduction française complète et substantiellement
 * équivalente des Conditions d'utilisation approuvées. Correspond
 * section par section à termsContent.en.ts — voir ce fichier pour la
 * note sur la portée et les ajustements relatifs au Québec / à la Loi 96. */

export const termsContentFr: LegalDocumentContent = {
  effectiveDate: "30 août 2026",
  lastUpdated: "30 août 2026",
  sections: [
    {
      number: 1,
      heading: "À propos de FutureTutor",
      blocks: [
        {
          type: "p",
          text: "Les présentes Conditions d'utilisation (les « Conditions ») constituent une entente juridiquement contraignante entre vous et FYRA SERVICES INC., une société constituée sous le régime des lois du Canada (« FutureTutor », « nous », « notre » ou « nos »).",
        },
        {
          type: "p",
          text: "Les présentes Conditions régissent votre accès et votre utilisation du site Web, de l'application Web, de l'application Web progressive, des services connexes, des communications, de la place de marché de tutorat, de la classe virtuelle et de tout autre service offert par FutureTutor (collectivement, la « Plateforme »).",
        },
        { type: "p", text: "Veuillez lire attentivement les présentes Conditions." },
        {
          type: "p",
          text: "En créant un compte, en accédant à la Plateforme ou en l'utilisant, en demandant ou en fournissant des services de tutorat, en effectuant ou en recevant un paiement par l'entremise de la Plateforme, ou en utilisant autrement les Services, vous reconnaissez avoir lu et compris les présentes Conditions ainsi que notre Politique de confidentialité, et vous acceptez d'y être lié.",
        },
        { type: "p", text: "Si vous n'acceptez pas les présentes Conditions, vous ne devez pas utiliser la Plateforme." },
        {
          type: "p",
          text: "FutureTutor exploite une place de marché de tutorat propulsée par la technologie qui facilite la mise en relation entre élèves, parents ou tuteurs légaux, et tuteurs.",
        },
        { type: "p", text: "Par l'entremise de la Plateforme, les utilisateurs admissibles peuvent, entre autres :" },
        {
          type: "ul",
          items: [
            "créer et gérer des comptes et des profils;",
            "créer ou gérer des profils d'élève;",
            "demander des services de tutorat;",
            "être jumelés à des tuteurs admissibles;",
            "parcourir les profils de tuteurs, le cas échéant;",
            "planifier des séances de tutorat;",
            "participer à des séances de tutorat en ligne;",
            "organiser des séances de tutorat en personne;",
            "effectuer et recevoir des paiements;",
            "gérer des réservations;",
            "fournir des évaluations ou des commentaires;",
            "recevoir des communications de la Plateforme; et",
            "utiliser d'autres fonctionnalités offertes par FutureTutor.",
          ],
        },
        {
          type: "p",
          text: "FutureTutor peut déterminer quelles fonctionnalités sont offertes à des utilisateurs, types de compte, régions géographiques ou étapes de développement de la Plateforme en particulier.",
        },
      ],
    },
    {
      number: 2,
      heading: "Nature de la place de marché",
      blocks: [
        {
          type: "p",
          text: "FutureTutor facilite l'organisation et la prestation de services de tutorat par l'entremise d'une place de marché gérée.",
        },
        {
          type: "p",
          text: "Sauf disposition contraire de la loi applicable ou entente écrite expresse, les Tuteurs fournissent des services de tutorat à titre de prestataires de services indépendants et ne sont pas des employés de FutureTutor du seul fait qu'ils utilisent la Plateforme.",
        },
        {
          type: "p",
          text: "Sauf disposition contraire de la loi applicable ou entente écrite expresse, rien dans les présentes Conditions ne crée de partenariat, de coentreprise, de relation fiduciaire, de franchise ou de relation de mandat entre un Tuteur et un Élève ou un Parent.",
        },
        {
          type: "p",
          text: "La relation juridique précise entre FutureTutor et les Tuteurs, y compris la classification contractuelle, la fiscalité, l'administration des paiements et d'autres obligations, peut également être régie par une Entente de Tuteur distincte mise à la disposition des Tuteurs.",
        },
        {
          type: "p",
          text: "FutureTutor peut établir et faire respecter des normes de place de marché relatives à l'admissibilité, à la vérification, à la tarification, au jumelage, à la qualité, à la sécurité, au traitement des paiements, aux annulations et à d'autres aspects de la Plateforme visant les Tuteurs.",
        },
      ],
    },
    {
      number: 3,
      heading: "Admissibilité",
      blocks: [
        {
          type: "p",
          text: "Vous ne pouvez utiliser la Plateforme que si vous avez la capacité juridique de conclure l'entente applicable à votre utilisation de la Plateforme, ou si vous l'utilisez par l'entremise d'un Parent ou Tuteur légal autorisé, selon ce que permet FutureTutor.",
        },
        { type: "p", text: "Vous devez fournir des renseignements exacts concernant votre identité, votre âge, votre rôle et votre autorité." },
        { type: "p", text: "FutureTutor peut refuser, restreindre, suspendre ou résilier l'accès lorsque les conditions d'admissibilité ne sont pas respectées." },
      ],
    },
    {
      number: 4,
      heading: "Enfants et mineurs",
      blocks: [
        { type: "p", text: "FutureTutor peut fournir des services de tutorat à des mineurs." },
        {
          type: "p",
          text: "La Plateforme distingue, le cas échéant, les comptes Élève gérés de façon autonome des profils d'Élève gérés par un Parent ou Tuteur légal.",
        },
        {
          type: "p",
          text: "Un enfant qui n'a pas la capacité juridique ou pratique de fournir un consentement significatif ou de conclure l'entente pertinente doit utiliser FutureTutor par l'entremise d'un Parent ou Tuteur légal autorisé.",
        },
        {
          type: "p",
          text: "En particulier, FutureTutor exige qu'un Parent ou Tuteur légal fournisse ou autorise le consentement requis pour un enfant de moins de 13 ans, sauf lorsque FutureTutor détermine qu'une autre approche est légalement permise et appropriée.",
        },
        {
          type: "p",
          text: "Cette exigence reflète les orientations canadiennes en matière de protection de la vie privée, selon lesquelles le consentement d'un parent ou tuteur devrait être obtenu lorsqu'un enfant ne peut fournir un consentement significatif; le Commissariat à la protection de la vie privée du Canada considère généralement que cela inclut les enfants de moins de 13 ans, sous réserve de circonstances exceptionnelles.",
        },
        { type: "p", text: "FutureTutor peut imposer des restrictions supplémentaires aux comptes de mineurs, notamment relativement à :" },
        {
          type: "ul",
          items: [
            "aux paiements;",
            "aux demandes de tutorat;",
            "aux lieux de tutorat en personne;",
            "aux modifications des renseignements de localisation privés;",
            "à l'administration du compte;",
            "au consentement;",
            "aux communications; et",
            "aux autres activités sensibles sur le plan de la sécurité.",
          ],
        },
        {
          type: "p",
          text: "Un Parent ou Tuteur qui crée ou gère un profil d'Élève déclare et garantit qu'il détient l'autorité légale d'agir au nom de cet Élève.",
        },
        { type: "p", text: "FutureTutor peut demander une preuve raisonnable de cette autorité." },
      ],
    },
    {
      number: 5,
      heading: "Comptes de Parents et de Tuteurs",
      blocks: [
        { type: "p", text: "Les Parents et Tuteurs légaux peuvent créer et gérer des profils d'Élève selon ce que permet la Plateforme." },
        { type: "p", text: "Un Parent ou Tuteur peut être tenu de :" },
        {
          type: "ul",
          items: [
            "fournir des renseignements sur l'Élève;",
            "autoriser des demandes de tutorat;",
            "fournir un moyen de paiement;",
            "choisir le tutorat en ligne ou en personne;",
            "fournir des lieux de tutorat;",
            "fournir le consentement pertinent;",
            "gérer des réservations; et",
            "exercer d'autres permissions associées à un Élève géré par un tuteur.",
          ],
        },
        {
          type: "p",
          text: "Lorsque plusieurs Parents ou Tuteurs sont associés à un Élève, leurs permissions peuvent dépendre de la relation et du statut d'autorisation enregistrés par la Plateforme.",
        },
        { type: "p", text: "Les utilisateurs ne doivent pas prétendre faussement détenir l'autorité parentale ou tutélaire." },
        {
          type: "p",
          text: "FutureTutor peut révoquer ou restreindre une relation Parent-Élève ou Tuteur-Élève lorsque l'autorisation est retirée, contestée, expirée, frauduleuse ou autrement invalide.",
        },
      ],
    },
    {
      number: 6,
      heading: "Inscription au compte",
      blocks: [
        { type: "p", text: "Certaines fonctionnalités de la Plateforme nécessitent un compte." },
        { type: "p", text: "Vous acceptez de :" },
        {
          type: "ul",
          items: [
            "fournir des renseignements exacts, à jour et complets;",
            "maintenir l'exactitude de ces renseignements;",
            "préserver la confidentialité de vos identifiants;",
            "utiliser des mesures de sécurité raisonnables pour protéger votre compte;",
            "ne pas partager vos identifiants avec des personnes non autorisées; et",
            "aviser FutureTutor rapidement si vous soupçonnez un accès non autorisé.",
          ],
        },
        {
          type: "p",
          text: "Vous êtes responsable des activités effectuées par l'entremise de votre compte, dans la mesure permise par la loi applicable.",
        },
        {
          type: "p",
          text: "Vous ne pouvez pas usurper l'identité d'une autre personne, créer des comptes frauduleux, ni présenter faussement votre identité, vos qualifications, votre âge ou votre autorité.",
        },
      ],
    },
    {
      number: 7,
      heading: "Types de compte",
      blocks: [
        { type: "p", text: "FutureTutor peut offrir des types de compte, notamment :" },
        { type: "ul", items: ["Élève;", "Parent ou Tuteur;", "Tuteur;", "Administrateur; et", "d'autres types de compte introduits par FutureTutor."] },
        { type: "p", text: "Des permissions et obligations différentes s'appliquent selon le type de compte." },
        { type: "p", text: "La possession d'un compte ne donne pas automatiquement accès à toutes les fonctionnalités de la Plateforme." },
      ],
    },
    {
      number: 8,
      heading: "Candidature et approbation des Tuteurs",
      partTitle: "Partie II — Tuteurs",
      blocks: [
        { type: "p", text: "Les Tuteurs sont assujettis au processus d'admissibilité et d'approbation de FutureTutor." },
        { type: "p", text: "Selon les exigences en vigueur de la Plateforme, ce processus peut inclure :" },
        {
          type: "ul",
          items: [
            "des renseignements d'identité et de profil;",
            "des renseignements sur la formation;",
            "des relevés de notes;",
            "des diplômes;",
            "des certifications;",
            "des documents justificatifs;",
            "un examen administratif;",
            "des entrevues;",
            "des modules de formation;",
            "des examens;",
            "des évaluations par matière;",
            "des procédures de vérification;",
            "des évaluations de qualité; et",
            "d'autres exigences raisonnables.",
          ],
        },
        { type: "p", text: "La soumission d'une candidature ne garantit pas son approbation." },
        {
          type: "p",
          text: "FutureTutor peut approuver, rejeter, suspendre, mettre en examen ou désactiver un Tuteur conformément aux normes de la Plateforme et à la loi applicable.",
        },
        { type: "p", text: "Seuls les Tuteurs qui satisfont aux exigences d'admissibilité applicables de FutureTutor peuvent être autorisés à recevoir des occasions de tutorat." },
      ],
    },
    {
      number: 9,
      heading: "Exactitude des renseignements des Tuteurs",
      blocks: [
        { type: "p", text: "Les Tuteurs déclarent que tous les renseignements et documents qu'ils fournissent sont véridiques, authentiques, à jour et complets." },
        { type: "p", text: "Les Tuteurs ne doivent pas :" },
        {
          type: "ul",
          items: [
            "falsifier leurs qualifications;",
            "soumettre des documents scolaires modifiés;",
            "présenter faussement leur expérience professionnelle;",
            "usurper l'identité d'une autre personne;",
            "présenter faussement leur formation;",
            "prétendre faussement détenir des certifications; ou",
            "fournir des renseignements substantiellement trompeurs.",
          ],
        },
        { type: "p", text: "FutureTutor peut demander une vérification supplémentaire en tout temps." },
        {
          type: "p",
          text: "Toute documentation frauduleuse peut entraîner une suspension ou une résiliation immédiate et peut être signalée aux autorités compétentes lorsque la loi le permet.",
        },
      ],
    },
    {
      number: 10,
      heading: "Qualité des Tuteurs et normes de la Plateforme",
      blocks: [
        { type: "p", text: "Les Tuteurs acceptent de :" },
        {
          type: "ul",
          items: [
            "agir de façon professionnelle;",
            "offrir le tutorat avec diligence et compétence raisonnables;",
            "assister ponctuellement aux séances acceptées;",
            "communiquer avec respect;",
            "maintenir des limites appropriées avec les Élèves;",
            "respecter les exigences de sécurité de FutureTutor;",
            "se conformer aux lois applicables;",
            "protéger les renseignements confidentiels;",
            "éviter tout comportement discriminatoire ou abusif;",
            "maintenir une disponibilité exacte;",
            "éviter toute activité hors plateforme non autorisée visant à contourner les obligations envers la Plateforme; et",
            "se conformer aux normes supplémentaires communiquées par l'entremise de la Plateforme.",
          ],
        },
        {
          type: "p",
          text: "FutureTutor peut surveiller la qualité de la place de marché à l'aide de renseignements tels que les séances complétées, les annulations, la présence, les évaluations, les commentaires, les résultats de vérification et d'autres renseignements opérationnels légitimes.",
        },
      ],
    },
    {
      number: 11,
      heading: "Cotes et évaluations des Tuteurs",
      blocks: [
        { type: "p", text: "FutureTutor peut maintenir différents systèmes d'évaluation." },
        { type: "p", text: "Ceux-ci peuvent inclure :" },
        {
          type: "p",
          text: "Cote publique du Tuteur — Une cote établie à partir des commentaires admissibles ou des séances de tutorat complétées, potentiellement visible par les utilisateurs de la Plateforme.",
        },
        {
          type: "p",
          text: "Cote interne du Tuteur — Une cote opérationnelle privée pouvant tenir compte de facteurs pertinents tels que la vérification, les qualifications, la performance, la fiabilité, l'expérience, la qualité ou d'autres critères de la Plateforme.",
        },
        {
          type: "p",
          text: "Les cotes internes, formules, classements, mesures de confiance et algorithmes de place de marché sont la propriété exclusive de FutureTutor et n'ont pas à être divulgués publiquement, sauf lorsque la loi l'exige.",
        },
        { type: "p", text: "FutureTutor peut corriger les cotes affectées par la fraude, un abus, une erreur technique, une manipulation ou des données invalides." },
      ],
    },
    {
      number: 12,
      heading: "Demande de tutorat",
      partTitle: "Partie III — Demandes de tutorat et jumelage",
      blocks: [
        { type: "p", text: "Les Élèves, Parents ou Tuteurs admissibles peuvent demander du tutorat en fournissant des renseignements tels que :" },
        {
          type: "ul",
          items: [
            "la matière;",
            "le niveau scolaire;",
            "la date souhaitée;",
            "l'heure souhaitée;",
            "la durée;",
            "le mode en ligne ou en personne;",
            "les besoins d'apprentissage;",
            "les commentaires pertinents;",
            "les renseignements de localisation, le cas échéant; et",
            "d'autres renseignements demandés par la Plateforme.",
          ],
        },
        { type: "p", text: "La soumission d'une demande ne garantit pas la disponibilité d'un Tuteur." },
      ],
    },
    {
      number: 13,
      heading: "Jumelage rapide (Quick Match)",
      blocks: [
        { type: "p", text: "FutureTutor peut utiliser un processus de jumelage automatisé ou fondé sur des règles afin d'identifier les Tuteurs susceptibles de convenir à une demande de tutorat donnée." },
        { type: "p", text: "Les facteurs pouvant être pris en compte incluent, sans s'y limiter :" },
        {
          type: "ul",
          items: [
            "le statut d'approbation du Tuteur;",
            "la matière;",
            "le niveau scolaire;",
            "la disponibilité;",
            "le mode de tutorat;",
            "la langue;",
            "les conflits d'horaire;",
            "la zone géographique;",
            "la qualité ou la cote interne du Tuteur;",
            "les relations antérieures;",
            "les conditions de la place de marché; et",
            "d'autres facteurs de jumelage légitimes.",
          ],
        },
        {
          type: "p",
          text: "Une cote de jumelage ou un classement est propre à une demande donnée et ne constitue pas une garantie quant à la qualité, aux résultats scolaires, à la compatibilité ou au résultat du tutorat.",
        },
        { type: "p", text: "FutureTutor peut modifier sa méthodologie de jumelage au fil du temps." },
      ],
    },
    {
      number: 14,
      heading: "Invitations des Tuteurs",
      blocks: [
        { type: "p", text: "FutureTutor peut offrir des occasions de tutorat à un ou plusieurs Tuteurs admissibles." },
        { type: "p", text: "La réception d'une invitation ne garantit pas une Réservation." },
        { type: "p", text: "Un Tuteur peut accepter ou refuser une invitation, sous réserve des règles de la Plateforme." },
        { type: "p", text: "FutureTutor peut imposer un délai d'acceptation." },
        { type: "p", text: "Si un Tuteur refuse ou ne répond pas à temps, FutureTutor peut offrir la demande à un autre Tuteur." },
        {
          type: "p",
          text: "Lorsque plusieurs Tuteurs peuvent répondre, seul le Tuteur dont l'acceptation est validement confirmée par la Plateforme devient le Tuteur pour la Réservation applicable.",
        },
      ],
    },
    {
      number: 15,
      heading: "Confirmation du client",
      blocks: [
        { type: "p", text: "L'acceptation d'un Tuteur ne complète pas nécessairement la Réservation." },
        {
          type: "p",
          text: "FutureTutor peut exiger une confirmation supplémentaire de la part de l'Élève, du Parent ou du Tuteur, ainsi que l'autorisation réussie du paiement, avant qu'une Réservation ne soit confirmée.",
        },
        { type: "p", text: "Le statut de Réservation faisant autorité sur la Plateforme détermine si une séance de tutorat a été confirmée." },
      ],
    },
    {
      number: 16,
      heading: "Tarification",
      partTitle: "Partie IV — Tarification et paiements",
      blocks: [
        {
          type: "p",
          text: "Les Tuteurs ne déterminent pas de façon indépendante le prix facturé aux Élèves ou aux Parents pour les séances réservées par l'entremise de FutureTutor, à moins que FutureTutor n'introduise expressément une telle fonctionnalité.",
        },
        { type: "p", text: "FutureTutor détermine la tarification client selon son système de tarification en vigueur." },
        { type: "p", text: "Les prix peuvent tenir compte de facteurs incluant :" },
        {
          type: "ul",
          items: [
            "la matière;",
            "le niveau scolaire;",
            "la durée de la séance;",
            "le mode de tutorat;",
            "l'urgence;",
            "la disponibilité du Tuteur;",
            "l'offre et la demande;",
            "les considérations liées au lieu ou au déplacement;",
            "la date ou l'heure; et",
            "d'autres facteurs de tarification divulgués.",
          ],
        },
        { type: "p", text: "Les taxes applicables peuvent être ajoutées lorsque requis." },
        { type: "p", text: "FutureTutor affichera le prix applicable avant que l'utilisateur ne s'engage envers la Réservation payante." },
        {
          type: "p",
          text: "FutureTutor n'imposera pas intentionnellement de frais obligatoires non divulgués après avoir présenté le prix d'achat final, sous réserve des taxes ou frais imposés par le gouvernement et des ajustements licites divulgués avant l'achat.",
        },
        {
          type: "p",
          text: "Les orientations du Bureau de la concurrence du Canada qualifient de « prix conditionnels » (drip pricing) problématiques les prix annoncés inaccessibles en raison de frais obligatoires ajoutés ultérieurement.",
        },
      ],
    },
    {
      number: 17,
      heading: "Autorisation de paiement",
      blocks: [
        { type: "p", text: "Les paiements sont traités par l'entremise de services de paiement tiers, incluant actuellement Stripe." },
        {
          type: "p",
          text: "En fournissant un moyen de paiement, vous autorisez FutureTutor et son processeur de paiement à effectuer les transactions nécessaires au traitement de votre Réservation, y compris l'autorisation, la capture, le remboursement ou d'autres opérations de paiement permises.",
        },
        { type: "p", text: "Une autorisation de paiement peut survenir avant la capture définitive des fonds." },
        { type: "p", text: "Une Réservation peut demeurer conditionnelle jusqu'à ce que la Plateforme confirme l'état de paiement requis." },
        { type: "p", text: "Vous déclarez être autorisé à utiliser le moyen de paiement fourni." },
      ],
    },
    {
      number: 18,
      heading: "Processeurs de paiement",
      blocks: [
        { type: "p", text: "Les services de traitement des paiements peuvent être fournis par Stripe et sont assujettis aux ententes et politiques applicables de Stripe." },
        {
          type: "p",
          text: "FutureTutor ne stocke pas directement les numéros complets de carte de paiement lorsque les renseignements de paiement sont recueillis et tokenisés par le processeur de paiement.",
        },
        { type: "p", text: "Stripe Connect peut également être utilisé pour administrer les flux de paiement liés aux Tuteurs." },
        {
          type: "p",
          text: "Les conditions actuelles de Stripe Connect exigent que les plateformes divulguent les frais de plateforme pertinents et expliquent certaines activités et utilisations de données relatives aux comptes connectés.",
        },
        { type: "p", text: "Les Tuteurs peuvent donc être tenus d'accepter les ententes Stripe applicables pour recevoir leurs versements." },
      ],
    },
    {
      number: 19,
      heading: "Rémunération des Tuteurs",
      blocks: [
        { type: "p", text: "FutureTutor détermine la rémunération offerte aux Tuteurs pour les occasions de tutorat selon son système de versement aux Tuteurs." },
        { type: "p", text: "La rémunération des Tuteurs peut tenir compte de facteurs incluant :" },
        {
          type: "ul",
          items: [
            "la durée de la séance;",
            "la matière;",
            "le niveau scolaire;",
            "les qualifications;",
            "le palier du Tuteur;",
            "l'expérience;",
            "les renseignements internes sur la qualité;",
            "les considérations de déplacement;",
            "les incitatifs; et",
            "d'autres facteurs applicables.",
          ],
        },
        { type: "p", text: "Le montant payé par l'Élève ou le Parent et le montant payable au Tuteur sont déterminés de façon indépendante." },
        {
          type: "p",
          text: "FutureTutor peut conserver la différence entre les revenus clients et la rémunération des Tuteurs, après déduction des coûts applicables, remboursements, taxes, frais de traitement, incitatifs et autres montants légitimes de la place de marché.",
        },
        {
          type: "p",
          text: "Le Tuteur se verra montrer ou autrement fournir la rémunération applicable à une occasion de tutorat avant de l'accepter, lorsque la fonctionnalité de la Plateforme l'exige.",
        },
      ],
    },
    {
      number: 20,
      heading: "Taxes",
      blocks: [
        { type: "p", text: "Les utilisateurs sont responsables des taxes dont ils sont légalement redevables." },
        { type: "p", text: "FutureTutor peut calculer, percevoir, retenir, remettre ou déclarer des renseignements relatifs aux taxes lorsque la loi l'exige." },
        {
          type: "p",
          text: "Les Tuteurs demeurent responsables de déterminer leurs propres obligations en matière d'impôt sur le revenu, d'inscription, de déclaration et d'autres obligations fiscales, sauf pour les montants que FutureTutor est légalement tenue d'administrer.",
        },
        { type: "p", text: "Rien de ce qui est fourni par l'entremise de la Plateforme ne constitue un conseil fiscal." },
      ],
    },
    {
      number: 21,
      heading: "Politique d'annulation par le client",
      partTitle: "Partie V — Annulations et remboursements",
      blocks: [
        {
          type: "p",
          text: "Sauf indication contraire au moment de la Réservation ou exigence de la loi applicable, la politique d'annulation standard actuelle pour les Réservations payées par séance est la suivante :",
        },
        { type: "p", text: "48 heures ou plus avant la séance prévue — remboursement de 100 %." },
        { type: "p", text: "24 heures ou plus, mais moins de 48 heures avant la séance prévue — remboursement de 50 %." },
        { type: "p", text: "Moins de 24 heures avant la séance prévue — aucun remboursement." },
        { type: "p", text: "Le délai applicable est déterminé à partir de l'heure prévue de la séance et des systèmes faisant autorité de FutureTutor." },
        { type: "p", text: "FutureTutor peut afficher le montant du remboursement avant l'annulation." },
        { type: "p", text: "Rien dans la présente section ne limite un droit ou un recours de consommateur non susceptible de renonciation en vertu de la loi applicable." },
      ],
    },
    {
      number: 22,
      heading: "Annulation par le Tuteur",
      blocks: [
        { type: "p", text: "Les Tuteurs ne devraient annuler une Réservation acceptée que lorsque cela est raisonnablement nécessaire." },
        { type: "p", text: "Si un Tuteur annule, FutureTutor peut tenter de trouver un Tuteur de remplacement." },
        {
          type: "p",
          text: "Lorsque FutureTutor ne peut fournir de remplacement approprié, FutureTutor peut accorder au client un remboursement complet ou rétablir un crédit applicable, selon les circonstances de la Réservation et la loi applicable.",
        },
        { type: "p", text: "Des annulations répétées par un Tuteur peuvent affecter son admissibilité, sa fiabilité, son classement ou son accès à la Plateforme." },
      ],
    },
    {
      number: 23,
      heading: "Circonstances exceptionnelles",
      blocks: [
        { type: "p", text: "FutureTutor peut accorder des exceptions raisonnables aux règles d'annulation ou de remboursement dans des circonstances telles que :" },
        {
          type: "ul",
          items: ["les urgences;", "les défaillances techniques graves;", "les frais en double;", "la fraude;", "les incidents de sécurité;", "les erreurs de la Plateforme;", "un cas de force majeure;", "une inconduite du Tuteur; ou", "d'autres circonstances exceptionnelles."],
        },
        { type: "p", text: "FutureTutor peut demander une preuve raisonnable." },
      ],
    },
    {
      number: 24,
      heading: "Traitement des remboursements",
      blocks: [
        { type: "p", text: "Les remboursements approuvés sont généralement retournés par le même moyen de paiement, lorsque possible." },
        { type: "p", text: "Le délai de traitement peut dépendre du fournisseur de paiement ou de l'institution financière." },
        {
          type: "p",
          text: "FutureTutor n'est pas responsable des retards causés uniquement par les banques, les réseaux de cartes ou les processeurs de paiement une fois que FutureTutor a dûment amorcé un remboursement.",
        },
      ],
    },
    {
      number: 25,
      heading: "Classe virtuelle",
      partTitle: "Partie VI — Tutorat en ligne",
      blocks: [
        { type: "p", text: "FutureTutor peut offrir une classe virtuelle intégrée par l'entremise de fournisseurs technologiques tiers." },
        { type: "p", text: "La classe virtuelle peut prendre en charge des fonctionnalités telles que :" },
        { type: "ul", items: ["la vidéo;", "l'audio;", "le partage d'écran;", "l'identification des participants;", "la minuterie de séance; et", "d'autres fonctionnalités de tutorat connexes."] },
        { type: "p", text: "Les utilisateurs doivent accorder les autorisations d'appareil requises pour les fonctionnalités qu'ils choisissent d'utiliser." },
      ],
    },
    {
      number: 26,
      heading: "Services vidéo tiers",
      blocks: [
        { type: "p", text: "FutureTutor peut utiliser une infrastructure tierce, incluant actuellement Daily, pour fournir des fonctionnalités de communication en ligne." },
        {
          type: "p",
          text: "L'utilisation de ces fonctionnalités peut impliquer un traitement technique par le fournisseur applicable, conformément à la Politique de confidentialité de FutureTutor et aux conditions applicables du fournisseur.",
        },
        { type: "p", text: "FutureTutor ne garantit pas le fonctionnement ininterrompu de l'infrastructure tierce." },
      ],
    },
    {
      number: 27,
      heading: "Enregistrement",
      blocks: [
        { type: "p", text: "FutureTutor ne fournit actuellement pas d'enregistrement systématique des séances de tutorat dans le cadre de la classe virtuelle standard." },
        { type: "p", text: "Les utilisateurs ne doivent pas enregistrer secrètement un autre participant lorsque cela violerait la loi applicable ou les règles de la Plateforme." },
        { type: "p", text: "FutureTutor ne peut introduire de fonctionnalité d'enregistrement que sous réserve d'un avis, d'un consentement et d'exigences légales appropriés." },
      ],
    },
    {
      number: 28,
      heading: "Observateurs Parent ou Tuteur",
      blocks: [
        { type: "p", text: "Lorsque cela est pris en charge, un Parent ou Tuteur autorisé peut participer à une classe virtuelle à titre d'observateur." },
        { type: "p", text: "Les permissions de l'observateur peuvent être techniquement restreintes, notamment quant à la transmission audio ou vidéo." },
        { type: "p", text: "L'accès de l'observateur n'autorise pas l'interférence avec une séance de tutorat ni sa perturbation." },
      ],
    },
    {
      number: 29,
      heading: "Services en personne",
      partTitle: "Partie VII — Tutorat en personne",
      blocks: [
        { type: "p", text: "FutureTutor peut faciliter des séances de tutorat tenues à un lieu physique convenu." },
        { type: "p", text: "Les utilisateurs participant à du tutorat en personne doivent exercer une diligence raisonnable pour leur propre sécurité et celle des autres." },
      ],
    },
    {
      number: 30,
      heading: "Renseignements de localisation",
      blocks: [
        { type: "p", text: "Pour le tutorat en personne, un Élève, Parent ou Tuteur autorisé peut fournir un lieu de tutorat." },
        { type: "p", text: "FutureTutor peut recueillir :" },
        { type: "ul", items: ["l'adresse municipale;", "les renseignements d'unité;", "la ville;", "la province;", "le code postal; et", "des instructions d'arrivée facultatives."] },
        { type: "p", text: "Les renseignements de localisation exacts sont traités comme des renseignements privés." },
      ],
    },
    {
      number: 31,
      heading: "Confidentialité du lieu pendant le jumelage",
      blocks: [
        {
          type: "p",
          text: "Pendant le jumelage ouvert, FutureTutor peut ne fournir aux Tuteurs potentiels que des renseignements géographiques approximatifs nécessaires pour évaluer l'occasion.",
        },
        { type: "p", text: "Cela peut inclure :" },
        { type: "ul", items: ["la ville;", "la province;", "une zone approximative; ou", "des renseignements postaux partiels."] },
        { type: "p", text: "FutureTutor n'a pas l'intention de divulguer l'adresse complète et privée du tutorat à chaque Tuteur qui reçoit une invitation." },
      ],
    },
    {
      number: 32,
      heading: "Divulgation au Tuteur confirmé",
      blocks: [
        {
          type: "p",
          text: "Une fois qu'une Réservation est confirmée de façon faisant autorité, FutureTutor peut divulguer le lieu exact du tutorat et les instructions d'arrivée applicables au Tuteur assigné à cette Réservation.",
        },
        {
          type: "p",
          text: "En demandant du tutorat en personne, l'Élève, le Parent ou le Tuteur autorisé consent à cette divulgation aux fins de la prestation du service de tutorat.",
        },
      ],
    },
    {
      number: 33,
      heading: "Instructions d'arrivée",
      blocks: [
        { type: "p", text: "Les instructions d'arrivée visent uniquement à faciliter un accès sûr et approprié au lieu de tutorat." },
        { type: "p", text: "Les utilisateurs ne doivent pas inclure de renseignements personnels sensibles inutiles dans les instructions d'arrivée." },
        {
          type: "p",
          text: "Les Tuteurs ne doivent utiliser les instructions d'arrivée que pour la séance de tutorat applicable et ne doivent pas les divulguer, sauf lorsque la loi l'exige ou que cela est nécessaire pour la sécurité.",
        },
      ],
    },
    {
      number: 34,
      heading: "Sécurité pendant le tutorat en personne",
      blocks: [
        { type: "p", text: "Tous les utilisateurs doivent se comporter de façon sécuritaire et professionnelle." },
        { type: "p", text: "Les Tuteurs doivent maintenir des limites professionnelles appropriées, particulièrement lorsqu'ils travaillent avec des mineurs." },
        {
          type: "p",
          text: "Les Parents et Tuteurs demeurent responsables de déterminer un environnement de tutorat approprié et un niveau de supervision adéquat pour leur enfant.",
        },
        { type: "p", text: "FutureTutor peut établir des exigences de sécurité supplémentaires pour les séances en personne." },
        {
          type: "p",
          text: "Les utilisateurs doivent signaler immédiatement à FutureTutor toute préoccupation sérieuse en matière de sécurité et, au besoin, aux services d'urgence ou aux autorités compétentes.",
        },
      ],
    },
    {
      number: 35,
      heading: "Présence",
      partTitle: "Partie VIII — Présence aux séances",
      blocks: [
        { type: "p", text: "Les utilisateurs sont tenus d'assister à l'heure aux séances de tutorat confirmées." },
        { type: "p", text: "La Plateforme peut utiliser une fonctionnalité d'enregistrement de présence pour déterminer la participation." },
        {
          type: "p",
          text: "Le défaut de participer peut entraîner des conséquences d'annulation, l'absence de remboursement, des conséquences sur la fiabilité du Tuteur ou d'autres mesures de la Plateforme.",
        },
      ],
    },
    {
      number: 36,
      heading: "Absences (No-Shows)",
      blocks: [
        { type: "p", text: "FutureTutor peut établir une fenêtre d'enregistrement et un seuil d'absence." },
        { type: "p", text: "Un participant qui ne se présente pas dans le délai applicable peut être classé comme absent (« no-show »)." },
        { type: "p", text: "Une détermination d'absence peut affecter :" },
        { type: "ul", items: ["les remboursements;", "la rémunération du Tuteur;", "les mesures de fiabilité;", "la réputation du compte; et", "le règlement des différends."] },
        { type: "p", text: "FutureTutor peut corriger une détermination d'absence erronée causée par une erreur technique ou des circonstances exceptionnelles." },
      ],
    },
    {
      number: 37,
      heading: "Évaluations et commentaires",
      partTitle: "Partie IX — Évaluations, conduite et contenu",
      blocks: [
        { type: "p", text: "Les utilisateurs admissibles peuvent soumettre des évaluations ou des commentaires après une séance de tutorat admissible." },
        { type: "p", text: "Les évaluations doivent refléter des expériences véritables." },
        { type: "p", text: "Les utilisateurs ne doivent pas soumettre :" },
        {
          type: "ul",
          items: [
            "d'évaluations fabriquées;",
            "d'évaluations de représailles;",
            "de contenu discriminatoire;",
            "de menaces;",
            "de harcèlement;",
            "de renseignements confidentiels;",
            "de contenu diffamatoire contraire à la loi applicable;",
            "de pourriel; ou",
            "de commentaires manipulés.",
          ],
        },
        { type: "p", text: "FutureTutor peut retirer, restreindre ou enquêter sur tout contenu qui viole les présentes Conditions ou la loi applicable." },
      ],
    },
    {
      number: 38,
      heading: "Contenu de l'utilisateur",
      blocks: [
        {
          type: "p",
          text: "Les utilisateurs peuvent fournir des renseignements, commentaires, renseignements de profil, documents, demandes de tutorat, commentaires ou autre contenu (le « Contenu de l'utilisateur »).",
        },
        { type: "p", text: "Vous conservez la propriété de votre Contenu de l'utilisateur dans la mesure où vous en détenez les droits de propriété." },
        {
          type: "p",
          text: "Vous accordez à FutureTutor une licence non exclusive, mondiale et sans redevance pour héberger, stocker, reproduire, traiter, afficher, transmettre et autrement utiliser le Contenu de l'utilisateur dans la mesure raisonnablement nécessaire pour :",
        },
        { type: "ul", items: ["exploiter la Plateforme;", "fournir les services de tutorat;", "faciliter les Réservations;", "fournir un soutien;", "prévenir la fraude;", "maintenir la sécurité;", "faire respecter les présentes Conditions; et", "se conformer à la loi."] },
        { type: "p", text: "Cette licence n'autorise pas FutureTutor à vendre vos renseignements personnels privés à titre de produit commercial indépendant." },
        { type: "p", text: "Les renseignements personnels demeurent assujettis à la Politique de confidentialité et à la loi applicable en matière de protection de la vie privée." },
      ],
    },
    {
      number: 39,
      heading: "Conduite interdite",
      blocks: [
        { type: "p", text: "Les utilisateurs ne doivent pas :" },
        {
          type: "ul",
          items: [
            "commettre de fraude;",
            "usurper l'identité d'une autre personne;",
            "harceler, menacer, exploiter ou maltraiter un autre utilisateur;",
            "harceler sexuellement ou se comporter de façon inappropriée envers un Élève;",
            "exploiter un mineur;",
            "faire preuve de discrimination illicite;",
            "contourner les obligations de paiement;",
            "manipuler les évaluations ou le jumelage;",
            "soumettre des titres scolaires frauduleux;",
            "nuire à la sécurité de la Plateforme;",
            "accéder au compte d'une autre personne sans autorisation;",
            "extraire ou récolter systématiquement des données de la Plateforme sans autorisation;",
            "rétroconcevoir des parties protégées de la Plateforme, sauf lorsque la loi le permet;",
            "téléverser du code malveillant;",
            "tenter d'obtenir un accès non autorisé;",
            "utiliser les données de la Plateforme à des fins de marketing non autorisées;",
            "faire mauvais usage des adresses privées ou des instructions d'arrivée;",
            "divulguer les renseignements privés d'un autre utilisateur sans autorisation;",
            "utiliser la Plateforme à des fins illégales; ou",
            "encourager une autre personne à commettre l'un des actes ci-dessus.",
          ],
        },
      ],
    },
    {
      number: 40,
      heading: "Contournement hors plateforme",
      blocks: [
        {
          type: "p",
          text: "Les utilisateurs ne doivent pas utiliser la Plateforme principalement pour identifier un autre utilisateur, puis délibérément contourner le processus de Réservation ou de paiement applicable de FutureTutor dans le but d'éviter les obligations ou frais envers la Plateforme.",
        },
        { type: "p", text: "FutureTutor peut prendre des mesures raisonnables contre un contournement délibéré." },
        {
          type: "p",
          text: "La présente section n'interdit pas les relations licites établies en dehors de FutureTutor de façon indépendante et sans lien avec l'utilisation de la Plateforme.",
        },
      ],
    },
    {
      number: 41,
      heading: "Propriété de FutureTutor",
      partTitle: "Partie X — Propriété intellectuelle",
      blocks: [
        {
          type: "p",
          text: "La Plateforme et ses logiciels, conception, image de marque, marques de commerce, logos, bases de données, algorithmes, systèmes de jumelage, méthodologies de cotation, interfaces, textes, graphiques et autres éléments de propriété associés appartiennent à FutureTutor ou lui sont concédés sous licence, et sont protégés par les lois applicables en matière de propriété intellectuelle.",
        },
        { type: "p", text: "À l'exception du droit limité d'utiliser la Plateforme en vertu des présentes Conditions, aucun droit ne vous est transféré." },
      ],
    },
    {
      number: 42,
      heading: "Licence limitée",
      blocks: [
        {
          type: "p",
          text: "FutureTutor vous accorde une licence limitée, révocable, non exclusive et non transférable pour accéder à la Plateforme et l'utiliser aux fins prévues, tant que votre compte demeure autorisé.",
        },
        { type: "p", text: "Vous ne pouvez pas reproduire, revendre, sous-licencier ou exploiter la Plateforme à des fins commerciales sans l'autorisation écrite de FutureTutor." },
      ],
    },
    {
      number: 43,
      heading: "Confidentialité",
      partTitle: "Partie XI — Confidentialité",
      blocks: [
        {
          type: "p",
          text: "La collecte, l'utilisation, la divulgation, la conservation et la protection des renseignements personnels par FutureTutor sont régies par sa Politique de confidentialité et par la législation applicable en matière de protection de la vie privée.",
        },
        {
          type: "p",
          text: "Les orientations canadiennes en matière de protection de la vie privée soulignent qu'un consentement significatif exige que les utilisateurs comprennent quels renseignements sont recueillis, avec qui ils sont partagés, pourquoi ils sont utilisés et quelles sont les conséquences importantes de ce traitement.",
        },
        {
          type: "p",
          text: "La loi albertaine intitulée Personal Information Protection Act encadre la collecte, l'utilisation et la divulgation de renseignements personnels par les organisations du secteur privé en Alberta.",
        },
        { type: "p", text: "La Politique de confidentialité doit être lue conjointement avec les présentes Conditions." },
      ],
    },
    {
      number: 44,
      heading: "Communications de service",
      partTitle: "Partie XII — Communications",
      blocks: [
        {
          type: "p",
          text: "FutureTutor peut envoyer des communications transactionnelles ou liées au service nécessaires à l'exploitation de la Plateforme, notamment concernant :",
        },
        { type: "ul", items: ["la sécurité du compte;", "la récupération du mot de passe;", "les Réservations;", "les demandes de tutorat;", "les paiements;", "les annulations;", "l'administration du compte;", "la sécurité;", "les modifications de politiques; et", "le soutien."] },
        {
          type: "p",
          text: "Lorsque requis, les communications de marketing seront traitées séparément des communications de service essentielles et assujetties au consentement applicable et aux exigences de désabonnement.",
        },
      ],
    },
    {
      number: 45,
      heading: "Suspension",
      partTitle: "Partie XIII — Suspension et résiliation",
      blocks: [
        { type: "p", text: "FutureTutor peut restreindre ou suspendre temporairement un compte lorsque cela est raisonnablement nécessaire pour :" },
        {
          type: "ul",
          items: [
            "enquêter sur une fraude soupçonnée;",
            "protéger un mineur;",
            "répondre à des préoccupations de sécurité;",
            "enquêter sur une inconduite;",
            "prévenir un accès non autorisé;",
            "faire respecter les présentes Conditions;",
            "se conformer à la loi;",
            "protéger les utilisateurs; ou",
            "protéger l'intégrité de la Plateforme.",
          ],
        },
        { type: "p", text: "Lorsque cela est approprié, FutureTutor peut fournir un avis ou une occasion de répondre." },
      ],
    },
    {
      number: 46,
      heading: "Résiliation par FutureTutor",
      blocks: [
        {
          type: "p",
          text: "FutureTutor peut résilier un compte en cas de violation importante ou répétée des présentes Conditions, de fraude, de violations graves de sécurité, de conduite illicite, d'exploitation de mineurs, de titres de Tuteur falsifiés, d'abus de paiement ou d'autre mauvais usage grave.",
        },
        { type: "p", text: "La résiliation n'élimine pas les obligations nées avant la résiliation." },
      ],
    },
    {
      number: 47,
      heading: "Résiliation par l'utilisateur",
      blocks: [
        { type: "p", text: "Les utilisateurs peuvent cesser d'utiliser FutureTutor en tout temps." },
        { type: "p", text: "La suppression ou la désactivation du compte peut être assujettie aux procédures communiquées par FutureTutor." },
        { type: "p", text: "FutureTutor peut conserver des renseignements lorsque cela est raisonnablement nécessaire ou légalement requis à des fins telles que :" },
        { type: "ul", items: ["les dossiers financiers;", "les obligations fiscales;", "la prévention de la fraude;", "le règlement des différends;", "les enquêtes de sécurité;", "l'application des présentes Conditions;", "les réclamations juridiques; et", "la conformité réglementaire."] },
        { type: "p", text: "De plus amples renseignements devraient être fournis dans la Politique de confidentialité." },
      ],
    },
    {
      number: 48,
      heading: "Différends entre utilisateurs",
      partTitle: "Partie XIV — Différends entre utilisateurs de la Plateforme",
      blocks: [
        {
          type: "p",
          text: "Les utilisateurs devraient signaler les différends relatifs aux séances de tutorat, aux paiements, à la présence, à la conduite ou à la sécurité par l'entremise des canaux de soutien de FutureTutor.",
        },
        { type: "p", text: "FutureTutor peut examiner les dossiers pertinents de la Plateforme et prendre des mesures raisonnables." },
        { type: "p", text: "La détermination de la place de marché de FutureTutor n'empêche pas un utilisateur d'exercer des droits ou recours auxquels il ne peut légalement renoncer." },
      ],
    },
    {
      number: 49,
      heading: "Résultats scolaires",
      partTitle: "Partie XV — Avis de non-responsabilité",
      blocks: [
        { type: "p", text: "Le tutorat peut favoriser l'apprentissage, mais ne garantit aucun résultat scolaire particulier." },
        { type: "p", text: "FutureTutor ne garantit pas :" },
        { type: "ul", items: ["les notes;", "les résultats d'examen;", "l'admission dans un établissement scolaire ou universitaire;", "les bourses d'études;", "l'avancement scolaire;", "l'emploi;", "la certification; ou", "tout résultat d'apprentissage particulier."] },
        {
          type: "p",
          text: "Les évaluations des Tuteurs, les cotes internes, la vérification et le jumelage sont des outils destinés à soutenir la qualité de la place de marché et ne constituent pas des garanties de performance future.",
        },
      ],
    },
    {
      number: 50,
      heading: "Disponibilité de la Plateforme",
      blocks: [
        {
          type: "p",
          text: "FutureTutor vise à offrir un accès fiable à la Plateforme, mais ne peut garantir que la Plateforme sera toujours ininterrompue, sécurisée ou exempte d'erreurs.",
        },
        { type: "p", text: "Le service peut être affecté par :" },
        {
          type: "ul",
          items: ["l'entretien;", "les pannes Internet;", "les services tiers;", "les réseaux de paiement;", "l'infrastructure vidéo;", "la compatibilité des appareils;", "les urgences; ou", "des événements hors du contrôle raisonnable de FutureTutor."],
        },
      ],
    },
    {
      number: 51,
      heading: "Services tiers",
      blocks: [
        {
          type: "p",
          text: "La Plateforme s'appuie sur des fournisseurs tiers pouvant inclure des processeurs de paiement, une infrastructure vidéo, des fournisseurs d'hébergement, des fournisseurs de courriel et d'autres services technologiques.",
        },
        {
          type: "p",
          text: "FutureTutor n'est pas responsable des défaillances de tiers dans la mesure où la défaillance échappe au contrôle raisonnable de FutureTutor, sous réserve toujours des droits et obligations qui ne peuvent être exclus en vertu de la loi applicable.",
        },
      ],
    },
    {
      number: 52,
      heading: "Limitation de responsabilité",
      partTitle: "Partie XVI — Limitation de responsabilité",
      blocks: [
        {
          type: "p",
          text: "DANS TOUTE LA MESURE PERMISE PAR LA LOI APPLICABLE, FUTURETUTOR AINSI QUE SES ADMINISTRATEURS, DIRIGEANTS, EMPLOYÉS, ENTREPRENEURS, SOCIÉTÉS AFFILIÉES ET MANDATAIRES NE SERONT PAS RESPONSABLES DES DOMMAGES INDIRECTS, ACCESSOIRES, PARTICULIERS, CONSÉCUTIFS, EXEMPLAIRES OU PUNITIFS DÉCOULANT DE L'UTILISATION DE LA PLATEFORME.",
        },
        {
          type: "p",
          text: "Sous réserve de la loi applicable, la responsabilité globale de FutureTutor découlant d'une réclamation relative à la Plateforme, ou s'y rapportant, ne dépassera pas le plus élevé des montants suivants :",
        },
        {
          type: "ul",
          items: [
            "(a) les montants payés par le réclamant à FutureTutor au cours des six (6) mois précédant l'événement à l'origine de la réclamation; ou",
            "(b) 100 $ CA.",
          ],
        },
        {
          type: "p",
          text: "Cependant, rien dans les présentes Conditions n'exclut ni ne limite la responsabilité qui ne peut légalement être exclue ou limitée, y compris la responsabilité résultant de la fraude, d'une faute intentionnelle ou de toute autre responsabilité que la loi applicable rend non susceptible d'exclusion.",
        },
        {
          type: "p",
          text: "EXAMEN JURIDIQUE REQUIS : Étant donné la participation de mineurs et l'offre de services en personne, un conseiller juridique canadien devrait examiner spécifiquement ce plafond de responsabilité et toutes les exclusions avant leur publication.",
        },
      ],
    },
    {
      number: 53,
      heading: "Indemnisation",
      partTitle: "Partie XVII — Indemnisation",
      blocks: [
        {
          type: "p",
          text: "Dans la mesure permise par la loi, vous acceptez d'indemniser FutureTutor ainsi que ses administrateurs, dirigeants, employés et mandataires, et de les tenir indemnes des réclamations de tiers, pertes, responsabilités, dommages et coûts raisonnables découlant :",
        },
        {
          type: "ul",
          items: [
            "de votre violation importante des présentes Conditions;",
            "de votre conduite illicite;",
            "de renseignements frauduleux que vous avez fournis;",
            "d'une atteinte aux droits d'une autre personne;",
            "d'un mauvais usage des renseignements personnels d'une autre personne;",
            "de votre Contenu de l'utilisateur; ou",
            "si vous êtes un Tuteur, de votre inconduite intentionnelle ou illicite dans la prestation de services de tutorat.",
          ],
        },
        {
          type: "p",
          text: "Cette indemnisation n'exige pas d'un consommateur qu'il indemnise FutureTutor pour la propre négligence de FutureTutor, sa violation de la loi, ou une conduite pour laquelle une indemnisation ne peut légalement être exigée.",
        },
      ],
    },
    {
      number: 54,
      heading: "Loi applicable",
      partTitle: "Partie XVIII — Loi applicable",
      blocks: [
        {
          type: "p",
          text: "Sauf disposition contraire de lois d'ordre public, les présentes Conditions sont régies par les lois de la province de l'Alberta et les lois fédérales du Canada qui y sont applicables, sans égard aux principes de conflits de lois.",
        },
        {
          type: "p",
          text: "Si vous êtes un consommateur résidant au Québec ou dans une autre juridiction canadienne dont les lois d'ordre public s'appliquent à votre relation avec FutureTutor, rien dans les présentes Conditions n'a pour objet de vous priver d'une protection, d'un recours, d'un droit juridictionnel ou d'un droit de consommateur auquel vous ne pouvez renoncer en vertu de ces lois.",
        },
      ],
    },
    {
      number: 55,
      heading: "Règlement des différends et tribunaux",
      blocks: [
        {
          type: "p",
          text: "Avant d'entamer une procédure formelle, les utilisateurs et FutureTutor devraient tenter de bonne foi de régler les différends par l'entremise du processus de soutien de FutureTutor, lorsque cela est approprié.",
        },
        {
          type: "p",
          text: "Sous réserve de tout droit de consommateur d'ordre public ou de règle de compétence, les différends découlant des présentes Conditions ou de la Plateforme seront soumis aux tribunaux compétents de l'Alberta, au Canada.",
        },
        { type: "p", text: "La présente version n'impose délibérément aucun arbitrage obligatoire ni aucune renonciation aux recours collectifs." },
        {
          type: "p",
          text: "Ces dispositions peuvent affecter de façon importante les droits des consommateurs et ne devraient pas être introduites sans avis juridique canadien spécifique.",
        },
      ],
    },
    {
      number: 56,
      heading: "Modifications des présentes Conditions",
      partTitle: "Partie XIX — Dispositions générales",
      blocks: [
        { type: "p", text: "FutureTutor peut mettre à jour les présentes Conditions afin de refléter :" },
        { type: "ul", items: ["des changements à la Plateforme;", "de nouvelles fonctionnalités;", "des exigences légales;", "des exigences de sécurité;", "des changements de la place de marché; ou", "des besoins opérationnels."] },
        { type: "p", text: "Lorsque les modifications sont importantes, FutureTutor fournira un avis raisonnable, conformément à la loi applicable." },
        { type: "p", text: "Lorsque la loi l'exige, FutureTutor obtiendra un nouveau consentement." },
        { type: "p", text: "La date d'entrée en vigueur des Conditions actuelles sera affichée au début du présent document." },
      ],
    },
    {
      number: 57,
      heading: "Cession",
      blocks: [
        { type: "p", text: "Vous ne pouvez céder vos droits ou obligations en vertu des présentes Conditions sans le consentement de FutureTutor." },
        {
          type: "p",
          text: "FutureTutor peut céder les présentes Conditions dans le cadre d'une fusion, d'une acquisition, d'une réorganisation d'entreprise, d'un financement ou de la vente de la totalité ou de la quasi-totalité des actifs commerciaux pertinents, sous réserve de la loi applicable.",
        },
      ],
    },
    {
      number: 58,
      heading: "Divisibilité",
      blocks: [
        {
          type: "p",
          text: "Si une disposition est jugée invalide ou inapplicable, cette disposition sera interprétée ou limitée dans la mesure minimale nécessaire, et les autres dispositions demeureront en vigueur.",
        },
      ],
    },
    {
      number: 59,
      heading: "Renonciation",
      blocks: [{ type: "p", text: "Le défaut de FutureTutor de faire respecter une disposition ne constitue pas une renonciation à cette disposition ni à toute autre disposition." }],
    },
    {
      number: 60,
      heading: "Entente complète",
      blocks: [
        {
          type: "p",
          text: "Les présentes Conditions, ainsi que la Politique de confidentialité, les conditions de Réservation applicables, les conditions propres aux Tuteurs le cas échéant, et toute autre condition expressément incorporée par renvoi, constituent l'entente entre vous et FutureTutor relativement à la Plateforme.",
        },
        {
          type: "p",
          text: "En cas de conflit, des conditions plus précises applicables à un service ou à une transaction en particulier peuvent prévaloir sur les présentes Conditions générales, dans la mesure de ce conflit.",
        },
      ],
    },
    {
      number: 61,
      heading: "Langue",
      blocks: [
        { type: "p", text: "FutureTutor met les présentes Conditions à disposition en français et en anglais." },
        {
          type: "p",
          text: "Pour les utilisateurs auxquels s'applique la Charte de la langue française du Québec ou d'autres exigences linguistiques applicables, la version française des présentes Conditions et des clauses types applicables sera rendue accessible avant que l'utilisateur ne soit invité à exprimer sa volonté d'être lié par une version dans une autre langue.",
        },
        {
          type: "p",
          text: "Lorsque la loi le permet, après avoir eu l'occasion d'examiner la version française, un utilisateur peut expressément choisir de conclure l'entente en anglais.",
        },
        {
          type: "p",
          text: "FutureTutor entend que les versions anglaise et française soient substantiellement équivalentes. Rien dans la présente section ne limite les droits auxquels il ne peut être renoncé en vertu de la loi applicable en matière de langue ou de protection du consommateur.",
        },
      ],
    },
    {
      number: 62,
      heading: "Entente électronique",
      blocks: [
        { type: "p", text: "Vous acceptez que les présentes Conditions puissent être acceptées par voie électronique." },
        {
          type: "p",
          text: "L'acceptation électronique, notamment par une case à cocher, un bouton, l'inscription à un compte, la confirmation d'une Réservation ou tout autre processus électronique, peut constituer votre acceptation des présentes Conditions dans la mesure permise par la loi.",
        },
        { type: "p", text: "FutureTutor peut conserver des dossiers électroniques de cette acceptation." },
      ],
    },
    {
      number: 63,
      heading: "Force majeure",
      blocks: [
        {
          type: "p",
          text: "FutureTutor ne sera pas responsable d'un retard ou d'un manquement causé par des circonstances hors de son contrôle raisonnable, notamment les catastrophes naturelles, les intempéries graves, une mesure gouvernementale, une défaillance généralisée des télécommunications, un conflit de travail, une guerre, des troubles civils, une épidémie ou une défaillance majeure de l'infrastructure d'un tiers, sauf disposition contraire de la loi applicable.",
        },
      ],
    },
    {
      number: 64,
      heading: "Coordonnées de FutureTutor",
      partTitle: "Partie XX — Coordonnées",
      blocks: [
        { type: "p", text: "Toute question relative aux présentes Conditions peut être adressée à :" },
        { type: "p", text: "FutureTutor — exploité et détenu par FYRA SERVICES INC., constituée sous le régime fédéral au Canada." },
        { type: "p", text: "FYRA SERVICES INC.\n8830 62e Ave NW\nEdmonton, AB T6E 0C8\nCanada" },
        { type: "p", text: "Affaires juridiques : legal@futuretutor.ca" },
        { type: "p", text: "Demandes relatives à la confidentialité : legal@futuretutor.ca" },
        { type: "p", text: "Site Web : futuretutor.ca" },
        { type: "p", text: "Province : Alberta" },
        { type: "p", text: "Pays : Canada" },
      ],
    },
    {
      number: 65,
      heading: "Reconnaissance",
      partTitle: "Partie XXI — Reconnaissance",
      blocks: [
        {
          type: "p",
          text: "EN CRÉANT UN COMPTE OU EN ACCEPTANT AUTREMENT LES PRÉSENTES CONDITIONS PAR L'ENTREMISE DE LA PLATEFORME, VOUS RECONNAISSEZ AVOIR LU ET COMPRIS LES PRÉSENTES CONDITIONS ET ACCEPTEZ D'Y ÊTRE LIÉ.",
        },
        {
          type: "p",
          text: "SI VOUS ACCEPTEZ LES PRÉSENTES CONDITIONS AU NOM D'UN MINEUR OU D'UNE ORGANISATION, VOUS DÉCLAREZ DÉTENIR L'AUTORITÉ NÉCESSAIRE POUR CE FAIRE.",
        },
      ],
    },
  ],
};
