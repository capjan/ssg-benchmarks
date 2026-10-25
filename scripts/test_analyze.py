import unittest
from analyze import analyze, describe


class StatisticsTests(unittest.TestCase):
    def test_robust_statistics_keep_outlier(self):
        row = describe([1, 2, 3, 4, 100], 'clean-build')
        self.assertEqual((row['median_ms'], row['mad_ms'], row['max_ms']), (3, 1, 100))
        self.assertIsNone(row['ci95_low_ms'])
        self.assertIsNone(row['p95_ms'])

    def test_bootstrap_is_reproducible_and_constant_interval_exact(self):
        self.assertEqual(describe(list(range(10)), 'clean-build'), describe(list(range(10)), 'clean-build'))
        row = describe([12] * 10, 'warm-build')
        self.assertEqual((row['ci95_low_ms'], row['ci95_high_ms']), (12, 12))

    def test_edits_do_not_claim_independent_sessions(self):
        row = describe(list(range(30)), 'edit-to-dom')
        self.assertIsNone(row['ci95_low_ms'])
        self.assertAlmostEqual(row['p95_ms'], 27.55)
        self.assertIn('one server/browser session', row['uncertainty'])

    def test_no_valid_samples(self):
        row = describe([], 'clean-build')
        self.assertEqual(row['n'], 0)
        self.assertIsNone(row['median_ms'])

    def record(self, **updates):
        return dict(run_id='r', environment_profile_id='e', corpus_sha256='c', corpus_size=50,
                    participant='p', scenario='clean-build', tool_version='1', status='ok', elapsed_ms=5, **updates)

    def test_failed_timing_excluded_but_failure_counted(self):
        good = self.record()
        bad = {**good, 'status': 'failed', 'elapsed_ms': 999}
        row = analyze([good, bad], {'p': {'status': 'fail'}})[0]
        self.assertEqual((row['n'], row['failed'], row['median_ms'], row['feature_parity']), (1, 1, 5, 'fail'))

    def test_incompatible_inputs_rejected(self):
        good = self.record()
        for key in ('run_id', 'environment_profile_id', 'corpus_sha256', 'corpus_size', 'tool_version'):
            with self.subTest(key=key), self.assertRaises(ValueError):
                analyze([good, {**good, key: 'different'}], {})
        for value in (None, -1, float('nan'), float('inf'), True):
            with self.subTest(value=value), self.assertRaises(ValueError):
                analyze([{**good, 'elapsed_ms': value}], {})


if __name__ == '__main__':
    unittest.main()
