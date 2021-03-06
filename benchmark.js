/* eslint-disable no-console */
/* eslint-disable no-process-exit */

import Benchmark from 'benchmark';
import requireDir from 'require-dir';
import fp from 'lodash/fp';

const benchmarks = requireDir('./benchmarks');

Object.keys(benchmarks).forEach((key) => {
  if (benchmarks[key].default) {
    benchmarks[key] = benchmarks[key].default;
  }
});

const benchmarkName = process.argv.length > 2 ? process.argv[2] : '';

const testBenchmark = (name, tests) => {
  return new Promise((resolve, reject) => {
    const output = [];
    tests = tests.map(test => ({
      ...test,
      key: test.key || test.name
    }));
    const suite = new Benchmark.Suite();
    const testsByName = tests.reduce((result, test) => {
      result[test.name] = test;
      return result;
    }, {});
    const testsByKey = tests.reduce((result, test) => {
      result[test.key] = test;
      return result;
    }, {});
    tests.forEach(test => {
      if (test.compare) {
        Object.keys(test.compare).forEach((testKey) => {
          if (!testsByKey[testKey]) {
            throw new Error(`Test ${testKey} not found for comparison.`);
          }
        });
      }
      suite.add(test.name, test.test);
    });
    suite.on('complete', function () {
      const benchesByKey = this.reduce((result, bench) => {
        result[testsByName[bench.name].key] = bench;
        return result;
      }, {});
      output.push(this.map(bench => {
        return bench.name + '\n' + Number(Math.round(bench.hz)).toLocaleString();
      }).join('\n\n'));
      const comparisons = fp.flatten(Object.keys(benchesByKey)
        .map(key => {
          const test = testsByKey[key];
          const bench = benchesByKey[key];
          if (test.compare) {
            return Object.keys(test.compare)
              .map(otherKey => {
                const compareBench = benchesByKey[otherKey];
                const ratio = bench.hz / compareBench.hz;
                return {
                  name: test.name,
                  compareName: testsByKey[otherKey].name,
                  ratio,
                  isPass: ratio > test.compare[otherKey]
                };
              });
          }
          return [];
        }));
      if (comparisons.length > 0) {
        output.push('');
        const isPass = !comparisons.some(comparison => !comparison.isPass);
        output.push(comparisons.map(comparison => {
          const percent = Math.round(100 * comparison.ratio);
          const passFail = comparison.isPass ? 'PASS' : 'FAIL';
          return `${comparison.name} / ${comparison.compareName} = ${percent}% (${passFail})`;
        }).join('\n'));
        if (!isPass) {
          console.log(output.join('\n'));
          return reject(new Error(`Benchmark ${name} failed.`));
        }
      }
      output.push('\n');
      console.log(output.join('\n'));
      return resolve();
    }).run({async: true});
  });
};

const matchingBenchmarks = Object.keys(benchmarks)
  .filter(key => !benchmarkName || benchmarkName === key);

// Make sure benchmarks are all valid, meaning that all tests within a benchmark
// return the same result.
matchingBenchmarks.forEach(key => {
  const tests = benchmarks[key];
  if (tests.length > 1) {
    const results = tests.map(test => test.test());
    const hasAllSameResults = results.every(result => fp.isEqual(result, results[0]));
    if (!hasAllSameResults) {
      console.log(`Benchmark invalid: ${key}`);
      console.log('Results:\n');
      results.forEach((result, i) => {
        console.log(tests[i].name);
        console.log(result);
        console.log('\n');
      });
      process.exit(1);
    }
  }
});

matchingBenchmarks.reduce((promise, key) => {
  return promise
    .then(() => testBenchmark(key, benchmarks[key]));
}, Promise.resolve())
  .then(() => {
    console.log('\nAll benchmark tests passed.');
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
