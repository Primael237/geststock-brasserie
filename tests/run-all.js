// Lance toutes les suites de tests (chacune sur sa propre base jetable).
const suites = [
  require('./sales.test'),
  require('./inventory.test'),
  require('./drafts.test'),
  require('./auth.test'),
  require('./reports.test'),
];

(async () => {
  let allOk = true;
  for (const suite of suites) {
    const ok = await suite.run();
    if (!ok) allOk = false;
  }
  console.log(allOk ? '✅ Toutes les suites sont passées.' : '❌ Au moins une suite a échoué.');
  process.exit(allOk ? 0 : 1);
})();
