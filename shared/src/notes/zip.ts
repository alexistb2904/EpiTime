export type ZipEntry = { name: string; data: Uint8Array };

const CRC_TABLE = (() => {
	const table = new Uint32Array(256);
	for (let n = 0; n < 256; n++) {
		let c = n;
		for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
		table[n] = c >>> 0;
	}
	return table;
})();

export function crc32(data: Uint8Array) {
	let crc = 0xffffffff;
	for (let i = 0; i < data.length; i++) crc = CRC_TABLE[(crc ^ data[i]!) & 0xff]! ^ (crc >>> 8);
	return (crc ^ 0xffffffff) >>> 0;
}

export function createZip(entries: ZipEntry[]): Uint8Array {
	const encoder = new TextEncoder();
	const locals: Uint8Array[] = [];
	const centrals: Uint8Array[] = [];
	let offset = 0;
	for (const entry of entries) {
		const name = encoder.encode(entry.name);
		const crc = crc32(entry.data);
		const local = new Uint8Array(30 + name.length);
		const view = new DataView(local.buffer);
		view.setUint32(0, 0x04034b50, true);
		view.setUint16(4, 20, true);
		view.setUint16(6, 0x0800, true);
		view.setUint32(14, crc, true);
		view.setUint32(18, entry.data.length, true);
		view.setUint32(22, entry.data.length, true);
		view.setUint16(26, name.length, true);
		local.set(name, 30);

		const central = new Uint8Array(46 + name.length);
		const cview = new DataView(central.buffer);
		cview.setUint32(0, 0x02014b50, true);
		cview.setUint16(4, 20, true);
		cview.setUint16(6, 20, true);
		cview.setUint16(8, 0x0800, true);
		cview.setUint32(16, crc, true);
		cview.setUint32(20, entry.data.length, true);
		cview.setUint32(24, entry.data.length, true);
		cview.setUint16(28, name.length, true);
		cview.setUint32(42, offset, true);
		central.set(name, 46);

		locals.push(local, entry.data);
		centrals.push(central);
		offset += local.length + entry.data.length;
	}
	const centralSize = centrals.reduce((sum, part) => sum + part.length, 0);
	const end = new Uint8Array(22);
	const eview = new DataView(end.buffer);
	eview.setUint32(0, 0x06054b50, true);
	eview.setUint16(8, entries.length, true);
	eview.setUint16(10, entries.length, true);
	eview.setUint32(12, centralSize, true);
	eview.setUint32(16, offset, true);

	const out = new Uint8Array(offset + centralSize + end.length);
	let position = 0;
	for (const part of [...locals, ...centrals, end]) {
		out.set(part, position);
		position += part.length;
	}
	return out;
}

export function readZip(bytes: Uint8Array): ZipEntry[] {
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	let endOffset = -1;
	for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 65_535); i--) {
		if (view.getUint32(i, true) === 0x06054b50) {
			endOffset = i;
			break;
		}
	}
	if (endOffset < 0) throw new Error("Archive illisible : ce n'est pas un fichier ZIP.");
	const count = view.getUint16(endOffset + 10, true);
	let pointer = view.getUint32(endOffset + 16, true);
	const decoder = new TextDecoder();
	const entries: ZipEntry[] = [];
	const check = (condition: boolean) => {
		if (!condition) throw new Error("Archive endommagée.");
	};
	for (let i = 0; i < count; i++) {
		check(pointer + 46 <= bytes.length && view.getUint32(pointer, true) === 0x02014b50);
		const method = view.getUint16(pointer + 10, true);
		if (method !== 0) throw new Error("Archive compressée non prise en charge : utilise un export EpiTime.");
		const crc = view.getUint32(pointer + 16, true);
		const size = view.getUint32(pointer + 20, true);
		const nameLength = view.getUint16(pointer + 28, true);
		const extraLength = view.getUint16(pointer + 30, true);
		const commentLength = view.getUint16(pointer + 32, true);
		const localOffset = view.getUint32(pointer + 42, true);
		check(pointer + 46 + nameLength <= bytes.length);
		const name = decoder.decode(bytes.subarray(pointer + 46, pointer + 46 + nameLength));
		check(localOffset + 30 <= bytes.length && view.getUint32(localOffset, true) === 0x04034b50);
		const dataStart = localOffset + 30 + view.getUint16(localOffset + 26, true) + view.getUint16(localOffset + 28, true);
		check(dataStart + size <= bytes.length);
		const data = bytes.slice(dataStart, dataStart + size);
		check(crc32(data) === crc);
		entries.push({ name, data });
		pointer += 46 + nameLength + extraLength + commentLength;
	}
	return entries;
}
