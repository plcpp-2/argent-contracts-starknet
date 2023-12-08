use argent::common::version::Version;
use argent::generic::argent_generic::ArgentGenericAccount;
use starknet::{contract_address_const, syscalls::deploy_syscall, account::Call, testing::set_contract_address};

const signer_pubkey_1: felt252 = 0x1ef15c18599971b7beced415a40f0c7deacfd9b0d1819e03d723d8bc943cfca;
const signer_pubkey_2: felt252 = 0x759ca09377679ecd535a81e83039658bf40959283187c654c5416f439403cf5;
const signer_pubkey_3: felt252 = 0x411494b501a98abd8262b0da1351e17899a0c4ef23dd2f96fec5ba847310b20;

#[starknet::interface]
trait ITestArgentGenericAccount<TContractState> {
    // IAccount
    fn __validate_declare__(self: @TContractState, class_hash: felt252) -> felt252;
    fn __validate__(ref self: TContractState, calls: Array<Call>) -> felt252;
    fn __execute__(ref self: TContractState, calls: Array<Call>) -> Array<Span<felt252>>;
    fn is_valid_signature(self: @TContractState, hash: felt252, signature: Array<felt252>) -> felt252;

    // IArgentMultisig
    fn __validate_deploy__(
        self: @TContractState,
        class_hash: felt252,
        contract_address_salt: felt252,
        threshold: usize,
        signers: Array<felt252>
    ) -> felt252;
    fn change_threshold(ref self: TContractState, new_threshold: usize);
    fn add_signers(ref self: TContractState, new_threshold: usize, signers_to_add: Array<felt252>);
    fn remove_signers(ref self: TContractState, new_threshold: usize, signers_to_remove: Array<felt252>);
    fn reorder_signers(ref self: TContractState, new_signer_order: Array<felt252>);
    fn replace_signer(ref self: TContractState, signer_to_remove: felt252, signer_to_add: felt252);
    fn get_name(self: @TContractState) -> felt252;
    fn get_version(self: @TContractState) -> Version;
    fn get_threshold(self: @TContractState) -> usize;
    fn get_signers(self: @TContractState) -> Array<felt252>;
    fn is_signer(self: @TContractState, signer: felt252) -> bool;
    fn assert_valid_signer_signature(
        self: @TContractState, hash: felt252, signer: felt252, signature_r: felt252, signature_s: felt252
    );
    fn is_valid_signer_signature(
        self: @TContractState, hash: felt252, signer: felt252, signature_r: felt252, signature_s: felt252
    ) -> bool;

    // IErc165
    fn supports_interface(self: @TContractState, interface_id: felt252) -> bool;

    // IRecoveryAccount
    fn trigger_escape_signer(ref self: TContractState, target_signer: felt252, new_signer: felt252);
    fn escape_signer(ref self: TContractState);
    fn cancel_escape(ref self: TContractState);
}

fn initialize_generic() -> ITestArgentGenericAccountDispatcher {
    let threshold = 1;
    let signers_array = array![signer_pubkey_1, signer_pubkey_2, signer_pubkey_3];
    initialize_generic_with(threshold, signers_array.span())
}

fn initialize_generic_with_one_signer() -> ITestArgentGenericAccountDispatcher {
    let threshold = 1;
    let signers_array = array![signer_pubkey_1];
    initialize_generic_with(threshold, signers_array.span())
}

fn initialize_generic_with(threshold: usize, mut signers: Span<felt252>) -> ITestArgentGenericAccountDispatcher {
    let mut calldata = array![threshold.into(), signers.len().into(),];
    loop {
        match signers.pop_front() {
            Option::Some(signer) => { calldata.append(*signer) },
            Option::None => { break; },
        };
    };

    let class_hash = ArgentGenericAccount::TEST_CLASS_HASH.try_into().unwrap();
    let (contract_address, _) = deploy_syscall(class_hash, 0, calldata.span(), true).unwrap();

    // This will set the caller for subsequent calls (avoid 'argent/only-self')
    set_contract_address(contract_address_const::<1>());
    ITestArgentGenericAccountDispatcher { contract_address }
}
