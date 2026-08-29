import type { LegalDocumentContent } from "./types";

/** FG-LEGAL2 — traduction française complète et substantiellement
 * équivalente de l'Entente de prestataire de services indépendant pour les
 * tuteurs approuvée. Correspond section par section à
 * tutorAgreementContent.en.ts — voir ce fichier pour la note sur la portée
 * et l'examen juridique canadien final. Les sections 157 à 162 rendent les
 * six Annexes lettrées (A-F) du document source en utilisant la même forme
 * de section numérotée, chacune portant son propre partTitle. */

export const tutorAgreementContentFr: LegalDocumentContent = {
  effectiveDate: "30 août 2026",
  lastUpdated: "30 août 2026",
  sections: [
    {
      number: 1,
      heading: "Objet",
      partTitle: "Partie I — Objet et relation",
      blocks: [
        {
          type: "p",
          text: "La présente Entente de prestataire de services indépendant pour les tuteurs (l'« Entente ») est conclue entre FYRA SERVICES INC., une société constituée sous le régime des lois fédérales du Canada, qui exploite la place de marché de tutorat connue sous le nom de FutureTutor, dont l'adresse postale est le 8830 62e Ave NW, Edmonton, Alberta T6E 0C8, Canada (« FutureTutor », « la Société », « nous », « notre » ou « nos »), et la personne physique ou morale qui présente une candidature pour un compte Tuteur sur FutureTutor, qui maintient un tel compte ou qui l'utilise, et qui accepte la présente Entente (« Tuteur », « vous » ou « votre »).",
        },
        {
          type: "p",
          text: "FutureTutor et le Tuteur peuvent être désignés individuellement comme une « Partie » et collectivement comme les « Parties ».",
        },
        { type: "p", text: "La présente Entente régit la prestation de services de tutorat par le Tuteur par l'entremise de la Plateforme FutureTutor." },
        { type: "p", text: "Elle doit être lue conjointement avec les documents suivants de FutureTutor :" },
        {
          type: "ul",
          items: [
            "les Conditions d'utilisation;",
            "la Politique de confidentialité;",
            "la Politique sur les témoins;",
            "les politiques applicables aux Tuteurs, les normes de sécurité et les règles de la Plateforme;",
            "les ententes Stripe applicables lorsque des services de paiement ou de versement sont utilisés.",
          ],
        },
        {
          type: "p",
          text: "FutureTutor exploite une place de marché de tutorat gérée par l'entremise de laquelle des Élèves, des Parents et des tuteurs légaux peuvent demander des services de tutorat et des Tuteurs admissibles peuvent recevoir, accepter et exécuter des occasions de tutorat.",
        },
        { type: "p", text: "Le tutorat peut être fourni :" },
        {
          type: "ul",
          items: ["en ligne, au moyen de la Classe virtuelle de FutureTutor ou d'une autre méthode approuvée; ou", "en personne, à un lieu de tutorat autorisé."],
        },
        { type: "p", text: "La présente Entente établit les conditions contractuelles selon lesquelles un Tuteur peut fournir des services de tutorat par l'entremise de FutureTutor." },
      ],
    },
    {
      number: 2,
      heading: "Relation de prestataire de services indépendant",
      blocks: [
        {
          type: "p",
          text: "Sous réserve de la loi applicable, les Parties entendent que le Tuteur fournisse des services de tutorat à titre de prestataire de services indépendant et d'entrepreneur indépendant, et non à titre d'employé de FutureTutor.",
        },
        { type: "p", text: "Rien dans la présente Entente ne vise à créer :" },
        {
          type: "ul",
          items: [
            "une relation d'employeur à employé;",
            "une société de personnes;",
            "une coentreprise;",
            "une relation fiduciaire;",
            "une relation de mandat, sauf pour l'autorité limitée expressément accordée;",
            "une franchise;",
            "ni toute autre relation incompatible avec la relation d'entrepreneur indépendant.",
          ],
        },
        {
          type: "p",
          text: "Les Parties reconnaissent toutefois que le statut juridique dépend de la loi applicable et des circonstances réelles de la relation, et qu'il ne peut être déterminé uniquement par la terminologie contractuelle.",
        },
        {
          type: "p",
          text: "Rien dans la présente Entente ne vise à écarter une protection légale à laquelle il ne peut être renoncé en matière d'emploi, de travail, de fiscalité, d'indemnisation des accidents du travail, de santé et sécurité au travail, de droits de la personne ou autre, qui s'applique de plein droit.",
        },
      ],
    },
    {
      number: 3,
      heading: "Aucun pouvoir de lier FutureTutor",
      blocks: [
        { type: "p", text: "Le Tuteur n'a aucun pouvoir pour :" },
        {
          type: "ul",
          items: [
            "conclure des contrats au nom de FutureTutor;",
            "engager des obligations au nom de FutureTutor;",
            "faire des déclarations qui lient juridiquement FutureTutor;",
            "négocier les contrats de FutureTutor;",
            "consentir du crédit au nom de FutureTutor;",
            "donner des garanties au nom de FutureTutor;",
            "se présenter comme un employé, un dirigeant, un administrateur ou un mandataire autorisé de FutureTutor.",
          ],
        },
        { type: "p", text: "Le Tuteur ne doit pas déclarer ni laisser entendre le contraire." },
      ],
    },
    {
      number: 4,
      heading: "Aucun nombre d'heures minimal",
      partTitle: "Partie II — Indépendance du Tuteur",
      blocks: [
        { type: "p", text: "FutureTutor ne garantit au Tuteur aucun nombre minimal :" },
        {
          type: "ul",
          items: ["d'heures;", "d'occasions de tutorat;", "d'Élèves;", "de Réservations;", "de mandats;", "de gains;", "ni de revenus."],
        },
        {
          type: "p",
          text: "Le Tuteur n'est pas tenu de maintenir un nombre minimal d'heures de travail, à moins qu'un programme écrit distinct ne le prévoie expressément.",
        },
      ],
    },
    {
      number: 5,
      heading: "Disponibilité du Tuteur",
      blocks: [
        {
          type: "p",
          text: "Le Tuteur peut déterminer les périodes pendant lesquelles il souhaite se rendre disponible par l'entremise de la Plateforme, sous réserve des fonctionnalités de la Plateforme.",
        },
        { type: "p", text: "Le Tuteur est responsable de maintenir sa disponibilité raisonnablement exacte." },
        {
          type: "p",
          text: "Une fois que le Tuteur accepte volontairement une occasion de tutorat, il est attendu qu'il honore l'engagement qui en découle conformément à la présente Entente et aux règles d'annulation applicables.",
        },
      ],
    },
    {
      number: 6,
      heading: "Droit d'accepter ou de refuser des occasions",
      blocks: [
        {
          type: "p",
          text: "Sauf exigence contraire d'un programme accepté séparément, le Tuteur peut accepter ou refuser les occasions de tutorat offertes par l'entremise de FutureTutor.",
        },
        {
          type: "p",
          text: "Le refus d'une occasion individuelle ne crée pas en soi une obligation d'emploi et ne constitue pas une inconduite.",
        },
        {
          type: "p",
          text: "FutureTutor peut néanmoins utiliser des renseignements opérationnels légitimes, y compris la disponibilité et le rendement à l'égard des Réservations acceptées, dans l'exploitation de son système de jumelage.",
        },
      ],
    },
    {
      number: 7,
      heading: "Absence d'exclusivité",
      blocks: [
        { type: "p", text: "Le Tuteur n'est pas tenu de fournir des services de tutorat exclusivement par l'entremise de FutureTutor." },
        {
          type: "p",
          text: "Sous réserve des obligations de confidentialité, de protection de la vie privée, de propriété intellectuelle, de non-contournement et des autres obligations prévues à la présente Entente, le Tuteur peut :",
        },
        {
          type: "ul",
          items: ["offrir du tutorat de façon indépendante;", "exploiter une autre entreprise;", "travailler pour une autre société;", "utiliser d'autres plateformes de tutorat;", "fournir des services à d'autres clients."],
        },
        { type: "p", text: "Rien dans la présente Entente ne crée d'obligation générale de non-concurrence." },
      ],
    },
    {
      number: 8,
      heading: "Contrôle des méthodes de tutorat",
      blocks: [
        { type: "p", text: "Sous réserve :" },
        {
          type: "ul",
          items: [
            "des besoins de l'Élève;",
            "des objectifs d'apprentissage convenus;",
            "des exigences applicables du programme d'études;",
            "des exigences de sécurité;",
            "des règles de la Plateforme;",
            "des normes professionnelles;",
            "des lois;",
            "et des obligations prévues à la présente Entente,",
          ],
        },
        { type: "p", text: "le Tuteur détermine généralement les méthodes professionnelles employées pour offrir les services de tutorat." },
        {
          type: "p",
          text: "FutureTutor peut établir des normes raisonnables de qualité, de sécurité, de conduite, de protection de la vie privée et de Plateforme sans pour autant vouloir contrôler chaque décision pédagogique du Tuteur.",
        },
      ],
    },
    {
      number: 9,
      heading: "Admissibilité de base",
      partTitle: "Partie III — Admissibilité du Tuteur",
      blocks: [
        { type: "p", text: "Pour offrir du tutorat par l'entremise de FutureTutor, le Tuteur doit :" },
        {
          type: "ul",
          items: [
            "satisfaire aux exigences légales applicables en matière d'âge;",
            "avoir la capacité juridique de conclure la présente Entente;",
            "être légalement autorisé à fournir les services pertinents dans le territoire où le tutorat est offert;",
            "fournir des renseignements exacts;",
            "compléter avec succès le processus de validation applicable de FutureTutor;",
            "maintenir un compte Tuteur admissible;",
            "respecter la présente Entente et les politiques applicables de la Plateforme.",
          ],
        },
        {
          type: "p",
          text: "FutureTutor peut établir des exigences d'admissibilité supplémentaires raisonnables pour certaines matières, certaines clientèles d'Élèves, certains modes de tutorat ou certains programmes.",
        },
      ],
    },
    {
      number: 10,
      heading: "Exactitude des renseignements",
      blocks: [
        { type: "p", text: "Le Tuteur déclare que les renseignements fournis à FutureTutor sont véridiques, exacts, complets et non trompeurs." },
        { type: "p", text: "Le Tuteur doit mettre à jour rapidement tout changement important." },
        { type: "p", text: "Le Tuteur ne doit pas :" },
        {
          type: "ul",
          items: [
            "falsifier ses qualifications;",
            "falsifier sa formation;",
            "falsifier son expérience;",
            "soumettre des relevés de notes modifiés;",
            "soumettre des attestations frauduleuses;",
            "usurper l'identité d'une autre personne;",
            "présenter faussement ses titres professionnels;",
            "dissimuler des restrictions importantes qui touchent son admissibilité.",
          ],
        },
        { type: "p", text: "Une fausse déclaration importante peut entraîner une suspension ou une résiliation immédiate." },
      ],
    },
    {
      number: 11,
      heading: "Processus de validation",
      partTitle: "Partie IV — Validation du Tuteur",
      blocks: [
        {
          type: "p",
          text: "FutureTutor peut exiger que les Tuteurs complètent un processus de validation avant de devenir admissibles à recevoir des occasions de tutorat.",
        },
        { type: "p", text: "Ce processus peut comprendre :" },
        {
          type: "ul",
          items: [
            "la complétion du profil;",
            "des renseignements d'identité;",
            "des renseignements sur la formation;",
            "des documents scolaires;",
            "des qualifications;",
            "des attestations;",
            "des entrevues;",
            "de la formation;",
            "des examens;",
            "des évaluations par matière;",
            "la vérification de documents;",
            "un examen administratif;",
            "d'autres vérifications raisonnables de qualité ou de sécurité.",
          ],
        },
        { type: "p", text: "Une candidature retenue ne crée pas de relation d'emploi." },
      ],
    },
    {
      number: 12,
      heading: "Documents de formation",
      blocks: [
        { type: "p", text: "FutureTutor peut demander des documents, notamment :" },
        {
          type: "ul",
          items: ["des diplômes;", "des grades universitaires;", "des relevés de notes;", "des attestations;", "des permis, le cas échéant;", "des dossiers scolaires;", "des qualifications professionnelles."],
        },
        {
          type: "p",
          text: "Le Tuteur autorise FutureTutor à examiner et, lorsque cela est raisonnablement nécessaire et légalement permis, à vérifier les renseignements soumis.",
        },
      ],
    },
    {
      number: 13,
      heading: "Entrevue",
      blocks: [
        { type: "p", text: "FutureTutor peut exiger que le Tuteur participe à une entrevue." },
        { type: "p", text: "Les critères d'évaluation peuvent comprendre :" },
        {
          type: "ul",
          items: [
            "la communication;",
            "la pédagogie;",
            "le professionnalisme;",
            "l'aisance dans la matière;",
            "l'interaction avec l'Élève;",
            "la motivation;",
            "la concordance avec les normes de sécurité et de service de FutureTutor.",
          ],
        },
        {
          type: "p",
          text: "L'entrevue fait partie du processus d'admissibilité et de contrôle de la qualité de la place de marché de FutureTutor et ne constitue pas une entrevue d'embauche, à moins que la loi applicable n'en décide autrement.",
        },
      ],
    },
    {
      number: 14,
      heading: "Formation",
      blocks: [
        { type: "p", text: "FutureTutor peut exiger que les Tuteurs complètent une formation d'intégration ou une formation sur la Plateforme portant notamment sur :" },
        {
          type: "ul",
          items: [
            "l'utilisation de la Plateforme;",
            "la sécurité;",
            "la protection de la vie privée;",
            "les attentes en matière de tutorat;",
            "la protection des mineurs;",
            "le fonctionnement de la Classe virtuelle;",
            "le tutorat en personne;",
            "la conduite professionnelle.",
          ],
        },
        {
          type: "p",
          text: "La formation obligatoire sur la Plateforme vise à établir des normes de place de marché sûres et cohérentes et ne confère pas au Tuteur le statut d'employé.",
        },
      ],
    },
    {
      number: 15,
      heading: "Examens et évaluations",
      blocks: [
        { type: "p", text: "FutureTutor peut exiger :" },
        {
          type: "ul",
          items: ["des évaluations générales de compétence;", "des évaluations relatives à la Plateforme;", "des évaluations propres à une matière;", "une réévaluation lorsque cela est raisonnablement nécessaire."],
        },
        { type: "p", text: "La réussite d'une évaluation ne garantit pas l'obtention d'occasions de tutorat." },
      ],
    },
    {
      number: 16,
      heading: "Approbation",
      blocks: [
        {
          type: "p",
          text: "Seuls les Tuteurs dont le statut est APPROVED, ou un statut admissible équivalent établi par FutureTutor, peuvent recevoir des occasions de tutorat lorsque les règles de la Plateforme exigent une approbation.",
        },
        {
          type: "p",
          text: "FutureTutor peut refuser une candidature lorsque des exigences légitimes de qualité, de sécurité, de vérification ou d'admissibilité ne sont pas satisfaites.",
        },
      ],
    },
    {
      number: 17,
      heading: "Vérifications des antécédents",
      partTitle: "Partie V — Antécédents et vérification de sécurité",
      blocks: [
        { type: "p", text: "Lorsque la loi le permet et que cela est raisonnablement requis en raison :" },
        {
          type: "ul",
          items: [
            "du travail auprès de mineurs;",
            "du tutorat en personne;",
            "de considérations de sécurité;",
            "de la loi applicable;",
            "d'exigences institutionnelles;",
            "ou de la politique de sécurité de FutureTutor,",
          ],
        },
        {
          type: "p",
          text: "FutureTutor peut exiger que le Tuteur complète une vérification appropriée des antécédents, du casier judiciaire, du secteur vulnérable ou une vérification équivalente.",
        },
        {
          type: "p",
          text: "FutureTutor ne déclarera pas qu'un type particulier de vérification est légalement obligatoire, à moins qu'il ne le soit réellement.",
        },
      ],
    },
    {
      number: 18,
      heading: "Divulgation continue",
      blocks: [
        {
          type: "p",
          text: "Dans la mesure permise par la loi, le Tuteur doit informer rapidement FutureTutor de tout changement important susceptible d'affecter, sur le plan juridique ou de façon raisonnable, son aptitude à offrir du tutorat, particulièrement lorsque ce changement crée un risque légitime pour la sécurité des Élèves.",
        },
        { type: "p", text: "FutureTutor peut demander des renseignements supplémentaires lorsque cela est raisonnablement nécessaire et légalement permis." },
      ],
    },
    {
      number: 19,
      heading: "Profil",
      partTitle: "Partie VI — Profil du Tuteur",
      blocks: [
        { type: "p", text: "FutureTutor peut afficher certains renseignements du Tuteur aux Élèves, aux Parents et aux tuteurs légaux, notamment :" },
        {
          type: "ul",
          items: [
            "le prénom ou le nom d'affichage approuvé;",
            "la photographie;",
            "la biographie;",
            "les matières;",
            "les langues;",
            "la formation;",
            "les qualifications;",
            "l'expérience;",
            "les modes de tutorat;",
            "la cote publique;",
            "les titres vérifiés pertinents.",
          ],
        },
        { type: "p", text: "FutureTutor peut distinguer les renseignements vérifiés des renseignements autodéclarés." },
      ],
    },
    {
      number: 20,
      heading: "Exactitude du profil",
      blocks: [
        { type: "p", text: "Le Tuteur doit maintenir un profil exact." },
        { type: "p", text: "Le Tuteur ne doit pas y inclure :" },
        {
          type: "ul",
          items: [
            "de faux titres;",
            "des affirmations trompeuses;",
            "des coordonnées interdites visant à contourner FutureTutor;",
            "des déclarations discriminatoires;",
            "du contenu illicite;",
            "du contenu inapproprié;",
            "des renseignements personnels non autorisés appartenant à une autre personne.",
          ],
        },
      ],
    },
    {
      number: 21,
      heading: "Jumelage",
      partTitle: "Partie VII — Jumelage et occasions de tutorat",
      blocks: [
        { type: "p", text: "FutureTutor peut utiliser des logiciels et des systèmes fondés sur des règles pour repérer des Tuteurs pour les demandes de tutorat." },
        { type: "p", text: "Le jumelage peut tenir compte de facteurs tels que :" },
        {
          type: "ul",
          items: [
            "le statut d'approbation;",
            "la matière;",
            "le niveau scolaire;",
            "la disponibilité;",
            "le mode de tutorat;",
            "la langue;",
            "les conflits d'horaire;",
            "les indicateurs de qualité;",
            "les relations de tutorat antérieures;",
            "le lieu approximatif pour le tutorat en personne;",
            "la disponibilité sur la place de marché;",
            "d'autres facteurs opérationnels légitimes.",
          ],
        },
      ],
    },
    {
      number: 22,
      heading: "Cote de jumelage",
      blocks: [
        { type: "p", text: "FutureTutor peut générer une Cote de jumelage ou un classement propre à une demande." },
        { type: "p", text: "Le Tuteur reconnaît que :" },
        {
          type: "ul",
          items: [
            "les Cotes de jumelage sont des outils opérationnels;",
            "les classements peuvent varier d'une demande à l'autre;",
            "un classement ne garantit pas une Réservation;",
            "FutureTutor n'est pas tenue de divulguer ses formules ou pondérations exclusives, sauf lorsque la loi l'exige.",
          ],
        },
      ],
    },
    {
      number: 23,
      heading: "Offre d'une occasion",
      blocks: [
        { type: "p", text: "Le fait de recevoir une occasion de tutorat ne garantit pas une Réservation." },
        { type: "p", text: "Une Réservation peut exiger :" },
        {
          type: "ul",
          items: [
            "que FutureTutor reconnaisse le Tuteur comme admissible;",
            "que le Tuteur accepte;",
            "la confirmation de l'Élève ou du Parent, le cas échéant;",
            "l'autorisation réussie du paiement, lorsque requise;",
            "la création faisant autorité de la Réservation.",
          ],
        },
        { type: "p", text: "Le Tuteur ne doit pas traiter une occasion en attente comme une Réservation confirmée tant que la Plateforme n'en indique pas la confirmation." },
      ],
    },
    {
      number: 24,
      heading: "FutureTutor détermine la rémunération du Tuteur",
      partTitle: "Partie VIII — Rémunération du Tuteur",
      blocks: [
        { type: "p", text: "FutureTutor exploite un Moteur de rémunération du Tuteur indépendant." },
        { type: "p", text: "Le Tuteur ne fixe pas de façon indépendante le prix client facturé par l'entremise de la Plateforme." },
        { type: "p", text: "FutureTutor détermine la rémunération offerte au Tuteur pour une Réservation donnée selon les règles applicables de la Plateforme." },
      ],
    },
    {
      number: 25,
      heading: "Offre de rémunération",
      blocks: [
        {
          type: "p",
          text: "Avant d'accepter une occasion de tutorat rémunérée, le Tuteur devrait se voir présenter la Rémunération du Tuteur applicable ou des renseignements suffisants pour déterminer la rémunération associée à cette occasion.",
        },
        { type: "p", text: "En acceptant l'occasion, le Tuteur accepte la rémunération offerte pour cette Réservation, sous réserve :" },
        {
          type: "ul",
          items: [
            "des exigences de complétion;",
            "des règles d'annulation;",
            "des règles de remboursement;",
            "des règles relatives aux absences;",
            "de la prévention de la fraude;",
            "du règlement des différends;",
            "des ajustements licites;",
            "des taxes;",
            "des autres conditions expressément divulguées.",
          ],
        },
      ],
    },
    {
      number: 26,
      heading: "Le prix client est distinct",
      blocks: [
        { type: "p", text: "Le montant payé par le client peut différer du montant versé au Tuteur." },
        { type: "p", text: "Les systèmes de tarification client et de rémunération du Tuteur de FutureTutor sont indépendants." },
        { type: "p", text: "Le Tuteur reconnaît que FutureTutor peut conserver la différence entre :" },
        { type: "p", text: "Prix client − Rémunération du Tuteur" },
        {
          type: "p",
          text: "à titre de revenu ou d'écart brut, sous réserve des taxes, des coûts de traitement des paiements, des remboursements, des incitatifs, des frais d'exploitation et des autres coûts d'entreprise.",
        },
        { type: "p", text: "Le Tuteur ne détient aucun droit de propriété sur l'écart de FutureTutor." },
      ],
    },
    {
      number: 27,
      heading: "Aucune déclaration de commission fixe",
      blocks: [
        {
          type: "p",
          text: "Sauf mention expresse pour un programme donné, la rémunération du Tuteur n'est pas nécessairement calculée comme un pourcentage fixe du montant payé par le client.",
        },
        { type: "p", text: "La rémunération du Tuteur peut dépendre de facteurs légitimes, notamment :" },
        {
          type: "ul",
          items: [
            "la durée du tutorat;",
            "la matière;",
            "le niveau scolaire;",
            "les qualifications du Tuteur;",
            "le palier du Tuteur;",
            "l'expérience;",
            "les indicateurs de qualité;",
            "les incitatifs;",
            "les considérations liées au tutorat en personne;",
            "les considérations de déplacement, lorsque prises en charge;",
            "les règles de rémunération applicables.",
          ],
        },
      ],
    },
    {
      number: 28,
      heading: "Rémunération immuable de la Réservation",
      blocks: [
        {
          type: "p",
          text: "Une fois qu'une Réservation est confirmée, FutureTutor peut conserver un instantané de la rémunération propre à cette Réservation ainsi que la version applicable des règles.",
        },
        { type: "p", text: "Les modifications futures des règles générales de rémunération ne devraient pas modifier rétroactivement une Réservation confirmée, sauf lorsque :" },
        {
          type: "ul",
          items: [
            "la correction d'une erreur manifeste est nécessaire;",
            "une fraude est survenue;",
            "les règles d'annulation ou de remboursement s'appliquent;",
            "la Réservation est modifiée avec autorisation;",
            "la loi applicable l'exige autrement.",
          ],
        },
      ],
    },
    {
      number: 29,
      heading: "Fournisseur de paiement",
      partTitle: "Partie IX — Stripe Connect",
      blocks: [
        { type: "p", text: "FutureTutor utilise actuellement Stripe et Stripe Connect comme infrastructure de paiement et de versement aux Tuteurs." },
        { type: "p", text: "Le Tuteur peut être tenu d'ouvrir ou de connecter un compte Stripe admissible avant de recevoir des versements." },
      ],
    },
    {
      number: 30,
      heading: "Ententes Stripe",
      blocks: [
        {
          type: "p",
          text: "L'utilisation des services de Stripe par le Tuteur est assujettie aux ententes Stripe applicables, y compris l'entente de compte connecté Stripe (Stripe Connected Account Agreement) et les conditions Stripe qui y sont incorporées.",
        },
        {
          type: "p",
          text: "Le Tuteur accepte de fournir les renseignements exacts et complets requis pour l'intégration à Stripe, la vérification d'identité, l'administration des paiements et la conformité.",
        },
        {
          type: "p",
          text: "Lorsque la configuration Stripe Connect de FutureTutor l'exige, le Tuteur autorise FutureTutor à transmettre à Stripe les renseignements raisonnablement nécessaires pour administrer le compte connecté et les opérations connexes.",
        },
      ],
    },
    {
      number: 31,
      heading: "Données Stripe",
      blocks: [
        { type: "p", text: "Le Tuteur reconnaît que Stripe peut traiter des renseignements concernant :" },
        {
          type: "ul",
          items: [
            "l'identité;",
            "les représentants;",
            "l'activité de paiement;",
            "les opérations;",
            "le compte connecté;",
            "les renseignements bancaires et de versement;",
            "la fraude et le risque;",
            "d'autres renseignements exigés par Stripe.",
          ],
        },
        { type: "p", text: "Ce traitement est également régi par les ententes Stripe applicables et les conditions de confidentialité de Stripe." },
      ],
    },
    {
      number: 32,
      heading: "Vérification Stripe",
      blocks: [
        { type: "p", text: "Le Tuteur est responsable de satisfaire aux exigences de vérification de Stripe qui lui sont applicables." },
        { type: "p", text: "Le défaut de compléter la vérification requise peut empêcher ou retarder les versements." },
        { type: "p", text: "FutureTutor n'est pas responsable des retards découlant uniquement :" },
        {
          type: "ul",
          items: ["de renseignements incomplets du Tuteur;", "de la vérification Stripe;", "de problèmes bancaires;", "de restrictions du fournisseur de paiement;", "de retenues liées à la conformité légale;"],
        },
        { type: "p", text: "sauf dans la mesure où FutureTutor a causé le retard ou lorsque la loi applicable en dispose autrement." },
      ],
    },
    {
      number: 33,
      heading: "État du compte Stripe",
      blocks: [
        { type: "p", text: "Le Tuteur doit maintenir les renseignements de paiement nécessaires pour recevoir ses versements." },
        {
          type: "p",
          text: "Si le Compte connecté du Tuteur devient restreint, désactivé ou autrement incapable de recevoir des fonds, FutureTutor peut suspendre temporairement l'administration des versements jusqu'à ce que la situation soit résolue, sous réserve de la loi applicable.",
        },
      ],
    },
    {
      number: 34,
      heading: "Responsabilité fiscale du Tuteur",
      partTitle: "Partie X — Taxes et impôts",
      blocks: [
        {
          type: "p",
          text: "Sous réserve de la loi applicable et de la qualification juridique réelle de la relation, le Tuteur est responsable de déterminer et d'acquitter ses propres obligations, notamment :",
        },
        {
          type: "ul",
          items: [
            "l'impôt sur le revenu;",
            "la TPS/TVH;",
            "la TVQ;",
            "la taxe de vente provinciale, le cas échéant;",
            "les obligations au titre du RPC applicables aux travailleurs autonomes;",
            "l'immatriculation de l'entreprise;",
            "les déclarations fiscales;",
            "les permis;",
            "les licences;",
            "les autres obligations gouvernementales.",
          ],
        },
        { type: "p", text: "FutureTutor ne fournit pas de conseils fiscaux personnels aux Tuteurs." },
      ],
    },
    {
      number: 35,
      heading: "TPS/TVH et autres taxes de vente",
      blocks: [
        {
          type: "p",
          text: "Le Tuteur est responsable de déterminer s'il est tenu de s'inscrire, de percevoir, de déclarer ou de remettre la TPS/TVH, la TVQ ou une autre taxe applicable.",
        },
        { type: "p", text: "Le Tuteur doit fournir à FutureTutor des renseignements d'inscription fiscale exacts lorsque cela est requis pour l'exploitation de la Plateforme ou pour les déclarations." },
        { type: "p", text: "Rien dans la présente Entente ne signifie que chaque Tuteur est automatiquement tenu de s'inscrire à la TPS/TVH." },
      ],
    },
    {
      number: 36,
      heading: "Documents fiscaux",
      blocks: [
        { type: "p", text: "FutureTutor peut demander ou délivrer des documents de nature fiscale lorsque la loi l'exige." },
        { type: "p", text: "Le Tuteur accepte de fournir les renseignements fiscaux exacts raisonnablement requis." },
        { type: "p", text: "FutureTutor peut effectuer les déductions, retenues ou déclarations exigées par la loi, le cas échéant." },
      ],
    },
    {
      number: 37,
      heading: "Dépenses du Tuteur",
      partTitle: "Partie XI — Dépenses et équipement",
      blocks: [
        {
          type: "p",
          text: "Sauf convention écrite expresse contraire de FutureTutor, le Tuteur est responsable de ses propres dépenses d'entreprise ordinaires, notamment, le cas échéant :",
        },
        {
          type: "ul",
          items: [
            "l'ordinateur;",
            "l'accès Internet;",
            "l'appareil mobile;",
            "le matériel pédagogique;",
            "le transport;",
            "les frais de véhicule;",
            "l'espace de travail;",
            "le matériel professionnel;",
            "les assurances;",
            "la préparation des déclarations fiscales;",
            "les immatriculations d'entreprise.",
          ],
        },
      ],
    },
    {
      number: 38,
      heading: "Équipement",
      blocks: [
        { type: "p", text: "Le Tuteur fournit généralement l'équipement nécessaire à la prestation des services de tutorat." },
        {
          type: "p",
          text: "FutureTutor peut donner accès à des technologies de la Plateforme, telle la Classe virtuelle, sans que cette technologie ne devienne la propriété du Tuteur.",
        },
      ],
    },
    {
      number: 39,
      heading: "Déplacements",
      blocks: [
        {
          type: "p",
          text: "Pour le tutorat en personne, il appartient au Tuteur de déterminer, avant d'accepter, s'il peut se déplacer de façon sécuritaire et raisonnable jusqu'au secteur approximatif présenté.",
        },
        { type: "p", text: "Lorsqu'une Réservation particulière comporte une rémunération ou un incitatif lié au déplacement, le montant indiqué pour cette Réservation prévaut." },
        {
          type: "p",
          text: "FutureTutor ne garantit par ailleurs aucun remboursement du kilométrage, du stationnement, du carburant, du transport en commun ou du temps de déplacement, sauf mention expresse.",
        },
      ],
    },
    {
      number: 40,
      heading: "Norme professionnelle",
      partTitle: "Partie XII — Obligations de tutorat",
      blocks: [
        { type: "p", text: "Le Tuteur doit fournir les services de tutorat :" },
        {
          type: "ul",
          items: ["avec compétence;", "de façon professionnelle;", "avec respect;", "de façon sécuritaire;", "avec ponctualité;", "avec honnêteté;", "de bonne foi;", "en cohérence avec les besoins éducatifs légitimes de l'Élève."],
        },
      ],
    },
    {
      number: 41,
      heading: "Préparation",
      blocks: [
        { type: "p", text: "Le Tuteur est responsable de se préparer raisonnablement aux séances qu'il a acceptées." },
        { type: "p", text: "La préparation peut comprendre l'examen des renseignements fournis volontairement concernant :" },
        {
          type: "ul",
          items: ["la matière;", "le niveau scolaire;", "les objectifs d'apprentissage;", "les chapitres;", "les concepts;", "le contexte du travail scolaire."],
        },
      ],
    },
    {
      number: 42,
      heading: "Aucune garantie de résultats",
      blocks: [
        { type: "p", text: "Le Tuteur ne doit pas garantir :" },
        {
          type: "ul",
          items: ["les notes;", "les résultats d'examen;", "l'admission;", "les bourses d'études;", "l'obtention d'un diplôme;", "le classement scolaire;", "l'emploi;", "d'autres résultats scolaires précis."],
        },
        { type: "p", text: "Le Tuteur peut aider les Élèves, mais il ne peut garantir leur rendement." },
      ],
    },
    {
      number: 43,
      heading: "Intégrité scolaire",
      blocks: [
        { type: "p", text: "Le Tuteur doit soutenir l'apprentissage plutôt que la malhonnêteté scolaire." },
        { type: "p", text: "Le Tuteur ne doit pas sciemment :" },
        {
          type: "ul",
          items: [
            "passer un examen à la place d'un Élève;",
            "usurper l'identité d'un Élève;",
            "réaliser un travail noté lorsque cela est interdit;",
            "falsifier des dossiers scolaires;",
            "faciliter le plagiat;",
            "contourner les systèmes d'intégrité scolaire;",
            "obtenir du matériel d'examen non autorisé;",
            "aider à tricher.",
          ],
        },
        {
          type: "p",
          text: "Le Tuteur peut expliquer des concepts, fournir des exemples, réviser le travail de l'Élève et offrir des conseils pédagogiques conformes aux règles scolaires applicables.",
        },
      ],
    },
    {
      number: 44,
      heading: "Devoir de conduite rehaussé",
      partTitle: "Partie XIII — Protection des mineurs",
      blocks: [
        { type: "p", text: "Le Tuteur reconnaît que FutureTutor peut faciliter du tutorat auprès d'enfants et d'adolescents." },
        { type: "p", text: "Les Tuteurs qui interagissent avec des mineurs doivent maintenir en tout temps des limites professionnelles appropriées." },
      ],
    },
    {
      number: 45,
      heading: "Conduite interdite à l'égard des mineurs",
      blocks: [
        { type: "p", text: "Le Tuteur ne doit jamais se livrer à :" },
        {
          type: "ul",
          items: [
            "des comportements sexuels;",
            "des communications à caractère sexuel;",
            "du leurre;",
            "des sollicitations amoureuses;",
            "des blagues à caractère sexuel;",
            "des demandes d'images sexuelles;",
            "des attouchements inappropriés;",
            "du harcèlement;",
            "des menaces;",
            "de l'intimidation;",
            "de la coercition;",
            "des punitions corporelles;",
            "des traitements humiliants;",
            "des abus discriminatoires;",
            "de l'exploitation;",
            "de la manipulation;",
            "des actes illicites.",
          ],
        },
        { type: "p", text: "Cette interdiction s'applique en ligne comme en personne." },
      ],
    },
    {
      number: 46,
      heading: "Limites professionnelles",
      blocks: [
        { type: "p", text: "Le Tuteur doit maintenir des interactions éducatives et professionnellement appropriées avec les mineurs." },
        {
          type: "p",
          text: "Le Tuteur ne doit pas utiliser la relation de tutorat pour développer une relation personnelle, amoureuse, financière ou abusive inappropriée.",
        },
      ],
    },
    {
      number: 47,
      heading: "Communications avec les mineurs",
      blocks: [
        { type: "p", text: "Le Tuteur devrait utiliser les canaux de communication approuvés par FutureTutor lorsque cela est requis." },
        { type: "p", text: "Le Tuteur ne doit pas exercer de pression sur un mineur pour qu'il :" },
        {
          type: "ul",
          items: [
            "communique en secret;",
            "dissimule des communications à un parent ou tuteur légal;",
            "fournisse des renseignements personnels inutiles;",
            "le rencontre en privé en dehors des arrangements de tutorat autorisés;",
            "déplace les communications hors de la Plateforme à des fins inappropriées.",
          ],
        },
      ],
    },
    {
      number: 48,
      heading: "Cadeaux et argent",
      blocks: [
        { type: "p", text: "Le Tuteur ne doit pas solliciter :" },
        {
          type: "ul",
          items: ["de prêts;", "de paiements personnels en dehors des opérations autorisées de la Plateforme;", "de cadeaux importants;", "d'investissements financiers;", "de dons;", "d'aide financière personnelle"],
        },
        { type: "p", text: "auprès d'Élèves ou de mineurs." },
        {
          type: "p",
          text: "Les cadeaux symboliques raisonnables offerts à l'initiative d'une famille peuvent être assujettis aux politiques de FutureTutor, mais les Tuteurs ne doivent jamais exercer de pression sur un Élève ou une famille pour en obtenir.",
        },
      ],
    },
    {
      number: 49,
      heading: "Signalement des préoccupations de sécurité",
      blocks: [
        { type: "p", text: "Le Tuteur doit signaler rapidement à FutureTutor toute préoccupation sérieuse concernant :" },
        {
          type: "ul",
          items: [
            "des abus soupçonnés;",
            "de l'exploitation;",
            "du leurre;",
            "des menaces;",
            "du harcèlement grave;",
            "des risques immédiats pour la sécurité;",
            "un accès non autorisé à un mineur;",
            "une inconduite grave sur la Plateforme.",
          ],
        },
        { type: "p", text: "Rien dans la présente Entente ne remplace une obligation de signalement obligatoire imposée directement au Tuteur par la loi applicable." },
        {
          type: "p",
          text: "En cas de danger immédiat, le Tuteur devrait communiquer avec les services d'urgence ou les autorités de protection compétentes, selon ce qu'exigent les circonstances et la loi.",
        },
      ],
    },
    {
      number: 50,
      heading: "Sécurité en personne",
      partTitle: "Partie XIV — Tutorat en personne",
      blocks: [
        { type: "p", text: "Le Tuteur doit faire preuve d'un jugement raisonnable lorsqu'il offre du tutorat en personne." },
        { type: "p", text: "Le Tuteur peut refuser une occasion avant de l'accepter s'il n'est pas à l'aise avec le lieu approximatif ou les circonstances." },
      ],
    },
    {
      number: 51,
      heading: "Confidentialité du lieu",
      blocks: [
        { type: "p", text: "Pendant le jumelage ouvert, le Tuteur peut ne recevoir que des renseignements de localisation approximatifs." },
        { type: "p", text: "Le Tuteur ne doit pas tenter de contourner les contrôles de confidentialité de FutureTutor pour découvrir l'adresse exacte d'un Élève avant d'y être autorisé." },
      ],
    },
    {
      number: 52,
      heading: "Adresse exacte",
      blocks: [
        { type: "p", text: "L'acceptation d'une occasion de tutorat n'autorise pas nécessairement à elle seule le Tuteur à recevoir l'adresse exacte." },
        { type: "p", text: "Le lieu exact du tutorat peut être divulgué après la confirmation faisant autorité de la Réservation." },
        { type: "p", text: "Le Tuteur ne peut utiliser l'adresse qu'à des fins légitimes liées à la séance de tutorat confirmée." },
      ],
    },
    {
      number: 53,
      heading: "Instructions d'arrivée",
      blocks: [
        { type: "p", text: "Le Tuteur peut recevoir des Instructions d'arrivée privées après la confirmation." },
        { type: "p", text: "Le Tuteur doit traiter les Instructions d'arrivée comme confidentielles." },
        { type: "p", text: "Le Tuteur ne doit pas :" },
        { type: "ul", items: ["les publier;", "les conserver inutilement;", "les partager avec des personnes non concernées;", "les utiliser à des fins non liées."] },
      ],
    },
    {
      number: 54,
      heading: "Accès aux résidences privées",
      blocks: [
        { type: "p", text: "Lorsque le tutorat a lieu dans une résidence privée, le Tuteur doit :" },
        {
          type: "ul",
          items: [
            "n'y entrer que dans la mesure autorisée;",
            "n'y demeurer qu'à des fins légitimes de tutorat;",
            "respecter les limites du ménage;",
            "éviter d'accéder à des aires non liées;",
            "quitter les lieux lorsque la séance de tutorat ou la présence autorisée prend fin;",
            "suivre les consignes de sécurité raisonnables.",
          ],
        },
      ],
    },
    {
      number: 55,
      heading: "Aucune personne non autorisée",
      blocks: [
        { type: "p", text: "Le Tuteur ne doit pas amener une autre personne à une séance de tutorat en personne sans autorisation préalable appropriée." },
      ],
    },
    {
      number: 56,
      heading: "Transport des Élèves",
      blocks: [
        {
          type: "p",
          text: "À moins que FutureTutor n'introduise et n'autorise expressément un tel service par écrit, le Tuteur ne doit pas transporter un Élève dans le cadre d'un service de tutorat FutureTutor.",
        },
        { type: "p", text: "Un Tuteur ne doit pas présenter le transport comme un service de FutureTutor." },
      ],
    },
    {
      number: 57,
      heading: "Classe virtuelle",
      partTitle: "Partie XV — Tutorat en ligne",
      blocks: [
        { type: "p", text: "FutureTutor peut offrir une Classe virtuelle intégrée par l'entremise de Daily ou d'un autre fournisseur approuvé." },
        { type: "p", text: "Le Tuteur doit utiliser la Classe virtuelle conformément :" },
        { type: "ul", items: ["à la présente Entente;", "aux exigences en matière de protection de la vie privée;", "aux règles de sécurité;", "à la loi applicable."] },
      ],
    },
    {
      number: 58,
      heading: "Caméra et microphone",
      blocks: [
        { type: "p", text: "Le Tuteur est responsable de veiller à ce que son environnement soit raisonnablement approprié à un tutorat professionnel." },
        { type: "p", text: "Le Tuteur devrait éviter d'exposer inutilement du matériel confidentiel, inapproprié ou privé par la caméra ou le microphone." },
      ],
    },
    {
      number: 59,
      heading: "Partage d'écran",
      blocks: [
        { type: "p", text: "Le Tuteur peut utiliser le partage d'écran à des fins légitimes de tutorat." },
        { type: "p", text: "Avant de partager son écran, le Tuteur devrait fermer tout élément non lié, notamment :" },
        { type: "ul", items: ["les messages personnels;", "les documents confidentiels;", "les renseignements financiers;", "les communications privées;", "le contenu inapproprié."] },
      ],
    },
    {
      number: 60,
      heading: "Enregistrement",
      blocks: [
        { type: "p", text: "Le Tuteur ne doit pas enregistrer de façon autonome :" },
        { type: "ul", items: ["l'audio;", "la vidéo;", "le contenu de l'écran;", "des captures d'écran de contenu de tutorat privé;"] },
        {
          type: "p",
          text: "sauf lorsque FutureTutor l'autorise expressément et que toutes les permissions ou tous les consentements exigés par la loi ont été obtenus.",
        },
        { type: "p", text: "La Classe virtuelle actuelle de FutureTutor ne prévoit pas d'enregistrement systématique." },
      ],
    },
    {
      number: 61,
      heading: "Observateurs Parent ou tuteur légal",
      blocks: [
        { type: "p", text: "Les Parents ou tuteurs légaux autorisés peuvent être admis à observer certaines séances." },
        { type: "p", text: "Le Tuteur ne doit pas tenter de désactiver ou de contourner la fonctionnalité d'observation autorisée." },
      ],
    },
    {
      number: 62,
      heading: "Ponctualité",
      partTitle: "Partie XVI — Présence",
      blocks: [
        { type: "p", text: "Il est attendu que le Tuteur soit raisonnablement ponctuel pour les Réservations acceptées." },
        { type: "p", text: "Des retards répétés ou graves peuvent avoir une incidence sur :" },
        { type: "ul", items: ["la Cote interne du Tuteur;", "l'admissibilité;", "le jumelage;", "l'examen de la qualité;", "l'accès à la Plateforme."] },
      ],
    },
    {
      number: 63,
      heading: "Enregistrement de présence",
      blocks: [
        { type: "p", text: "Le Tuteur peut être tenu de compléter l'enregistrement de présence sur la Plateforme ou des procédures équivalentes de vérification de séance." },
        { type: "p", text: "Le Tuteur ne doit pas falsifier :" },
        { type: "ul", items: ["la présence;", "l'enregistrement de présence;", "la durée de la séance;", "la complétion;", "la présence de l'Élève."] },
      ],
    },
    {
      number: 64,
      heading: "Absence (no-show)",
      blocks: [
        {
          type: "p",
          text: "Le défaut de se présenter à une Réservation acceptée sans annulation valide ni circonstances exceptionnelles peut constituer une absence (« no-show ») du Tuteur.",
        },
        { type: "p", text: "FutureTutor peut alors :" },
        {
          type: "ul",
          items: [
            "tenter de jumeler de nouveau l'Élève;",
            "retenir la rémunération d'une séance non exécutée;",
            "ajuster les renseignements légitimes de fiabilité ou de qualité;",
            "procéder à un examen de la qualité;",
            "suspendre le Tuteur en cas d'inconduite répétée ou grave.",
          ],
        },
      ],
    },
    {
      number: 65,
      heading: "Annulation par le Tuteur",
      partTitle: "Partie XVII — Annulations",
      blocks: [
        { type: "p", text: "Le Tuteur ne devrait annuler une Réservation acceptée que lorsque cela est raisonnablement nécessaire." },
        { type: "p", text: "Le Tuteur doit donner un préavis aussi long que raisonnablement possible." },
        { type: "p", text: "Des annulations évitables répétées peuvent avoir une incidence sur l'admissibilité du Tuteur ou sur son statut de qualité." },
      ],
    },
    {
      number: 66,
      heading: "Annulation d'urgence",
      blocks: [
        { type: "p", text: "Lorsque le Tuteur doit annuler en raison :" },
        { type: "ul", items: ["d'une maladie;", "d'une urgence;", "d'un accident;", "de conditions de déplacement dangereuses;", "d'un cas de force majeure;", "d'autres circonstances exceptionnelles légitimes,"] },
        { type: "p", text: "il devrait en aviser FutureTutor rapidement." },
        { type: "p", text: "FutureTutor peut demander des renseignements justificatifs raisonnables lorsque cela est proportionné et légalement permis." },
      ],
    },
    {
      number: 67,
      heading: "Tuteur remplaçant",
      blocks: [
        { type: "p", text: "Lorsque le Tuteur annule, FutureTutor peut tenter de jumeler de nouveau l'Élève avec un autre Tuteur admissible." },
        { type: "p", text: "Le Tuteur n'a droit à aucune part de la rémunération du Tuteur remplaçant." },
      ],
    },
    {
      number: 68,
      heading: "Annulation par le client",
      blocks: [
        {
          type: "p",
          text: "La rémunération du Tuteur à la suite d'une annulation par le client est régie par les règles d'annulation et de rémunération de FutureTutor applicables à cette Réservation.",
        },
        { type: "p", text: "Les obligations de FutureTutor en matière de remboursement au client et de rémunération du Tuteur peuvent différer." },
      ],
    },
    {
      number: 69,
      heading: "Cotes publiques",
      partTitle: "Partie XVIII — Cotes et qualité",
      blocks: [
        { type: "p", text: "Les séances de tutorat admissibles complétées peuvent permettre aux Élèves, aux Parents ou aux tuteurs légaux de fournir des évaluations ou des commentaires." },
        { type: "p", text: "FutureTutor peut afficher la cote publique globale légitime d'un Tuteur." },
      ],
    },
    {
      number: 70,
      heading: "Cote interne du Tuteur",
      blocks: [
        { type: "p", text: "FutureTutor peut maintenir une Cote interne du Tuteur privée à des fins de qualité et d'exploitation." },
        { type: "p", text: "Les facteurs peuvent comprendre :" },
        {
          type: "ul",
          items: [
            "la validation;",
            "les qualifications;",
            "l'expérience;",
            "la fiabilité;",
            "la présence;",
            "les annulations;",
            "les séances complétées;",
            "les commentaires des Élèves et des Parents;",
            "l'examen de la qualité;",
            "d'autres indicateurs légitimes de la Plateforme.",
          ],
        },
        { type: "p", text: "FutureTutor n'est pas tenue de divulguer publiquement ses formules exclusives, sauf lorsque la loi l'exige." },
      ],
    },
    {
      number: 71,
      heading: "Examen de la qualité",
      blocks: [
        { type: "p", text: "FutureTutor peut soumettre le Tuteur à un examen de la qualité lorsque des préoccupations légitimes surviennent." },
        { type: "p", text: "FutureTutor peut demander :" },
        { type: "ul", items: ["des explications;", "des renseignements à jour;", "une nouvelle formation;", "une réévaluation;", "une vérification supplémentaire;", "des mesures correctives."] },
      ],
    },
    {
      number: 72,
      heading: "Équité",
      blocks: [
        { type: "p", text: "FutureTutor ne devrait pas sciemment manipuler les cotes ou les systèmes de qualité à des fins discriminatoires illicites ou de représailles." },
        { type: "p", text: "Le Tuteur peut signaler toute erreur factuelle soupçonnée par l'entremise des canaux de soutien disponibles." },
      ],
    },
    {
      number: 73,
      heading: "Les renseignements sur les Élèves sont confidentiels",
      partTitle: "Partie XIX — Protection de la vie privée et confidentialité",
      blocks: [
        { type: "p", text: "Le Tuteur peut recevoir des renseignements confidentiels concernant des Élèves et des familles." },
        { type: "p", text: "Ces renseignements peuvent comprendre :" },
        {
          type: "ul",
          items: [
            "le nom;",
            "des renseignements scolaires;",
            "les besoins d'apprentissage;",
            "des renseignements sur l'école;",
            "des notes de tutorat;",
            "des renseignements sur le Parent;",
            "les détails de la Réservation;",
            "des adresses privées;",
            "les Instructions d'arrivée;",
            "des communications;",
            "des renseignements sur les séances.",
          ],
        },
        { type: "p", text: "Le Tuteur ne doit utiliser ces renseignements que dans la mesure nécessaire pour fournir les services de tutorat autorisés." },
      ],
    },
    {
      number: 74,
      heading: "Minimisation des données",
      blocks: [
        { type: "p", text: "Le Tuteur ne doit pas recueillir de renseignements personnels inutiles auprès des Élèves." },
        { type: "p", text: "Le Tuteur ne devrait pas demander de renseignements sensibles à moins que cela ne soit légitimement nécessaire et permis." },
      ],
    },
    {
      number: 75,
      heading: "Aucune base de données privée",
      blocks: [
        { type: "p", text: "Le Tuteur ne doit pas créer de bases de données indépendantes de renseignements sur les Élèves ou les Parents de FutureTutor à des fins :" },
        { type: "ul", items: ["de marketing;", "de sollicitation;", "de revente;", "de profilage;", "d'activités commerciales non liées."] },
      ],
    },
    {
      number: 76,
      heading: "Sécurité",
      blocks: [
        { type: "p", text: "Le Tuteur doit prendre des mesures raisonnables pour protéger les renseignements auxquels il accède par l'entremise de FutureTutor." },
        { type: "p", text: "Le Tuteur ne doit pas :" },
        {
          type: "ul",
          items: [
            "partager ses identifiants de compte;",
            "exposer intentionnellement des renseignements sur les Élèves;",
            "laisser des renseignements sensibles accessibles au public;",
            "utiliser des comptes compromis;",
            "contourner intentionnellement la sécurité de la Plateforme.",
          ],
        },
      ],
    },
    {
      number: 77,
      heading: "Incidents de sécurité",
      blocks: [
        { type: "p", text: "Le Tuteur doit aviser rapidement FutureTutor s'il prend connaissance :" },
        {
          type: "ul",
          items: [
            "d'un accès non autorisé à un compte;",
            "de la perte de renseignements sensibles concernant un Élève;",
            "d'une divulgation non autorisée;",
            "d'identifiants compromis;",
            "d'une atteinte soupçonnée à la protection des données;",
            "d'un incident important en matière de vie privée.",
          ],
        },
        { type: "p", text: "L'avis devrait être transmis par le canal de soutien ou de confidentialité désigné par FutureTutor." },
      ],
    },
    {
      number: 78,
      heading: "Politique de confidentialité",
      blocks: [
        { type: "p", text: "L'utilisation de FutureTutor par le Tuteur est également assujettie à la Politique de confidentialité de FutureTutor." },
        {
          type: "p",
          text: "Lorsque le Tuteur recueille de façon indépendante des renseignements personnels en dehors de FutureTutor pour sa propre entreprise distincte, il peut avoir des obligations légales autonomes en matière de protection de la vie privée.",
        },
      ],
    },
    {
      number: 79,
      heading: "Renseignements confidentiels de la Société",
      partTitle: "Partie XX — Renseignements confidentiels de FutureTutor",
      blocks: [
        { type: "p", text: "Le Tuteur peut recevoir des renseignements non publics de FutureTutor, notamment :" },
        {
          type: "ul",
          items: [
            "des procédures internes;",
            "la méthodologie de tarification;",
            "la méthodologie de rémunération;",
            "des renseignements sur la Cote de jumelage;",
            "des cotes internes;",
            "du matériel de formation;",
            "la stratégie d'affaires;",
            "des renseignements de sécurité;",
            "des renseignements techniques;",
            "des plans de produits non publics;",
            "des communications confidentielles.",
          ],
        },
        { type: "p", text: "Le Tuteur ne doit pas divulguer indûment ni utiliser à mauvais escient les renseignements confidentiels de FutureTutor." },
      ],
    },
    {
      number: 80,
      heading: "Exclusions",
      blocks: [
        { type: "p", text: "Les Renseignements confidentiels ne comprennent pas les renseignements dont le Tuteur peut démontrer :" },
        {
          type: "ul",
          items: [
            "qu'ils sont licitement publics sans qu'il y ait eu manquement;",
            "qu'ils étaient déjà licitement connus sans obligation de confidentialité;",
            "qu'ils ont été élaborés de façon indépendante sans utilisation de renseignements confidentiels;",
            "qu'ils ont été licitement reçus d'un tiers autorisé.",
          ],
        },
      ],
    },
    {
      number: 81,
      heading: "Divulgation exigée par la loi",
      blocks: [
        { type: "p", text: "Si le Tuteur est légalement contraint de divulguer des renseignements confidentiels, il peut le faire dans la mesure exigée par la loi." },
        { type: "p", text: "Lorsque la loi le permet, le Tuteur devrait en aviser FutureTutor dans un délai raisonnable." },
      ],
    },
    {
      number: 82,
      heading: "Propriété de FutureTutor",
      partTitle: "Partie XXI — Propriété intellectuelle",
      blocks: [
        { type: "p", text: "FutureTutor conserve la propriété :" },
        {
          type: "ul",
          items: [
            "de sa Plateforme;",
            "de ses logiciels;",
            "de ses marques de commerce;",
            "de ses logos;",
            "de son image de marque;",
            "de son interface;",
            "de sa formation exclusive;",
            "de sa documentation;",
            "de ses systèmes;",
            "de ses méthodologies exclusives;",
            "du contenu original de la Plateforme.",
          ],
        },
        { type: "p", text: "Aucun droit de propriété n'est transféré au Tuteur." },
      ],
    },
    {
      number: 83,
      heading: "Licence limitée d'utilisation de la Plateforme",
      blocks: [
        {
          type: "p",
          text: "FutureTutor accorde au Tuteur un droit limité, révocable, non exclusif et non transférable d'utiliser la Plateforme uniquement pour participer aux services de FutureTutor tant qu'il demeure admissible.",
        },
      ],
    },
    {
      number: 84,
      heading: "Matériel préexistant du Tuteur",
      blocks: [
        { type: "p", text: "Le Tuteur conserve la propriété du matériel pédagogique original créé de façon indépendante avant FutureTutor ou en dehors de celle-ci, sous réserve des droits de tiers." },
      ],
    },
    {
      number: 85,
      heading: "Matériel du Tuteur utilisé pendant les séances",
      blocks: [
        { type: "p", text: "Lorsque le Tuteur fournit du matériel dont il est propriétaire par l'entremise de FutureTutor, il n'accorde à FutureTutor que la licence limitée raisonnablement nécessaire pour :" },
        { type: "ul", items: ["transmettre;", "afficher;", "livrer;", "traiter techniquement;"] },
        { type: "p", text: "ce matériel aux fins du service de tutorat." },
        { type: "p", text: "FutureTutor n'acquiert pas pour autant la propriété du matériel pédagogique indépendant du Tuteur." },
      ],
    },
    {
      number: 86,
      heading: "Matériel de tiers",
      blocks: [
        { type: "p", text: "Le Tuteur doit respecter le droit d'auteur et les autres droits de propriété intellectuelle." },
        { type: "p", text: "Le Tuteur ne doit pas distribuer illicitement :" },
        { type: "ul", items: ["des manuels scolaires;", "des corrigés;", "du matériel de cours payant;", "des examens protégés par le droit d'auteur;", "des ressources pédagogiques exclusives."] },
      ],
    },
    {
      number: 87,
      heading: "Aucune fraude",
      partTitle: "Partie XXII — Intégrité de la Plateforme",
      blocks: [
        { type: "p", text: "Le Tuteur ne doit pas se livrer :" },
        {
          type: "ul",
          items: [
            "à de la fraude en matière de paiement;",
            "à de la fraude d'identité;",
            "à de fausses Réservations;",
            "à des présences fabriquées;",
            "à des évaluations manipulées;",
            "à de la collusion;",
            "à de fausses réclamations de rémunération;",
            "au partage de compte;",
            "à la production de documents frauduleux.",
          ],
        },
      ],
    },
    {
      number: 88,
      heading: "Aucune manipulation",
      blocks: [
        { type: "p", text: "Le Tuteur ne doit pas tenter de manipuler indûment :" },
        {
          type: "ul",
          items: [
            "les Cotes de jumelage;",
            "les classements;",
            "les cotes;",
            "les rémunérations;",
            "la disponibilité;",
            "les annulations;",
            "les dossiers de séance;",
            "les systèmes de recommandation;",
            "les systèmes de qualité.",
          ],
        },
      ],
    },
    {
      number: 89,
      heading: "Aucune extraction de données ni accès non autorisé",
      blocks: [
        { type: "p", text: "Le Tuteur ne doit pas :" },
        {
          type: "ul",
          items: [
            "extraire des renseignements sur les Élèves;",
            "extraire les bases de données de la Plateforme;",
            "rétroconcevoir les systèmes protégés, sauf lorsque la loi le permet expressément;",
            "contourner les contrôles d'accès;",
            "sonder la sécurité sans autorisation;",
            "accéder au compte d'un autre Tuteur;",
            "accéder à des Réservations qui ne le concernent pas.",
          ],
        },
      ],
    },
    {
      number: 90,
      heading: "Protection des relations établies par la Plateforme",
      partTitle: "Partie XXIII — Contournement hors plateforme",
      blocks: [
        { type: "p", text: "FutureTutor investit des ressources dans :" },
        {
          type: "ul",
          items: ["l'attraction de la clientèle;", "la validation des Tuteurs;", "le jumelage;", "les paiements;", "la sécurité;", "l'infrastructure;", "le soutien à la clientèle;", "l'exploitation de la Plateforme."],
        },
        {
          type: "p",
          text: "Le Tuteur ne doit pas utiliser des renseignements confidentiels de la Plateforme ni la mise en relation avec un Élève effectuée par FutureTutor dans le seul but de contourner frauduleusement des montants légitimement payables à FutureTutor.",
        },
      ],
    },
    {
      number: 91,
      heading: "Aucune sollicitation visant à éviter la Plateforme",
      blocks: [
        {
          type: "p",
          text: "Le Tuteur ne doit pas inciter un Élève, un Parent ou un tuteur légal à annuler ou à éviter une Réservation FutureTutor dans le but de recréer essentiellement le même arrangement de tutorat hors plateforme uniquement pour éviter les frais ou les systèmes légitimes de FutureTutor.",
        },
        {
          type: "p",
          text: "La présente disposition vise à protéger les opérations issues de la Plateforme et non à créer une interdiction générale pour le Tuteur d'exploiter une entreprise de tutorat indépendante.",
        },
      ],
    },
    {
      number: 92,
      heading: "Portée raisonnable",
      blocks: [
        { type: "p", text: "Rien dans la présente Entente n'interdit au Tuteur :" },
        {
          type: "ul",
          items: [
            "d'avoir des clients indépendants;",
            "de faire la promotion générale de son entreprise indépendante;",
            "d'offrir du tutorat à des personnes obtenues de façon indépendante, sans usage abusif des renseignements confidentiels de FutureTutor;",
            "de travailler par l'entremise de plateformes concurrentes.",
          ],
        },
        { type: "p", text: "Toute restriction de non-contournement doit être interprétée uniquement dans la mesure où elle est exécutoire en vertu de la loi applicable." },
      ],
    },
    {
      number: 93,
      heading: "Conduite respectueuse",
      partTitle: "Partie XXIV — Conduite professionnelle",
      blocks: [{ type: "p", text: "Le Tuteur doit traiter avec respect les Élèves, les Parents, les tuteurs légaux, le personnel de FutureTutor et les autres utilisateurs." }],
    },
    {
      number: 94,
      heading: "Non-discrimination",
      blocks: [{ type: "p", text: "Le Tuteur ne doit pas exercer de discrimination illicite ni harceler des personnes en raison de caractéristiques protégées par la législation applicable en matière de droits de la personne." }],
    },
    {
      number: 95,
      heading: "Harcèlement",
      blocks: [
        { type: "p", text: "Le Tuteur ne doit pas se livrer :" },
        { type: "ul", items: ["à du harcèlement;", "à des menaces;", "à du harcèlement criminel;", "à de l'intimidation;", "à de l'intimidation psychologique;", "à des discours haineux;", "à du harcèlement sexuel;", "à des représailles."] },
      ],
    },
    {
      number: 96,
      heading: "Substances et facultés affaiblies",
      blocks: [
        {
          type: "p",
          text: "Le Tuteur ne doit pas offrir de tutorat alors que ses facultés sont affaiblies d'une manière qui l'empêche d'exécuter le service de façon sécuritaire ou professionnelle.",
        },
        { type: "p", text: "Le Tuteur ne doit pas consommer de substances illégales pendant le tutorat." },
      ],
    },
    {
      number: 97,
      heading: "Armes et objets dangereux",
      blocks: [
        { type: "p", text: "Le Tuteur ne doit pas apporter d'armes illicites ni d'objets dangereux aux séances de tutorat." },
        { type: "p", text: "Rien dans la présente section n'écarte les exigences licites en matière d'urgence, de profession ou d'accessibilité." },
      ],
    },
    {
      number: 98,
      heading: "Assurance exigée par la loi",
      partTitle: "Partie XXV — Assurance et conformité légale",
      blocks: [
        { type: "p", text: "Le Tuteur est responsable de maintenir toute assurance légalement requise pour ses activités indépendantes." },
        {
          type: "p",
          text: "FutureTutor ne déclare pas que chaque Tuteur est légalement tenu de maintenir une police d'assurance commerciale particulière.",
        },
      ],
    },
    {
      number: 99,
      heading: "Exigences futures des programmes",
      blocks: [
        { type: "p", text: "FutureTutor peut établir des exigences d'assurance raisonnables pour certains :" },
        { type: "ul", items: ["programmes;", "territoires;", "partenariats institutionnels;", "catégories de services à risque plus élevé;"] },
        { type: "p", text: "lorsque cela est justifié." },
        { type: "p", text: "Dans la mesure du possible, ces exigences seront communiquées avant que le Tuteur ne participe au programme visé." },
      ],
    },
    {
      number: 100,
      heading: "Permis et licences",
      blocks: [
        { type: "p", text: "Le Tuteur est responsable des permis, licences ou immatriculations légalement requis pour sa prestation indépendante de services." },
        { type: "p", text: "FutureTutor ne déclare pas que le tutorat ordinaire exige universellement un permis professionnel." },
      ],
    },
    {
      number: 101,
      heading: "Déclarations du Tuteur",
      partTitle: "Partie XXVI — Déclarations et garanties",
      blocks: [
        { type: "p", text: "Le Tuteur déclare que :" },
        {
          type: "ul",
          items: [
            "il a le pouvoir de conclure la présente Entente;",
            "les renseignements fournis sont exacts pour l'essentiel;",
            "il se conformera à la loi applicable;",
            "il fournira les services de façon professionnelle;",
            "il respectera la vie privée et la confidentialité;",
            "il ne violera pas sciemment les droits de tiers;",
            "il maintiendra les exigences d'admissibilité;",
            "il n'utilisera pas la Plateforme à mauvais escient.",
          ],
        },
      ],
    },
    {
      number: 102,
      heading: "Aucune obligation incompatible",
      blocks: [{ type: "p", text: "Le Tuteur déclare que sa participation à FutureTutor ne contrevient pas sciemment à une autre obligation contractuelle exécutoire." }],
    },
    {
      number: 103,
      heading: "Disponibilité de la Plateforme",
      partTitle: "Partie XXVII — Plateforme FutureTutor",
      blocks: [
        { type: "p", text: "FutureTutor vise à offrir un accès fiable à la Plateforme, mais ne garantit pas une disponibilité ininterrompue." },
        { type: "p", text: "Des interruptions temporaires peuvent survenir en raison :" },
        { type: "ul", items: ["de l'entretien;", "de pannes Internet;", "de pannes chez des tiers;", "d'incidents de sécurité;", "d'un cas de force majeure;", "de problèmes techniques."] },
      ],
    },
    {
      number: 104,
      heading: "Aucune garantie d'occasions",
      blocks: [
        { type: "p", text: "FutureTutor ne garantit pas :" },
        { type: "ul", items: ["la demande;", "les occasions de tutorat;", "les Réservations;", "la fidélisation des Élèves;", "les gains;", "le classement;", "un revenu minimal."] },
      ],
    },
    {
      number: 105,
      heading: "Services tiers",
      blocks: [
        { type: "p", text: "FutureTutor s'appuie sur des services tiers, notamment des fournisseurs de paiement, d'infrastructure, de courriel et de vidéo." },
        {
          type: "p",
          text: "FutureTutor n'est pas responsable de chaque acte ou omission d'un fournisseur tiers indépendant, sauf lorsque la loi applicable lui impose une responsabilité.",
        },
      ],
    },
    {
      number: 106,
      heading: "Suspension temporaire",
      partTitle: "Partie XXVIII — Suspension",
      blocks: [
        { type: "p", text: "FutureTutor peut suspendre temporairement le Tuteur lorsque cela est raisonnablement nécessaire pour enquêter sur :" },
        {
          type: "ul",
          items: [
            "des préoccupations de sécurité;",
            "une fraude;",
            "des plaintes sérieuses;",
            "des incidents relatifs à la vie privée;",
            "des problèmes de paiement;",
            "des préoccupations d'identité;",
            "des violations soupçonnées des politiques;",
            "des préoccupations relatives aux qualifications.",
          ],
        },
      ],
    },
    {
      number: 107,
      heading: "Suspension immédiate pour motif de sécurité",
      blocks: [
        { type: "p", text: "FutureTutor peut restreindre immédiatement l'accès du Tuteur à la Plateforme lorsque cela est raisonnablement nécessaire pour protéger :" },
        {
          type: "ul",
          items: ["un enfant;", "un Élève;", "un Parent;", "un tuteur légal;", "un Tuteur;", "FutureTutor;", "la sécurité publique;", "la sécurité de la Plateforme."],
        },
        { type: "p", text: "Une suspension immédiate ne constitue pas nécessairement une conclusion définitive de faute." },
      ],
    },
    {
      number: 108,
      heading: "Examen de la qualité",
      blocks: [
        {
          type: "p",
          text: "FutureTutor peut placer le Tuteur au statut QUALITY_REVIEW ou à un statut équivalent pendant qu'elle enquête sur des préoccupations légitimes de rendement.",
        },
      ],
    },
    {
      number: 109,
      heading: "Résiliation par le Tuteur",
      partTitle: "Partie XXIX — Résiliation",
      blocks: [
        {
          type: "p",
          text: "Le Tuteur peut cesser de fournir des services par l'entremise de FutureTutor et résilier la présente Entente en fermant ou en désactivant sa relation avec FutureTutor au moyen des processus disponibles, ou en donnant un préavis raisonnable.",
        },
        { type: "p", text: "Le Tuteur demeure responsable des Réservations confirmées existantes, à moins qu'elles ne soient dûment annulées ou transférées." },
      ],
    },
    {
      number: 110,
      heading: "Résiliation par FutureTutor",
      blocks: [
        { type: "p", text: "Sous réserve de la loi applicable, FutureTutor peut mettre fin à l'accès du Tuteur à la Plateforme pour des motifs légitimes, notamment :" },
        {
          type: "ul",
          items: [
            "une fraude;",
            "une violation grave de la sécurité;",
            "une inconduite impliquant un mineur;",
            "des qualifications falsifiées;",
            "des absences graves et répétées;",
            "une violation importante de la vie privée;",
            "une fraude en matière de paiement;",
            "du harcèlement;",
            "une conduite illicite;",
            "un manquement important;",
            "l'incapacité de satisfaire aux exigences d'admissibilité.",
          ],
        },
        {
          type: "p",
          text: "FutureTutor peut également mettre fin à une relation avec un Tuteur pour des motifs d'affaires légitimes, sous réserve de la loi applicable et des obligations contractuelles en cours.",
        },
      ],
    },
    {
      number: 111,
      heading: "Effet de la résiliation",
      blocks: [
        { type: "p", text: "La résiliation met fin au droit du Tuteur de recevoir de nouvelles occasions par l'entremise de FutureTutor." },
        { type: "p", text: "La résiliation n'élimine pas automatiquement :" },
        {
          type: "ul",
          items: [
            "les montants gagnés et impayés;",
            "les remboursements ou renversements valides;",
            "les obligations de confidentialité;",
            "les obligations en matière de vie privée;",
            "les obligations en matière de propriété intellectuelle;",
            "les obligations fiscales;",
            "les obligations relatives aux différends;",
            "les responsabilités nées avant la résiliation;",
            "les dispositions destinées à survivre.",
          ],
        },
      ],
    },
    {
      number: 112,
      heading: "Rémunérations en souffrance",
      blocks: [
        { type: "p", text: "Sous réserve :" },
        { type: "ul", items: ["d'un examen pour fraude;", "des remboursements;", "des rétrofacturations;", "des exigences légales;", "des restrictions du fournisseur de paiement;"] },
        {
          type: "p",
          text: "FutureTutor administrera les rémunérations légitimement gagnées et en souffrance après la résiliation, conformément aux règles applicables et à la loi.",
        },
      ],
    },
    {
      number: 113,
      heading: "Renversements de paiement",
      partTitle: "Partie XXX — Renversements de paiement et différends",
      blocks: [
        { type: "p", text: "Lorsqu'un paiement client est licitement renversé, remboursé ou rétrofacturé, FutureTutor peut enquêter sur l'opération." },
        { type: "p", text: "Le Tuteur n'est pas automatiquement responsable de chaque rétrofacturation client." },
        { type: "p", text: "Tout ajustement de la rémunération du Tuteur doit être conforme :" },
        { type: "ul", items: ["aux conditions de la Réservation;", "aux règles de rémunération applicables;", "aux conclusions relatives à la fraude;", "à la présente Entente;", "à la loi applicable."] },
      ],
    },
    {
      number: 114,
      heading: "Fraude du Tuteur",
      blocks: [
        {
          type: "p",
          text: "Lorsque FutureTutor détermine raisonnablement qu'une rémunération résulte d'une fraude du Tuteur, d'une présence fabriquée ou d'une inconduite intentionnelle, elle peut en réclamer le recouvrement ou procéder à une compensation lorsque la loi le permet.",
        },
      ],
    },
    {
      number: 115,
      heading: "Erreur de paiement manifeste",
      blocks: [
        {
          type: "p",
          text: "Si une erreur technique ou d'écriture évidente amène le Tuteur à recevoir un montant sensiblement différent de la rémunération convenue, les Parties collaboreront de bonne foi pour corriger l'erreur.",
        },
      ],
    },
    {
      number: 116,
      heading: "Indemnisation par le Tuteur",
      partTitle: "Partie XXXI — Indemnisation",
      blocks: [
        {
          type: "p",
          text: "Dans la mesure permise par la loi applicable, le Tuteur accepte d'indemniser FYRA SERVICES INC., ses administrateurs, dirigeants et représentants, et de les tenir indemnes des réclamations de tiers, pertes, dommages, responsabilités et coûts raisonnables découlant directement :",
        },
        {
          type: "ul",
          items: [
            "d'un manquement important à la présente Entente;",
            "d'une conduite illicite;",
            "d'une fraude;",
            "d'une faute intentionnelle;",
            "d'une atteinte à la propriété intellectuelle d'un tiers;",
            "d'une divulgation non autorisée de renseignements personnels;",
            "d'une violation grave des obligations de sécurité envers les Élèves;",
          ],
        },
        {
          type: "p",
          text: "sauf dans la mesure où cela découle de la propre négligence de FutureTutor, de sa faute intentionnelle, d'un manquement de sa part ou d'une autre responsabilité qui lui incombe en vertu de la loi applicable.",
        },
        { type: "p", text: "La présente section doit être interprétée sous réserve de la loi applicable et n'exige aucune indemnisation lorsque celle-ci est légalement interdite." },
      ],
    },
    {
      number: 117,
      heading: "Dommages exclus",
      partTitle: "Partie XXXII — Limitation de responsabilité",
      blocks: [
        {
          type: "p",
          text: "Dans toute la mesure permise par la loi, aucune Partie ne sera responsable envers l'autre des dommages indirects, accessoires, particuliers, exemplaires ou consécutifs découlant uniquement de la présente Entente, sauf lorsqu'une telle exclusion est interdite par la loi ou incompatible avec une autre obligation expresse.",
        },
      ],
    },
    {
      number: 118,
      heading: "Plafond de responsabilité de FutureTutor",
      blocks: [
        { type: "p", text: "Dans toute la mesure permise par la loi applicable, la responsabilité globale de FutureTutor envers le Tuteur découlant de la présente Entente ne dépassera pas le plus élevé des montants suivants :" },
        {
          type: "ol",
          items: [
            "les montants payés ou payables par FutureTutor au Tuteur par l'entremise de la Plateforme au cours des six mois précédant immédiatement l'événement à l'origine de la réclamation; ou",
            "100 $ CA.",
          ],
        },
      ],
    },
    {
      number: 119,
      heading: "Exceptions au plafond de responsabilité",
      blocks: [
        { type: "p", text: "La limitation qui précède ne s'applique pas lorsque la responsabilité ne peut légalement être limitée ou exclue, notamment lorsque la loi applicable en dispose autrement relativement :" },
        {
          type: "ul",
          items: ["à la fraude;", "à la faute intentionnelle;", "à la négligence grave lorsqu'elle n'est pas exclusible;", "aux lésions corporelles;", "aux droits d'origine législative;", "à toute autre responsabilité à laquelle il ne peut être renoncé."],
        },
        { type: "p", text: "La présente disposition est expressément assujettie à un examen juridique et à la loi provinciale applicable." },
      ],
    },
    {
      number: 120,
      heading: "Règlement de bonne foi",
      partTitle: "Partie XXXIII — Différends",
      blocks: [
        {
          type: "p",
          text: "Avant d'entamer une procédure formelle, les Parties devraient tenter de bonne foi de régler les différends contractuels ordinaires par voie de communication écrite.",
        },
        { type: "p", text: "Cela n'empêche pas le recours à une mesure judiciaire urgente." },
      ],
    },
    {
      number: 121,
      heading: "Coordonnées",
      blocks: [
        { type: "p", text: "Les avis contractuels ou les différends peuvent être transmis à :" },
        { type: "p", text: "legal@futuretutor.ca" },
        { type: "p", text: "FutureTutor pourra offrir un processus de règlement des différends dédié à l'avenir." },
      ],
    },
    {
      number: 122,
      heading: "Aucun arbitrage obligatoire pour le moment",
      blocks: [{ type: "p", text: "La présente Entente n'impose aucun arbitrage privé obligatoire, à moins que les Parties n'y consentent validement par la suite conformément à la loi applicable." }],
    },
    {
      number: 123,
      heading: "Aucune renonciation aux recours collectifs",
      blocks: [
        { type: "p", text: "La présente Entente n'impose aucune renonciation aux recours collectifs." },
        { type: "p", text: "FutureTutor se réserve la possibilité de modifier prospectivement les mécanismes de règlement des différends lorsque la loi le permet et que la modification est dûment acceptée." },
      ],
    },
    {
      number: 124,
      heading: "Droit albertain",
      partTitle: "Partie XXXIV — Loi applicable",
      blocks: [
        {
          type: "p",
          text: "Sous réserve des lois d'ordre public qui s'appliquent malgré un choix contractuel de loi, la présente Entente est régie par les lois de la province de l'Alberta et les lois fédérales du Canada qui y sont applicables.",
        },
      ],
    },
    {
      number: 125,
      heading: "Lois locales d'ordre public",
      blocks: [
        { type: "p", text: "Rien dans la clause de loi applicable albertaine n'écarte les droits ou obligations auxquels il ne peut légalement être dérogé en vertu :" },
        {
          type: "ul",
          items: [
            "des lois d'une autre province;",
            "de la législation en matière d'emploi et de travail;",
            "de la législation sur la protection de la vie privée;",
            "de la législation sur les droits de la personne;",
            "de la législation fiscale;",
            "de la législation en santé et sécurité au travail;",
            "de la législation sur la protection du consommateur, le cas échéant;",
            "d'autres lois d'ordre public.",
          ],
        },
      ],
    },
    {
      number: 126,
      heading: "Tribunaux",
      blocks: [
        {
          type: "p",
          text: "Sous réserve des droits juridictionnels d'ordre public prévus par la loi applicable, les différends qui ne peuvent être réglés à l'amiable peuvent être soumis aux tribunaux compétents de l'Alberta.",
        },
        {
          type: "p",
          text: "Rien dans la présente section n'empêche une Partie de recourir à un tribunal administratif, à un organisme de réglementation, à une autorité fiscale, à un processus de détermination du statut d'emploi ou à tout autre forum que la loi applicable met à sa disposition.",
        },
      ],
    },
    {
      number: 127,
      heading: "Tuteurs du Québec",
      partTitle: "Partie XXXV — Québec",
      blocks: [
        { type: "p", text: "Lorsque le Tuteur réside ou fournit des services au Québec, le droit québécois d'ordre public s'applique dans la mesure requise, malgré la présente Entente." },
        { type: "p", text: "Rien dans la présente Entente ne vise à écarter des droits québécois auxquels il ne peut être renoncé." },
      ],
    },
    {
      number: 128,
      heading: "Version française",
      blocks: [
        { type: "p", text: "FutureTutor entend rendre disponible une version française complète de la présente Entente." },
        {
          type: "p",
          text: "Lorsque le droit québécois exige que la version française d'un contrat d'adhésion soit fournie avant que les Parties ne choisissent une autre langue, FutureTutor fournira la version française conformément aux exigences applicables.",
        },
      ],
    },
    {
      number: 129,
      heading: "Choix de la langue",
      blocks: [
        {
          type: "p",
          text: "Lorsque la loi le prévoit, un Tuteur à qui la version française a d'abord été remise et qui a eu l'occasion de l'examiner peut expressément choisir de conclure la version anglaise, conformément au droit québécois applicable.",
        },
        { type: "p", text: "FutureTutor ne doit pas rendre la version française sensiblement moins favorable que la version anglaise." },
      ],
    },
    {
      number: 130,
      heading: "Modifications futures",
      partTitle: "Partie XXXVI — Modifications de l'Entente",
      blocks: [
        { type: "p", text: "FutureTutor peut mettre à jour la présente Entente pour l'avenir lorsque cela est raisonnablement nécessaire en raison :" },
        { type: "ul", items: ["de changements législatifs;", "de changements à la Plateforme;", "d'exigences du fournisseur de paiement;", "d'exigences de sécurité;", "de nouveaux services;", "de changements d'affaires."] },
      ],
    },
    {
      number: 131,
      heading: "Modifications importantes",
      blocks: [
        { type: "p", text: "Lorsque la loi l'exige ou que les circonstances le justifient, FutureTutor donnera un avis raisonnable des modifications importantes." },
        { type: "p", text: "FutureTutor peut exiger que le Tuteur accepte expressément une Entente sensiblement révisée avant de continuer à recevoir de nouvelles occasions de tutorat." },
        { type: "p", text: "Les modifications ne devraient pas priver rétroactivement le Tuteur d'une rémunération déjà gagnée, sauf lorsque la loi l'exige ou que cela est nécessaire pour corriger une fraude ou une erreur manifeste." },
      ],
    },
    {
      number: 132,
      heading: "Acceptation électronique",
      partTitle: "Partie XXXVII — Entente électronique",
      blocks: [
        { type: "p", text: "Le Tuteur peut accepter la présente Entente par voie électronique." },
        { type: "p", text: "L'acceptation électronique a le même effet contractuel qu'une signature manuscrite, dans la mesure permise par la loi applicable." },
      ],
    },
    {
      number: 133,
      heading: "Dossier d'acceptation",
      blocks: [
        { type: "p", text: "FutureTutor peut conserver des dossiers concernant :" },
        {
          type: "ul",
          items: [
            "l'identité du Tuteur;",
            "la version de l'Entente;",
            "l'horodatage de l'acceptation;",
            "la langue;",
            "les preuves techniques ou d'adresse IP, lorsque cela est approprié et légalement permis;",
            "les dossiers de consentement connexes.",
          ],
        },
        { type: "p", text: "Ces dossiers sont traités conformément à la Politique de confidentialité de FutureTutor." },
      ],
    },
    {
      number: 134,
      heading: "Cession par le Tuteur",
      partTitle: "Partie XXXVIII — Cession",
      blocks: [
        {
          type: "p",
          text: "Le Tuteur ne peut transférer son compte FutureTutor ni céder l'exécution personnelle des services de tutorat acceptés à une autre personne sans l'autorisation de FutureTutor.",
        },
        { type: "p", text: "Cette restriction est nécessaire parce que l'admissibilité et les qualifications du Tuteur sont validées individuellement." },
      ],
    },
    {
      number: 135,
      heading: "Cession par FutureTutor",
      blocks: [
        { type: "p", text: "FutureTutor peut céder la présente Entente dans le cadre :" },
        { type: "ul", items: ["d'une réorganisation d'entreprise;", "d'une fusion;", "d'une acquisition;", "d'un financement;", "de la vente de la quasi-totalité des actifs commerciaux pertinents;", "d'un transfert à une société affiliée;"] },
        { type: "p", text: "sous réserve de la loi applicable." },
      ],
    },
    {
      number: 136,
      heading: "Aucun Tuteur substitut non autorisé",
      partTitle: "Partie XXXIX — Sous-traitance",
      blocks: [
        { type: "p", text: "Le Tuteur doit exécuter personnellement les services de tutorat acceptés, à moins que FutureTutor n'autorise expressément un autre arrangement." },
        { type: "p", text: "Le Tuteur ne doit pas envoyer un remplaçant non vérifié auprès d'un Élève." },
        {
          type: "p",
          text: "Cette restriction protège la sécurité des Élèves, la vérification des qualifications et la vie privée, et n'autorise pas FutureTutor à contrôler l'entreprise indépendante du Tuteur en dehors de FutureTutor.",
        },
      ],
    },
    {
      number: 137,
      heading: "Force majeure",
      partTitle: "Partie XL — Force majeure",
      blocks: [
        { type: "p", text: "Aucune Partie ne sera responsable d'un défaut d'exécution causé par des circonstances raisonnablement hors de son contrôle, sous réserve de la loi applicable." },
        { type: "p", text: "En voici des exemples :" },
        { type: "ul", items: ["les intempéries graves;", "les catastrophes naturelles;", "les pannes majeures d'infrastructure;", "les restrictions gouvernementales;", "les défaillances généralisées des communications;", "les urgences graves."] },
        { type: "p", text: "La Partie touchée devrait donner un avis raisonnable lorsque cela est possible." },
      ],
    },
    {
      number: 138,
      heading: "Avis électroniques",
      partTitle: "Partie XLI — Avis",
      blocks: [
        { type: "p", text: "FutureTutor peut transmettre les avis contractuels par :" },
        { type: "ul", items: ["courriel;", "le tableau de bord du Tuteur;", "les notifications de la Plateforme;", "d'autres moyens électroniques permis par la loi."] },
        { type: "p", text: "Le Tuteur est responsable de maintenir des coordonnées exactes." },
      ],
    },
    {
      number: 139,
      heading: "Avis à FutureTutor",
      blocks: [
        { type: "p", text: "Les avis juridiques formels peuvent être envoyés à :" },
        { type: "p", text: "FYRA SERVICES INC.\n8830 62e Ave NW\nEdmonton, Alberta T6E 0C8\nCanada" },
        { type: "p", text: "Courriel :\nlegal@futuretutor.ca" },
      ],
    },
    {
      number: 140,
      heading: "Entente complète",
      partTitle: "Partie XLII — Dispositions générales",
      blocks: [
        {
          type: "p",
          text: "La présente Entente, ainsi que les documents qui y sont expressément incorporés, constitue l'entente entre FutureTutor et le Tuteur relativement à la prestation de services de tutorat par le Tuteur par l'entremise de FutureTutor.",
        },
      ],
    },
    {
      number: 141,
      heading: "Ordre de préséance",
      blocks: [
        { type: "p", text: "En cas de conflit entre les documents, l'ordre suivant devrait s'appliquer, sauf mention expresse contraire :" },
        {
          type: "ol",
          items: [
            "la loi applicable d'ordre public;",
            "les conditions écrites propres à une Réservation visant une opération donnée;",
            "la présente Entente de tuteur;",
            "les Conditions d'utilisation de FutureTutor;",
            "les politiques applicables de la Plateforme.",
          ],
        },
        { type: "p", text: "Les propres ententes de Stripe régissent de façon indépendante la relation du Tuteur avec Stripe." },
      ],
    },
    {
      number: 142,
      heading: "Divisibilité",
      blocks: [
        {
          type: "p",
          text: "Si une disposition est jugée inexécutoire, elle sera interprétée ou retranchée uniquement dans la mesure nécessaire, et les autres dispositions demeureront en vigueur dans la mesure permise par la loi.",
        },
      ],
    },
    {
      number: 143,
      heading: "Absence de renonciation",
      blocks: [{ type: "p", text: "Le défaut de faire respecter une disposition à une occasion donnée n'emporte pas automatiquement renonciation au droit de FutureTutor ou du Tuteur de la faire respecter ultérieurement." }],
    },
    {
      number: 144,
      heading: "Titres",
      blocks: [{ type: "p", text: "Les titres sont fournis par souci de commodité et ne déterminent pas à eux seuls l'interprétation juridique." }],
    },
    {
      number: 145,
      heading: "Survie",
      blocks: [
        { type: "p", text: "Les dispositions relatives :" },
        {
          type: "ul",
          items: [
            "à la rémunération gagnée;",
            "aux taxes et impôts;",
            "à la confidentialité;",
            "à la protection de la vie privée;",
            "à la propriété intellectuelle;",
            "à la fraude;",
            "à l'indemnisation;",
            "à la responsabilité;",
            "aux différends;",
            "à la loi applicable;",
            "aux obligations destinées par leur nature à survivre",
          ],
        },
        { type: "p", text: "continuent de s'appliquer après la résiliation, selon le cas." },
      ],
    },
    {
      number: 146,
      heading: "Reconnaissance d'entreprise indépendante",
      partTitle: "Partie XLIII — Reconnaissances du Tuteur",
      blocks: [
        {
          type: "p",
          text: "Le Tuteur reconnaît l'intention des Parties selon laquelle il exerce à titre de prestataire de services indépendant, sous réserve en tout temps de la qualification juridique découlant de la relation réelle et de la loi applicable.",
        },
        { type: "p", text: "Le Tuteur reconnaît que FutureTutor ne garantit ni travail ni gains." },
      ],
    },
    {
      number: 147,
      heading: "Liberté de travailler ailleurs",
      blocks: [{ type: "p", text: "Le Tuteur reconnaît que la présente Entente ne lui interdit généralement pas de travailler ailleurs ni d'exploiter sa propre entreprise de tutorat indépendante." }],
    },
    {
      number: 148,
      heading: "Acceptation des occasions",
      blocks: [
        { type: "p", text: "Le Tuteur reconnaît qu'il détermine généralement s'il souhaite se rendre disponible et s'il accepte chaque occasion de tutorat." },
        { type: "p", text: "Une fois qu'il accepte une Réservation confirmée, le Tuteur assume les obligations contractuelles qui s'y rattachent." },
      ],
    },
    {
      number: 149,
      heading: "Reconnaissance relative à la rémunération",
      blocks: [
        { type: "p", text: "Le Tuteur reconnaît que :" },
        {
          type: "ul",
          items: [
            "FutureTutor détermine la tarification client;",
            "FutureTutor détermine la rémunération offerte au Tuteur selon ses règles de rémunération applicables;",
            "le prix client et la rémunération du Tuteur sont distincts;",
            "le Tuteur voit ou est informé de la rémunération applicable avant d'accepter;",
            "FutureTutor peut conserver la différence entre le prix client et la rémunération du Tuteur.",
          ],
        },
      ],
    },
    {
      number: 150,
      heading: "Reconnaissance fiscale",
      blocks: [{ type: "p", text: "Le Tuteur reconnaît qu'il lui incombe de déterminer ses propres obligations en matière de fiscalité, d'immatriculation et de déclaration, sous réserve de la loi applicable." }],
    },
    {
      number: 151,
      heading: "Reconnaissance en matière de sécurité",
      blocks: [{ type: "p", text: "Le Tuteur reconnaît que le tutorat peut impliquer des mineurs et accepte de se conformer aux exigences de FutureTutor en matière de sécurité des enfants, de protection de la vie privée et de limites professionnelles." }],
    },
    {
      number: 152,
      heading: "Reconnaissance en matière de vie privée",
      blocks: [
        { type: "p", text: "Le Tuteur reconnaît avoir eu accès :" },
        { type: "ul", items: ["à la Politique de confidentialité de FutureTutor;", "à la Politique sur les témoins de FutureTutor;", "aux exigences applicables en matière de vie privée pertinentes pour les Tuteurs."] },
      ],
    },
    {
      number: 153,
      heading: "Reconnaissance relative à Stripe",
      blocks: [
        { type: "p", text: "Lorsque le Tuteur utilise Stripe Connect, il reconnaît que les services de paiement et de versement sont également régis par les ententes Stripe applicables." },
        { type: "p", text: "Le Tuteur accepte de compléter l'intégration Stripe requise et de fournir des renseignements exacts." },
      ],
    },
    {
      number: 154,
      heading: "Entente",
      partTitle: "Partie XLIV — Signature et acceptation",
      blocks: [
        {
          type: "p",
          text: "EN SÉLECTIONNANT « J'ACCEPTE », « ACCEPTER », « DEVENIR TUTEUR » OU UN MÉCANISME D'ACCEPTATION ÉLECTRONIQUE ÉQUIVALENT, OU EN CONTINUANT DE FOURNIR DES SERVICES DE TUTORAT APRÈS AVOIR VALIDEMENT ACCEPTÉ LA PRÉSENTE ENTENTE, LE TUTEUR CONFIRME QUE :",
        },
        {
          type: "ul",
          items: [
            "le Tuteur a lu la présente Entente;",
            "le Tuteur a eu l'occasion de l'examiner avant de l'accepter;",
            "le Tuteur en comprend les conditions importantes;",
            "le Tuteur accepte d'y être lié;",
            "le Tuteur a eu accès aux politiques incorporées applicables;",
            "le Tuteur a le pouvoir de conclure l'Entente;",
            "les renseignements fournis à FutureTutor sont exacts pour l'essentiel.",
          ],
        },
        { type: "p", text: "Lorsque la loi applicable exige un consentement ou une reconnaissance distincte, la présente acceptation générale ne remplace pas cette exigence." },
      ],
    },
    {
      number: 155,
      heading: "FutureTutor",
      partTitle: "Partie XLV — Coordonnées",
      blocks: [
        { type: "p", text: "FutureTutor\nDétenue et exploitée par FYRA SERVICES INC." },
        { type: "p", text: "8830 62e Ave NW\nEdmonton, Alberta T6E 0C8\nCanada" },
        { type: "p", text: "Affaires juridiques : legal@futuretutor.ca\nConfidentialité : legal@futuretutor.ca\nSite Web : futuretutor.ca" },
      ],
    },
    {
      number: 156,
      heading: "Date d'entrée en vigueur",
      partTitle: "Partie XLVI — Date d'entrée en vigueur",
      blocks: [
        { type: "p", text: "La présente Entente de prestataire de services indépendant pour les tuteurs entre en vigueur le :" },
        { type: "p", text: "30 août 2026" },
        { type: "p", text: "Dernière mise à jour :" },
        { type: "p", text: "30 août 2026" },
      ],
    },
    {
      number: 157,
      heading: "Code de conduite du Tuteur",
      partTitle: "Annexe A — Code de conduite du Tuteur",
      blocks: [
        { type: "p", text: "La présente Annexe fait partie intégrante de l'Entente." },
        { type: "p", text: "Le Tuteur accepte :" },
        {
          type: "ul",
          items: [
            "d'arriver à l'heure;",
            "d'offrir un tutorat professionnel;",
            "de maintenir des limites appropriées;",
            "de protéger la vie privée des Élèves;",
            "de respecter les règles de sécurité des enfants;",
            "de maintenir l'intégrité scolaire;",
            "de consigner la présence avec exactitude;",
            "de respecter les Parents et les tuteurs légaux;",
            "de respecter la diversité des Élèves;",
            "d'éviter le harcèlement et la discrimination;",
            "de protéger les adresses exactes de tutorat;",
            "de protéger les Instructions d'arrivée;",
            "d'utiliser les fonctionnalités de la Classe virtuelle de façon appropriée;",
            "d'éviter tout enregistrement non autorisé;",
            "d'éviter le contournement des paiements;",
            "d'éviter les évaluations ou les Réservations frauduleuses;",
            "de signaler les incidents de sécurité graves;",
            "de maintenir l'exactitude de ses qualifications;",
            "de protéger les identifiants de son compte Tuteur;",
            "de se conformer à la loi applicable.",
          ],
        },
        { type: "p", text: "Une violation grave peut entraîner une suspension ou une résiliation immédiate." },
      ],
    },
    {
      number: 158,
      heading: "Norme de sécurité des enfants",
      partTitle: "Annexe B — Norme de sécurité des enfants",
      blocks: [
        { type: "p", text: "Le Tuteur doit :" },
        {
          type: "ul",
          items: [
            "Maintenir des limites professionnelles. La relation de tutorat doit demeurer éducative et professionnellement appropriée.",
            "Éviter les communications secrètes. Le Tuteur ne doit pas demander à un mineur de dissimuler des communications à un parent ou tuteur légal.",
            "Éviter les rencontres non autorisées. Le Tuteur ne doit pas organiser de rencontres privées avec des mineurs en dehors des arrangements de tutorat autorisés à des fins inappropriées.",
            "Ne jamais avoir de comportement sexuel ou amoureux.",
            "Ne jamais demander d'images intimes.",
            "Ne jamais se livrer à du leurre ou à de l'exploitation.",
            "Ne jamais recourir aux punitions corporelles.",
            "Ne jamais transporter un Élève à titre de service FutureTutor, à moins que FutureTutor n'introduise et n'autorise expressément une telle fonctionnalité.",
            "Respecter la participation autorisée du parent ou du tuteur légal.",
            "Signaler les préoccupations sérieuses en matière de sécurité.",
          ],
        },
        { type: "p", text: "Lorsque la loi applicable impose une obligation de signalement obligatoire, il incombe au Tuteur de s'y conformer." },
      ],
    },
    {
      number: 159,
      heading: "Norme de tutorat en personne",
      partTitle: "Annexe C — Norme de tutorat en personne",
      blocks: [
        { type: "p", text: "Pour les Réservations en personne :" },
        { type: "p", text: "Avant la confirmation" },
        { type: "p", text: "Le Tuteur peut ne recevoir que des renseignements de localisation approximatifs." },
        { type: "p", text: "Après la confirmation faisant autorité" },
        { type: "p", text: "Le Tuteur autorisé peut recevoir :" },
        { type: "ul", items: ["l'adresse exacte du tutorat;", "les Instructions d'arrivée;", "les renseignements nécessaires sur l'Élève ou le tuteur légal."] },
        { type: "p", text: "Le Tuteur doit :" },
        {
          type: "ul",
          items: [
            "n'utiliser le lieu que pour la Réservation;",
            "en préserver la confidentialité;",
            "ne pas le partager;",
            "ne pas le publier;",
            "ne pas retourner à la résidence sans autorisation;",
            "ne pas conserver les renseignements de localisation privés plus longtemps que raisonnablement nécessaire;",
            "respecter les limites du ménage;",
            "quitter les lieux une fois l'activité de tutorat autorisée terminée.",
          ],
        },
      ],
    },
    {
      number: 160,
      heading: "Norme de la Classe virtuelle",
      partTitle: "Annexe D — Norme de la Classe virtuelle",
      blocks: [
        { type: "p", text: "Le Tuteur doit :" },
        {
          type: "ul",
          items: [
            "utiliser la classe de façon professionnelle;",
            "protéger la vie privée des Élèves;",
            "utiliser la caméra et le microphone de façon responsable;",
            "ne partager à l'écran que du matériel approprié;",
            "éviter d'exposer le contenu privé de son bureau;",
            "respecter les observateurs autorisés;",
            "ne pas contourner les restrictions applicables aux observateurs;",
            "ne pas enregistrer les séances de façon autonome sans autorisation et sans le consentement exigé par la loi;",
            "ne pas partager de jetons d'accès ni de liens de séance privés;",
            "signaler les problèmes de sécurité.",
          ],
        },
      ],
    },
    {
      number: 161,
      heading: "Principes de rémunération",
      partTitle: "Annexe E — Principes de rémunération",
      blocks: [
        { type: "p", text: "Sauf disposition expresse contraire d'une Réservation :" },
        {
          type: "ul",
          items: [
            "FutureTutor détermine le prix client.",
            "FutureTutor détermine de façon indépendante la rémunération du Tuteur.",
            "Le Tuteur voit ou reçoit la rémunération applicable avant d'accepter.",
            "Le Tuteur peut refuser une occasion.",
            "L'acceptation crée un engagement à l'égard des règles de rémunération affichées.",
            "Le prix client ne constitue pas le revenu brut du Tuteur.",
            "FutureTutor peut conserver son écart.",
            "La rémunération du Tuteur peut être touchée par les règles légitimes d'annulation ou d'absence.",
            "Les séances frauduleuses ne sont pas payables.",
            "Les séances valides et complétées sont payables, sous réserve des exigences du fournisseur de paiement et des exigences légales.",
            "FutureTutor peut conserver des instantanés immuables de la rémunération d'une Réservation.",
            "Les modifications futures des règles de rémunération ne modifient pas ordinairement de façon rétroactive les Réservations confirmées.",
          ],
        },
      ],
    },
    {
      number: 162,
      heading: "Principes d'indépendance du Tuteur",
      partTitle: "Annexe F — Principes d'indépendance du Tuteur",
      blocks: [
        { type: "p", text: "Les Parties entendent que la relation s'exerce de façon compatible avec une prestation de services indépendante." },
        { type: "p", text: "En conséquence, sous réserve des exigences de sécurité et de qualité de la Plateforme :" },
        {
          type: "ul",
          items: [
            "FutureTutor ne garantit aucun travail;",
            "le Tuteur n'a aucune obligation générale d'heures minimales;",
            "le Tuteur choisit sa disponibilité;",
            "le Tuteur peut généralement refuser des occasions;",
            "le Tuteur peut travailler ailleurs;",
            "le Tuteur peut exploiter une entreprise de tutorat indépendante;",
            "le Tuteur fournit ordinairement son propre équipement;",
            "le Tuteur assume les dépenses d'entreprise indépendantes ordinaires;",
            "le Tuteur est responsable de ses obligations fiscales applicables à titre de travailleur indépendant;",
            "le Tuteur conserve une discrétion pédagogique raisonnable;",
            "le Tuteur n'est pas autorisé à lier FutureTutor;",
            "les normes de qualité et de sécurité de FutureTutor ne créent pas, à elles seules, une intention d'emploi.",
          ],
        },
        {
          type: "p",
          text: "Les Parties reconnaissent que les autorités compétentes et les tribunaux déterminent le statut juridique en fonction de la relation réelle et de la loi applicable, et non uniquement de la présente Annexe.",
        },
      ],
    },
  ],
};
