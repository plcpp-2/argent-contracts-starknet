import { CallData, uint256 } from "starknet";
import {
  deployAccount,
  deployAccountWithoutGuardian,
  provider,
  getEthContract,
  deployFixedWebauthnAccount,
  restart,
  declareContract,
  removeFromCache,
  deployOldAccount,
  LegacyStarknetKeyPair,
  signChangeOwnerMessage,
  starknetSignatureType,
  StarknetKeyPair,
  EthKeyPair,
  Secp256r1KeyPair,
} from "../tests-integration/lib";
import { newProfiler } from "../tests-integration/lib/gas";

const profiler = newProfiler(provider);

// With the KeyPairs hardcoded, we gotta reset to avoid some issues
await restart();
removeFromCache("Proxy");
removeFromCache("OldArgentAccount");
removeFromCache("ArgentAccount");

const ethContract = await getEthContract();
const recipient = "0xadbe1";
const amount = uint256.bnToUint256(1);
const starknetOwner = new StarknetKeyPair(42n);
const guardian = new StarknetKeyPair(43n);

{
  const { account } = await deployOldAccount();
  ethContract.connect(account);
  await profiler.profile("Old account", await ethContract.transfer(recipient, amount));
}

{
  const { account, accountContract } = await deployAccount({
    owner: starknetOwner,
    guardian,
    salt: "0x1",
  });
  const owner = await accountContract.get_owner();
  const newOwner = new LegacyStarknetKeyPair();
  const chainId = await provider.getChainId();
  const [r, s] = await signChangeOwnerMessage(account.address, owner, newOwner, chainId);
  await profiler.profile(
    "Change owner",
    await accountContract.change_owner(starknetSignatureType(newOwner.publicKey, r, s)),
  );
}

{
  const { account } = await deployAccount({
    owner: starknetOwner,
    guardian,
    salt: "0x2",
  });
  ethContract.connect(account);
  await profiler.profile("Account", await ethContract.transfer(recipient, amount));
}

{
  const { account } = await deployAccountWithoutGuardian({ owner: starknetOwner, salt: "0x3" });
  ethContract.connect(account);
  await profiler.profile("Account w/o guardian", await ethContract.transfer(recipient, amount));
}

{
  const { account } = await deployAccount({
    owner: new EthKeyPair(45n),
    guardian,
    salt: "0x4",
  });
  ethContract.connect(account);
  await profiler.profile(
    "Eth sig w guardian",
    await ethContract.invoke("transfer", CallData.compile([recipient, amount]), { maxFee: 1e15 }),
  );
}

{
  const { account } = await deployAccount({
    owner: new Secp256r1KeyPair(48n),
    guardian,
    salt: "0x5",
  });
  ethContract.connect(account);
  await profiler.profile(
    "Secp256r1 w guardian",
    await ethContract.invoke("transfer", CallData.compile([recipient, amount]), { maxFee: 1e15 }),
  );
}

// commented out because class hash changed
// {
//   await restart();
//   removeFromCache("ArgentAccount");
//   const classHash = await declareContract("ArgentAccount");
//   const account = await deployFixedWebauthnAccount(classHash);
//   const ethContract = await getEthContract();
//   ethContract.connect(account);
//   const recipient = 69;
//   await profiler.profile(
//     "Fixed webauthn w/o guardian",
//     await ethContract.invoke("transfer", CallData.compile([recipient, amount]), { maxFee: 1e15 }),
//   );
// }

profiler.printSummary();
profiler.updateOrCheckReport();
