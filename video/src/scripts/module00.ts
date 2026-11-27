import type { Locale } from "../brand";

/**
 * Module 0 capsule — narration per shot, from docs/training/module-00-welcome.md
 * (section A). Shot ids name the audio files: public/audio/module00/<locale>/<id>.mp3.
 */
export interface Shot {
  id: string;
  text: Record<Locale, string>;
}

export const MODULE00_SHOTS: Shot[] = [
  {
    id: "01-welcome",
    text: {
      fr: "Bonjour, et bienvenue chez FutureTutor ! Je m'appelle Alex, et je vais vous accompagner tout au long de votre formation.",
      en: "Hi, and welcome to FutureTutor! I'm Alex, and I'll be with you throughout your training.",
    },
  },
  {
    id: "02-mission",
    text: {
      fr: "Notre mission est simple : aider chaque élève à progresser, grâce à un tuteur qualifié, en ligne ou en personne.",
      en: "Our mission is simple: help every student move forward with a qualified tutor, online or in person.",
    },
  },
  {
    id: "03-marketplace",
    text: {
      fr: "FutureTutor met en relation les élèves et leurs familles avec des tuteurs comme vous. Notre équipe s'occupe du jumelage, des réservations, des paiements et de la sécurité.",
      en: "FutureTutor connects students and their families with tutors like you. Our team handles matching, bookings, payments and safety.",
    },
  },
  {
    id: "04-commitments",
    text: {
      fr: "En retour, chaque tuteur FutureTutor prend trois engagements. La compétence : bien préparer et bien expliquer. La sécurité : protéger chaque élève, surtout les plus jeunes. La fiabilité : être là, à l'heure, quand on s'y est engagé.",
      en: "In return, every FutureTutor tutor makes three commitments. Competence: prepare well and explain well. Safety: protect every student, especially the youngest. Reliability: be there, on time, when you said you would.",
    },
  },
  {
    id: "05-independent",
    text: {
      fr: "Vous êtes un prestataire indépendant : vous choisissez vos disponibilités et vous êtes libre d'accepter ou de refuser une occasion. Mais une fois que vous l'acceptez, l'élève compte sur vous.",
      en: "You are an independent service provider: you choose your availability, and you're free to accept or decline an opportunity. But once you accept it, the student is counting on you.",
    },
  },
  {
    id: "06-path",
    text: {
      fr: "Vos documents sont déjà déposés. Il vous reste la formation, que vous commencez maintenant, puis l'examen, un entretien avec notre équipe, et l'approbation de votre profil.",
      en: "Your documents are already in. Next comes this training, then the exam, an interview with our team, and finally the approval of your profile.",
    },
  },
  {
    id: "07-format",
    text: {
      fr: "Chaque module commence par une courte vidéo, puis des pages interactives et quelques questions. Prenez votre temps : vous pouvez vous arrêter et reprendre quand vous voulez.",
      en: "Each module starts with a short video, followed by interactive pages and a few questions. Take your time: you can stop and pick up where you left off whenever you like.",
    },
  },
  {
    id: "08-go",
    text: { fr: "Prêt ? On y va !", en: "Ready? Let's go!" },
  },
];
