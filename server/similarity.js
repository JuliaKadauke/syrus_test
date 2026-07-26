function normalizeAnswer(answer) {
  return answer.toLowerCase().trim()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss');
}

function groupByNormalization(answers) {
  const groups = [];
  const assigned = new Set();
  for (const a of answers) {
    const key = normalizeAnswer(a);
    if (assigned.has(key)) continue;
    const similar = answers.filter(b => normalizeAnswer(b) === key);
    similar.forEach(b => assigned.add(normalizeAnswer(b)));
    groups.push(similar);
  }
  return groups;
}

function scoreAnswers(letter, answers) {
  const trimmed = answers.map(a => (a || '').trim());
  const valid = trimmed.map(a => a.length > 0 && a[0].toUpperCase() === letter.toUpperCase());
  const points = valid.map(v => (v ? 10 : 0));

  const validAnswers = trimmed.filter((_, i) => valid[i]);
  const groups = groupByNormalization(validAnswers);

  for (const group of groups) {
    if (group.length < 2) continue;
    const groupKeys = new Set(group.map(normalizeAnswer));
    trimmed.forEach((ans, i) => {
      if (valid[i] && groupKeys.has(normalizeAnswer(ans))) {
        points[i] = 5;
      }
    });
  }

  return points;
}

module.exports = { normalizeAnswer, groupByNormalization, scoreAnswers };
