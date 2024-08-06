import {fetchArrayBuffer, fetchText} from "../Utils";

class DBFParser {
	constructor() {}

	static async load(url, encoding, callback, returnData) {
		try {
			const arrayBuffer = await fetchArrayBuffer(url);
			const responseText = await fetchText(url, encoding);
			const geojsonData = new DBFParser().parse(arrayBuffer, url, responseText, encoding);
			callback(geojsonData, returnData);
		} catch (error) {
			console.error('Error loading DBF file:', error);
		}
	}

	parse(arrayBuffer, src, response, encoding) {
		const dv = new DataView(arrayBuffer);
		let idx = 0;
		let offset;

		switch (encoding.toLowerCase()) {
			case 'big5':
				offset = 2;
				break;
			case 'iso-8859-1':
				offset = 1;
				break;
			default:
				offset = 3;
		}

		const o = {
			fileName: src,
			version: dv.getInt8(idx, false),
			year: dv.getUint8(idx + 1) + 1900,
			month: dv.getUint8(idx + 2),
			day: dv.getUint8(idx + 3),
			numberOfRecords: dv.getInt32(idx + 4, true),
			bytesInHeader: dv.getInt16(idx + 8, true),
			bytesInRecord: dv.getInt16(idx + 10, true),
			// offset 2 for reserved bytes
			// offset 2 for incompleteTransation
			incompleteTransation: dv.getUint8(idx + 14),
			encryptionFlag: dv.getUint8(idx + 15),
			// offset 1 for skip free record thread for LAN only
			// offset 4 for reserved for multi-user dBASE in dBASE III+
			// offset 8 for mdxFlag
			mdxFlag: dv.getUint8(idx + 28),
			languageDriverId: dv.getUint8(idx + 29),
			fields: []
		};

		idx += 32;

		let responseHandler = response.split('\r');
		if (responseHandler.length > 2) {
			responseHandler.pop();
			responseHandler = responseHandler.join('\r').slice(32);
		} else {
			responseHandler = responseHandler[0].slice(32);
			offset = 2;
		}

		while (true) {
			const field = {
				name: this.readChar(dv, idx, 10).trim(),
				type: String.fromCharCode(dv.getUint8(idx + 11)),
				// offset 1 for skip field data address
				// offset 4 for fieldLength
				fieldLength: dv.getUint8(idx + 16),
				// offset 1 for decimalCount field
				// offset 1 for skip reserved bytes multi-user dBASE
				// offset 2 for workAreaId
				workAreaId: dv.getUint8(idx + 20),
				setFieldFlag: dv.getUint8(idx + 21),
				indexFieldFlag: dv.getUint8(idx + 31)
			};

			o.fields.push(field);

			// Checks for end of field descriptor array. Valid .dbf files will have this flag
			if (dv.getUint8(idx + 32) === 0x0D) break;

			idx += 32;
		}

		idx += 1;
		o.fieldpos = idx;
		o.records = [];

		response = response.split('\r').pop();

		for (let i = 0; i < o.numberOfRecords; i++) {
			response = response.slice(1);
			const record = {};

			for (let j = 0; j < o.fields.length; j++) {
				const charString = [];
				let count = 0;
				let z = 0;

				while (count < o.fields[j].fieldLength) {
					try {
						if (encodeURIComponent(response[z]).match(/%[A-F\d]{2}/g)) {
							count += offset;
						} else {
							count++;
						}
					} catch (error) {
						count++;
					}
					z++;
				}

				charString.push(response.slice(0, z).replace(/\0/g, ''));
				response = response.slice(z);

				record[o.fields[j].name] = charString.join('').trim().match(/\d{1}\.\d{11}e\+\d{3}/g) ? parseFloat(charString.join('').trim()) : charString.join('').trim();
			}
			o.records.push(record);
		}

		return o;
	}

	readChar(dv, idx, len) {
		let charArray = [];

		for (let i = 0; i < len; i++) {
			const char = dv.getUint8(idx + i);
			if (char !== 0) {
				charArray.push(String.fromCharCode(char));
			}
		}

		return charArray.join('');
	}
}