import { keccak_256 } from "@noble/hashes/sha3.js";
const ABI_WORD_BYTE_LENGTH = 32;
function concatBytes(...byteArrays: ReadonlyArray<Uint8Array>): Uint8Array {
    const totalLength = byteArrays.reduce((total, byteArray) => total + byteArray.length, 0);
    const combinedBytes = new Uint8Array(totalLength);
    let writeOffset = 0;
    for (const byteArray of byteArrays) {
        combinedBytes.set(byteArray, writeOffset);
        writeOffset += byteArray.length;
    }
    return combinedBytes;
}
function numberWord(value: bigint): Uint8Array {
    const wordBytes = new Uint8Array(ABI_WORD_BYTE_LENGTH);
    let remainingValue = value;
    for (let byteIndex = ABI_WORD_BYTE_LENGTH - 1; byteIndex >= 0; byteIndex--) {
        wordBytes[byteIndex] = Number(remainingValue & 0xffn);
        remainingValue >>= 8n;
    }
    return wordBytes;
}
function encodeStringValue(text: string): Uint8Array {
    const encodedText = new TextEncoder().encode(text);
    const paddingLength =
        (ABI_WORD_BYTE_LENGTH - (encodedText.length % ABI_WORD_BYTE_LENGTH)) % ABI_WORD_BYTE_LENGTH;
    return concatBytes(
        numberWord(BigInt(encodedText.length)),
        encodedText,
        new Uint8Array(paddingLength),
    );
}
function encodeStringArrayArgument(items: ReadonlyArray<string>): Uint8Array {
    const encodedItems = items.map((item) => encodeStringValue(item));
    let bodyOffset = items.length * ABI_WORD_BYTE_LENGTH;
    const itemOffsets = encodedItems.map((encodedItem) => {
        const itemOffset = bodyOffset;
        bodyOffset += encodedItem.length;
        return numberWord(BigInt(itemOffset));
    });
    return concatBytes(
        numberWord(32n),
        numberWord(BigInt(items.length)),
        ...itemOffsets,
        ...encodedItems,
    );
}
function readWord(bytes: Uint8Array, offset: number): bigint {
    let value = 0n;
    for (let byteIndex = 0; byteIndex < ABI_WORD_BYTE_LENGTH; byteIndex++) {
        value = (value << 8n) | BigInt(bytes[offset + byteIndex] as number);
    }
    return value;
}
function decodeStringAt(bytes: Uint8Array, dataStart: number): string {
    const textLength = Number(readWord(bytes, dataStart));
    return new TextDecoder().decode(
        bytes.slice(
            dataStart + ABI_WORD_BYTE_LENGTH,
            dataStart + ABI_WORD_BYTE_LENGTH + textLength,
        ),
    );
}
function decodeStringResult(bytes: Uint8Array): string {
    const dataStart = Number(readWord(bytes, 0));
    return decodeStringAt(bytes, dataStart);
}
function decodeStringArrayResult(bytes: Uint8Array): Array<string> {
    const arrayStart = Number(readWord(bytes, 0));
    const itemCount = Number(readWord(bytes, arrayStart));
    const decodedItems: Array<string> = [];
    for (let itemIndex = 0; itemIndex < itemCount; itemIndex++) {
        const itemOffset = Number(
            readWord(bytes, arrayStart + ABI_WORD_BYTE_LENGTH + itemIndex * ABI_WORD_BYTE_LENGTH),
        );
        decodedItems.push(decodeStringAt(bytes, arrayStart + ABI_WORD_BYTE_LENGTH + itemOffset));
    }
    return decodedItems;
}
function encodeFunctionSelector(signature: string): Uint8Array {
    return keccak_256(new TextEncoder().encode(signature)).slice(0, 4);
}
export {
    concatBytes,
    decodeStringArrayResult,
    decodeStringResult,
    encodeFunctionSelector,
    encodeStringArrayArgument,
    numberWord,
};
