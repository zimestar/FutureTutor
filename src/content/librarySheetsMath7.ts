import { same, sheet } from "@/content/librarySheetBuilder";

/**
 * LIBRARY-2 — Alberta Mathematics, Grade 7 (2016 program of studies).
 * Written by FutureTutor; drafts until reviewed by a tutor.
 */

export const divisibilitySheet = sheet({
  summary: [
    "Les règles de divisibilité permettent de savoir rapidement si un nombre se divise sans reste par 2, 3, 4, 5, 6, 8, 9 ou 10, sans faire la division. Elles aident à simplifier des fractions et à trouver des facteurs.",
    "Divisibility rules tell you quickly whether a number divides evenly by 2, 3, 4, 5, 6, 8, 9 or 10, without doing the division. They help simplify fractions and find factors.",
  ],
  mustKnow: [
    ["Par 2 : le dernier chiffre est pair. Par 5 : il finit par 0 ou 5. Par 10 : il finit par 0.", "By 2: the last digit is even. By 5: it ends in 0 or 5. By 10: it ends in 0."],
    ["Par 3 : la somme des chiffres est divisible par 3. Par 9 : la somme des chiffres est divisible par 9.", "By 3: the sum of the digits is divisible by 3. By 9: the sum of the digits is divisible by 9."],
    ["Par 4 : les deux derniers chiffres forment un nombre divisible par 4. Par 8 : les trois derniers chiffres forment un nombre divisible par 8.", "By 4: the last two digits form a number divisible by 4. By 8: the last three digits form a number divisible by 8."],
    ["Par 6 : le nombre est divisible à la fois par 2 et par 3.", "By 6: the number is divisible by both 2 and 3."],
    ["On ne peut jamais diviser par 0 : aucun nombre multiplié par 0 ne donne autre chose que 0.", "You can never divide by 0: no number times 0 gives anything but 0."],
  ],
  explanation: [
    ["On applique les règles une par une et on note celles qui fonctionnent.", "Apply the rules one by one and note which ones work."],
    ["Pour 3 et 9, on additionne les chiffres; si la somme est encore grande, on peut additionner ses chiffres à nouveau.", "For 3 and 9, add the digits; if the sum is still large, add its digits again."],
  ],
  examples: [
    {
      problem: ["Par quels nombres 4 512 est-il divisible?", "Which numbers divide 4,512?"],
      steps: [
        ["Dernier chiffre 2, pair : divisible par 2.", "Last digit 2 is even: divisible by 2."],
        ["4 + 5 + 1 + 2 = 12 : divisible par 3, mais pas par 9.", "4 + 5 + 1 + 2 = 12: divisible by 3 but not by 9."],
        ["12 est divisible par 4; 512 ÷ 8 = 64 : divisible par 4 et par 8.", "12 is divisible by 4; 512 ÷ 8 = 64: divisible by 4 and 8."],
        ["Divisible par 2 et 3, donc par 6. Ne finit pas par 0 ou 5.", "Divisible by 2 and 3, so by 6. Does not end in 0 or 5."],
      ],
      answer: ["2, 3, 4, 6 et 8", "2, 3, 4, 6 and 8"],
    },
    {
      problem: ["Par quels nombres 2 835 est-il divisible?", "Which numbers divide 2,835?"],
      steps: [
        ["Finit par 5 : divisible par 5, mais pas par 2 ni par 10.", "Ends in 5: divisible by 5, but not by 2 or 10."],
        ["2 + 8 + 3 + 5 = 18 : divisible par 3 et par 9.", "2 + 8 + 3 + 5 = 18: divisible by 3 and 9."],
      ],
      answer: ["3, 5 et 9", "3, 5 and 9"],
    },
  ],
  mistakes: [
    ["Appliquer la règle de 3 en regardant seulement le dernier chiffre.", "Applying the rule for 3 by looking only at the last digit."],
    ["Croire qu'un nombre divisible par 4 l'est aussi par 8 : 12 est divisible par 4, pas par 8.", "Thinking a number divisible by 4 is also divisible by 8: 12 is divisible by 4, not by 8."],
  ],
  practice: [
    [["738 est-il divisible par 9?", "Is 738 divisible by 9?"], ["Oui : 7 + 3 + 8 = 18.", "Yes: 7 + 3 + 8 = 18."]],
    [["1 316 est-il divisible par 4?", "Is 1,316 divisible by 4?"], ["Oui : 16 est divisible par 4.", "Yes: 16 is divisible by 4."]],
    [["2 120 est-il divisible par 6?", "Is 2,120 divisible by 6?"], ["Non : il est pair, mais 2 + 1 + 2 + 0 = 5 n'est pas divisible par 3.", "No: it is even, but 2 + 1 + 2 + 0 = 5 is not divisible by 3."]],
    [["3 000 est-il divisible par 8?", "Is 3,000 divisible by 8?"], ["Oui : 3 000 ÷ 8 = 375.", "Yes: 3,000 ÷ 8 = 375."]],
    [["Pourquoi ne peut-on pas partager 42 biscuits entre 0 ami?", "Why can't 42 cookies be shared among 0 friends?"], ["Parce qu'aucun nombre multiplié par 0 ne donne 42 : la division par 0 n'est pas définie.", "Because no number times 0 gives 42: division by 0 is undefined."]],
  ],
  tips: [
    ["Jouez avec les plaques d'immatriculation ou les numéros de maison : « Divisible par 3? »", "Play with licence plates or house numbers: “Divisible by 3?”"],
    ["Faites vérifier la réponse avec une calculatrice : votre enfant voit que la règle fonctionne.", "Have your child check with a calculator: they see that the rule works."],
  ],
});

export const decimalOperationsSheet = sheet({
  summary: [
    "En 7e année, l'élève additionne, soustrait, multiplie et divise des nombres décimaux pour résoudre des problèmes de la vie courante : argent, mesures, recettes.",
    "In Grade 7, students add, subtract, multiply and divide decimals to solve everyday problems: money, measurements, recipes.",
  ],
  mustKnow: [
    ["Pour additionner ou soustraire, on aligne les virgules.", "To add or subtract, line up the decimal points."],
    ["Pour multiplier, on multiplie comme des nombres entiers, puis on place la virgule selon le nombre total de chiffres après la virgule.", "To multiply, multiply as whole numbers, then place the decimal point using the total number of decimal places."],
    ["Pour diviser par un nombre décimal, on multiplie les deux nombres par 10, 100… pour que le diviseur devienne entier.", "To divide by a decimal, multiply both numbers by 10, 100… so the divisor becomes a whole number."],
    ["On estime d'abord pour vérifier que la réponse a du sens.", "Estimate first to check that the answer makes sense."],
  ],
  explanation: [
    ["Estimer : 2,4 × 1,3 est proche de 2 × 1 = 2, donc la réponse doit être un peu plus grande que 2.", "Estimate: 2.4 × 1.3 is close to 2 × 1 = 2, so the answer should be a bit more than 2."],
    ["Après le calcul, on compare avec l'estimation; un écart énorme signale une virgule mal placée.", "After calculating, compare with the estimate; a huge gap signals a misplaced decimal point."],
  ],
  examples: [
    { problem: ["3,75 + 12,4", "3.75 + 12.4"], steps: [["On aligne les virgules : 3,75 + 12,40.", "Line up the points: 3.75 + 12.40."]], answer: ["16,15", "16.15"] },
    {
      problem: ["2,4 × 1,3", "2.4 × 1.3"],
      steps: [["24 × 13 = 312.", "24 × 13 = 312."], ["Il y a 2 chiffres après la virgule en tout : 3,12.", "There are 2 decimal places in total: 3.12."]],
      answer: ["3,12", "3.12"],
    },
    {
      problem: ["7,2 ÷ 0,4", "7.2 ÷ 0.4"],
      steps: [["On multiplie les deux par 10 : 72 ÷ 4.", "Multiply both by 10: 72 ÷ 4."]],
      answer: ["18", "18"],
    },
  ],
  mistakes: [
    ["Aligner les derniers chiffres au lieu des virgules dans une addition.", "Lining up the last digits instead of the decimal points when adding."],
    ["Croire qu'une multiplication donne toujours un résultat plus grand : 0,5 × 8 = 4.", "Thinking multiplication always gives a bigger result: 0.5 × 8 = 4."],
  ],
  practice: [
    [["15,6 − 4,87", "15.6 − 4.87"], ["10,73", "10.73"]],
    [["0,6 × 0,05", "0.6 × 0.05"], ["0,03", "0.03"]],
    [["9,6 ÷ 1,2", "9.6 ÷ 1.2"], ["8", "8"]],
    [["4,25 × 4", "4.25 × 4"], ["17", "17"]],
    [["Trois cahiers à 2,35 $ et un stylo à 1,80 $. Combien coûte le tout?", "Three notebooks at $2.35 and a pen at $1.80. What is the total?"], ["7,05 $ + 1,80 $ = 8,85 $", "$7.05 + $1.80 = $8.85"]],
  ],
  tips: [
    ["À l'épicerie, demandez une estimation du total avant de passer à la caisse.", "At the grocery store, ask for an estimate of the total before checkout."],
    ["Doublez ou réduisez une recette ensemble : c'est de la multiplication de décimaux.", "Double or halve a recipe together: that's multiplying decimals."],
  ],
});

export const percentsSheet = sheet({
  summary: [
    "Un pourcentage indique une partie sur 100. En 7e année, l'élève résout des problèmes avec des pourcentages de 1 % à 100 % : rabais, taxes, résultats de sondages.",
    "A percent is a part out of 100. In Grade 7, students solve problems with percents from 1% to 100%: discounts, taxes, survey results.",
  ],
  mustKnow: [
    ["25 % = 25/100 = 0,25.", "25% = 25/100 = 0.25."],
    ["Pour trouver un pourcentage d'un nombre, on multiplie : 15 % de 80 = 0,15 × 80.", "To find a percent of a number, multiply: 15% of 80 = 0.15 × 80."],
    ["Pour trouver quel pourcentage représente une partie : partie ÷ tout × 100.", "To find what percent a part is: part ÷ whole × 100."],
  ],
  explanation: [
    ["Repères utiles : 50 % = la moitié, 25 % = le quart, 10 % = un dixième.", "Useful benchmarks: 50% = half, 25% = a quarter, 10% = a tenth."],
    ["10 % se calcule en déplaçant la virgule d'un rang vers la gauche : 10 % de 260 = 26.", "10% is found by moving the decimal point one place left: 10% of 260 = 26."],
  ],
  examples: [
    { problem: ["15 % de 80", "15% of 80"], steps: [["0,15 × 80 = 12.", "0.15 × 80 = 12."]], answer: ["12", "12"] },
    {
      problem: ["Un chandail de 40 $ est soldé à 25 %. Quel est le nouveau prix?", "A $40 sweater is 25% off. What is the new price?"],
      steps: [["Rabais : 25 % de 40 = 10 $.", "Discount: 25% of 40 = $10."], ["40 $ − 10 $ = 30 $.", "$40 − $10 = $30."]],
      answer: ["30 $", "$30"],
    },
  ],
  mistakes: [
    ["Soustraire le nombre du pourcentage au lieu du montant du rabais (40 − 25 = 15 $).", "Subtracting the percent number instead of the discount amount (40 − 25 = $15)."],
    ["Écrire 8 % comme 0,8 au lieu de 0,08.", "Writing 8% as 0.8 instead of 0.08."],
  ],
  practice: [
    [["30 % de 50", "30% of 50"], same("15")],
    [["18 sur 24 en pourcentage", "18 out of 24 as a percent"], ["75 %", "75%"]],
    [["5 % de 260", "5% of 260"], same("13")],
    [["La TPS de 5 % sur un achat de 60 $. Quel est le total?", "5% GST on a $60 purchase. What is the total?"], ["3 $ de taxe, 63 $ au total.", "$3 tax, $63 total."]],
    [["Écris 8 % en nombre décimal.", "Write 8% as a decimal."], ["0,08", "0.08"]],
  ],
  tips: [
    ["Regardez les circulaires de soldes ensemble et calculez les vrais prix.", "Look at sale flyers together and work out the real prices."],
    ["Au restaurant, faites calculer le pourboire avec le repère de 10 %.", "At a restaurant, have your child work out the tip using the 10% benchmark."],
  ],
});

export const fractionsDecimalsSheet = sheet({
  summary: [
    "Une fraction est une division : 3/8 = 3 ÷ 8. En 7e année, l'élève passe d'une fraction à un nombre décimal et inversement, et distingue les décimaux qui se terminent de ceux qui se répètent.",
    "A fraction is a division: 3/8 = 3 ÷ 8. In Grade 7, students convert between fractions and decimals and tell terminating decimals from repeating ones.",
  ],
  mustKnow: [
    ["Pour passer d'une fraction à un décimal, on divise le numérateur par le dénominateur.", "To change a fraction to a decimal, divide the numerator by the denominator."],
    ["Certains décimaux se terminent (3/8 = 0,375); d'autres se répètent sans fin (2/3 = 0,666…).", "Some decimals terminate (3/8 = 0.375); others repeat forever (2/3 = 0.666…)."],
    ["Pour passer d'un décimal à une fraction, on utilise la valeur de position, puis on simplifie : 0,45 = 45/100 = 9/20.", "To change a decimal to a fraction, use place value, then simplify: 0.45 = 45/100 = 9/20."],
  ],
  explanation: [
    ["On note un décimal périodique avec une barre au-dessus des chiffres qui se répètent, ou avec « … ».", "A repeating decimal is written with a bar over the repeating digits, or with “…”."],
  ],
  examples: [
    { problem: same("3/8"), steps: [["3 ÷ 8 = 0,375 : le décimal se termine.", "3 ÷ 8 = 0.375: the decimal terminates."]], answer: ["0,375", "0.375"] },
    { problem: same("2/3"), steps: [["2 ÷ 3 = 0,666… : le 6 se répète.", "2 ÷ 3 = 0.666…: the 6 repeats."]], answer: ["0,666… (périodique)", "0.666… (repeating)"] },
    { problem: ["0,45 en fraction", "0.45 as a fraction"], steps: [["45 centièmes : 45/100.", "45 hundredths: 45/100."], ["On divise par 5 : 9/20.", "Divide by 5: 9/20."]], answer: same("9/20") },
  ],
  mistakes: [
    ["Écrire 1/4 = 1,4 : la barre de fraction n'est pas une virgule.", "Writing 1/4 = 1.4: the fraction bar is not a decimal point."],
    ["Oublier de simplifier la fraction obtenue.", "Forgetting to simplify the resulting fraction."],
  ],
  practice: [
    [["1/4 en décimal", "1/4 as a decimal"], ["0,25", "0.25"]],
    [["5/6 en décimal", "5/6 as a decimal"], ["0,833… (le 3 se répète)", "0.833… (the 3 repeats)"]],
    [["0,6 en fraction", "0.6 as a fraction"], same("3/5")],
    [["0,125 en fraction", "0.125 as a fraction"], same("1/8")],
    [["7/20 en décimal", "7/20 as a decimal"], ["0,35", "0.35"]],
  ],
  tips: [
    ["Utilisez l'argent : 1/4 de dollar = 0,25 $.", "Use money: 1/4 of a dollar = $0.25."],
    ["Laissez votre enfant découvrir à la calculatrice quels dénominateurs donnent des décimaux qui se répètent.", "Let your child discover on a calculator which denominators give repeating decimals."],
  ],
});

export const fractionsAddSubtractSheet = sheet({
  summary: [
    "Pour additionner ou soustraire des fractions, il faut des parts de même taille : un dénominateur commun. En 7e année, l'élève travaille aussi avec des nombres fractionnaires comme 2 1/2.",
    "To add or subtract fractions, the parts must be the same size: a common denominator. In Grade 7, students also work with mixed numbers like 2 1/2.",
  ],
  mustKnow: [
    ["Même dénominateur : on additionne ou soustrait les numérateurs et on garde le dénominateur.", "Same denominator: add or subtract the numerators and keep the denominator."],
    ["Dénominateurs différents : on trouve un dénominateur commun (souvent le plus petit multiple commun).", "Different denominators: find a common denominator (often the lowest common multiple)."],
    ["Nombre fractionnaire : on peut le transformer en fraction impropre, 2 1/2 = 5/2.", "Mixed number: you can change it to an improper fraction, 2 1/2 = 5/2."],
    ["On simplifie la réponse à la fin.", "Simplify the answer at the end."],
  ],
  explanation: [
    ["On ne peut pas additionner directement des tiers et des quarts; on les découpe en douzièmes.", "You can't add thirds and quarters directly; cut them into twelfths."],
  ],
  examples: [
    { problem: same("1/3 + 1/4"), steps: [["Dénominateur commun 12 : 4/12 + 3/12.", "Common denominator 12: 4/12 + 3/12."]], answer: same("7/12") },
    {
      problem: same("2 1/2 − 1 3/4"),
      steps: [["En fractions impropres : 5/2 − 7/4.", "As improper fractions: 5/2 − 7/4."], ["10/4 − 7/4 = 3/4.", "10/4 − 7/4 = 3/4."]],
      answer: same("3/4"),
    },
  ],
  mistakes: [
    ["Additionner les dénominateurs : 1/3 + 1/4 n'est pas 2/7.", "Adding the denominators: 1/3 + 1/4 is not 2/7."],
    ["Oublier de transformer le numérateur quand on change le dénominateur.", "Forgetting to change the numerator when changing the denominator."],
  ],
  practice: [
    [same("2/5 + 1/5"), same("3/5")],
    [same("5/6 − 1/3"), ["5/6 − 2/6 = 3/6 = 1/2", "5/6 − 2/6 = 3/6 = 1/2"]],
    [same("3/4 + 2/3"), same("17/12 = 1 5/12")],
    [same("3 1/3 − 1 1/2"), same("11/6 = 1 5/6")],
    [["Une recette demande 1/2 tasse de lait et 3/4 tasse d'eau. Combien de liquide en tout?", "A recipe needs 1/2 cup of milk and 3/4 cup of water. How much liquid in all?"], ["5/4 = 1 1/4 tasse", "5/4 = 1 1/4 cups"]],
  ],
  tips: [
    ["Utilisez des tasses à mesurer ou une pizza découpée pour montrer pourquoi il faut des parts de même taille.", "Use measuring cups or a sliced pizza to show why parts must be the same size."],
  ],
});

export const compareOrderSheet = sheet({
  summary: [
    "Pour comparer des fractions, des décimaux et des nombres entiers, on les met sous la même forme, le plus souvent en nombres décimaux, puis on les place sur une droite numérique.",
    "To compare fractions, decimals and whole numbers, put them in the same form, usually decimals, then place them on a number line.",
  ],
  mustKnow: [
    ["On transforme les fractions en décimaux pour les comparer facilement.", "Change fractions to decimals to compare them easily."],
    ["On compare les décimaux chiffre par chiffre, en partant de la gauche.", "Compare decimals digit by digit, starting from the left."],
    ["Deux écritures différentes peuvent représenter le même nombre : 1,2 = 1 1/5.", "Two different forms can name the same number: 1.2 = 1 1/5."],
  ],
  explanation: [
    ["Ajouter des zéros à la fin d'un décimal ne change pas sa valeur : 0,7 = 0,70. Ça aide à comparer 0,7 et 0,65.", "Adding zeros at the end of a decimal doesn't change it: 0.7 = 0.70. That helps compare 0.7 and 0.65."],
  ],
  examples: [
    {
      problem: ["Ordonne 0,7, 2/3 et 0,65 du plus petit au plus grand.", "Order 0.7, 2/3 and 0.65 from least to greatest."],
      steps: [["2/3 ≈ 0,667.", "2/3 ≈ 0.667."], ["0,650 < 0,667 < 0,700.", "0.650 < 0.667 < 0.700."]],
      answer: ["0,65 < 2/3 < 0,7", "0.65 < 2/3 < 0.7"],
    },
    { problem: ["Compare 5/8 et 0,6.", "Compare 5/8 and 0.6."], steps: [["5/8 = 0,625 > 0,600.", "5/8 = 0.625 > 0.600."]], answer: ["5/8 > 0,6", "5/8 > 0.6"] },
  ],
  mistakes: [
    ["Croire que 0,65 > 0,7 parce que 65 > 7.", "Thinking 0.65 > 0.7 because 65 > 7."],
    ["Croire qu'une fraction au plus grand dénominateur est plus grande : 1/8 < 1/4.", "Thinking a fraction with a bigger denominator is bigger: 1/8 < 1/4."],
  ],
  practice: [
    [["Compare 3/4 et 0,8.", "Compare 3/4 and 0.8."], ["0,75 < 0,8, donc 3/4 < 0,8.", "0.75 < 0.8, so 3/4 < 0.8."]],
    [["Ordonne 1/2, 0,45 et 3/5.", "Order 1/2, 0.45 and 3/5."], ["0,45 < 1/2 < 3/5", "0.45 < 1/2 < 3/5"]],
    [["Lequel est le plus grand : 7/10 ou 0,07?", "Which is greater: 7/10 or 0.07?"], ["7/10 = 0,7", "7/10 = 0.7"]],
    [["Ordonne 1,2, 5/4 et 1 1/5.", "Order 1.2, 5/4 and 1 1/5."], ["1,2 = 1 1/5 < 5/4 (= 1,25)", "1.2 = 1 1/5 < 5/4 (= 1.25)"]],
    [["Donne un nombre entre 0,3 et 1/3.", "Give a number between 0.3 and 1/3."], ["Par exemple 0,32.", "For example 0.32."]],
  ],
  tips: [
    ["Tracez une droite numérique de 0 à 2 sur une bande de papier et placez-y les nombres ensemble.", "Draw a number line from 0 to 2 on a strip of paper and place the numbers on it together."],
  ],
});

export const linearRelationsSheet = sheet({
  summary: [
    "Une régularité qui augmente du même nombre à chaque étape est une relation linéaire. En 7e année, l'élève la décrit par une règle, en fait une table de valeurs et un graphique, dont les points sont alignés.",
    "A pattern that grows by the same amount at each step is a linear relation. In Grade 7, students describe it with a rule, make a table of values and a graph, whose points line up.",
  ],
  mustKnow: [
    ["La règle s'écrit avec une variable : par exemple, nombre de tuiles = 2n + 1.", "The rule is written with a variable: for example, number of tiles = 2n + 1."],
    ["Dans une table de valeurs, la différence constante entre les termes donne le nombre qui multiplie n.", "In a table of values, the constant difference between terms gives the number that multiplies n."],
    ["Le graphique d'une relation linéaire forme une ligne droite.", "The graph of a linear relation forms a straight line."],
  ],
  explanation: [
    ["Pour la suite 3, 5, 7, 9 : on ajoute 2 à chaque fois, donc la règle commence par 2n. Pour n = 1, 2 × 1 = 2, il manque 1 : la règle est 2n + 1.", "For 3, 5, 7, 9: you add 2 each time, so the rule starts with 2n. For n = 1, 2 × 1 = 2, 1 is missing: the rule is 2n + 1."],
  ],
  examples: [
    {
      problem: ["Figure 1 : 3 tuiles, figure 2 : 5 tuiles, figure 3 : 7 tuiles. Combien de tuiles à la figure 10?", "Figure 1: 3 tiles, figure 2: 5 tiles, figure 3: 7 tiles. How many tiles in figure 10?"],
      steps: [["On ajoute 2 à chaque fois : règle 2n + 1.", "Add 2 each time: rule 2n + 1."], ["2 × 10 + 1 = 21.", "2 × 10 + 1 = 21."]],
      answer: ["21 tuiles", "21 tiles"],
    },
    {
      problem: ["Un taxi coûte 3 $ plus 2 $ par kilomètre. Combien coûtent 5 km?", "A taxi costs $3 plus $2 per kilometre. How much for 5 km?"],
      steps: [["Coût = 2d + 3.", "Cost = 2d + 3."], ["2 × 5 + 3 = 13.", "2 × 5 + 3 = 13."]],
      answer: ["13 $", "$13"],
    },
  ],
  mistakes: [
    ["Ne garder que la différence (2n) et oublier le nombre ajouté (+ 1).", "Keeping only the difference (2n) and forgetting the added number (+ 1)."],
    ["Relier les points avec des segments en zigzag : si la relation est linéaire, ils sont alignés.", "Joining points in a zigzag: if the relation is linear, they line up."],
  ],
  practice: [
    [["Quelle est la règle de la suite 4, 7, 10, 13? Quel est le 10e terme?", "What is the rule for 4, 7, 10, 13? What is the 10th term?"], ["3n + 1; le 10e terme est 31.", "3n + 1; the 10th term is 31."]],
    [["Complète la table de y = 2x − 1 pour x = 0, 1, 2, 3.", "Complete the table for y = 2x − 1 for x = 0, 1, 2, 3."], same("−1, 1, 3, 5")],
    [["Le point (4, 9) appartient-il à y = 2x + 1?", "Is the point (4, 9) on y = 2x + 1?"], ["Oui : 2 × 4 + 1 = 9.", "Yes: 2 × 4 + 1 = 9."]],
    [["Une table a 4 chaises; chaque table ajoutée en bout ajoute 2 chaises (c = 2t + 2). Combien de chaises pour 6 tables?", "One table seats 4; each table added at the end adds 2 chairs (c = 2t + 2). How many chairs for 6 tables?"], ["14 chaises", "14 chairs"]],
    [["Les points d'une relation linéaire sont-ils alignés?", "Do the points of a linear relation line up?"], ["Oui, ils forment une droite.", "Yes, they form a straight line."]],
  ],
  tips: [
    ["Construisez une suite avec des cure-dents ou des blocs et demandez combien il en faudra pour la 20e figure.", "Build a pattern with toothpicks or blocks and ask how many the 20th figure needs."],
  ],
});

export const expressionsSheet = sheet({
  summary: [
    "Une expression algébrique combine des nombres et des variables (comme 3x + 4). Une équation affirme que deux expressions sont égales. En 7e année, l'élève les distingue et évalue une expression en remplaçant la variable par un nombre.",
    "An algebraic expression combines numbers and variables (like 3x + 4). An equation states that two expressions are equal. In Grade 7, students tell them apart and evaluate an expression by replacing the variable with a number.",
  ],
  mustKnow: [
    ["Une variable est une lettre qui représente un nombre.", "A variable is a letter that stands for a number."],
    ["3x signifie 3 × x.", "3x means 3 × x."],
    ["Expression : pas de signe « = ». Équation : un signe « = ».", "Expression: no “=” sign. Equation: an “=” sign."],
    ["Pour évaluer, on remplace la variable puis on respecte l'ordre des opérations.", "To evaluate, replace the variable, then follow the order of operations."],
  ],
  explanation: [
    ["Traduire des mots en expression : « 3 de plus que le double d'un nombre » s'écrit 2n + 3.", "Translate words into an expression: “3 more than twice a number” is 2n + 3."],
  ],
  examples: [
    { problem: ["Évalue 3x + 4 pour x = 5.", "Evaluate 3x + 4 for x = 5."], steps: [["3 × 5 + 4 = 15 + 4.", "3 × 5 + 4 = 15 + 4."]], answer: same("19") },
    { problem: ["Évalue 2a − b pour a = 6 et b = 4.", "Evaluate 2a − b for a = 6 and b = 4."], steps: [["2 × 6 − 4 = 12 − 4.", "2 × 6 − 4 = 12 − 4."]], answer: same("8") },
  ],
  mistakes: [
    ["Lire 3x comme « 3 suivi de x » : pour x = 5, 3x vaut 15, pas 35.", "Reading 3x as “3 next to x”: for x = 5, 3x is 15, not 35."],
    ["Additionner avant de multiplier.", "Adding before multiplying."],
  ],
  practice: [
    [["Évalue 5y − 2 pour y = 3.", "Evaluate 5y − 2 for y = 3."], same("13")],
    [["Évalue 10 − 2m pour m = 4.", "Evaluate 10 − 2m for m = 4."], same("2")],
    [["Évalue a + b + c pour a = 2, b = 5 et c = −1.", "Evaluate a + b + c for a = 2, b = 5 and c = −1."], same("6")],
    [["7 + k = 12 est-il une expression ou une équation?", "Is 7 + k = 12 an expression or an equation?"], ["Une équation (il y a un signe =).", "An equation (it has an = sign)."]],
    [["Écris « 3 de plus que le double d'un nombre ».", "Write “3 more than twice a number”."], same("2n + 3")],
  ],
  tips: [
    ["Inventez des « machines à nombres » : « Ma machine fait 2n + 3. Si j'entre 4, qu'est-ce qui sort? »", "Make up “number machines”: “My machine does 2n + 3. If I put in 4, what comes out?”"],
  ],
});

export const circlesSheet = sheet({
  summary: [
    "Dans un cercle, le rayon va du centre au bord et le diamètre traverse le cercle en passant par le centre. La circonférence (le tour du cercle) vaut environ 3,14 fois le diamètre : c'est le nombre π.",
    "In a circle, the radius goes from the centre to the edge and the diameter crosses the circle through the centre. The circumference (the distance around) is about 3.14 times the diameter: that is the number π.",
  ],
  mustKnow: [
    ["d = 2r et r = d ÷ 2.", "d = 2r and r = d ÷ 2."],
    ["C = π × d = 2 × π × r, avec π ≈ 3,14.", "C = π × d = 2 × π × r, with π ≈ 3.14."],
    ["La somme des angles au centre d'un cercle est 360°.", "The central angles of a circle add up to 360°."],
  ],
  explanation: [
    ["π n'est pas un nombre inventé : peu importe la taille du cercle, la circonférence divisée par le diamètre donne toujours environ 3,14.", "π is not made up: whatever the size of the circle, circumference divided by diameter is always about 3.14."],
  ],
  examples: [
    { problem: ["Un cercle a un rayon de 5 cm. Trouve d et C.", "A circle has a radius of 5 cm. Find d and C."], steps: [["d = 2 × 5 = 10 cm.", "d = 2 × 5 = 10 cm."], ["C ≈ 3,14 × 10 = 31,4 cm.", "C ≈ 3.14 × 10 = 31.4 cm."]], answer: ["d = 10 cm, C ≈ 31,4 cm", "d = 10 cm, C ≈ 31.4 cm"] },
    { problem: ["La circonférence est 62,8 cm. Quel est le diamètre?", "The circumference is 62.8 cm. What is the diameter?"], steps: [["d = C ÷ π ≈ 62,8 ÷ 3,14.", "d = C ÷ π ≈ 62.8 ÷ 3.14."]], answer: same("20 cm") },
  ],
  mistakes: [
    ["Utiliser le rayon dans C = π × d.", "Using the radius in C = π × d."],
    ["Confondre circonférence (une longueur, en cm) et aire (une surface, en cm²).", "Mixing up circumference (a length, in cm) and area (a surface, in cm²)."],
  ],
  practice: [
    [["d = 12 cm. Quel est le rayon?", "d = 12 cm. What is the radius?"], same("6 cm")],
    [["r = 3 m. Quelle est la circonférence?", "r = 3 m. What is the circumference?"], ["≈ 18,84 m", "≈ 18.84 m"]],
    [["d = 7 cm. Quelle est la circonférence?", "d = 7 cm. What is the circumference?"], ["≈ 21,98 cm", "≈ 21.98 cm"]],
    [["C = 31,4 cm. Quel est le rayon?", "C = 31.4 cm. What is the radius?"], same("5 cm")],
    [["Une roue de vélo a 60 cm de diamètre. Quelle distance parcourt-elle en un tour?", "A bike wheel is 60 cm in diameter. How far does it travel in one turn?"], ["≈ 188,4 cm", "≈ 188.4 cm"]],
  ],
  tips: [
    ["Mesurez le tour d'une boîte de conserve avec une ficelle, puis son diamètre : divisez, vous trouverez environ 3,14.", "Measure around a can with string, then its diameter: divide and you'll get about 3.14."],
  ],
});

export const areaSheet = sheet({
  summary: [
    "L'aire mesure la surface d'une figure, en unités carrées. En 7e année, l'élève trouve et utilise les formules d'aire du parallélogramme, du triangle et du cercle.",
    "Area measures the surface of a shape, in square units. In Grade 7, students develop and use the area formulas for parallelograms, triangles and circles.",
  ],
  mustKnow: [
    ["Parallélogramme : A = b × h.", "Parallelogram: A = b × h."],
    ["Triangle : A = b × h ÷ 2.", "Triangle: A = b × h ÷ 2."],
    ["Cercle : A = π × r², avec π ≈ 3,14.", "Circle: A = π × r², with π ≈ 3.14."],
    ["La hauteur est toujours perpendiculaire à la base.", "The height is always perpendicular to the base."],
  ],
  explanation: [
    ["Un parallélogramme se transforme en rectangle si on coupe un triangle d'un côté pour le recoller de l'autre : même aire, b × h.", "A parallelogram becomes a rectangle if you cut a triangle off one side and move it to the other: same area, b × h."],
    ["Deux triangles identiques forment un parallélogramme : un triangle vaut donc la moitié, b × h ÷ 2.", "Two identical triangles make a parallelogram: one triangle is half, b × h ÷ 2."],
  ],
  examples: [
    { problem: ["Parallélogramme : b = 8 cm, h = 5 cm", "Parallelogram: b = 8 cm, h = 5 cm"], steps: [same("8 × 5 = 40")], answer: same("40 cm²") },
    { problem: ["Triangle : b = 10 cm, h = 6 cm", "Triangle: b = 10 cm, h = 6 cm"], steps: [same("10 × 6 ÷ 2 = 30")], answer: same("30 cm²") },
    { problem: ["Cercle : r = 4 cm", "Circle: r = 4 cm"], steps: [["3,14 × 4 × 4 = 50,24.", "3.14 × 4 × 4 = 50.24."]], answer: ["≈ 50,24 cm²", "≈ 50.24 cm²"] },
  ],
  mistakes: [
    ["Prendre le côté oblique au lieu de la hauteur.", "Using the slanted side instead of the height."],
    ["Calculer r × 2 au lieu de r × r pour r².", "Calculating r × 2 instead of r × r for r²."],
    ["Utiliser le diamètre au lieu du rayon dans la formule du cercle.", "Using the diameter instead of the radius in the circle formula."],
  ],
  practice: [
    [["Parallélogramme : b = 12 cm, h = 7 cm", "Parallelogram: b = 12 cm, h = 7 cm"], same("84 cm²")],
    [["Triangle : b = 9 m, h = 4 m", "Triangle: b = 9 m, h = 4 m"], same("18 m²")],
    [["Cercle : r = 10 cm", "Circle: r = 10 cm"], ["≈ 314 cm²", "≈ 314 cm²"]],
    [["Cercle : d = 6 cm", "Circle: d = 6 cm"], ["r = 3 cm, A ≈ 28,26 cm²", "r = 3 cm, A ≈ 28.26 cm²"]],
    [["Un jardin triangulaire a une base de 5 m et une hauteur de 8 m. Quelle est son aire?", "A triangular garden has a base of 5 m and a height of 8 m. What is its area?"], same("20 m²")],
  ],
  tips: [
    ["Découpez un parallélogramme dans du papier et transformez-le en rectangle : la formule devient évidente.", "Cut a parallelogram out of paper and turn it into a rectangle: the formula becomes obvious."],
  ],
});

export const constructionsSheet = sheet({
  summary: [
    "Une construction géométrique se fait avec des instruments précis : règle, équerre, rapporteur et compas. En 7e année, l'élève trace des droites parallèles et perpendiculaires, la médiatrice d'un segment et la bissectrice d'un angle.",
    "A geometric construction is made with precise tools: ruler, set square, protractor and compass. In Grade 7, students draw parallel and perpendicular lines, the perpendicular bisector of a segment and the bisector of an angle.",
  ],
  mustKnow: [
    ["Droites parallèles : elles ne se croisent jamais et restent à la même distance.", "Parallel lines: they never meet and stay the same distance apart."],
    ["Droites perpendiculaires : elles se croisent à angle droit (90°).", "Perpendicular lines: they meet at a right angle (90°)."],
    ["La médiatrice d'un segment le coupe en son milieu, à 90°. Chacun de ses points est à égale distance des deux extrémités.", "The perpendicular bisector of a segment cuts it at its midpoint, at 90°. Each of its points is the same distance from both ends."],
    ["La bissectrice d'un angle le partage en deux angles égaux.", "The bisector of an angle splits it into two equal angles."],
  ],
  explanation: [
    ["Avec le compas, on trace des arcs de même ouverture : leurs points d'intersection servent de repères pour tracer la droite.", "With the compass, draw arcs with the same opening: where they cross gives the points to draw the line."],
  ],
  examples: [
    {
      problem: ["Tracer la médiatrice du segment AB", "Construct the perpendicular bisector of segment AB"],
      steps: [
        ["Ouvre le compas un peu plus que la moitié de AB.", "Open the compass a bit more than half of AB."],
        ["Trace un arc au-dessus et au-dessous de AB depuis A, puis depuis B (même ouverture).", "Draw an arc above and below AB from A, then from B (same opening)."],
        ["Relie les deux points où les arcs se croisent.", "Join the two points where the arcs cross."],
      ],
      answer: ["Une droite qui coupe AB en son milieu à 90°", "A line cutting AB at its midpoint at 90°"],
    },
    {
      problem: ["Tracer la bissectrice d'un angle", "Construct the bisector of an angle"],
      steps: [
        ["Depuis le sommet, trace un arc qui coupe les deux côtés.", "From the vertex, draw an arc crossing both sides."],
        ["Depuis ces deux points, trace deux arcs de même ouverture qui se croisent.", "From those two points, draw two arcs with the same opening that cross."],
        ["Relie le sommet à ce point de croisement.", "Join the vertex to that crossing point."],
      ],
      answer: ["Deux angles égaux", "Two equal angles"],
    },
  ],
  mistakes: [
    ["Changer l'ouverture du compas entre deux arcs.", "Changing the compass opening between two arcs."],
    ["Tracer « à l'œil » une perpendiculaire sans vérifier l'angle de 90°.", "Drawing a perpendicular “by eye” without checking the 90° angle."],
  ],
  practice: [
    [["Quel angle la médiatrice fait-elle avec le segment?", "What angle does the perpendicular bisector make with the segment?"], ["90°, en passant par le milieu.", "90°, through the midpoint."]],
    [["On trace la bissectrice d'un angle de 70°. Que mesure chaque nouvel angle?", "You bisect a 70° angle. What does each new angle measure?"], same("35°")],
    [["Un point de la médiatrice de AB est à 4 cm de A. À quelle distance est-il de B?", "A point on the perpendicular bisector of AB is 4 cm from A. How far is it from B?"], ["4 cm aussi.", "Also 4 cm."]],
    [["Deux droites parallèles peuvent-elles se croiser?", "Can two parallel lines cross?"], ["Non, jamais.", "No, never."]],
    [["Quels instruments faut-il pour tracer une médiatrice?", "What tools do you need to construct a perpendicular bisector?"], ["Un compas et une règle.", "A compass and a ruler."]],
  ],
  tips: [
    ["Un compas et une règle coûtent peu : faites des constructions ensemble, c'est un bon moment calme.", "A compass and ruler are cheap: do constructions together, it's a nice calm activity."],
  ],
});

export const cartesianPlaneSheet = sheet({
  summary: [
    "Le plan cartésien est formé de deux droites numériques perpendiculaires : l'axe des x (horizontal) et l'axe des y (vertical). Elles se croisent à l'origine (0, 0) et partagent le plan en quatre quadrants.",
    "The Cartesian plane is made of two perpendicular number lines: the x-axis (horizontal) and the y-axis (vertical). They cross at the origin (0, 0) and split the plane into four quadrants.",
  ],
  mustKnow: [
    ["Un point s'écrit (x, y) : on avance d'abord horizontalement, puis verticalement.", "A point is written (x, y): move horizontally first, then vertically."],
    ["Quadrant I : (+, +); II : (−, +); III : (−, −); IV : (+, −).", "Quadrant I: (+, +); II: (−, +); III: (−, −); IV: (+, −)."],
    ["Un point sur un axe n'est dans aucun quadrant.", "A point on an axis is not in any quadrant."],
  ],
  explanation: [
    ["Les quadrants se numérotent en tournant dans le sens inverse des aiguilles d'une montre, en partant d'en haut à droite.", "Quadrants are numbered counterclockwise, starting at the top right."],
  ],
  examples: [
    { problem: ["Où est le point (−3, 2)?", "Where is the point (−3, 2)?"], steps: [["3 vers la gauche, 2 vers le haut.", "3 left, 2 up."]], answer: ["Quadrant II", "Quadrant II"] },
    { problem: ["Où est le point (4, −5)?", "Where is the point (4, −5)?"], steps: [["4 vers la droite, 5 vers le bas.", "4 right, 5 down."]], answer: ["Quadrant IV", "Quadrant IV"] },
  ],
  mistakes: [
    ["Inverser x et y : (5, −2) et (−2, 5) sont deux points différents.", "Swapping x and y: (5, −2) and (−2, 5) are two different points."],
    ["Commencer par le déplacement vertical.", "Starting with the vertical move."],
  ],
  practice: [
    [["Dans quel quadrant est (−2, −6)?", "Which quadrant is (−2, −6) in?"], ["Quadrant III", "Quadrant III"]],
    [["Où est (0, 5)?", "Where is (0, 5)?"], ["Sur l'axe des y, dans aucun quadrant.", "On the y-axis, in no quadrant."]],
    [["Depuis l'origine : 3 vers la droite, 1 vers le bas. Quel point?", "From the origin: 3 right, 1 down. Which point?"], same("(3, −1)")],
    [["(5, −2) et (−2, 5) sont-ils le même point?", "Are (5, −2) and (−2, 5) the same point?"], ["Non.", "No."]],
    [["Quelle est la distance entre (1, 2) et (1, 7)?", "What is the distance between (1, 2) and (1, 7)?"], ["5 unités", "5 units"]],
  ],
  tips: [
    ["Jouez à la bataille navale sur une grille avec des coordonnées positives et négatives.", "Play Battleship on a grid with positive and negative coordinates."],
  ],
});

export const transformationsSheet = sheet({
  summary: [
    "Une transformation déplace une figure sans changer sa forme ni sa taille. En 7e année, l'élève effectue et décrit des translations (glissements), des réflexions (effets miroir) et des rotations (tours) dans le plan cartésien.",
    "A transformation moves a shape without changing its shape or size. In Grade 7, students perform and describe translations (slides), reflections (flips) and rotations (turns) on the Cartesian plane.",
  ],
  mustKnow: [
    ["Translation : chaque point glisse du même nombre d'unités horizontalement et verticalement.", "Translation: every point slides the same number of units horizontally and vertically."],
    ["Réflexion par rapport à l'axe des x : (x, y) devient (x, −y). Par rapport à l'axe des y : (x, y) devient (−x, y).", "Reflection in the x-axis: (x, y) becomes (x, −y). In the y-axis: (x, y) becomes (−x, y)."],
    ["Rotation de 180° autour de l'origine : (x, y) devient (−x, −y).", "Rotation of 180° about the origin: (x, y) becomes (−x, −y)."],
    ["La figure obtenue (l'image) est congruente à la figure de départ.", "The resulting shape (the image) is congruent to the original."],
  ],
  explanation: [
    ["On transforme chaque sommet de la figure, puis on relie les nouveaux points.", "Transform each vertex of the shape, then join the new points."],
  ],
  examples: [
    { problem: ["Translation de A(2, 1) : 3 vers la gauche, 4 vers le haut", "Translate A(2, 1): 3 left, 4 up"], steps: [same("(2 − 3, 1 + 4)")], answer: same("(−1, 5)") },
    { problem: ["Réflexion de (3, 2) par rapport à l'axe des x", "Reflect (3, 2) in the x-axis"], steps: [["On change le signe de y.", "Change the sign of y."]], answer: same("(3, −2)") },
    { problem: ["Rotation de 180° de (2, 3) autour de l'origine", "Rotate (2, 3) 180° about the origin"], steps: [["On change les deux signes.", "Change both signs."]], answer: same("(−2, −3)") },
  ],
  mistakes: [
    ["Pour une réflexion, changer le mauvais signe (x au lieu de y).", "For a reflection, changing the wrong sign (x instead of y)."],
    ["Déplacer un seul sommet au lieu de toute la figure.", "Moving only one vertex instead of the whole shape."],
  ],
  practice: [
    [["Translation de (−1, 4) : 5 vers la droite, 2 vers le bas", "Translate (−1, 4): 5 right, 2 down"], same("(4, 2)")],
    [["Réflexion de (−4, 1) par rapport à l'axe des y", "Reflect (−4, 1) in the y-axis"], same("(4, 1)")],
    [["Rotation de 180° de (1, −3) autour de l'origine", "Rotate (1, −3) 180° about the origin"], same("(−1, 3)")],
    [["Une transformation change-t-elle la taille de la figure?", "Does a transformation change the size of the shape?"], ["Non, l'image est congruente.", "No, the image is congruent."]],
    [["Réflexion de (5, 0) par rapport à l'axe des x", "Reflect (5, 0) in the x-axis"], ["(5, 0) : le point est sur l'axe, il ne bouge pas.", "(5, 0): the point is on the axis, it doesn't move."]],
  ],
  tips: [
    ["Avec un miroir posé sur une feuille quadrillée, votre enfant voit la réflexion en vrai.", "With a mirror on grid paper, your child sees the reflection for real."],
  ],
});

export const centralTendencySheet = sheet({
  summary: [
    "La moyenne, la médiane et le mode résument un ensemble de données; l'étendue montre à quel point elles sont dispersées. En 7e année, l'élève les calcule et observe l'effet d'une valeur aberrante (très éloignée des autres).",
    "Mean, median and mode summarize a data set; range shows how spread out it is. In Grade 7, students calculate them and see the effect of an outlier (a value far from the others).",
  ],
  mustKnow: [
    ["Moyenne : somme des données ÷ nombre de données.", "Mean: sum of the data ÷ number of values."],
    ["Médiane : la valeur du milieu une fois les données ordonnées (ou la moyenne des deux du milieu).", "Median: the middle value once the data are ordered (or the mean of the two middle ones)."],
    ["Mode : la valeur la plus fréquente. Étendue : plus grande − plus petite.", "Mode: the most frequent value. Range: largest − smallest."],
    ["Une valeur aberrante change beaucoup la moyenne, peu la médiane.", "An outlier changes the mean a lot and the median little."],
  ],
  explanation: [
    ["Quand il y a une valeur aberrante, la médiane décrit souvent mieux la donnée « typique » que la moyenne.", "When there is an outlier, the median often describes the “typical” value better than the mean."],
  ],
  examples: [
    {
      problem: same("4, 7, 7, 9, 13"),
      steps: [["Moyenne : 40 ÷ 5 = 8. Médiane : 7. Mode : 7. Étendue : 13 − 4 = 9.", "Mean: 40 ÷ 5 = 8. Median: 7. Mode: 7. Range: 13 − 4 = 9."]],
      answer: ["Moyenne 8, médiane 7, mode 7, étendue 9", "Mean 8, median 7, mode 7, range 9"],
    },
    {
      problem: ["On ajoute 50 : 4, 7, 7, 9, 13, 50", "Add 50: 4, 7, 7, 9, 13, 50"],
      steps: [["Moyenne : 90 ÷ 6 = 15. Médiane : (7 + 9) ÷ 2 = 8.", "Mean: 90 ÷ 6 = 15. Median: (7 + 9) ÷ 2 = 8."]],
      answer: ["La moyenne passe de 8 à 15, la médiane de 7 à 8.", "The mean goes from 8 to 15, the median from 7 to 8."],
    },
  ],
  mistakes: [
    ["Chercher la médiane sans ordonner les données.", "Finding the median without ordering the data."],
    ["Diviser par le mauvais nombre de données pour la moyenne.", "Dividing by the wrong number of values for the mean."],
  ],
  practice: [
    [["Moyenne de 3, 5, 5, 8, 9", "Mean of 3, 5, 5, 8, 9"], same("6")],
    [["Médiane de 2, 9, 4, 7", "Median of 2, 9, 4, 7"], ["2, 4, 7, 9 : (4 + 7) ÷ 2 = 5,5", "2, 4, 7, 9: (4 + 7) ÷ 2 = 5.5"]],
    [["Mode de 1, 3, 3, 6, 6, 6", "Mode of 1, 3, 3, 6, 6, 6"], same("6")],
    [["Étendue de 12, 4, 19, 7", "Range of 12, 4, 19, 7"], same("15")],
    [["Notes : 70, 75, 80 et 85. Quelle est la moyenne?", "Marks: 70, 75, 80 and 85. What is the mean?"], ["310 ÷ 4 = 77,5", "310 ÷ 4 = 77.5"]],
  ],
  tips: [
    ["Notez la température chaque jour pendant une semaine et calculez la moyenne et la médiane ensemble.", "Record the temperature every day for a week and work out the mean and median together."],
  ],
});

export const circleGraphsSheet = sheet({
  summary: [
    "Un diagramme circulaire montre comment un tout se partage en parties. Chaque secteur représente un pourcentage du total, et l'ensemble fait 100 %, soit 360°.",
    "A circle graph shows how a whole is split into parts. Each sector stands for a percent of the total, and together they make 100%, or 360°.",
  ],
  mustKnow: [
    ["Pourcentage d'une catégorie = nombre de la catégorie ÷ total × 100.", "Percent of a category = category count ÷ total × 100."],
    ["Angle du secteur = pourcentage × 360°.", "Sector angle = percent × 360°."],
    ["Tous les secteurs ensemble : 100 % et 360°.", "All sectors together: 100% and 360°."],
  ],
  explanation: [
    ["Pour construire le diagramme, on calcule chaque angle, puis on le trace au rapporteur à partir du centre.", "To build the graph, calculate each angle, then draw it with a protractor from the centre."],
  ],
  examples: [
    {
      problem: ["Sur 40 élèves, 10 préfèrent le hockey. Quel angle pour le secteur « hockey »?", "Out of 40 students, 10 prefer hockey. What angle for the “hockey” sector?"],
      steps: [["10 ÷ 40 = 25 %.", "10 ÷ 40 = 25%."], ["0,25 × 360° = 90°.", "0.25 × 360° = 90°."]],
      answer: same("90°"),
    },
    { problem: ["Un secteur mesure 72°. Quel pourcentage représente-t-il?", "A sector measures 72°. What percent is it?"], steps: [["72 ÷ 360 = 0,2.", "72 ÷ 360 = 0.2."]], answer: ["20 %", "20%"] },
  ],
  mistakes: [
    ["Oublier de multiplier par 360 et tracer un angle égal au pourcentage.", "Forgetting to multiply by 360 and drawing an angle equal to the percent."],
    ["Obtenir un total différent de 100 % à cause des arrondis, sans le vérifier.", "Getting a total other than 100% from rounding, without checking."],
  ],
  practice: [
    [["Quel angle pour 50 %?", "What angle for 50%?"], same("180°")],
    [["Quel angle pour 10 %?", "What angle for 10%?"], same("36°")],
    [["20 sur 80 : quel pourcentage et quel angle?", "20 out of 80: what percent and what angle?"], ["25 %, 90°", "25%, 90°"]],
    [["Un secteur de 72° : quel pourcentage?", "A 72° sector: what percent?"], ["20 %", "20%"]],
    [["Quelle est la somme de tous les secteurs?", "What do all the sectors add up to?"], ["100 % ou 360°", "100% or 360°"]],
  ],
  tips: [
    ["Faites un diagramme circulaire du budget de la semaine ou du temps passé à chaque activité.", "Make a circle graph of the week's budget or of time spent on each activity."],
  ],
});

export const probabilitySheet = sheet({
  summary: [
    "La probabilité mesure la chance qu'un événement se produise, entre 0 (impossible) et 1 (certain). En 7e année, l'élève compare la probabilité théorique (calculée) à la probabilité expérimentale (observée) et l'exprime en fraction, en décimal et en pourcentage.",
    "Probability measures how likely an event is, from 0 (impossible) to 1 (certain). In Grade 7, students compare theoretical probability (calculated) with experimental probability (observed) and express it as a fraction, decimal and percent.",
  ],
  mustKnow: [
    ["Probabilité théorique = résultats favorables ÷ résultats possibles.", "Theoretical probability = favourable outcomes ÷ possible outcomes."],
    ["Probabilité expérimentale = nombre de fois observé ÷ nombre d'essais.", "Experimental probability = times observed ÷ number of trials."],
    ["Pour deux événements, on liste l'espace échantillonnal avec un tableau ou un arbre.", "For two events, list the sample space with a table or a tree diagram."],
    ["Plus on fait d'essais, plus la probabilité expérimentale se rapproche de la théorique.", "The more trials, the closer experimental probability gets to theoretical."],
  ],
  explanation: [
    ["Avec deux dés, il y a 6 × 6 = 36 résultats possibles; un tableau de 6 lignes et 6 colonnes les montre tous.", "With two dice there are 6 × 6 = 36 possible outcomes; a 6 × 6 table shows them all."],
  ],
  examples: [
    { problem: ["P(nombre pair) avec un dé", "P(even number) with one die"], steps: [["Pairs : 2, 4, 6, soit 3 sur 6.", "Even: 2, 4, 6, so 3 out of 6."]], answer: ["1/2 = 0,5 = 50 %", "1/2 = 0.5 = 50%"] },
    {
      problem: ["P(deux faces) avec deux pièces", "P(two heads) with two coins"],
      steps: [["Espace : FF, FP, PF, PP (4 résultats).", "Sample space: HH, HT, TH, TT (4 outcomes)."]],
      answer: ["1/4 = 25 %", "1/4 = 25%"],
    },
    { problem: ["20 lancers, 12 fois « face »", "20 flips, 12 heads"], steps: [same("12 ÷ 20")], answer: ["Probabilité expérimentale 60 %", "Experimental probability 60%"] },
  ],
  mistakes: [
    ["Croire que si « face » est sorti 3 fois, « pile » est plus probable au prochain lancer.", "Thinking that after 3 heads, tails is more likely next."],
    ["Oublier des résultats dans l'espace échantillonnal (FP et PF sont deux résultats distincts).", "Missing outcomes in the sample space (HT and TH are two different outcomes)."],
  ],
  practice: [
    [["P(obtenir 5) avec un dé", "P(rolling a 5) with one die"], ["1/6 ≈ 0,17 ≈ 17 %", "1/6 ≈ 0.17 ≈ 17%"]],
    [["Un sac contient 3 billes rouges et 5 bleues. P(rouge)?", "A bag has 3 red and 5 blue marbles. P(red)?"], ["3/8 = 37,5 %", "3/8 = 37.5%"]],
    [["Combien de résultats possibles avec deux dés?", "How many possible outcomes with two dice?"], same("36")],
    [["P(somme de 7) avec deux dés", "P(sum of 7) with two dice"], ["6/36 = 1/6", "6/36 = 1/6"]],
    [["Sur 30 tours de roulette, 9 fois rouge. Probabilité expérimentale?", "In 30 spins, red came up 9 times. Experimental probability?"], ["9/30 = 30 %", "9/30 = 30%"]],
  ],
  tips: [
    ["Lancez une pièce 50 fois ensemble et comparez le résultat à 50 % : une belle discussion sur le hasard.", "Flip a coin 50 times together and compare with 50%: a great talk about chance."],
  ],
});
