import {fetchArrayBuffer} from "../Utils";

class SHPParser {
	constructor() {
		// Shapefile parser, following the specification at
		// http://www.esri.com/library/whitepapers/pdfs/shapefile.pdf
		this.SHAPE_TYPE = {
			NULL: 0,
			POINT: 1,
			POLYLINE: 3,
			POLYGON: 5,

			// not supported
			MultiPoint: 8,
			PointZ: 11,
			PolylineZ: 13,
			PolygonZ: 15,
			MultiPointZ: 18,
			PointM: 21,
			PolylineM: 23,
			PolygonM: 25,
			MultiPointM: 28,
			MultiPatch: 31
		};
	}

	static getShapeName(id) {
		return Object.keys(this.SHAPE_TYPE).find(key => this.SHAPE_TYPE[key] === id);
	}

	static async load(url, callback, returnData) {
		try {
			const arrayBuffer = await fetchArrayBuffer(url);
			const geojsonData = new SHPParser().parse(arrayBuffer, url);
			callback(geojsonData, returnData);
		} catch (error) {
			console.error('Error loading SHP file:', error);
		}
	}

	parse(arrayBuffer, url) {
		const dv = new DataView(arrayBuffer);
		let idx = 0;
		const o = {
			fileName: url,
			fileCode: dv.getInt32(idx, false)
		};

		if (o.fileCode !== 0x0000270a) {
			throw new Error(`Unknown file code: ${o.fileCode}`);
		}

		idx += 6 * 4;
		o.wordLength = dv.getInt32(idx, false);
		o.byteLength = o.wordLength * 2;
		idx += 4;
		o.version = dv.getInt32(idx, true);
		idx += 4;
		o.shapeType = dv.getInt32(idx, true);
		idx += 4;
		o.minX = dv.getFloat64(idx, true);
		o.minY = dv.getFloat64(idx + 8, true);
		o.maxX = dv.getFloat64(idx + 16, true);
		o.maxY = dv.getFloat64(idx + 24, true);
		o.minZ = dv.getFloat64(idx + 32, true);
		o.maxZ = dv.getFloat64(idx + 40, true);
		o.minM = dv.getFloat64(idx + 48, true);
		o.maxM = dv.getFloat64(idx + 56, true);
		idx += 8 * 8;
		o.records = [];

		while (idx < o.byteLength) {
			const record = {
				number: dv.getInt32(idx, false),
				length: dv.getInt32(idx + 4, false)
			};

			try {
				record.shape = this.parseShape(dv, idx + 8);
			} catch (e) {
				console.log(e, record);
			}

			idx += record.length * 2;
			o.records.push(record);
		}

		return o;
	}

	parseShape(dv, idx) {
		const shape = {
			type: dv.getInt32(idx, true),
			content: {}
		};

		idx += 4 * 2;

		switch (shape.type) {
			case this.SHAPE_TYPE.NULL: // shape_type: 0
				break;
			case this.SHAPE_TYPE.POINT: // shape_type: 1
				shape.content = {
					x: dv.getFloat64(idx, true),
					y: dv.getFloat64(idx + 8, true)
				};
				break;
			case this.SHAPE_TYPE.POLYLINE: // shape_type: 3
			case this.SHAPE_TYPE.POLYGON: // shape_type: 5
				shape.content = {
					minX: dv.getFloat64(idx, true),
					minY: dv.getFloat64(idx + 8, true),
					maxX: dv.getFloat64(idx + 16, true),
					maxY: dv.getFloat64(idx + 24, true),
					parts: new Int32Array(dv.getInt32(idx + 32, true)),
					points: new Float64Array(dv.getInt32(idx + 36, true) * 2)
				};
				idx += 40;

				for (let i = 0; i < shape.content.parts.length; i++) {
					shape.content.parts[i] = dv.getInt32(idx, true);
					idx += 4;
				}

				for (let i = 0; i < shape.content.points.length; i++) {
					shape.content.points[i] = dv.getFloat64(idx, true);
					idx += 8;
				}
				break;

			case this.SHAPE_TYPE.MultiPoint:
			case this.SHAPE_TYPE.PointZ:
			case this.SHAPE_TYPE.PolylineZ:
			case this.SHAPE_TYPE.PolygonZ:
			case this.SHAPE_TYPE.MultiPointZ:
			case this.SHAPE_TYPE.PointM:
			case this.SHAPE_TYPE.PolylineM:
			case this.SHAPE_TYPE.PolygonM:
			case this.SHAPE_TYPE.MultiPointM:
			case this.SHAPE_TYPE.MultiPatch:
				throw new Error(`Shape type not supported: ${shape.type}:${this.getShapeName(shape.type)}`);

			default:
				throw new Error(`Unknown shape type at ${idx - 4}:${shape.type}`);
		}

		return shape;
	}
}

export default SHPParser
