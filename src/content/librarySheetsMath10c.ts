import { same, sheet } from "@/content/librarySheetBuilder";

/**
 * LIBRARY-2 — Alberta Mathematics 10C (MAT1791). Written by FutureTutor;
 * drafts until reviewed by a tutor. Decimal answers are rounded to the
 * tenth unless stated otherwise.
 */

export const measurementUnitsSheet = sheet({
  summary: [
    "Au Canada, on utilise surtout le système international (SI : cm, m, km), mais les unités impériales (pouce, pied, verge, mille) restent courantes. En 10C, l'élève mesure, estime et convertit d'un système à l'autre grâce au raisonnement proportionnel.",
    "In Canada we mostly use SI units (cm, m, km), but imperial units (inch, foot, yard, mile) are still common. In 10C, students measure, estimate and convert between systems using proportional reasoning.",
  ],
  mustKnow: [
    ["1 po = 2,54 cm (exact).", "1 in = 2.54 cm (exact)."],
    ["1 pi = 12 po; 1 vg = 3 pi; 1 mi = 1 760 vg ≈ 1,609 km.", "1 ft = 12 in; 1 yd = 3 ft; 1 mi = 1,760 yd ≈ 1.609 km."],
    ["Pour convertir, on multiplie par un rapport égal à 1, par exemple 2,54 cm / 1 po.", "To convert, multiply by a ratio equal to 1, for example 2.54 cm / 1 in."],
    ["On choisit l'instrument et l'unité selon la précision voulue.", "Choose the tool and unit for the precision needed."],
  ],
  explanation: [
    ["En plaçant les unités dans les rapports, celles qu'on ne veut plus s'annulent : c'est une bonne façon de vérifier sa conversion.", "Writing units in the ratios makes unwanted units cancel: a good way to check a conversion."],
  ],
  examples: [
    { problem: ["5 pi 8 po en centimètres", "5 ft 8 in in centimetres"], steps: [["5 × 12 + 8 = 68 po.", "5 × 12 + 8 = 68 in."], ["68 × 2,54 = 172,72 cm.", "68 × 2.54 = 172.72 cm."]], answer: ["≈ 172,7 cm", "≈ 172.7 cm"] },
    { problem: ["10 km en milles", "10 km in miles"], steps: [["10 ÷ 1,609 ≈ 6,21.", "10 ÷ 1.609 ≈ 6.21."]], answer: ["≈ 6,2 mi", "≈ 6.2 mi"] },
  ],
  mistakes: [
    ["Multiplier au lieu de diviser (ou l'inverse) : vérifier si la réponse doit être plus grande ou plus petite.", "Multiplying instead of dividing (or the reverse): check whether the answer should be larger or smaller."],
    ["Oublier de convertir les pieds en pouces avant d'utiliser 2,54.", "Forgetting to convert feet to inches before using 2.54."],
  ],
  practice: [
    [["3 pi en pouces", "3 ft in inches"], ["36 po", "36 in"]],
    [["12 po en centimètres", "12 in in centimetres"], ["30,48 cm", "30.48 cm"]],
    [["100 cm en pouces", "100 cm in inches"], ["≈ 39,4 po", "≈ 39.4 in"]],
    [["2 vg en pieds", "2 yd in feet"], ["6 pi", "6 ft"]],
    [["Une course de 5 km, en milles?", "A 5 km race, in miles?"], ["≈ 3,1 mi", "≈ 3.1 mi"]],
  ],
  tips: [
    ["Mesurez la taille de chacun en pieds et en centimètres et comparez.", "Measure everyone's height in feet and in centimetres and compare."],
  ],
});

export const surfaceAreaVolumeSheet = sheet({
  summary: [
    "En 10C, l'élève calcule l'aire de surface (l'emballage) et le volume (l'espace à l'intérieur) de prismes, pyramides, cylindres, cônes et sphères droits, en unités SI ou impériales.",
    "In 10C, students find the surface area (the wrapping) and volume (the space inside) of right prisms, pyramids, cylinders, cones and spheres, in SI or imperial units.",
  ],
  mustKnow: [
    ["Prisme et cylindre : V = aire de la base × hauteur. Cylindre : V = πr²h, AS = 2πr² + 2πrh.", "Prism and cylinder: V = base area × height. Cylinder: V = πr²h, SA = 2πr² + 2πrh."],
    ["Pyramide et cône : V = 1/3 × aire de la base × hauteur. Cône : AS = πr² + πrs (s = apothème).", "Pyramid and cone: V = 1/3 × base area × height. Cone: SA = πr² + πrs (s = slant height)."],
    ["Sphère : V = 4/3 πr³, AS = 4πr².", "Sphere: V = 4/3 πr³, SA = 4πr²."],
    ["Les aires sont en unités carrées, les volumes en unités cubes.", "Areas are in square units, volumes in cubic units."],
  ],
  explanation: [
    ["Une pyramide (ou un cône) contient le tiers du prisme (ou du cylindre) de même base et de même hauteur.", "A pyramid (or cone) holds one third of the prism (or cylinder) with the same base and height."],
    ["On garde π dans les calculs et on arrondit seulement à la fin.", "Keep π in the calculations and round only at the end."],
  ],
  examples: [
    {
      problem: ["Cylindre : r = 3 cm, h = 10 cm", "Cylinder: r = 3 cm, h = 10 cm"],
      steps: [["V = π × 9 × 10 = 90π ≈ 282,7 cm³.", "V = π × 9 × 10 = 90π ≈ 282.7 cm³."], ["AS = 2π(9) + 2π(3)(10) = 78π ≈ 245,0 cm².", "SA = 2π(9) + 2π(3)(10) = 78π ≈ 245.0 cm²."]],
      answer: ["V ≈ 282,7 cm³, AS ≈ 245,0 cm²", "V ≈ 282.7 cm³, SA ≈ 245.0 cm²"],
    },
    {
      problem: ["Sphère : r = 6 cm", "Sphere: r = 6 cm"],
      steps: [["AS = 4π × 36 = 144π ≈ 452,4 cm².", "SA = 4π × 36 = 144π ≈ 452.4 cm²."], ["V = 4/3 π × 216 = 288π ≈ 904,8 cm³.", "V = 4/3 π × 216 = 288π ≈ 904.8 cm³."]],
      answer: ["AS ≈ 452,4 cm², V ≈ 904,8 cm³", "SA ≈ 452.4 cm², V ≈ 904.8 cm³"],
    },
  ],
  mistakes: [
    ["Confondre la hauteur et l'apothème d'un cône ou d'une pyramide.", "Mixing up the height and the slant height of a cone or pyramid."],
    ["Oublier le 1/3 pour les cônes et les pyramides.", "Forgetting the 1/3 for cones and pyramids."],
  ],
  practice: [
    [["Prisme rectangulaire de 4 × 5 × 6 cm : volume", "Rectangular prism 4 × 5 × 6 cm: volume"], same("120 cm³")],
    [["Cône : r = 3 cm, h = 4 cm : volume", "Cone: r = 3 cm, h = 4 cm: volume"], ["12π ≈ 37,7 cm³", "12π ≈ 37.7 cm³"]],
    [["Même cône, apothème s = 5 cm : aire de surface", "Same cone, slant height s = 5 cm: surface area"], ["24π ≈ 75,4 cm²", "24π ≈ 75.4 cm²"]],
    [["Pyramide à base carrée de 6 cm de côté, h = 4 cm : volume", "Square pyramid, base side 6 cm, h = 4 cm: volume"], same("48 cm³")],
    [["Sphère : r = 3 cm : volume", "Sphere: r = 3 cm: volume"], ["36π ≈ 113,1 cm³", "36π ≈ 113.1 cm³"]],
  ],
  tips: [
    ["Comparez le volume d'une canette et d'un cornet de crème glacée de même rayon : la formule du tiers devient concrète.", "Compare a can and an ice-cream cone with the same radius: the one-third rule becomes concrete."],
  ],
});

export const trigonometrySheet = sheet({
  summary: [
    "Dans un triangle rectangle, les rapports trigonométriques relient un angle aigu aux longueurs des côtés. En 10C, l'élève utilise le sinus, le cosinus et la tangente pour trouver un côté ou un angle inconnu.",
    "In a right triangle, trigonometric ratios link an acute angle to the side lengths. In 10C, students use sine, cosine and tangent to find a missing side or angle.",
  ],
  mustKnow: [
    ["sin θ = opposé / hypoténuse; cos θ = adjacent / hypoténuse; tan θ = opposé / adjacent (SOH CAH TOA).", "sin θ = opposite / hypotenuse; cos θ = adjacent / hypotenuse; tan θ = opposite / adjacent (SOH CAH TOA)."],
    ["L'hypoténuse est le plus long côté, en face de l'angle droit.", "The hypotenuse is the longest side, opposite the right angle."],
    ["Pour trouver un angle, on utilise la fonction inverse : θ = sin⁻¹(…), cos⁻¹(…) ou tan⁻¹(…).", "To find an angle, use the inverse: θ = sin⁻¹(…), cos⁻¹(…) or tan⁻¹(…)."],
    ["La calculatrice doit être en degrés.", "The calculator must be in degree mode."],
  ],
  explanation: [
    ["On repère l'angle utilisé, on nomme les côtés (opposé, adjacent, hypoténuse) par rapport à cet angle, puis on choisit le rapport qui contient le côté connu et le côté cherché.", "Locate the angle, label the sides (opposite, adjacent, hypotenuse) relative to it, then pick the ratio that contains the known side and the side you want."],
  ],
  examples: [
    { problem: ["Angle de 30°, hypoténuse 10 cm : côté opposé?", "30° angle, hypotenuse 10 cm: opposite side?"], steps: [["sin 30° = x / 10, donc x = 10 × sin 30° = 10 × 0,5.", "sin 30° = x / 10, so x = 10 × sin 30° = 10 × 0.5."]], answer: same("5 cm") },
    { problem: ["Opposé 7 cm, adjacent 7 cm : angle?", "Opposite 7 cm, adjacent 7 cm: angle?"], steps: [["tan θ = 7/7 = 1, donc θ = tan⁻¹(1).", "tan θ = 7/7 = 1, so θ = tan⁻¹(1)."]], answer: same("45°") },
  ],
  mistakes: [
    ["Nommer les côtés par rapport au mauvais angle.", "Labelling the sides relative to the wrong angle."],
    ["Calculatrice en radians : sin 30 donne alors −0,988 au lieu de 0,5.", "Calculator in radians: sin 30 then gives −0.988 instead of 0.5."],
  ],
  practice: [
    [["Angle de 60°, hypoténuse 12 : côté adjacent?", "60° angle, hypotenuse 12: adjacent side?"], ["12 × cos 60° = 6", "12 × cos 60° = 6"]],
    [["tan 40° = x / 8 : trouve x.", "tan 40° = x / 8: find x."], ["≈ 6,7", "≈ 6.7"]],
    [["Hypoténuse 13, opposé 5 : trouve l'angle.", "Hypotenuse 13, opposite 5: find the angle."], ["sin⁻¹(5/13) ≈ 22,6°", "sin⁻¹(5/13) ≈ 22.6°"]],
    [["Une échelle de 5 m fait un angle de 70° avec le sol. À quelle hauteur touche-t-elle le mur?", "A 5 m ladder makes a 70° angle with the ground. How high up the wall does it reach?"], ["5 × sin 70° ≈ 4,7 m", "5 × sin 70° ≈ 4.7 m"]],
    [["Opposé 9, adjacent 12 : trouve l'angle.", "Opposite 9, adjacent 12: find the angle."], ["tan⁻¹(0,75) ≈ 36,9°", "tan⁻¹(0.75) ≈ 36.9°"]],
  ],
  tips: [
    ["Demandez à votre ado de mesurer la hauteur d'un arbre avec un angle et une distance : la trigo sert vraiment.", "Ask your teen to measure a tree's height with an angle and a distance: trig is genuinely useful."],
    ["Vérifiez ensemble le mode « degrés » de la calculatrice avant chaque examen.", "Check the calculator's degree mode together before every test."],
  ],
});

export const factorsRootsSheet = sheet({
  summary: [
    "Tout nombre entier se décompose en facteurs premiers. Cette décomposition permet de trouver le plus grand commun diviseur (PGCD), le plus petit commun multiple (PPCM), et les racines carrées et cubiques des carrés et cubes parfaits.",
    "Every whole number breaks down into prime factors. This factorization gives the greatest common factor (GCF), the least common multiple (LCM), and the square and cube roots of perfect squares and cubes.",
  ],
  mustKnow: [
    ["Décomposition en facteurs premiers : 84 = 2² × 3 × 7.", "Prime factorization: 84 = 2² × 3 × 7."],
    ["PGCD : facteurs communs avec le plus petit exposant. PPCM : tous les facteurs avec le plus grand exposant.", "GCF: common factors with the lowest exponent. LCM: all factors with the highest exponent."],
    ["Un carré parfait a des exposants pairs; un cube parfait, des exposants multiples de 3.", "A perfect square has even exponents; a perfect cube has exponents that are multiples of 3."],
  ],
  explanation: [
    ["Pour √1 764 : 1 764 = 2² × 3² × 7², donc √1 764 = 2 × 3 × 7 = 42.", "For √1,764: 1,764 = 2² × 3² × 7², so √1,764 = 2 × 3 × 7 = 42."],
  ],
  examples: [
    {
      problem: ["PGCD et PPCM de 36 et 48", "GCF and LCM of 36 and 48"],
      steps: [["36 = 2² × 3²; 48 = 2⁴ × 3.", "36 = 2² × 3²; 48 = 2⁴ × 3."], ["PGCD = 2² × 3 = 12; PPCM = 2⁴ × 3² = 144.", "GCF = 2² × 3 = 12; LCM = 2⁴ × 3² = 144."]],
      answer: ["PGCD 12, PPCM 144", "GCF 12, LCM 144"],
    },
    { problem: same("∛125"), steps: [["125 = 5³.", "125 = 5³."]], answer: same("5") },
  ],
  mistakes: [
    ["Inverser PGCD et PPCM : le PGCD est toujours plus petit ou égal aux nombres, le PPCM plus grand ou égal.", "Swapping GCF and LCM: the GCF is never larger than the numbers, the LCM never smaller."],
    ["Laisser un facteur non premier (comme 4 ou 6) dans la décomposition.", "Leaving a non-prime factor (like 4 or 6) in the factorization."],
  ],
  practice: [
    [["Décompose 90 en facteurs premiers.", "Prime factorization of 90."], same("2 × 3² × 5")],
    [["PGCD de 24 et 60", "GCF of 24 and 60"], same("12")],
    [["PPCM de 8 et 12", "LCM of 8 and 12"], same("24")],
    [same("√324"), same("18")],
    [same("∛216"), same("6")],
  ],
  tips: [
    ["Le PPCM sert dans la vie : deux autobus passent toutes les 8 et 12 minutes; ils repassent ensemble toutes les 24 minutes.", "The LCM is useful: two buses come every 8 and 12 minutes; they arrive together every 24 minutes."],
  ],
});

export const irrationalNumbersSheet = sheet({
  summary: [
    "Un nombre irrationnel ne peut pas s'écrire comme une fraction : son développement décimal ne se termine pas et ne se répète pas (√2, π). En 10C, l'élève reconnaît, simplifie et ordonne des radicaux.",
    "An irrational number cannot be written as a fraction: its decimal never ends and never repeats (√2, π). In 10C, students identify, simplify and order radicals.",
  ],
  mustKnow: [
    ["√49 = 7 est rationnel; √50 est irrationnel.", "√49 = 7 is rational; √50 is irrational."],
    ["Simplifier : on sort le plus grand carré parfait. √72 = √(36 × 2) = 6√2 (radical composé).", "Simplify by taking out the largest perfect square. √72 = √(36 × 2) = 6√2 (mixed radical)."],
    ["Inverse : 3√5 = √(9 × 5) = √45 (radical entier).", "Reverse: 3√5 = √(9 × 5) = √45 (entire radical)."],
    ["Pour ordonner, on écrit tout en radicaux entiers ou en décimaux approximatifs.", "To order, write everything as entire radicals or approximate decimals."],
  ],
  explanation: [
    ["Les ensembles de nombres s'emboîtent : naturels ⊂ entiers ⊂ rationnels; les rationnels et les irrationnels forment ensemble les nombres réels.", "Number sets nest: natural ⊂ integers ⊂ rational; rational and irrational numbers together make the real numbers."],
  ],
  examples: [
    { problem: same("√72"), steps: [same("√72 = √36 × √2")], answer: same("6√2") },
    {
      problem: ["Ordonne √10, 3 et 2√3.", "Order √10, 3 and 2√3."],
      steps: [["3 = √9 et 2√3 = √12.", "3 = √9 and 2√3 = √12."], ["√9 < √10 < √12.", "√9 < √10 < √12."]],
      answer: same("3 < √10 < 2√3"),
    },
  ],
  mistakes: [
    ["Sortir un facteur qui n'est pas un carré parfait : √18 ≠ 9√2.", "Taking out a factor that isn't a perfect square: √18 ≠ 9√2."],
    ["Croire que √(a + b) = √a + √b.", "Thinking √(a + b) = √a + √b."],
  ],
  practice: [
    [same("√48"), same("4√3")],
    [same("∛54"), same("3∛2")],
    [["Écris 2√7 en radical entier.", "Write 2√7 as an entire radical."], same("√28")],
    [["√49 est-il irrationnel?", "Is √49 irrational?"], ["Non, √49 = 7.", "No, √49 = 7."]],
    [["Ordonne 5, √20 et 2√6.", "Order 5, √20 and 2√6."], same("√20 < 2√6 < 5")],
  ],
  tips: [
    ["Faites estimer √50 avant la calculatrice : « entre 7 et 8, plus près de 7 ». C'est le meilleur réflexe de vérification.", "Have your teen estimate √50 before using the calculator: “between 7 and 8, closer to 7”. It's the best checking habit."],
  ],
});

export const exponentsSheet = sheet({
  summary: [
    "En 10C, l'élève applique les lois des exposants avec des exposants entiers (positifs, nuls, négatifs) et rationnels, ce qui relie les puissances aux racines.",
    "In 10C, students apply exponent laws with integral (positive, zero, negative) and rational exponents, which links powers to roots.",
  ],
  mustKnow: [
    ["aᵐ × aⁿ = aᵐ⁺ⁿ; aᵐ ÷ aⁿ = aᵐ⁻ⁿ; (aᵐ)ⁿ = aᵐⁿ.", "aᵐ × aⁿ = aᵐ⁺ⁿ; aᵐ ÷ aⁿ = aᵐ⁻ⁿ; (aᵐ)ⁿ = aᵐⁿ."],
    ["a⁰ = 1 (a ≠ 0); a⁻ⁿ = 1 / aⁿ.", "a⁰ = 1 (a ≠ 0); a⁻ⁿ = 1 / aⁿ."],
    ["a^(1/n) = ⁿ√a et a^(m/n) = (ⁿ√a)ᵐ.", "a^(1/n) = ⁿ√a and a^(m/n) = (ⁿ√a)ᵐ."],
  ],
  explanation: [
    ["Un exposant négatif ne rend pas le nombre négatif : il indique l'inverse. 5⁻² = 1/25.", "A negative exponent doesn't make the number negative: it means the reciprocal. 5⁻² = 1/25."],
    ["Pour a^(m/n), on prend d'abord la racine, puis la puissance : les nombres restent petits.", "For a^(m/n), take the root first, then the power: numbers stay small."],
  ],
  examples: [
    { problem: same("2³ × 2⁴"), steps: [same("2³⁺⁴ = 2⁷")], answer: same("128") },
    { problem: same("8^(2/3)"), steps: [same("(∛8)² = 2²")], answer: same("4") },
    { problem: same("(x³)² ÷ x⁴"), steps: [same("x⁶ ÷ x⁴")], answer: same("x²") },
  ],
  mistakes: [
    ["Multiplier les exposants au lieu de les additionner dans aᵐ × aⁿ.", "Multiplying exponents instead of adding them in aᵐ × aⁿ."],
    ["Écrire 5⁻² = −25.", "Writing 5⁻² = −25."],
    ["Appliquer la puissance seulement à la variable : (2x²)³ = 8x⁶, pas 2x⁶.", "Applying the power only to the variable: (2x²)³ = 8x⁶, not 2x⁶."],
  ],
  practice: [
    [same("3⁰"), same("1")],
    [same("10⁻³"), ["0,001", "0.001"]],
    [same("27^(1/3)"), same("3")],
    [same("16^(3/4)"), same("(⁴√16)³ = 2³ = 8")],
    [same("(2x²)³"), same("8x⁶")],
  ],
  tips: [
    ["Encouragez votre ado à écrire la loi utilisée à côté de chaque étape : c'est ce qui évite la plupart des erreurs.", "Encourage your teen to write the law used next to each step: it prevents most mistakes."],
  ],
});

export const polynomialMultiplicationSheet = sheet({
  summary: [
    "Multiplier des polynômes, c'est appliquer la distributivité : chaque terme du premier facteur multiplie chaque terme du second. En 10C, on multiplie des monômes, binômes et trinômes.",
    "Multiplying polynomials means using the distributive property: each term of the first factor multiplies each term of the second. In 10C, students multiply monomials, binomials and trinomials.",
  ],
  mustKnow: [
    ["a(b + c) = ab + ac.", "a(b + c) = ab + ac."],
    ["(a + b)(c + d) = ac + ad + bc + bd, puis on regroupe les termes semblables.", "(a + b)(c + d) = ac + ad + bc + bd, then collect like terms."],
    ["Produits remarquables : (a + b)² = a² + 2ab + b²; (a − b)² = a² − 2ab + b²; (a + b)(a − b) = a² − b².", "Special products: (a + b)² = a² + 2ab + b²; (a − b)² = a² − 2ab + b²; (a + b)(a − b) = a² − b²."],
  ],
  explanation: [
    ["Un modèle d'aire (un rectangle découpé en cases) montre visuellement chaque produit partiel.", "An area model (a rectangle split into boxes) shows each partial product visually."],
  ],
  examples: [
    { problem: same("(x + 3)(x + 5)"), steps: [same("x² + 5x + 3x + 15")], answer: same("x² + 8x + 15") },
    { problem: same("(2x − 1)(x + 4)"), steps: [same("2x² + 8x − x − 4")], answer: same("2x² + 7x − 4") },
    { problem: same("(x + 2)(x² − x + 3)"), steps: [same("x³ − x² + 3x + 2x² − 2x + 6")], answer: same("x³ + x² + x + 6") },
  ],
  mistakes: [
    ["(x + 3)² = x² + 9 : il manque le terme du milieu 6x.", "(x + 3)² = x² + 9: the middle term 6x is missing."],
    ["Perdre un signe négatif en distribuant.", "Losing a negative sign while distributing."],
  ],
  practice: [
    [same("3x(x − 4)"), same("3x² − 12x")],
    [same("(x + 6)(x − 2)"), same("x² + 4x − 12")],
    [same("(x − 5)²"), same("x² − 10x + 25")],
    [same("(x + 3)(x − 3)"), same("x² − 9")],
    [same("(2x + 3)(3x + 1)"), same("6x² + 11x + 3")],
  ],
  tips: [
    ["Remplacez x par un nombre (par exemple 2) des deux côtés : si les résultats sont égaux, le développement est probablement juste.", "Replace x with a number (say 2) on both sides: if the results match, the expansion is probably right."],
  ],
});

export const factoringSheet = sheet({
  summary: [
    "Factoriser, c'est l'inverse de développer : on réécrit un polynôme comme un produit. En 10C, l'élève met en évidence un facteur commun et factorise des trinômes et des différences de carrés.",
    "Factoring is the reverse of expanding: rewrite a polynomial as a product. In 10C, students factor out a common factor and factor trinomials and differences of squares.",
  ],
  mustKnow: [
    ["Toujours chercher d'abord un facteur commun : 6x² + 9x = 3x(2x + 3).", "Always look for a common factor first: 6x² + 9x = 3x(2x + 3)."],
    ["x² + bx + c : deux nombres dont le produit est c et la somme b.", "x² + bx + c: two numbers whose product is c and sum is b."],
    ["Différence de carrés : a² − b² = (a − b)(a + b).", "Difference of squares: a² − b² = (a − b)(a + b)."],
    ["Trinôme carré parfait : a² + 2ab + b² = (a + b)².", "Perfect square trinomial: a² + 2ab + b² = (a + b)²."],
  ],
  explanation: [
    ["Pour ax² + bx + c (a ≠ 1), on cherche deux nombres dont le produit est a × c et la somme b, puis on décompose le terme du milieu et on regroupe.", "For ax² + bx + c (a ≠ 1), find two numbers with product a × c and sum b, then split the middle term and group."],
    ["On vérifie en redéveloppant.", "Check by expanding again."],
  ],
  examples: [
    { problem: same("x² + 7x + 12"), steps: [["3 × 4 = 12 et 3 + 4 = 7.", "3 × 4 = 12 and 3 + 4 = 7."]], answer: same("(x + 3)(x + 4)") },
    { problem: same("4x² − 25"), steps: [same("(2x)² − 5²")], answer: same("(2x − 5)(2x + 5)") },
    {
      problem: same("2x² + 7x + 3"),
      steps: [["a × c = 6 : 6 et 1 (somme 7).", "a × c = 6: 6 and 1 (sum 7)."], same("2x² + 6x + x + 3 = 2x(x + 3) + 1(x + 3)")],
      answer: same("(2x + 1)(x + 3)"),
    },
  ],
  mistakes: [
    ["Oublier le facteur commun avant de factoriser le trinôme.", "Forgetting the common factor before factoring the trinomial."],
    ["Tenter de factoriser x² + 9 comme une différence de carrés : une somme de carrés ne se factorise pas ainsi.", "Trying to factor x² + 9 as a difference of squares: a sum of squares doesn't factor that way."],
  ],
  practice: [
    [same("5x − 20"), same("5(x − 4)")],
    [same("x² − x − 12"), same("(x − 4)(x + 3)")],
    [same("x² − 49"), same("(x − 7)(x + 7)")],
    [same("x² + 10x + 25"), same("(x + 5)²")],
    [same("3x² + 10x + 8"), same("(3x + 4)(x + 2)")],
  ],
  tips: [
    ["Demandez à votre ado de redévelopper chaque réponse : c'est la vérification la plus fiable.", "Ask your teen to expand each answer back out: it's the most reliable check."],
  ],
});

export const relationsFunctionsSheet = sheet({
  summary: [
    "Une relation associe des valeurs d'entrée à des valeurs de sortie. Une fonction est une relation où chaque entrée a une seule sortie. En 10C, l'élève interprète des graphiques, trouve le domaine et l'image, et utilise la notation f(x).",
    "A relation pairs input values with output values. A function is a relation where each input has exactly one output. In 10C, students interpret graphs, find domain and range, and use f(x) notation.",
  ],
  mustKnow: [
    ["Test de la droite verticale : si une droite verticale coupe le graphique plus d'une fois, ce n'est pas une fonction.", "Vertical line test: if a vertical line crosses the graph more than once, it is not a function."],
    ["Domaine : toutes les valeurs de x possibles. Image : toutes les valeurs de y obtenues.", "Domain: all possible x-values. Range: all resulting y-values."],
    ["f(4) veut dire : remplacer x par 4 dans la règle de f.", "f(4) means: replace x with 4 in the rule for f."],
  ],
  explanation: [
    ["Deux entrées peuvent avoir la même sortie dans une fonction ; c'est une entrée avec deux sorties qui est interdite.", "Two inputs may share an output in a function; it's one input with two outputs that isn't allowed."],
    ["Lire un graphique, c'est raconter une situation : « la température monte jusqu'à midi puis redescend ».", "Reading a graph means telling a story: “the temperature rises until noon, then falls”."],
  ],
  examples: [
    { problem: ["{(1, 2), (2, 4), (3, 6)} est-elle une fonction?", "Is {(1, 2), (2, 4), (3, 6)} a function?"], steps: [["Chaque x a une seule sortie.", "Each x has one output."]], answer: ["Oui", "Yes"] },
    { problem: ["f(x) = 3x − 2 : trouve f(4).", "f(x) = 3x − 2: find f(4)."], steps: [same("3(4) − 2 = 12 − 2")], answer: same("10") },
  ],
  mistakes: [
    ["Croire qu'une sortie répétée empêche d'être une fonction.", "Thinking a repeated output stops it from being a function."],
    ["Lire f(x) comme « f multiplié par x ».", "Reading f(x) as “f times x”."],
  ],
  practice: [
    [["{(2, 3), (4, 3), (5, 1)} est-elle une fonction?", "Is {(2, 3), (4, 3), (5, 1)} a function?"], ["Oui (une sortie répétée est permise).", "Yes (a repeated output is allowed)."]],
    [["f(x) = 2x + 5 : trouve f(−3).", "f(x) = 2x + 5: find f(−3)."], same("−1")],
    [["f(x) = 7 − x : pour quelle valeur de x a-t-on f(x) = 2?", "f(x) = 7 − x: for what x is f(x) = 2?"], same("x = 5")],
    [["Un cercle est-il le graphique d'une fonction?", "Is a circle the graph of a function?"], ["Non, il échoue au test de la droite verticale.", "No, it fails the vertical line test."]],
    [["La température est relevée pendant 24 heures. Quel est le domaine?", "Temperature is recorded over 24 hours. What is the domain?"], ["0 ≤ t ≤ 24 (heures)", "0 ≤ t ≤ 24 (hours)"]],
  ],
  tips: [
    ["Regardez un graphique dans les nouvelles et demandez à votre ado de raconter ce qu'il montre.", "Look at a graph in the news and ask your teen to explain what it shows."],
  ],
});

export const slopeSheet = sheet({
  summary: [
    "La pente mesure l'inclinaison d'une droite : de combien elle monte (ou descend) quand on avance d'une unité vers la droite. En 10C, l'élève calcule la pente et reconnaît les droites parallèles et perpendiculaires.",
    "Slope measures how steep a line is: how much it rises (or falls) as you move one unit to the right. In 10C, students find slope and recognize parallel and perpendicular lines.",
  ],
  mustKnow: [
    ["m = déplacement vertical / déplacement horizontal = (y₂ − y₁) / (x₂ − x₁).", "m = rise / run = (y₂ − y₁) / (x₂ − x₁)."],
    ["Pente positive : la droite monte; négative : elle descend; nulle : horizontale; non définie : verticale.", "Positive slope: the line rises; negative: it falls; zero: horizontal; undefined: vertical."],
    ["Droites parallèles : même pente. Droites perpendiculaires : pentes opposées et inverses (2 et −1/2).", "Parallel lines: same slope. Perpendicular lines: negative reciprocal slopes (2 and −1/2)."],
  ],
  explanation: [
    ["La pente est un taux de variation : 60 km en 1 h donne une pente de 60 km/h sur un graphique distance-temps.", "Slope is a rate of change: 60 km in 1 h is a slope of 60 km/h on a distance-time graph."],
  ],
  examples: [
    { problem: ["Pente entre (1, 2) et (4, 8)", "Slope between (1, 2) and (4, 8)"], steps: [same("(8 − 2) / (4 − 1) = 6/3")], answer: same("2") },
    { problem: ["Pente perpendiculaire à une droite de pente 2/3", "Slope perpendicular to a line with slope 2/3"], steps: [["On inverse et on change le signe.", "Flip it and change the sign."]], answer: same("−3/2") },
  ],
  mistakes: [
    ["Mettre les x au numérateur.", "Putting the x-values in the numerator."],
    ["Soustraire dans un ordre différent en haut et en bas.", "Subtracting in a different order on top and bottom."],
  ],
  practice: [
    [["Pente entre (−2, 5) et (2, −3)", "Slope between (−2, 5) and (2, −3)"], same("−8/4 = −2")],
    [["Pente entre (3, 1) et (7, 1)", "Slope between (3, 1) and (7, 1)"], ["0 (droite horizontale)", "0 (horizontal line)"]],
    [["Pente entre (2, 1) et (2, 6)", "Slope between (2, 1) and (2, 6)"], ["Non définie (droite verticale)", "Undefined (vertical line)"]],
    [["Pente d'une droite parallèle à une droite de pente −4", "Slope of a line parallel to one with slope −4"], same("−4")],
    [["Pente d'une droite perpendiculaire à une droite de pente 5", "Slope of a line perpendicular to one with slope 5"], same("−1/5")],
  ],
  tips: [
    ["Les panneaux de pente sur la route (par exemple 8 %) sont des pentes : 8 m de descente pour 100 m parcourus.", "Road grade signs (for example 8%) are slopes: 8 m drop for every 100 m travelled."],
  ],
});

export const linearRelations10cSheet = sheet({
  summary: [
    "En 10C, l'élève décrit une relation linéaire de plusieurs façons et en trouve l'équation sous trois formes : pente et ordonnée à l'origine, point et pente, et forme générale.",
    "In 10C, students describe a linear relation in several ways and find its equation in three forms: slope-intercept, slope-point and general form.",
  ],
  mustKnow: [
    ["Forme pente-ordonnée : y = mx + b (m = pente, b = ordonnée à l'origine).", "Slope-intercept form: y = mx + b (m = slope, b = y-intercept)."],
    ["Forme point-pente : y − y₁ = m(x − x₁).", "Slope-point form: y − y₁ = m(x − x₁)."],
    ["Forme générale : Ax + By + C = 0, avec A, B et C entiers et A ≥ 0.", "General form: Ax + By + C = 0, with integers A, B, C and A ≥ 0."],
    ["Abscisse à l'origine : on pose y = 0. Ordonnée à l'origine : on pose x = 0.", "x-intercept: set y = 0. y-intercept: set x = 0."],
  ],
  explanation: [
    ["Avec deux points, on calcule d'abord la pente, puis on utilise l'un des points dans la forme point-pente.", "With two points, find the slope first, then use one of the points in slope-point form."],
  ],
  examples: [
    { problem: ["Pente 3, ordonnée à l'origine −2", "Slope 3, y-intercept −2"], steps: [same("y = mx + b")], answer: same("y = 3x − 2") },
    { problem: ["Passe par (2, 5), pente −1", "Passes through (2, 5), slope −1"], steps: [same("y − 5 = −1(x − 2)"), same("y = −x + 2 + 5")], answer: same("y = −x + 7") },
    {
      problem: ["Abscisse et ordonnée à l'origine de 2x + 3y − 12 = 0", "Intercepts of 2x + 3y − 12 = 0"],
      steps: [["y = 0 : 2x = 12, x = 6.", "y = 0: 2x = 12, x = 6."], ["x = 0 : 3y = 12, y = 4.", "x = 0: 3y = 12, y = 4."]],
      answer: ["(6, 0) et (0, 4)", "(6, 0) and (0, 4)"],
    },
  ],
  mistakes: [
    ["Dans la forme point-pente, garder les signes du point : (2, 5) donne y − 5 = m(x − 2), pas y + 5.", "In slope-point form, keep the point's signs: (2, 5) gives y − 5 = m(x − 2), not y + 5."],
    ["Lire la pente directement dans la forme générale sans isoler y.", "Reading the slope straight from general form without isolating y."],
  ],
  practice: [
    [["Droite passant par (0, 4) avec une pente de −2", "Line through (0, 4) with slope −2"], same("y = −2x + 4")],
    [["Droite passant par (1, 3) et (3, 7)", "Line through (1, 3) and (3, 7)"], same("y = 2x + 1")],
    [["Pente et ordonnée à l'origine de y = −1/2 x + 6", "Slope and y-intercept of y = −1/2 x + 6"], ["m = −1/2, b = 6", "m = −1/2, b = 6"]],
    [["Écris 4x − 2y + 8 = 0 sous la forme y = mx + b.", "Write 4x − 2y + 8 = 0 as y = mx + b."], same("y = 2x + 4")],
    [["Abscisse à l'origine de y = 3x − 9", "x-intercept of y = 3x − 9"], same("x = 3")],
  ],
  tips: [
    ["Un forfait de cellulaire (frais fixes + coût par Go) est une relation linéaire : faites écrire l'équation à votre ado.", "A phone plan (fixed fee + cost per GB) is a linear relation: have your teen write its equation."],
  ],
});
