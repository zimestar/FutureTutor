import type { LegalDocumentContent } from "./types";

/** FG-LEGAL1C — traduction française complète et fidèle de la Politique sur
 * les témoins approuvée par le Product Owner (voir cookieContent.en.ts).
 * Demeure assujettie à un examen juridique canadien externe final. La
 * terminologie suit celle déjà établie dans termsContent.fr.ts et
 * privacyContent.fr.ts (« Témoins (cookies) », « Politique sur les
 * témoins », déjà référencée depuis la Politique de confidentialité). */
export const cookieContentFr: LegalDocumentContent = {
  effectiveDate: "30 août 2026",
  lastUpdated: "30 août 2026",
  sections: [
    {
      number: 1,
      heading: "Qu'est-ce qu'un témoin (cookie)?",
      blocks: [
        {
          type: "p",
          text: "FutureTutor est une place de marché de tutorat détenue et exploitée par FYRA SERVICES INC., une société constituée sous le régime fédéral au Canada.",
        },
        {
          type: "p",
          text: "La présente Politique sur les témoins explique comment FYRA SERVICES INC., exerçant ses activités sous le nom FutureTutor (« FutureTutor », « nous », « notre » ou « nos »), utilise des témoins et des technologies similaires lorsque vous accédez au site Web, à l'application Web, à l'application Web progressive, à la place de marché de tutorat et aux services connexes de FutureTutor (collectivement, la « Plateforme »).",
        },
        {
          type: "p",
          text: "La présente Politique sur les témoins doit être lue conjointement avec notre Politique de confidentialité et nos Conditions d'utilisation.",
        },
        {
          type: "p",
          text: "Les témoins sont de petits renseignements que les sites Web et les applications Web peuvent enregistrer sur le navigateur ou l'appareil d'un utilisateur.",
        },
        {
          type: "p",
          text: "Les témoins peuvent remplir des fonctions telles que se souvenir qu'un utilisateur est connecté, maintenir une session sécurisée, mémoriser des préférences ou aider un site Web à fonctionner correctement.",
        },
        {
          type: "p",
          text: "Le Commissariat à la protection de la vie privée du Canada décrit les témoins comme de petits fragments de texte déposés sur l'ordinateur d'un utilisateur qui peuvent conserver des renseignements d'une visite à l'autre, y compris des préférences et des fonctionnalités liées à la connexion.",
        },
        {
          type: "p",
          text: "Certains témoins sont nécessaires au fonctionnement d'un service. D'autres peuvent être utilisés à des fins telles que l'analytique, la personnalisation, la publicité ou le suivi.",
        },
        {
          type: "p",
          text: "FutureTutor ne traite pas tous les témoins comme ayant le même objet ou la même incidence sur la vie privée.",
        },
      ],
    },
    {
      number: 2,
      heading: "Technologies similaires",
      blocks: [
        {
          type: "p",
          text: "En plus des témoins HTTP traditionnels, la Plateforme peut utiliser des technologies de navigateur ou d'appareil similaires, notamment :",
        },
        {
          type: "ul",
          items: [
            "le stockage local (local storage);",
            "le stockage de session (session storage);",
            "les jetons ou identifiants d'authentification;",
            "les préférences fondées sur le navigateur;",
            "les identifiants de sécurité;",
            "l'état temporaire de l'application;",
            "d'autres technologies nécessaires à l'exploitation de la Plateforme.",
          ],
        },
        {
          type: "p",
          text: "Par souci de simplicité, la présente Politique sur les témoins peut désigner collectivement ces technologies par les termes « Témoins » ou « témoins et technologies similaires ».",
        },
      ],
    },
    {
      number: 3,
      heading: "Notre approche actuelle",
      partTitle: "Partie I — Comment FutureTutor utilise les témoins",
      blocks: [
        {
          type: "p",
          text: "FutureTutor utilise actuellement, ou peut utiliser, des témoins et des technologies similaires principalement pour assurer les aspects essentiels ou fonctionnels de la Plateforme.",
        },
        { type: "p", text: "Ces technologies peuvent être utilisées à des fins telles que :" },
        {
          type: "ul",
          items: [
            "authentifier les utilisateurs;",
            "maintenir des sessions de connexion sécurisées;",
            "protéger les comptes;",
            "prévenir les accès non autorisés;",
            "maintenir l'état de l'application;",
            "mémoriser les préférences de langue ou de localisation;",
            "appuyer les contrôles de sécurité;",
            "orienter les utilisateurs de manière appropriée;",
            "prendre en charge l'application Web progressive;",
            "permettre les fonctionnalités essentielles de la Plateforme.",
          ],
        },
        {
          type: "p",
          text: "FutureTutor n'a pas actuellement l'intention d'utiliser des témoins à des fins de publicité comportementale ou de reciblage.",
        },
        {
          type: "p",
          text: "FutureTutor ne représente pas actuellement utiliser des témoins publicitaires tiers.",
        },
        {
          type: "p",
          text: "FutureTutor ne représente pas actuellement utiliser des technologies d'analytique comportementale tierces, sauf si de telles technologies sont expressément mises en œuvre et divulguées.",
        },
      ],
    },
    {
      number: 4,
      heading: "Témoins strictement nécessaires",
      blocks: [
        {
          type: "p",
          text: "Les témoins strictement nécessaires et les technologies similaires servent à assurer des fonctions sans lesquelles la Plateforme ne pourrait pas fonctionner correctement ou en toute sécurité.",
        },
        { type: "p", text: "Ils peuvent être utilisés pour :" },
        {
          type: "ul",
          items: [
            "l'authentification des utilisateurs;",
            "le maintien des sessions connectées;",
            "la sécurité des comptes;",
            "la prévention de la fraude ou des abus;",
            "l'autorisation;",
            "l'orientation (routing);",
            "la gestion de la charge ou de l'état de l'application;",
            "les protections de sécurité;",
            "la gestion des préférences juridiques ou relatives à la vie privée, le cas échéant.",
          ],
        },
        { type: "p", text: "La désactivation de ces technologies peut empêcher certaines parties de FutureTutor de fonctionner correctement." },
      ],
    },
    {
      number: 5,
      heading: "Technologies d'authentification et de session",
      blocks: [
        {
          type: "p",
          text: "FutureTutor utilise des technologies d'authentification et de session pour reconnaître les utilisateurs authentifiés et maintenir un accès sécurisé à leurs comptes.",
        },
        { type: "p", text: "Ces technologies peuvent aider FutureTutor à déterminer :" },
        {
          type: "ul",
          items: [
            "si un utilisateur est connecté;",
            "quel compte est actuellement authentifié;",
            "si une session demeure valide;",
            "si l'accès à une zone protégée est autorisé;",
            "si un utilisateur doit s'authentifier de nouveau.",
          ],
        },
        { type: "p", text: "FutureTutor utilise actuellement Auth.js dans le cadre de son architecture d'authentification." },
        {
          type: "p",
          text: "Les témoins ou jetons liés à l'authentification ne devraient pas être utilisés par FutureTutor à des fins de publicité comportementale.",
        },
      ],
    },
    {
      number: 6,
      heading: "Technologies de sécurité",
      blocks: [
        {
          type: "p",
          text: "FutureTutor peut utiliser des témoins, des jetons, des identifiants ou des mécanismes similaires pour appuyer la sécurité de la Plateforme.",
        },
        { type: "p", text: "Ces technologies peuvent contribuer à :" },
        {
          type: "ul",
          items: [
            "l'authentification;",
            "l'intégrité des sessions;",
            "la validation des requêtes;",
            "la protection contre les accès non autorisés;",
            "la détection d'activités suspectes;",
            "la protection des comptes;",
            "l'état lié à la sécurité.",
          ],
        },
        {
          type: "p",
          text: "Les technologies de sécurité visent à protéger FutureTutor et ses utilisateurs plutôt qu'à créer des profils publicitaires.",
        },
      ],
    },
    {
      number: 7,
      heading: "Langue et localisation",
      partTitle: "Partie II — Préférences et fonctionnalités",
      blocks: [
        { type: "p", text: "FutureTutor est une Plateforme bilingue anglais/français." },
        { type: "p", text: "Des témoins ou des technologies fondées sur le navigateur peuvent être utilisés pour mémoriser :" },
        {
          type: "ul",
          items: ["la langue préférée;", "la localisation (locale);", "l'orientation linguistique;", "les préférences d'interface connexes."],
        },
        { type: "p", text: "Cela permet à la Plateforme d'offrir une expérience plus cohérente en anglais ou en français." },
      ],
    },
    {
      number: 8,
      heading: "Préférences d'application",
      blocks: [
        {
          type: "p",
          text: "FutureTutor peut utiliser le stockage de navigateur ou des technologies similaires pour mémoriser des préférences d'application limitées, lorsque cela est pris en charge.",
        },
        { type: "p", text: "Les exemples peuvent comprendre :" },
        {
          type: "ul",
          items: ["les préférences d'affichage;", "l'état temporaire de l'interface;", "l'état lié à l'installation;", "les options non sensibles précédemment sélectionnées."],
        },
        {
          type: "p",
          text: "FutureTutor ne devrait pas utiliser le stockage de préférences comme moyen de créer secrètement des profils comportementaux.",
        },
      ],
    },
    {
      number: 9,
      heading: "L'application Web progressive de FutureTutor",
      partTitle: "Partie III — Application Web progressive",
      blocks: [
        { type: "p", text: "FutureTutor peut être installée sur les appareils pris en charge à titre d'application Web progressive (« PWA »)." },
        {
          type: "p",
          text: "La PWA offre une expérience de type application tout en continuant d'utiliser l'architecture d'application Web de FutureTutor.",
        },
        {
          type: "p",
          text: "L'existence de la PWA ne signifie pas en soi que FutureTutor suit continuellement l'appareil ou la localisation d'un utilisateur.",
        },
      ],
    },
    {
      number: 10,
      heading: "Mise en cache hors ligne",
      blocks: [
        {
          type: "p",
          text: "FutureTutor ne met pas actuellement en œuvre intentionnellement une architecture de mise en cache hors ligne agressive pour les données de compte privées.",
        },
        {
          type: "p",
          text: "FutureTutor n'utilise pas actuellement de service worker comme couche de mise en cache de données privées à usage général.",
        },
        {
          type: "p",
          text: "Si cette architecture change de manière importante à l'avenir, FutureTutor examinera les incidences sur la vie privée et mettra à jour les avis applicables, le cas échéant.",
        },
      ],
    },
    {
      number: 11,
      heading: "Localisation et témoins",
      partTitle: "Partie IV — Localisation",
      blocks: [
        {
          type: "p",
          text: "FutureTutor prend en charge le tutorat en personne, mais FutureTutor n'exige pas actuellement un suivi GPS continu pour le fonctionnement ordinaire du tutorat.",
        },
        {
          type: "p",
          text: "La Plateforme peut traiter des renseignements de localisation que les utilisateurs fournissent manuellement, comme une adresse de tutorat en personne.",
        },
        {
          type: "p",
          text: "Ces renseignements sont régis principalement par la Politique de confidentialité de FutureTutor plutôt que recueillis au moyen de témoins publicitaires ou de suivi.",
        },
      ],
    },
    {
      number: 12,
      heading: "Géolocalisation de l'appareil",
      blocks: [
        {
          type: "p",
          text: "FutureTutor n'utilise pas actuellement de témoins pour suivre continuellement l'emplacement physique des utilisateurs.",
        },
        {
          type: "p",
          text: "Si FutureTutor introduit la géolocalisation par navigateur ou par appareil à l'avenir, elle fournira un avis approprié et demandera une permission ou un consentement lorsque requis.",
        },
        {
          type: "p",
          text: "Pour les utilisateurs du Québec, FutureTutor tiendra compte des exigences applicables relatives aux technologies comportant des fonctions d'identification, de localisation ou de profilage.",
        },
        {
          type: "p",
          text: "La Commission d'accès à l'information du Québec indique que les organisations qui utilisent des technologies comportant des fonctions d'identification, de localisation ou de profilage doivent informer les personnes concernées de l'utilisation de ces technologies et des moyens offerts pour activer ces fonctions; ces fonctions ne devraient pas être activées par défaut.",
        },
      ],
    },
    {
      number: 13,
      heading: "Position actuelle en matière d'analytique",
      partTitle: "Partie V — Analytique",
      blocks: [
        {
          type: "p",
          text: "FutureTutor peut traiter des renseignements techniques limités au moyen de sa propre infrastructure applicative à des fins telles que :",
        },
        {
          type: "ul",
          items: ["le dépannage;", "la performance de l'application;", "la sécurité;", "la fiabilité;", "le diagnostic d'erreurs;", "la surveillance opérationnelle."],
        },
        { type: "p", text: "Cela n'implique pas nécessairement des témoins d'analytique tiers." },
        {
          type: "p",
          text: "À la date d'entrée en vigueur de la présente Politique, FutureTutor ne représente pas utiliser des technologies d'analytique comportementale tierces, sauf si elles sont réellement mises en œuvre et divulguées.",
        },
      ],
    },
    {
      number: 14,
      heading: "Services d'analytique futurs",
      blocks: [
        { type: "p", text: "FutureTutor peut introduire des services d'analytique respectueux de la vie privée à l'avenir." },
        {
          type: "p",
          text: "Avant d'introduire des technologies d'analytique qui élargissent de manière importante le suivi ou le traitement de renseignements personnels, FutureTutor évaluera :",
        },
        {
          type: "ul",
          items: [
            "quels renseignements sont recueillis;",
            "pourquoi ils sont recueillis;",
            "si cela est nécessaire;",
            "si un consentement est requis;",
            "si les utilisateurs devraient pouvoir refuser;",
            "si la présente Politique sur les témoins ou la Politique de confidentialité doit être mise à jour.",
          ],
        },
        {
          type: "p",
          text: "Lorsqu'un consentement est requis, FutureTutor demandera le consentement approprié avant d'activer la technologie concernée.",
        },
      ],
    },
    {
      number: 15,
      heading: "Publicité comportementale",
      partTitle: "Partie VI — Publicité et reciblage",
      blocks: [
        { type: "p", text: "FutureTutor n'utilise pas actuellement de témoins à des fins de publicité comportementale." },
        { type: "p", text: "FutureTutor n'utilise pas actuellement les renseignements personnels des enfants à des fins de publicité comportementale." },
      ],
    },
    {
      number: 16,
      heading: "Reciblage",
      blocks: [
        {
          type: "p",
          text: "FutureTutor n'utilise pas actuellement de témoins ou de pixels de reciblage pour suivre les utilisateurs sur des sites Web non liés à des fins publicitaires.",
        },
        { type: "p", text: "Si cela change, FutureTutor mettra à jour la présente Politique et mettra en œuvre les contrôles de consentement appropriés, lorsque requis." },
      ],
    },
    {
      number: 17,
      heading: "Plateformes publicitaires",
      blocks: [
        {
          type: "p",
          text: "À la date d'entrée en vigueur de la présente Politique, FutureTutor ne représente pas que des technologies telles que les suivantes sont actives sur la Plateforme :",
        },
        {
          type: "ul",
          items: ["le pixel Meta;", "le pixel TikTok;", "les balises Google à vocation publicitaire;", "le LinkedIn Insight Tag;", "d'autres pixels de publicité comportementale."],
        },
        {
          type: "p",
          text: "Si une telle technologie est introduite, la présente Politique devra être mise à jour avant ou au moment de sa mise en service, conformément au droit applicable.",
        },
      ],
    },
    {
      number: 18,
      heading: "Technologies tierces",
      partTitle: "Partie VII — Services tiers",
      blocks: [
        { type: "p", text: "FutureTutor fait appel à des fournisseurs de services tiers pour exploiter certaines parties de la Plateforme." },
        {
          type: "p",
          text: "Ces fournisseurs peuvent utiliser leurs propres témoins, jetons, technologies de navigateur ou autres mécanismes techniques, lorsque nécessaire pour fournir leurs services.",
        },
        { type: "p", text: "Les fournisseurs actuels comprennent :" },
        {
          type: "ul",
          items: [
            "Stripe — paiements et infrastructure de versement aux Tuteurs;",
            "Daily — infrastructure de la Classe virtuelle/vidéo;",
            "Resend — livraison de courriels transactionnels;",
            "Railway — hébergement de l'application/infrastructure;",
            "Supabase — infrastructure de base de données.",
          ],
        },
        {
          type: "p",
          text: "Le simple recours à un fournisseur de services ne signifie pas nécessairement que ce fournisseur dépose un témoin sur l'appareil de chaque utilisateur de FutureTutor.",
        },
      ],
    },
    {
      number: 19,
      heading: "Stripe",
      blocks: [
        { type: "p", text: "FutureTutor utilise Stripe pour le traitement des paiements et l'infrastructure financière connexe." },
        {
          type: "p",
          text: "Lorsqu'un utilisateur interagit avec les fonctionnalités de paiement, Stripe peut traiter des renseignements techniques ou utiliser des technologies nécessaires pour :",
        },
        {
          type: "ul",
          items: ["traiter les transactions;", "authentifier l'activité de paiement;", "prévenir la fraude;", "assurer la sécurité;", "se conformer aux obligations légales."],
        },
        { type: "p", text: "Les propres pratiques de confidentialité de Stripe peuvent s'appliquer aux renseignements qu'elle traite de manière indépendante." },
      ],
    },
    {
      number: 20,
      heading: "Daily",
      blocks: [
        { type: "p", text: "FutureTutor utilise actuellement Daily pour fournir la technologie de la Classe virtuelle." },
        {
          type: "p",
          text: "Daily peut utiliser des identifiants techniques ou d'autres technologies nécessaires pour établir et maintenir les séances de tutorat en ligne.",
        },
        { type: "p", text: "FutureTutor n'utilise pas la Classe virtuelle comme mécanisme de publicité comportementale." },
      ],
    },
    {
      number: 21,
      heading: "Resend",
      blocks: [
        { type: "p", text: "FutureTutor utilise actuellement Resend pour la livraison de courriels transactionnels." },
        {
          type: "p",
          text: "Le fait que Resend participe à l'envoi d'un courriel ne signifie pas nécessairement que FutureTutor dépose un témoin de suivi sur l'appareil du destinataire.",
        },
        {
          type: "p",
          text: "FutureTutor devrait évaluer séparément toute fonctionnalité de suivi des courriels si une telle fonctionnalité est activée à l'avenir.",
        },
      ],
    },
    {
      number: 22,
      heading: "Railway et Supabase",
      blocks: [
        { type: "p", text: "FutureTutor utilise Railway et Supabase comme composantes de son infrastructure applicative et de données." },
        {
          type: "p",
          text: "Ces fournisseurs d'infrastructure peuvent traiter des renseignements techniques nécessaires pour héberger, sécuriser, connecter ou exploiter la Plateforme.",
        },
        {
          type: "p",
          text: "Leur présence ne signifie pas nécessairement qu'ils déposent des témoins publicitaires indépendants sur les appareils des utilisateurs.",
        },
      ],
    },
    {
      number: 23,
      heading: "Vie privée des enfants",
      partTitle: "Partie VIII — Enfants",
      blocks: [
        { type: "p", text: "FutureTutor offre des services de tutorat qui peuvent concerner des mineurs." },
        { type: "p", text: "FutureTutor cherche à appliquer des protections accrues en matière de vie privée aux enfants et aux jeunes." },
        {
          type: "p",
          text: "Les témoins ou technologies similaires ne devraient pas être utilisés par FutureTutor pour créer des profils publicitaires comportementaux d'enfants.",
        },
      ],
    },
    {
      number: 24,
      heading: "Enfants de moins de 13 ans",
      blocks: [
        {
          type: "p",
          text: "Le cadre général de confidentialité de FutureTutor exige généralement que les enfants de moins de 13 ans utilisent la Plateforme par l'intermédiaire d'un Parent ou d'un tuteur légal autorisé.",
        },
        {
          type: "p",
          text: "Les pratiques relatives aux témoins et aux technologies similaires touchant les comptes gérés par un tuteur doivent demeurer conformes aux protections décrites dans la Politique de confidentialité de FutureTutor.",
        },
        {
          type: "p",
          text: "Pour le Québec en particulier, les règles applicables aux mineurs doivent également être respectées. La Commission d'accès à l'information indique que, pour un mineur de moins de 14 ans, le consentement à l'utilisation ou à la communication de renseignements personnels est généralement donné par le parent ou le titulaire de l'autorité parentale, sous réserve des exceptions prévues par la loi.",
        },
      ],
    },
    {
      number: 25,
      heading: "Consentement",
      partTitle: "Partie IX — Consentement et choix relatifs aux témoins",
      blocks: [
        {
          type: "p",
          text: "FutureTutor distingue les technologies nécessaires à la fourniture de la Plateforme des technologies optionnelles pouvant exiger un consentement additionnel.",
        },
        { type: "p", text: "La forme de consentement appropriée dépend :" },
        {
          type: "ul",
          items: [
            "de la technologie;",
            "des renseignements traités;",
            "de l'objet;",
            "du caractère sensible des renseignements;",
            "des attentes raisonnables des utilisateurs;",
            "du droit applicable.",
          ],
        },
        {
          type: "p",
          text: "Selon les lignes directrices canadiennes en matière de protection de la vie privée, le consentement doit être significatif et les personnes concernées doivent comprendre les fins pour lesquelles leurs renseignements sont recueillis, utilisés ou communiqués.",
        },
      ],
    },
    {
      number: 26,
      heading: "Technologies essentielles",
      blocks: [
        {
          type: "p",
          text: "Certaines technologies d'authentification, de sécurité et de session sont nécessaires pour que FutureTutor puisse fournir les fonctionnalités demandées de la Plateforme.",
        },
        {
          type: "p",
          text: "Dans la mesure permise par le droit applicable, FutureTutor peut utiliser ces technologies dans la mesure nécessaire pour fournir le service.",
        },
        { type: "p", text: "Les utilisateurs qui empêchent le fonctionnement de ces technologies pourraient être incapables :" },
        {
          type: "ul",
          items: ["de se connecter;", "de demeurer authentifiés;", "d'accéder aux tableaux de bord protégés;", "de mener à terme certaines transactions;", "d'utiliser d'autres fonctionnalités essentielles de la Plateforme."],
        },
      ],
    },
    {
      number: 27,
      heading: "Technologies optionnelles",
      blocks: [
        {
          type: "p",
          text: "Si FutureTutor introduit des technologies non essentielles nécessitant un consentement, FutureTutor fournira un mécanisme approprié pour effectuer le choix requis.",
        },
        { type: "p", text: "Selon le droit applicable et la technologie, cela peut comprendre la possibilité :" },
        { type: "ul", items: ["d'accepter;", "de refuser;", "de configurer des préférences;", "de retirer son consentement."] },
        {
          type: "p",
          text: "FutureTutor ne devrait pas activer par défaut des technologies de suivi optionnelles lorsque le droit applicable exige un consentement préalable.",
        },
      ],
    },
    {
      number: 28,
      heading: "Bandeau relatif aux témoins",
      blocks: [
        {
          type: "p",
          text: "FutureTutor n'affirme pas qu'un bandeau relatif aux témoins est légalement requis du seul fait que la Plateforme utilise des technologies d'authentification ou de session essentielles.",
        },
        { type: "p", text: "La nécessité d'un bandeau de consentement dépend des technologies réellement utilisées et du droit applicable." },
        {
          type: "p",
          text: "Si FutureTutor introduit des technologies optionnelles d'analytique, de publicité, de reciblage, de profilage ou d'autres technologies de suivi non essentielles nécessitant un consentement, un mécanisme de consentement approprié devrait être mis en œuvre avant l'activation de ces technologies.",
        },
      ],
    },
    {
      number: 29,
      heading: "Contrôles du navigateur",
      partTitle: "Partie X — Gestion des témoins",
      blocks: [
        { type: "p", text: "La plupart des navigateurs permettent aux utilisateurs de contrôler les témoins au moyen des paramètres du navigateur." },
        { type: "p", text: "Selon le navigateur, les utilisateurs peuvent être en mesure de :" },
        {
          type: "ul",
          items: ["consulter les témoins;", "bloquer les témoins;", "supprimer les témoins;", "restreindre les témoins tiers;", "effacer les données du site."],
        },
        { type: "p", text: "La désactivation des témoins nécessaires peut faire en sorte que FutureTutor cesse de fonctionner correctement." },
      ],
    },
    {
      number: 30,
      heading: "Effacement des données d'application",
      blocks: [
        { type: "p", text: "Les utilisateurs peuvent également être en mesure d'effacer :" },
        { type: "ul", items: ["le stockage local;", "le stockage de session;", "les données du site;", "les données de navigation mises en cache;"] },
        { type: "p", text: "au moyen des paramètres du navigateur ou du système d'exploitation." },
        { type: "p", text: "Cela peut :" },
        {
          type: "ul",
          items: ["déconnecter l'utilisateur;", "réinitialiser les préférences;", "supprimer l'état stocké localement;", "exiger que l'utilisateur s'authentifie de nouveau."],
        },
      ],
    },
    {
      number: 31,
      heading: "Signaux de confidentialité du navigateur",
      partTitle: "Partie XI — Ne pas suivre et signaux similaires",
      blocks: [
        { type: "p", text: "Les navigateurs et les appareils peuvent offrir des signaux de confidentialité ou des mécanismes de prévention du suivi." },
        { type: "p", text: "La réponse de FutureTutor à ces signaux peut dépendre :" },
        {
          type: "ul",
          items: ["de la technologie en cause;", "du droit applicable;", "des capacités du navigateur;", "des fins pour lesquelles les renseignements sont traités."],
        },
        {
          type: "p",
          text: "Comme FutureTutor n'utilise pas actuellement de témoins de publicité comportementale ou de reciblage, certains signaux de retrait propres à la publicité peuvent avoir une application pratique limitée à la Plateforme actuelle.",
        },
        {
          type: "p",
          text: "FutureTutor révisera son traitement des signaux de confidentialité reconnus si ses pratiques de suivi changent de manière importante.",
        },
      ],
    },
    {
      number: 32,
      heading: "Renseignements pouvant être associés aux témoins",
      partTitle: "Partie XII — Données générées par les témoins",
      blocks: [
        { type: "p", text: "Selon la technologie, les témoins ou mécanismes similaires peuvent être associés :" },
        {
          type: "ul",
          items: [
            "aux identifiants de session;",
            "à l'état d'authentification;",
            "aux identifiants de compte;",
            "à la préférence linguistique;",
            "aux renseignements sur l'appareil/le navigateur;",
            "à l'adresse IP;",
            "aux horodatages;",
            "aux renseignements de sécurité;",
            "aux événements techniques;",
            "à l'état temporaire de l'application.",
          ],
        },
        {
          type: "p",
          text: "Lorsque de tels renseignements identifient une personne ou peuvent raisonnablement lui être associés, FutureTutor les traite conformément à sa Politique de confidentialité et au droit applicable.",
        },
      ],
    },
    {
      number: 33,
      heading: "Limitation de l'objet",
      blocks: [
        {
          type: "p",
          text: "Les renseignements générés par des témoins et des technologies similaires ne devraient être utilisés qu'à des fins légitimes et déterminées.",
        },
        {
          type: "p",
          text: "FutureTutor n'a pas l'intention de réutiliser les renseignements essentiels d'authentification ou de sécurité à des fins de publicité comportementale non liées, sans avis approprié et sans consentement lorsque requis.",
        },
        {
          type: "p",
          text: "Les principes de la LPRPDE exigent que les organisations limitent l'utilisation et la communication aux fins déterminées, à moins qu'un consentement additionnel ou un autre fondement légal ne s'applique.",
        },
      ],
    },
    {
      number: 34,
      heading: "Durée des témoins",
      partTitle: "Partie XIII — Conservation",
      blocks: [
        { type: "p", text: "Différents témoins et technologies de navigateur peuvent subsister pendant des périodes différentes." },
        { type: "p", text: "Certains peuvent n'exister que pendant une session de navigation." },
        { type: "p", text: "D'autres peuvent subsister pendant une période limitée afin de maintenir l'authentification, les préférences ou les fonctionnalités de sécurité." },
        { type: "p", text: "FutureTutor n'établit pas de périodes d'expiration universelles fictives dans la présente Politique." },
        { type: "p", text: "La durée réelle dépend de la technologie et de la configuration utilisées." },
      ],
    },
    {
      number: 35,
      heading: "Principe de conservation",
      blocks: [
        {
          type: "p",
          text: "FutureTutor cherche à conserver les renseignements associés aux témoins et aux technologies similaires seulement aussi longtemps que raisonnablement nécessaire aux fins pertinentes, sous réserve des exigences de sécurité, juridiques, opérationnelles et réglementaires.",
        },
        {
          type: "p",
          text: "Les principes canadiens en matière de protection de la vie privée invitent les organisations à ne conserver les renseignements personnels que le temps nécessaire aux fins déterminées et à établir des pratiques de conservation et de destruction.",
        },
      ],
    },
    {
      number: 36,
      heading: "Traitement par les fournisseurs de services",
      partTitle: "Partie XIV — Traitement international",
      blocks: [
        { type: "p", text: "Certains fournisseurs de services qui appuient FutureTutor peuvent traiter des renseignements à l'extérieur du Canada." },
        {
          type: "p",
          text: "En conséquence, les renseignements techniques générés par des témoins ou des technologies connexes peuvent, dans certains cas, être traités dans une autre autorité et être assujettis aux lois de celle-ci.",
        },
        {
          type: "p",
          text: "Des renseignements supplémentaires sur le traitement transfrontalier figurent dans la Politique de confidentialité de FutureTutor.",
        },
      ],
    },
    {
      number: 37,
      heading: "Utilisateurs du Québec",
      partTitle: "Partie XV — Québec",
      blocks: [
        { type: "p", text: "FutureTutor a l'intention de desservir les utilisateurs du Québec." },
        {
          type: "p",
          text: "Lorsque le droit québécois en matière de protection de la vie privée s'applique, FutureTutor tiendra compte des exigences applicables lors de l'utilisation de technologies qui recueillent des renseignements personnels.",
        },
        { type: "p", text: "Cela comprend les exigences relatives :" },
        {
          type: "ul",
          items: [
            "à la transparence;",
            "à la nécessité;",
            "au consentement;",
            "à la protection de la vie privée par défaut;",
            "aux technologies d'identification;",
            "aux technologies de localisation;",
            "aux technologies de profilage.",
          ],
        },
        {
          type: "p",
          text: "Le régulateur québécois en matière de protection de la vie privée souligne que la nécessité doit être évaluée avant le consentement et que le consentement, lorsqu'il est requis, doit répondre à des critères, notamment être manifeste, libre, éclairé, spécifique, compréhensible et accordé à des fins distinctes.",
        },
      ],
    },
    {
      number: 38,
      heading: "Protection de la vie privée par défaut",
      blocks: [
        {
          type: "p",
          text: "Lorsque le droit québécois applicable l'exige, FutureTutor entend configurer les paramètres de confidentialité des produits ou services technologiques destinés au public de façon à offrir un niveau élevé de protection de la vie privée par défaut.",
        },
        {
          type: "p",
          text: "La Commission d'accès à l'information recense les exigences de protection de la vie privée par défaut parmi les changements introduits par la réforme québécoise en matière de protection de la vie privée.",
        },
      ],
    },
    {
      number: 39,
      heading: "Profilage, identification et localisation",
      blocks: [
        {
          type: "p",
          text: "Si FutureTutor introduit une technologie permettant l'identification, la localisation ou le profilage au-delà de ce qui est nécessaire au fonctionnement ordinaire de la Plateforme, FutureTutor évaluera les exigences applicables en matière de divulgation et d'activation avant de mettre cette fonctionnalité en service.",
        },
        { type: "p", text: "FutureTutor n'utilise pas actuellement le profilage comportemental fondé sur les témoins à des fins publicitaires." },
      ],
    },
    {
      number: 40,
      heading: "Technologies futures",
      partTitle: "Partie XVI — Modifications aux pratiques relatives aux témoins",
      blocks: [
        { type: "p", text: "FutureTutor peut modifier ou ajouter des technologies à mesure que la Plateforme évolue." },
        { type: "p", text: "Les exemples pourraient comprendre :" },
        {
          type: "ul",
          items: ["l'analytique;", "la surveillance de la performance;", "des technologies supplémentaires de prévention de la fraude;", "la personnalisation optionnelle;", "des technologies de paiement supplémentaires."],
        },
        {
          type: "p",
          text: "Avant d'introduire des technologies qui modifient de manière importante les pratiques de FutureTutor en matière de protection de la vie privée, FutureTutor évaluera les exigences applicables en matière d'avis et de consentement.",
        },
      ],
    },
    {
      number: 41,
      heading: "Mises à jour de la Politique",
      blocks: [
        { type: "p", text: "FutureTutor peut mettre à jour la présente Politique sur les témoins afin de tenir compte :" },
        {
          type: "ul",
          items: ["des changements technologiques;", "des changements relatifs aux témoins ou au stockage de navigateur;", "de nouveaux fournisseurs de services;", "de nouvelles fonctionnalités de la Plateforme;", "des exigences juridiques;", "des pratiques de confidentialité."],
        },
        { type: "p", text: "La date de dernière mise à jour figurant au début de la présente Politique indiquera la date de sa révision la plus récente." },
        {
          type: "p",
          text: "Lorsque la loi l'exige, FutureTutor fournira un avis supplémentaire ou obtiendra un consentement avant qu'un traitement substantiellement différent ne débute.",
        },
      ],
    },
    {
      number: 42,
      heading: "Questions relatives aux témoins",
      partTitle: "Partie XVII — Coordonnées",
      blocks: [
        { type: "p", text: "Les questions relatives à l'utilisation des témoins et des technologies similaires par FutureTutor peuvent être adressées à :" },
        {
          type: "p",
          text: "FutureTutor\nDétenue et exploitée par FYRA SERVICES INC.",
        },
        {
          type: "p",
          text: "FYRA SERVICES INC.\n8830, avenue 62e NW\nEdmonton (Alberta) T6E 0C8\nCanada",
        },
        {
          type: "p",
          text: "Demandes relatives à la vie privée : legal@futuretutor.ca\nDemandes juridiques : legal@futuretutor.ca\nSite Web : futuretutor.ca",
        },
      ],
    },
    {
      number: 43,
      heading: "Politique de confidentialité",
      partTitle: "Partie XVIII — Relation avec les autres politiques",
      blocks: [
        { type: "p", text: "La Politique de confidentialité de FutureTutor fournit des renseignements supplémentaires sur :" },
        {
          type: "ul",
          items: [
            "les renseignements personnels que FutureTutor recueille;",
            "les Étudiants;",
            "les Parents et tuteurs;",
            "les Tuteurs;",
            "les mineurs;",
            "les paiements;",
            "la Classe virtuelle;",
            "le tutorat en personne;",
            "les renseignements de localisation;",
            "les fournisseurs de services;",
            "la conservation;",
            "la sécurité;",
            "les droits en matière de vie privée;",
            "les droits particuliers relatifs à la vie privée au Québec.",
          ],
        },
        {
          type: "p",
          text: "Si les renseignements recueillis au moyen d'un témoin ou d'une technologie similaire constituent des renseignements personnels, la Politique de confidentialité s'applique également à ces renseignements.",
        },
      ],
    },
    {
      number: 44,
      heading: "Conditions d'utilisation",
      blocks: [
        { type: "p", text: "L'utilisation de FutureTutor est également régie par les Conditions d'utilisation de FutureTutor." },
        { type: "p", text: "La présente Politique sur les témoins ne modifie pas les droits ou obligations contractuels prévus dans les Conditions d'utilisation." },
      ],
    },
    {
      number: 45,
      heading: "Position actuelle de FutureTutor",
      partTitle: "Partie XIX — Résumé des pratiques actuelles relatives aux témoins",
      blocks: [
        {
          type: "p",
          text: "À la date d'entrée en vigueur de la présente Politique sur les témoins, la posture actuelle de FutureTutor en matière de témoins est la suivante :",
        },
        {
          type: "table",
          headers: ["Technologie / Objet", "Position actuelle"],
          rows: [
            ["Témoins d'authentification", "Utilisés / nécessaires lorsque techniquement applicable"],
            ["Technologies de session", "Utilisées / nécessaires lorsque techniquement applicable"],
            ["Technologies de sécurité", "Utilisées / nécessaires lorsque techniquement applicable"],
            ["Stockage de la langue/localisation", "Peuvent être utilisés"],
            ["Stockage fonctionnel du navigateur", "Peut être utilisé"],
            ["État local lié à la PWA", "Peut être utilisé"],
            ["Suivi GPS continu", "Non utilisé actuellement"],
            ["Témoins de publicité comportementale", "Non utilisés actuellement"],
            ["Témoins de reciblage", "Non utilisés actuellement"],
            ["Pixels publicitaires", "Non utilisés actuellement"],
            ["Publicité comportementale visant les enfants", "Non utilisée actuellement"],
            ["Analytique comportementale tierce habituelle", "Non représentée comme étant utilisée actuellement"],
            ["Mise en cache de données privées par service worker", "Non utilisée actuellement"],
          ],
        },
        {
          type: "p",
          text: "Ce résumé reflète les pratiques actuellement prévues par FutureTutor et doit demeurer cohérent avec les technologies réellement déployées sur la Plateforme.",
        },
      ],
    },
    {
      number: 46,
      heading: "Reconnaissance",
      blocks: [
        { type: "p", text: "En utilisant FutureTutor, les utilisateurs reconnaissent avoir eu accès à la présente Politique sur les témoins." },
        {
          type: "p",
          text: "Lorsqu'un consentement est légalement requis pour un témoin ou une technologie similaire en particulier, FutureTutor fournira le mécanisme de consentement applicable avant ou au moment où il est requis.",
        },
        {
          type: "p",
          text: "L'utilisation de technologies strictement nécessaires peut être requise pour que FutureTutor puisse fournir les fonctionnalités demandées de la Plateforme, sous réserve du droit applicable.",
        },
      ],
    },
  ],
};
