use contracts::asserts;

#[test]
fn test_assert_only_self() {
    asserts::assert_only_self();
}

#[test]
fn assert_correct_tx_version_test() {
    // for now valid tx_version == 1 & 2
    let tx_version = 1;
    asserts::assert_correct_tx_version(tx_version);
}

#[test]
#[should_panic(expected = 'argent: invalid tx version')]
fn assert_correct_tx_version_invalidtx_test() {
    // for now valid tx_version == 1 & 2
    let tx_version = 4;
    asserts::assert_correct_tx_version(tx_version);
    let tx_version = 4;
    asserts::assert_correct_tx_version(tx_version);
}
