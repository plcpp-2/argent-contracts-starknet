import {
  ArraySignatureType,
  CairoCustomEnum,
  CairoOption,
  CairoOptionVariant,
  Call,
  CallData,
  DeclareSignerDetails,
  DeployAccountSignerDetails,
  InvocationsSignerDetails,
  Signature,
  Signer,
  SignerInterface,
  ec,
  encode,
  hash,
  transaction,
  typedData,
  RPC,
  V2InvocationsSignerDetails,
  V3InvocationsSignerDetails,
  V2DeployAccountSignerDetails,
  V3DeployAccountSignerDetails,
  V2DeclareSignerDetails,
  V3DeclareSignerDetails,
  stark,
} from "starknet";

const types = {
  Starknet: [{ name: "Starknet", type: "felt" }],
  Secp256k1: [{ name: "Secp256k1", type: "Ethereum Address" }],
  Secp256r1: [{ name: "Secp256r1", type: "u256" }],
  Webauthn: [{ name: "Webauthn", type: "Webauthn Signer" }],
  "Ethereum Address": [{ name: "Pub Key Hash", type: "EthAddress" }],
  EthAddress: [{ name: "address", type: "felt" }],
  "Webauthn Signer": [
    { name: "origin", type: "felt" },
    { name: "rp id hash", type: "u256" },
    { name: "Public Key", type: "u256" },
  ],
  u256: [
    { name: "low", type: "u128" },
    { name: "high", type: "u128" },
  ],
};

console.log("yo,", typedData.encodeType(types, "u256", typedData.TypedDataRevision.Active));

/**
 * This class allows to easily implement custom signers by overriding the `signRaw` method.
 * This is based on Starknet.js implementation of Signer, but it delegates the actual signing to an abstract function
 */
export abstract class RawSigner implements SignerInterface {
  abstract signRaw(messageHash: string): Promise<Signature>;

  public async getPubKey(): Promise<string> {
    throw Error("This signer allows multiple public keys");
  }

  public async signMessage(typedDataArgument: typedData.TypedData, accountAddress: string): Promise<Signature> {
    const messageHash = typedData.getMessageHash(typedDataArgument, accountAddress);
    return this.signRaw(messageHash);
  }

  public async signTransaction(transactions: Call[], details: InvocationsSignerDetails): Promise<Signature> {
    const compiledCalldata = transaction.getExecuteCalldata(transactions, details.cairoVersion);
    let msgHash;

    // TODO: How to do generic union discriminator for all like this
    if (Object.values(RPC.ETransactionVersion2).includes(details.version as any)) {
      const det = details as V2InvocationsSignerDetails;
      msgHash = hash.calculateInvokeTransactionHash({
        ...det,
        senderAddress: det.walletAddress,
        compiledCalldata,
        version: det.version,
      });
    } else if (Object.values(RPC.ETransactionVersion3).includes(details.version as any)) {
      const det = details as V3InvocationsSignerDetails;
      msgHash = hash.calculateInvokeTransactionHash({
        ...det,
        senderAddress: det.walletAddress,
        compiledCalldata,
        version: det.version,
        nonceDataAvailabilityMode: stark.intDAM(det.nonceDataAvailabilityMode),
        feeDataAvailabilityMode: stark.intDAM(det.feeDataAvailabilityMode),
      });
    } else {
      throw Error("unsupported signTransaction version");
    }
    return this.signRaw(msgHash);
  }

  public async signDeployAccountTransaction(details: DeployAccountSignerDetails): Promise<Signature> {
    const compiledConstructorCalldata = CallData.compile(details.constructorCalldata);
    /*     const version = BigInt(details.version).toString(); */
    let msgHash;

    if (Object.values(RPC.ETransactionVersion2).includes(details.version as any)) {
      const det = details as V2DeployAccountSignerDetails;
      msgHash = hash.calculateDeployAccountTransactionHash({
        ...det,
        salt: det.addressSalt,
        constructorCalldata: compiledConstructorCalldata,
        version: det.version,
      });
    } else if (Object.values(RPC.ETransactionVersion3).includes(details.version as any)) {
      const det = details as V3DeployAccountSignerDetails;
      msgHash = hash.calculateDeployAccountTransactionHash({
        ...det,
        salt: det.addressSalt,
        compiledConstructorCalldata,
        version: det.version,
        nonceDataAvailabilityMode: stark.intDAM(det.nonceDataAvailabilityMode),
        feeDataAvailabilityMode: stark.intDAM(det.feeDataAvailabilityMode),
      });
    } else {
      throw Error(`unsupported signDeployAccountTransaction version: ${details.version}}`);
    }

    return this.signRaw(msgHash);
  }

  public async signDeclareTransaction(
    // contractClass: ContractClass,  // Should be used once class hash is present in ContractClass
    details: DeclareSignerDetails,
  ): Promise<Signature> {
    let msgHash;

    if (Object.values(RPC.ETransactionVersion2).includes(details.version as any)) {
      const det = details as V2DeclareSignerDetails;
      msgHash = hash.calculateDeclareTransactionHash({
        ...det,
        version: det.version,
      });
    } else if (Object.values(RPC.ETransactionVersion3).includes(details.version as any)) {
      const det = details as V3DeclareSignerDetails;
      msgHash = hash.calculateDeclareTransactionHash({
        ...det,
        version: det.version,
        nonceDataAvailabilityMode: stark.intDAM(det.nonceDataAvailabilityMode),
        feeDataAvailabilityMode: stark.intDAM(det.feeDataAvailabilityMode),
      });
    } else {
      throw Error("unsupported signDeclareTransaction version");
    }

    return this.signRaw(msgHash);
  }
}

export class MultisigSigner extends RawSigner {
  constructor(public keys: KeyPair[]) {
    super();
  }

  async signRaw(messageHash: string): Promise<ArraySignatureType> {
    const keys = this.keys.map((key) => key.signHash(messageHash));
    return [keys.length.toString(), keys.flat()].flat();
  }
}

export class ArgentSigner extends MultisigSigner {
  constructor(
    public owner: KeyPair = randomKeyPair(),
    public guardian?: KeyPair,
  ) {
    const signers = [owner];
    if (guardian) {
      signers.push(guardian);
    }
    super(signers);
  }
}

export class LegacyArgentSigner extends RawSigner {
  constructor(
    public owner: LegacyKeyPair = new LegacyKeyPair(),
    public guardian?: LegacyKeyPair,
  ) {
    super();
  }

  async signRaw(messageHash: string): Promise<ArraySignatureType> {
    const signature = this.owner.signHash(messageHash);
    if (this.guardian) {
      const [guardianR, guardianS] = this.guardian.signHash(messageHash);
      signature[2] = guardianR;
      signature[3] = guardianS;
    }
    return signature;
  }
}

export class LegacyMultisigSigner extends RawSigner {
  constructor(public keys: KeyPair[]) {
    super();
  }

  async signRaw(messageHash: string): Promise<ArraySignatureType> {
    const keys = this.keys.map((key) => key.signHash(messageHash));
    return keys.flat();
  }
}

export class KeyPair extends Signer {
  constructor(pk?: string | bigint) {
    super(pk ? `${pk}` : `0x${encode.buf2hex(ec.starkCurve.utils.randomPrivateKey())}`);
  }

  public get privateKey() {
    return BigInt(this.pk as string);
  }

  public get publicKey() {
    return BigInt(ec.starkCurve.getStarkKey(this.pk));
  }

  public signHash(messageHash: string) {
    const { r, s } = ec.starkCurve.sign(messageHash, this.pk);
    return starknetSignatureType(this.publicKey, r, s);
  }
}

export class LegacyKeyPair extends KeyPair {
  public signHash(messageHash: string) {
    const { r, s } = ec.starkCurve.sign(messageHash, this.pk);
    return [r.toString(), s.toString()];
  }
}

export class LegacyMultisigKeyPair extends KeyPair {
  public signHash(messageHash: string) {
    const { r, s } = ec.starkCurve.sign(messageHash, this.pk);
    return [this.publicKey.toString(), r.toString(), s.toString()];
  }
}

export function starknetSignatureType(
  signer: bigint | number | string,
  r: bigint | number | string,
  s: bigint | number | string,
) {
  return CallData.compile([
    new CairoCustomEnum({
      Starknet: { signer, r, s },
      Secp256k1: undefined,
      Secp256r1: undefined,
      Webauthn: undefined,
    }),
  ]);
}

export function compiledStarknetSigner(signer: bigint | number | string) {
  return CallData.compile([starknetSigner(signer)]);
}
export function starknetSigner(signer: bigint | number | string) {
  return new CairoCustomEnum({
    Starknet: { signer },
    Secp256k1: undefined,
    Secp256r1: undefined,
    Webauthn: undefined,
  });
}

export function intoGuid(signer: CairoCustomEnum) {
  return signer.unwrap().signer;
}

export function compiledSignerOption(signer: bigint | undefined) {
  return CallData.compile([signerOption(signer)]);
}

export function signerOption(signer?: bigint) {
  if (signer !== undefined) {
    return new CairoOption<any>(CairoOptionVariant.Some, { signer: starknetSigner(signer) });
  }
  return new CairoOption<any>(CairoOptionVariant.None);
}

export const randomKeyPair = () => new KeyPair();

export const randomKeyPairs = (length: number) => Array.from({ length }, randomKeyPair);
