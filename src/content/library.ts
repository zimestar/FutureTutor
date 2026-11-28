/**
 * LIBRARY-1 — curriculum-aligned learning library for parents and students.
 *
 * Structure: province -> course -> strands -> chapters -> optional sheet.
 * Chapter titles and summaries paraphrase, in FutureTutor's own words, the
 * official learning outcomes published by the province (Alberta: new
 * LearnAlberta, read 2026-11-27). Nothing is copied from provincial or
 * publisher documents; every course links to its official source.
 *
 * Sheets are written by FutureTutor and must be reviewed by a qualified tutor
 * before they lose the `draft` status: draft sheets show a visible notice and
 * are not indexed by search engines.
 */

import { divisibilitySheet, decimalOperationsSheet, percentsSheet, fractionsDecimalsSheet, fractionsAddSubtractSheet, compareOrderSheet, linearRelationsSheet, expressionsSheet, circlesSheet, areaSheet, constructionsSheet, cartesianPlaneSheet, transformationsSheet, centralTendencySheet, circleGraphsSheet, probabilitySheet } from "@/content/librarySheetsMath7";
import { measurementUnitsSheet, surfaceAreaVolumeSheet, trigonometrySheet, factorsRootsSheet, irrationalNumbersSheet, exponentsSheet, polynomialMultiplicationSheet, factoringSheet, relationsFunctionsSheet, slopeSheet, linearRelations10cSheet } from "@/content/librarySheetsMath10c";

export interface L {
  fr: string;
  en: string;
}

export interface WorkedExample {
  problem: L;
  steps: L[];
  answer: L;
}

export interface PracticeItem {
  question: L;
  answer: L;
}

export interface LibrarySheet {
  reviewStatus: "draft" | "reviewed";
  summary: L;
  mustKnow: L[];
  explanation: L[];
  examples: WorkedExample[];
  commonMistakes: L[];
  practice: PracticeItem[];
  parentTips: L[];
}

export interface LibraryChapter {
  slug: string;
  title: L;
  /** One-line paraphrase of what the official outcome expects. */
  goal: L;
  sheet?: LibrarySheet;
}

export interface LibraryStrand {
  title: L;
  chapters: LibraryChapter[];
}

export interface LibraryCourse {
  slug: string;
  subject: "math";
  title: L;
  level: L;
  /** Official program name and status, as published by the province. */
  officialName: L;
  officialStatus: L;
  officialUrl: string;
  strands: LibraryStrand[];
}

export interface LibraryProvince {
  slug: string;
  name: L;
  available: boolean;
  officialHomeUrl?: string;
  courses: LibraryCourse[];
}

/* ------------------------------------------------------------------ */
/* Sheets                                                              */
/* ------------------------------------------------------------------ */

const integersSheet: LibrarySheet = {
  reviewStatus: "draft",
  summary: {
    fr: "Les entiers relatifs regroupent les nombres entiers positifs, les nombres entiers négatifs et zéro. En 7e année, l'élève apprend à les additionner et à les soustraire, d'abord avec des objets ou une droite numérique, puis avec des règles simples.",
    en: "Integers are the positive whole numbers, the negative whole numbers and zero. In Grade 7, students learn to add and subtract them, first with objects or a number line, then with simple rules.",
  },
  mustKnow: [
    { fr: "Chaque entier a un opposé : l'opposé de +5 est −5. Un nombre et son opposé forment une « paire nulle » : (+1) + (−1) = 0.", en: "Every integer has an opposite: the opposite of +5 is −5. A number and its opposite make a “zero pair”: (+1) + (−1) = 0." },
    { fr: "Additionner deux entiers de même signe : on additionne les nombres et on garde le signe.", en: "Adding two integers with the same sign: add the numbers and keep the sign." },
    { fr: "Additionner deux entiers de signes différents : on soustrait le plus petit du plus grand (sans les signes) et on prend le signe de celui qui est le plus loin de zéro.", en: "Adding two integers with different signs: subtract the smaller from the larger (ignoring signs) and keep the sign of the one farther from zero." },
    { fr: "Soustraire un entier revient à additionner son opposé : a − b = a + (−b).", en: "Subtracting an integer is the same as adding its opposite: a − b = a + (−b)." },
  ],
  explanation: [
    { fr: "Sur une droite numérique, additionner un nombre positif fait avancer vers la droite; additionner un nombre négatif fait reculer vers la gauche.", en: "On a number line, adding a positive number moves right; adding a negative number moves left." },
    { fr: "Avec des jetons de deux couleurs (par exemple jaune = +1, rouge = −1), on regroupe les paires jaune-rouge : elles valent zéro. Ce qui reste donne la réponse.", en: "With two colours of counters (for example yellow = +1, red = −1), group yellow-red pairs: they equal zero. What is left is the answer." },
    { fr: "Pour soustraire, on transforme l'opération : on change le signe « − » en « + » et on remplace le deuxième nombre par son opposé, puis on additionne.", en: "To subtract, rewrite the operation: change “−” to “+” and replace the second number by its opposite, then add." },
  ],
  examples: [
    {
      problem: { fr: "(−3) + (+5)", en: "(−3) + (+5)" },
      steps: [
        { fr: "Les signes sont différents : 5 − 3 = 2.", en: "The signs are different: 5 − 3 = 2." },
        { fr: "+5 est plus loin de zéro que −3, donc le résultat est positif.", en: "+5 is farther from zero than −3, so the result is positive." },
      ],
      answer: { fr: "+2", en: "+2" },
    },
    {
      problem: { fr: "(−4) + (−6)", en: "(−4) + (−6)" },
      steps: [{ fr: "Même signe : 4 + 6 = 10, on garde le signe négatif.", en: "Same sign: 4 + 6 = 10, keep the negative sign." }],
      answer: { fr: "−10", en: "−10" },
    },
    {
      problem: { fr: "(+2) − (−7)", en: "(+2) − (−7)" },
      steps: [
        { fr: "Soustraire −7, c'est additionner son opposé : (+2) + (+7).", en: "Subtracting −7 means adding its opposite: (+2) + (+7)." },
        { fr: "Même signe : 2 + 7 = 9.", en: "Same sign: 2 + 7 = 9." },
      ],
      answer: { fr: "+9", en: "+9" },
    },
    {
      problem: { fr: "(−5) − (+3)", en: "(−5) − (+3)" },
      steps: [
        { fr: "On additionne l'opposé : (−5) + (−3).", en: "Add the opposite: (−5) + (−3)." },
        { fr: "Même signe : 5 + 3 = 8, signe négatif.", en: "Same sign: 5 + 3 = 8, negative sign." },
      ],
      answer: { fr: "−8", en: "−8" },
    },
  ],
  commonMistakes: [
    { fr: "Penser qu'une soustraction donne toujours un résultat plus petit : (+2) − (−7) donne +9.", en: "Thinking subtraction always gives a smaller result: (+2) − (−7) gives +9." },
    { fr: "Changer l'opération sans changer le signe du deuxième nombre (ou l'inverse). Il faut changer les deux.", en: "Changing the operation without changing the sign of the second number (or the reverse). Both must change." },
    { fr: "Confondre le signe d'un nombre et le signe de l'opération : les parenthèses aident à les distinguer.", en: "Mixing up the sign of a number and the operation sign: brackets help tell them apart." },
  ],
  practice: [
    { question: { fr: "(−8) + (+3)", en: "(−8) + (+3)" }, answer: { fr: "−5", en: "−5" } },
    { question: { fr: "(+6) + (−6)", en: "(+6) + (−6)" }, answer: { fr: "0", en: "0" } },
    { question: { fr: "(−2) − (−9)", en: "(−2) − (−9)" }, answer: { fr: "+7", en: "+7" } },
    { question: { fr: "(+4) − (+10)", en: "(+4) − (+10)" }, answer: { fr: "−6", en: "−6" } },
    {
      question: { fr: "À 7 h, il fait −7 °C à Edmonton. À midi, la température a monté de 12 °C. Quelle température fait-il à midi?", en: "At 7 a.m. it is −7 °C in Edmonton. By noon the temperature has risen 12 °C. What is the temperature at noon?" },
      answer: { fr: "(−7) + (+12) = +5, donc 5 °C.", en: "(−7) + (+12) = +5, so 5 °C." },
    },
  ],
  parentTips: [
    { fr: "Utilisez des situations du quotidien : la température en hiver, un ascenseur avec des sous-sols, un solde qui passe sous zéro.", en: "Use everyday situations: winter temperatures, an elevator with basement floors, a balance that goes below zero." },
    { fr: "Dessinez une droite numérique sur une feuille et faites « marcher » votre enfant dessus avec un crayon.", en: "Draw a number line on paper and have your child “walk” along it with a pencil." },
    { fr: "Demandez-lui d'expliquer à voix haute pourquoi le résultat est positif ou négatif, plutôt que de seulement vérifier la réponse.", en: "Ask your child to explain out loud why the result is positive or negative, rather than only checking the answer." },
  ],
};

const equationsSheet: LibrarySheet = {
  reviewStatus: "draft",
  summary: {
    fr: "Une équation dit que deux expressions sont égales. Résoudre une équation, c'est trouver la valeur de la variable qui rend l'égalité vraie. En 7e année, on résout des équations simples comme x + 5 = 12, 3x = 18 ou 2x + 3 = 11.",
    en: "An equation says that two expressions are equal. Solving an equation means finding the value of the variable that makes it true. In Grade 7, students solve simple equations such as x + 5 = 12, 3x = 18 or 2x + 3 = 11.",
  },
  mustKnow: [
    { fr: "Une expression (comme 2x + 3) n'a pas de signe « = ». Une équation (comme 2x + 3 = 11) en a un.", en: "An expression (such as 2x + 3) has no “=” sign. An equation (such as 2x + 3 = 11) has one." },
    { fr: "On garde l'égalité en faisant la même opération des deux côtés, comme sur une balance en équilibre.", en: "Equality is kept by doing the same operation on both sides, like a balanced scale." },
    { fr: "On défait les opérations dans l'ordre inverse : d'abord l'addition ou la soustraction, puis la multiplication ou la division.", en: "Undo operations in reverse order: first addition or subtraction, then multiplication or division." },
    { fr: "On vérifie toujours en remplaçant la variable par la réponse trouvée.", en: "Always check by substituting the answer back into the equation." },
  ],
  explanation: [
    { fr: "Imaginez une balance : à gauche 2x + 3, à droite 11. Si on enlève 3 des deux côtés, la balance reste équilibrée : 2x = 8.", en: "Picture a balance: 2x + 3 on the left, 11 on the right. Removing 3 from both sides keeps it balanced: 2x = 8." },
    { fr: "Ensuite, on partage les deux côtés en 2 : x = 4.", en: "Then divide both sides by 2: x = 4." },
    { fr: "Vérification : 2 × 4 + 3 = 11. L'égalité est vraie, la réponse est bonne.", en: "Check: 2 × 4 + 3 = 11. The equality is true, so the answer is correct." },
  ],
  examples: [
    {
      problem: { fr: "x + 5 = 12", en: "x + 5 = 12" },
      steps: [{ fr: "On soustrait 5 des deux côtés : x = 12 − 5.", en: "Subtract 5 from both sides: x = 12 − 5." }],
      answer: { fr: "x = 7", en: "x = 7" },
    },
    {
      problem: { fr: "3x = 18", en: "3x = 18" },
      steps: [{ fr: "On divise les deux côtés par 3 : x = 18 ÷ 3.", en: "Divide both sides by 3: x = 18 ÷ 3." }],
      answer: { fr: "x = 6", en: "x = 6" },
    },
    {
      problem: { fr: "x ÷ 4 = 5", en: "x ÷ 4 = 5" },
      steps: [{ fr: "On multiplie les deux côtés par 4 : x = 5 × 4.", en: "Multiply both sides by 4: x = 5 × 4." }],
      answer: { fr: "x = 20", en: "x = 20" },
    },
    {
      problem: { fr: "Léa a 3 paquets identiques de cartes et 4 cartes en plus. Elle a 25 cartes en tout. Combien y a-t-il de cartes par paquet?", en: "Léa has 3 identical packs of cards and 4 extra cards. She has 25 cards in all. How many cards are in each pack?" },
      steps: [
        { fr: "On appelle n le nombre de cartes par paquet : 3n + 4 = 25.", en: "Let n be the number of cards per pack: 3n + 4 = 25." },
        { fr: "On soustrait 4 des deux côtés : 3n = 21.", en: "Subtract 4 from both sides: 3n = 21." },
        { fr: "On divise par 3 : n = 7.", en: "Divide by 3: n = 7." },
      ],
      answer: { fr: "7 cartes par paquet", en: "7 cards per pack" },
    },
  ],
  commonMistakes: [
    { fr: "Faire une opération d'un seul côté de l'égalité.", en: "Doing an operation on only one side of the equation." },
    { fr: "Commencer par diviser dans 2x + 3 = 11 : il faut d'abord enlever le 3.", en: "Dividing first in 2x + 3 = 11: remove the 3 first." },
    { fr: "Oublier de vérifier la réponse dans l'équation de départ.", en: "Forgetting to check the answer in the original equation." },
  ],
  practice: [
    { question: { fr: "x − 4 = 9", en: "x − 4 = 9" }, answer: { fr: "x = 13", en: "x = 13" } },
    { question: { fr: "5x = 35", en: "5x = 35" }, answer: { fr: "x = 7", en: "x = 7" } },
    { question: { fr: "3x + 2 = 14", en: "3x + 2 = 14" }, answer: { fr: "x = 4", en: "x = 4" } },
    { question: { fr: "x ÷ 3 = 6", en: "x ÷ 3 = 6" }, answer: { fr: "x = 18", en: "x = 18" } },
    { question: { fr: "4x − 5 = 11", en: "4x − 5 = 11" }, answer: { fr: "x = 4", en: "x = 4" } },
  ],
  parentTips: [
    { fr: "Jouez aux « nombres mystères » : « Je pense à un nombre, je le multiplie par 3 et j'ajoute 2, j'obtiens 14. Quel est mon nombre? »", en: "Play “mystery number”: “I think of a number, multiply it by 3 and add 2, and get 14. What is my number?”" },
    { fr: "Faites dessiner une balance pour représenter l'équation avant de la résoudre.", en: "Have your child draw a balance to represent the equation before solving it." },
    { fr: "Insistez sur la vérification : c'est l'habitude qui fait gagner le plus de points aux examens.", en: "Insist on checking: it is the habit that earns the most marks on tests." },
  ],
};

const systemsSheet: LibrarySheet = {
  reviewStatus: "draft",
  summary: {
    fr: "Un système d'équations linéaires, ce sont deux équations à deux variables qu'on veut satisfaire en même temps. La solution est le couple (x, y) qui rend les deux équations vraies : graphiquement, c'est le point où les deux droites se croisent.",
    en: "A system of linear equations is two equations in two variables that must be true at the same time. The solution is the pair (x, y) that makes both equations true: on a graph, it is the point where the two lines cross.",
  },
  mustKnow: [
    { fr: "Graphiquement : on trace les deux droites; la solution est leur point d'intersection.", en: "Graphically: draw both lines; the solution is where they intersect." },
    { fr: "Par substitution : on isole une variable dans une équation, puis on la remplace dans l'autre.", en: "By substitution: isolate one variable in one equation, then replace it in the other." },
    { fr: "Par élimination : on additionne ou on soustrait les équations pour faire disparaître une variable.", en: "By elimination: add or subtract the equations to make one variable disappear." },
    { fr: "Un système peut avoir une solution (droites qui se croisent), aucune solution (droites parallèles) ou une infinité de solutions (même droite).", en: "A system can have one solution (lines cross), no solution (parallel lines) or infinitely many solutions (the same line)." },
  ],
  explanation: [
    { fr: "La méthode graphique aide à comprendre, mais elle est souvent imprécise. Les méthodes algébriques (substitution, élimination) donnent la réponse exacte.", en: "The graphing method helps understanding but is often imprecise. Algebraic methods (substitution, elimination) give the exact answer." },
    { fr: "On choisit la substitution quand une variable est déjà isolée (y = …). On choisit l'élimination quand les coefficients d'une variable sont égaux ou opposés.", en: "Choose substitution when a variable is already isolated (y = …). Choose elimination when one variable has equal or opposite coefficients." },
    { fr: "On vérifie toujours la solution dans les deux équations de départ.", en: "Always check the solution in both original equations." },
  ],
  examples: [
    {
      problem: { fr: "Résoudre par substitution : y = 2x + 1 et x + y = 7", en: "Solve by substitution: y = 2x + 1 and x + y = 7" },
      steps: [
        { fr: "On remplace y dans la deuxième équation : x + (2x + 1) = 7.", en: "Replace y in the second equation: x + (2x + 1) = 7." },
        { fr: "3x + 1 = 7, donc 3x = 6 et x = 2.", en: "3x + 1 = 7, so 3x = 6 and x = 2." },
        { fr: "y = 2(2) + 1 = 5.", en: "y = 2(2) + 1 = 5." },
        { fr: "Vérification : 5 = 2(2) + 1 ✓ et 2 + 5 = 7 ✓.", en: "Check: 5 = 2(2) + 1 ✓ and 2 + 5 = 7 ✓." },
      ],
      answer: { fr: "(2, 5)", en: "(2, 5)" },
    },
    {
      problem: { fr: "Résoudre par élimination : 2x + 3y = 12 et 4x − 3y = 6", en: "Solve by elimination: 2x + 3y = 12 and 4x − 3y = 6" },
      steps: [
        { fr: "Les termes en y sont opposés : on additionne les équations. 6x = 18, donc x = 3.", en: "The y terms are opposites: add the equations. 6x = 18, so x = 3." },
        { fr: "On remplace dans la première : 2(3) + 3y = 12, donc 3y = 6 et y = 2.", en: "Substitute into the first: 2(3) + 3y = 12, so 3y = 6 and y = 2." },
        { fr: "Vérification : 4(3) − 3(2) = 6 ✓.", en: "Check: 4(3) − 3(2) = 6 ✓." },
      ],
      answer: { fr: "(3, 2)", en: "(3, 2)" },
    },
  ],
  commonMistakes: [
    { fr: "Trouver x et s'arrêter : la solution d'un système est toujours un couple (x, y).", en: "Finding x and stopping: the solution of a system is always a pair (x, y)." },
    { fr: "Oublier les parenthèses lors de la substitution, ce qui fausse les signes.", en: "Forgetting brackets when substituting, which changes the signs." },
    { fr: "En élimination, ne multiplier qu'un seul terme d'une équation au lieu de toute l'équation.", en: "In elimination, multiplying only one term of an equation instead of the whole equation." },
  ],
  practice: [
    { question: { fr: "y = x + 3 et y = −x + 7", en: "y = x + 3 and y = −x + 7" }, answer: { fr: "(2, 5)", en: "(2, 5)" } },
    { question: { fr: "x + y = 10 et x − y = 4", en: "x + y = 10 and x − y = 4" }, answer: { fr: "(7, 3)", en: "(7, 3)" } },
    { question: { fr: "3x + 2y = 16 et x = 2y", en: "3x + 2y = 16 and x = 2y" }, answer: { fr: "(4, 2)", en: "(4, 2)" } },
    { question: { fr: "y = 2x + 1 et y = 2x − 3", en: "y = 2x + 1 and y = 2x − 3" }, answer: { fr: "Aucune solution : les droites ont la même pente, elles sont parallèles.", en: "No solution: the lines have the same slope, so they are parallel." } },
    {
      question: { fr: "Une école vend 20 billets pour 200 $. Un billet adulte coûte 12 $ et un billet enfant 8 $. Combien de billets de chaque sorte?", en: "A school sells 20 tickets for $200. An adult ticket costs $12 and a child ticket $8. How many of each were sold?" },
      answer: { fr: "a + e = 20 et 12a + 8e = 200, donc 10 billets adultes et 10 billets enfants.", en: "a + c = 20 and 12a + 8c = 200, so 10 adult tickets and 10 child tickets." },
    },
  ],
  parentTips: [
    { fr: "Demandez à votre enfant quelle méthode il choisit et pourquoi : savoir choisir fait partie de ce qui est évalué.", en: "Ask your teen which method they choose and why: choosing well is part of what is assessed." },
    { fr: "Encouragez la vérification dans les deux équations, même quand le temps presse.", en: "Encourage checking in both equations, even when time is short." },
    { fr: "Une calculatrice graphique ou un outil en ligne permet de voir les deux droites se croiser et de confirmer la réponse.", en: "A graphing calculator or an online tool shows the two lines crossing and confirms the answer." },
  ],
};

/* ------------------------------------------------------------------ */
/* Courses                                                             */
/* ------------------------------------------------------------------ */

const ch = (slug: string, fr: string, en: string, goalFr: string, goalEn: string, sheet?: LibrarySheet): LibraryChapter => ({
  slug,
  title: { fr, en },
  goal: { fr: goalFr, en: goalEn },
  sheet,
});

const albertaMath7: LibraryCourse = {
  slug: "math-7",
  subject: "math",
  title: { fr: "Mathématiques 7e année", en: "Grade 7 Mathematics" },
  level: { fr: "7e année", en: "Grade 7" },
  officialName: { fr: "Mathematics (7–9), Grade 7", en: "Mathematics (7–9), Grade 7" },
  officialStatus: {
    fr: "Programme en vigueur, publié en 2016. Un nouveau programme de 7e à 9e année existe à l'état d'ébauche (projet pilote facultatif en 2026-2027).",
    en: "Program in force, published 2016. A new Grades 7–9 program exists as a draft (optional pilot in 2026–2027).",
  },
  officialUrl: "https://curriculum.learnalberta.ca/curriculum/en/pos/MAT_79/MATH7",
  strands: [
    {
      title: { fr: "Le nombre", en: "Number" },
      chapters: [
        ch("divisibility", "Règles de divisibilité", "Divisibility rules", "Expliquer pourquoi un nombre est divisible par 2, 3, 4, 5, 6, 8, 9 ou 10.", "Explain why a number is divisible by 2, 3, 4, 5, 6, 8, 9 or 10.", divisibilitySheet),
        ch("decimal-operations", "Opérations sur les nombres décimaux", "Operations with decimals", "Additionner, soustraire, multiplier et diviser des nombres décimaux pour résoudre des problèmes.", "Add, subtract, multiply and divide decimals to solve problems.", decimalOperationsSheet),
        ch("percents", "Les pourcentages", "Percents", "Résoudre des problèmes avec des pourcentages de 1 % à 100 %.", "Solve problems with percents from 1% to 100%.", percentsSheet),
        ch("fractions-decimals", "Fractions et nombres décimaux", "Fractions and decimals", "Faire le lien entre les fractions et les nombres décimaux qui se terminent ou se répètent.", "Relate fractions to terminating and repeating decimals.", fractionsDecimalsSheet),
        ch("fractions-add-subtract", "Additionner et soustraire des fractions", "Adding and subtracting fractions", "Additionner et soustraire des fractions et des nombres fractionnaires, avec des dénominateurs pareils ou différents.", "Add and subtract fractions and mixed numbers, with like and unlike denominators.", fractionsAddSubtractSheet),
        ch("integers", "Additionner et soustraire des entiers relatifs", "Adding and subtracting integers", "Additionner et soustraire des entiers relatifs avec du matériel, des dessins puis des symboles.", "Add and subtract integers concretely, pictorially and symbolically.", integersSheet),
        ch("compare-order", "Comparer et ordonner des nombres", "Comparing and ordering numbers", "Comparer et ordonner des fractions, des nombres décimaux et des nombres entiers.", "Compare and order fractions, decimals and whole numbers.", compareOrderSheet),
      ],
    },
    {
      title: { fr: "Régularités et relations", en: "Patterns and relations" },
      chapters: [
        ch("linear-relations", "Régularités et relations linéaires", "Patterns and linear relations", "Passer d'une régularité à une relation linéaire, à une table de valeurs et à un graphique.", "Move from a pattern to a linear relation, a table of values and a graph.", linearRelationsSheet),
        ch("expressions", "Expressions et équations", "Expressions and equations", "Distinguer une expression d'une équation et évaluer une expression.", "Tell an expression from an equation and evaluate an expression.", expressionsSheet),
        ch("linear-equations", "Résoudre des équations linéaires", "Solving linear equations", "Modéliser et résoudre des problèmes avec des équations linéaires simples.", "Model and solve problems with simple linear equations.", equationsSheet),
      ],
    },
    {
      title: { fr: "La forme et l'espace", en: "Shape and space" },
      chapters: [
        ch("circles", "Le cercle", "Circles", "Comprendre le rayon, le diamètre, la circonférence et le nombre π.", "Understand radius, diameter, circumference and π.", circlesSheet),
        ch("area", "Aire des parallélogrammes, triangles et cercles", "Area of parallelograms, triangles and circles", "Trouver et utiliser les formules d'aire.", "Develop and use area formulas.", areaSheet),
        ch("constructions", "Constructions géométriques", "Geometric constructions", "Tracer des droites perpendiculaires, parallèles et des bissectrices.", "Construct perpendicular and parallel lines and bisectors.", constructionsSheet),
        ch("cartesian-plane", "Le plan cartésien", "The Cartesian plane", "Situer des points dans les quatre quadrants.", "Plot points in all four quadrants.", cartesianPlaneSheet),
        ch("transformations", "Les transformations", "Transformations", "Effectuer et décrire des translations, rotations et réflexions.", "Perform and describe translations, rotations and reflections.", transformationsSheet),
      ],
    },
    {
      title: { fr: "La statistique et la probabilité", en: "Statistics and probability" },
      chapters: [
        ch("central-tendency", "Moyenne, médiane, mode et étendue", "Mean, median, mode and range", "Calculer ces mesures et voir l'effet d'une valeur aberrante.", "Calculate these measures and see the effect of an outlier.", centralTendencySheet),
        ch("circle-graphs", "Les diagrammes circulaires", "Circle graphs", "Construire et interpréter des diagrammes circulaires.", "Construct and interpret circle graphs.", circleGraphsSheet),
        ch("probability", "Les probabilités", "Probability", "Utiliser des probabilités expérimentales et théoriques, en fraction, en décimal et en pourcentage.", "Use experimental and theoretical probability as fractions, decimals and percents.", probabilitySheet),
      ],
    },
  ],
};

const albertaMath10C: LibraryCourse = {
  slug: "math-10c",
  subject: "math",
  title: { fr: "Mathématiques 10C", en: "Mathematics 10C" },
  level: { fr: "10e année (secondaire 2e cycle)", en: "Grade 10 (senior high)" },
  officialName: { fr: "Mathematics 10C (MAT1791)", en: "Mathematics 10C (MAT1791)" },
  officialStatus: {
    fr: "Programme en vigueur depuis 2008. Point de départ des séquences 20-1/30-1 et 20-2/30-2.",
    en: "Program in force since 2008. Starting point for the 20-1/30-1 and 20-2/30-2 sequences.",
  },
  officialUrl: "https://curriculum.learnalberta.ca/curriculum/en/pos/MAT_HS/MAT1791",
  strands: [
    {
      title: { fr: "La mesure", en: "Measurement" },
      chapters: [
        ch("measurement-units", "Mesure linéaire, unités SI et impériales", "Linear measurement, SI and imperial units", "Mesurer, estimer et convertir entre unités SI et impériales.", "Measure, estimate and convert between SI and imperial units.", measurementUnitsSheet),
        ch("surface-area-volume", "Aire de surface et volume", "Surface area and volume", "Calculer l'aire de surface et le volume de cônes, cylindres, prismes, pyramides et sphères.", "Find surface area and volume of cones, cylinders, prisms, pyramids and spheres.", surfaceAreaVolumeSheet),
        ch("trigonometry", "Rapports trigonométriques", "Trigonometric ratios", "Utiliser sinus, cosinus et tangente dans les triangles rectangles.", "Use sine, cosine and tangent in right triangles.", trigonometrySheet),
      ],
    },
    {
      title: { fr: "L'algèbre et le nombre", en: "Algebra and number" },
      chapters: [
        ch("factors-roots", "Facteurs, racines carrées et cubiques", "Factors, square and cube roots", "Trouver facteurs premiers, PGCD, PPCM, racines carrées et cubiques.", "Find prime factors, GCF, LCM, square roots and cube roots.", factorsRootsSheet),
        ch("irrational-numbers", "Les nombres irrationnels", "Irrational numbers", "Reconnaître, simplifier et ordonner des nombres irrationnels.", "Identify, simplify and order irrational numbers.", irrationalNumbersSheet),
        ch("exponents", "Les puissances et les exposants", "Powers and exponents", "Travailler avec des exposants entiers et rationnels.", "Work with integral and rational exponents.", exponentsSheet),
        ch("polynomial-multiplication", "Multiplier des polynômes", "Multiplying polynomials", "Multiplier des monômes, binômes et trinômes.", "Multiply monomials, binomials and trinomials.", polynomialMultiplicationSheet),
        ch("factoring", "La factorisation", "Factoring", "Mettre en évidence un facteur commun et factoriser des trinômes.", "Factor out common factors and factor trinomials.", factoringSheet),
      ],
    },
    {
      title: { fr: "Les relations et les fonctions", en: "Relations and functions" },
      chapters: [
        ch("relations-functions", "Relations et fonctions", "Relations and functions", "Interpréter des graphiques et distinguer une relation d'une fonction; notation fonctionnelle.", "Interpret graphs, tell relations from functions; function notation.", relationsFunctionsSheet),
        ch("slope", "La pente", "Slope", "Comprendre et calculer la pente d'une droite, y compris des droites parallèles et perpendiculaires.", "Understand and find slope, including parallel and perpendicular lines.", slopeSheet),
        ch("linear-relations-10c", "Les relations linéaires", "Linear relations", "Décrire une relation linéaire et en trouver l'équation sous différentes formes.", "Describe a linear relation and find its equation in different forms.", linearRelations10cSheet),
        ch("systems-of-equations", "Systèmes d'équations linéaires", "Systems of linear equations", "Résoudre des systèmes à deux variables, graphiquement et algébriquement.", "Solve two-variable systems graphically and algebraically.", systemsSheet),
      ],
    },
  ],
};

export const libraryProvinces: readonly LibraryProvince[] = [
  {
    slug: "alberta",
    name: { fr: "Alberta", en: "Alberta" },
    available: true,
    officialHomeUrl: "https://curriculum.learnalberta.ca/curriculum/en/area/MAT",
    courses: [albertaMath7, albertaMath10C],
  },
  { slug: "british-columbia", name: { fr: "Colombie-Britannique", en: "British Columbia" }, available: false, courses: [] },
  { slug: "ontario", name: { fr: "Ontario", en: "Ontario" }, available: false, courses: [] },
  { slug: "quebec", name: { fr: "Québec", en: "Quebec" }, available: false, courses: [] },
];

export function getLibraryProvince(slug: string) {
  return libraryProvinces.find((p) => p.slug === slug && p.available);
}

export function getLibraryCourse(provinceSlug: string, courseSlug: string) {
  return getLibraryProvince(provinceSlug)?.courses.find((c) => c.slug === courseSlug);
}

export function getLibraryChapter(provinceSlug: string, courseSlug: string, chapterSlug: string) {
  const course = getLibraryCourse(provinceSlug, courseSlug);
  if (!course) return undefined;
  for (const strand of course.strands) {
    const chapter = strand.chapters.find((c) => c.slug === chapterSlug);
    if (chapter) return { course, strand, chapter };
  }
  return undefined;
}

export function countSheets(course: LibraryCourse) {
  return course.strands.reduce((n, s) => n + s.chapters.filter((c) => c.sheet).length, 0);
}

export function pick(text: L, locale: string) {
  return locale === "fr" ? text.fr : text.en;
}
