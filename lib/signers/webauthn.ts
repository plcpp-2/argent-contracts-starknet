import { concatBytes } from "@noble/curves/abstract/utils";
import { p256 as secp256r1 } from "@noble/curves/p256";
import { BinaryLike, createHash } from "crypto";
import { ArraySignatureType, CairoCustomEnum, CallData, hash, shortString, uint256 } from "starknet";
import { KeyPair, SignerType, signerTypeToCustomEnum } from "..";

// Bytes fn
const buf2hex = (buffer: ArrayBuffer, prefix = true) =>
  `${prefix ? "0x" : ""}${[...new Uint8Array(buffer)].map((x) => x.toString(16).padStart(2, "0")).join("")}`;

const normalizeTransactionHash = (transactionHash: string) => transactionHash.replace(/^0x/, "").padStart(64, "0");

const buf2base64url = (buffer: ArrayBuffer) =>
  buf2base64(buffer).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");

const buf2base64 = (buffer: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(buffer)));

const hex2buf = (hex: string) =>
  Uint8Array.from(
    hex
      .replace(/^0x/, "")
      .match(/.{1,2}/g)!
      .map((byte) => parseInt(byte, 16)),
  );

// Constants
const rpIdHash = sha256("localhost");
const origin = "http://localhost:5173";
const originBytes = CallData.compile(origin.split("").map(shortString.encodeShortString));

interface WebauthnAssertion {
  authenticatorData: Uint8Array;
  clientDataJson: Uint8Array;
  r: bigint;
  s: bigint;
  yParity: boolean;
}

export class WebauthnOwner extends KeyPair {
  pk: Uint8Array;

  constructor(pk?: string) {
    super();
    this.pk = pk ? hex2buf(normalizeTransactionHash(pk)) : secp256r1.utils.randomPrivateKey();
  }

  public get publicKey() {
    return secp256r1.getPublicKey(this.pk).slice(1);
  }

  public get guid(): bigint {
    const rpIdHashAsU256 = uint256.bnToUint256(buf2hex(rpIdHash));
    const publicKeyAsU256 = uint256.bnToUint256(buf2hex(this.publicKey));
    return BigInt(
      hash.computePoseidonHashOnElements([
        shortString.encodeShortString("Webauthn Signer"),
        originBytes.length,
        ...originBytes,
        rpIdHashAsU256.low,
        rpIdHashAsU256.high,
        publicKeyAsU256.low,
        publicKeyAsU256.high,
      ]),
    );
  }

  public get storedValue(): bigint {
    throw new Error("Not implemented yet");
  }

  public get signer(): CairoCustomEnum {
    return signerTypeToCustomEnum(SignerType.Webauthn, {
      origin: originBytes,
      rp_id_hash: uint256.bnToUint256(buf2hex(rpIdHash)),
      pubkey: uint256.bnToUint256(buf2hex(this.publicKey)),
    });
  }

  public async signRaw(messageHash: string): Promise<ArraySignatureType> {
    const { authenticatorData, clientDataJson, r, s, yParity } = await this.signHash(messageHash);
    const clientDataText = new TextDecoder().decode(clientDataJson.buffer);
    const clientData = JSON.parse(clientDataText);
    const clientDataOffset = (substring: string) => clientDataText.indexOf(substring) + substring.length;

    const cairoAssertion = {
      origin: originBytes,
      rp_id_hash: uint256.bnToUint256(buf2hex(rpIdHash)),
      pubkey: uint256.bnToUint256(buf2hex(this.publicKey)),
      authenticator_data: CallData.compile(Array.from(authenticatorData)),
      client_data_json: CallData.compile(Array.from(clientDataJson)),
      signature: {
        r: uint256.bnToUint256(r),
        s: uint256.bnToUint256(s),
        y_parity: yParity,
      },
      type_offset: clientDataOffset('"type":"'),
      challenge_offset: clientDataOffset('"challenge":"'),
      challenge_length: clientData.challenge.length,
      origin_offset: clientDataOffset('"origin":"'),
      origin_length: clientData.origin.length,
    };

    return CallData.compile([signerTypeToCustomEnum(SignerType.Webauthn, cairoAssertion)]);
  }

  public async signHash(transactionHash: string): Promise<WebauthnAssertion> {
    const flags = new Uint8Array([0b0001 | 0b0100]); // present and verified
    const signCount = new Uint8Array(4); // [0_u8, 0_u8, 0_u8, 0_u8]
    const authenticatorData = concatBytes(rpIdHash, flags, signCount);

    const challenge = buf2base64url(hex2buf(normalizeTransactionHash(transactionHash) + "00"));
    const clientData = { type: "webauthn.get", challenge, origin, crossOrigin: false };
    const clientDataJson = new TextEncoder().encode(JSON.stringify(clientData));

    const message = concatBytes(authenticatorData, sha256(clientDataJson));
    const messageHash = sha256(message);

    const signature = secp256r1.sign(messageHash, this.pk);

    return { authenticatorData, clientDataJson, r: signature.r, s: signature.s, yParity: signature.recovery !== 0 };
  }
}

function sha256(message: BinaryLike) {
  return createHash("sha256").update(message).digest();
}

export const randomWebauthnOwner = () => new WebauthnOwner();
