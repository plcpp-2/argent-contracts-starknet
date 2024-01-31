import { expect } from "chai";
import { num, shortString } from "starknet";
import { MultisigSigner, declareContract, expectRevertWithErrorMessage, randomKeyPair } from "./lib";
import { deployMultisig, deployMultisig1_1 } from "./lib/multisig";

describe("ArgentMultisig: signing", function () {
  const VALID = BigInt(shortString.encodeShortString("VALID"));

  describe("is_valid_signature(hash, signatures)", function () {
    it("Should verify that a multisig owner has signed a message", async function () {
      const messageHash = num.toHex(424242);

      const { accountContract, signers, keys } = await deployMultisig1_1();

      const signatures = await new MultisigSigner(keys).signRaw(messageHash);

      const validSignatureResult = await accountContract.is_valid_signature(BigInt(messageHash), signatures);

      expect(validSignatureResult).to.equal(VALID);
    });

    it("Should verify numerous multisig owners have signed a message", async function () {
      const messageHash = num.toHex(424242);

      const { accountContract, signers, keys } = await deployMultisig({ threshold: 2, signersLength: 2 });

      const signatures = await new MultisigSigner(keys).signRaw(messageHash);

      const validSignatureResult = await accountContract.is_valid_signature(BigInt(messageHash), signatures);

      expect(validSignatureResult).to.equal(VALID);
    });

    it("Should verify that signatures are in the correct order", async function () {
      const messageHash = num.toHex(424242);

      const { accountContract, signers, keys } = await deployMultisig({ threshold: 2, signersLength: 2 });

      const signatures = await new MultisigSigner(keys.reverse()).signRaw(messageHash);

      await expectRevertWithErrorMessage("argent/signatures-not-sorted", () =>
        accountContract.is_valid_signature(BigInt(messageHash), signatures),
      );
    });

    it("Should verify that signatures are in the not repeated", async function () {
      const messageHash = num.toHex(424242);

      const { accountContract, signers, keys } = await deployMultisig({ threshold: 2, signersLength: 2 });

      const signatures = await new MultisigSigner([keys[0], keys[0]]).signRaw(messageHash);

      await expectRevertWithErrorMessage("argent/signatures-not-sorted", () =>
        accountContract.is_valid_signature(BigInt(messageHash), signatures),
      );
    });

    it("Expect 'argent/invalid-signature-length' when an owner's signature is missing", async function () {
      const messageHash = num.toHex(424242);
      const { accountContract, signers, keys } = await deployMultisig({ threshold: 2, signersLength: 2 });

      const signatures = await new MultisigSigner([keys[0]]).signRaw(messageHash);

      await expectRevertWithErrorMessage("argent/invalid-signature-length", () =>
        accountContract.is_valid_signature(BigInt(messageHash), signatures),
      );
    });

    it("Expect 'argent/not-a-signer' when a non-owner signs a message", async function () {
      const messageHash = num.toHex(424242);

      const { accountContract } = await deployMultisig1_1();
      const invalid = randomKeyPair();
      const signatures = await new MultisigSigner([invalid]).signRaw(messageHash);

      await expectRevertWithErrorMessage("argent/not-a-signer", () =>
        accountContract.is_valid_signature(BigInt(messageHash), signatures),
      );
    });

    it("Expect 'argent/invalid-signature-length' when the signature is improperly formatted/empty", async function () {
      const messageHash = num.toHex(424242);

      const { accountContract, keys, signers } = await deployMultisig1_1();

      const [r] = keys[0].signHash(messageHash);

      await expectRevertWithErrorMessage("argent/undeserializable", () =>
        // Missing S argument
        accountContract.is_valid_signature(BigInt(messageHash), [1, 0, keys[0].publicKey, r]),
      );

      // No SignerSignature
      await expectRevertWithErrorMessage("argent/undeserializable", () =>
        accountContract.is_valid_signature(BigInt(messageHash), []),
      );
    });
  });
});
