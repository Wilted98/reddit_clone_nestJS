module.exports = async function () {
  // Deliberately empty. The scaffold this replaced called killPort(3000)
  // unconditionally, which would kill any process on that port - including a
  // dev server you already had running that had nothing to do with this test
  // run. NX owns the lifecycle of the `auth:serve` task this target depends
  // on and stops it itself; there is nothing left for this hook to clean up.
};
