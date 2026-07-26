const { test } = require('node:test');
const assert = require('node:assert/strict');
const { scoreAnswers } = require('../server/similarity.js');

test('GLEICH: münchen = München = muenchen → 5 Punkte', () => {
  const scores = scoreAnswers('M', ['münchen', 'München', 'muenchen']);
  assert.deepStrictEqual(scores, [5, 5, 5]);
});

test('NICHT GLEICH: kroatien vs Kuwait → beide 10 Punkte', () => {
  const scores = scoreAnswers('K', ['kroatien', 'Kuwait']);
  assert.deepStrictEqual(scores, [10, 10]);
});

test('NICHT GLEICH: Karlsruhe vs Köln → beide 10 Punkte', () => {
  const scores = scoreAnswers('K', ['Karlsruhe', 'Köln']);
  assert.deepStrictEqual(scores, [10, 10]);
});

test('NICHT GLEICH: katarina vs Karl → beide 10 Punkte', () => {
  const scores = scoreAnswers('K', ['katarina', 'Karl']);
  assert.deepStrictEqual(scores, [10, 10]);
});

test('LEER: leere Antwort → 0 Punkte', () => {
  const scores = scoreAnswers('K', ['']);
  assert.deepStrictEqual(scores, [0]);
});

test('FALSCHER BUCHSTABE: Berlin bei Buchstabe K → 0 Punkte', () => {
  const scores = scoreAnswers('K', ['Berlin']);
  assert.deepStrictEqual(scores, [0]);
});
