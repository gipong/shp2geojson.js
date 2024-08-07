import proj4 from 'proj4'
import JSZip from 'jszip';
import JSZipUtils from 'jszip-utils';
import SHPParser from './SHPParser';
import DBFParser from './DBFParser';

const EPSG4326 = proj4('EPSG:4326');

class Shp2GeoJsonLoader {
	constructor() {
		this.inputData = {};
		this.geoData = {};
		this.EPSGUser = null;
		this.url = null;
		this.encoding = 'utf-8';
		this.EPSG = 4326;
	}

	load(config, returnData) {
		this.url = config.url;
		this.encoding = config.encoding || 'utf-8';
		this.EPSG = config.EPSG || 4326;

		this.loadEPSG(`https://epsg.io/${this.EPSG}.js`, () => {
			// predefined [EPSG:3821] customized projection
			if (this.EPSG === 3821) {
				proj4.defs([
					['EPSG:3821', '+proj=tmerc +ellps=GRS67 +towgs84=-752,-358,-179,-.0000011698,.0000018398,.0000009822,.00002329 +lat_0=0 +lon_0=121 +x_0=250000 +y_0=0 +k=0.9999 +units=m +no_defs']
				]);
			}
			this.EPSGUser = proj4(`EPSG:${this.EPSG}`);

			if (typeof this.url !== 'string') {
				const reader = new FileReader();
				reader.onload = (e) => this.handleFileLoad(e, returnData);
				reader.readAsArrayBuffer(this.url);
			} else {
				JSZipUtils.getBinaryContent(this.url, (err, data) => {
					if (err) throw err;
					this.handleZipLoad(data, returnData);
				});
			}
		});
	}

	loadEPSG(url, callback) {
		const script = document.createElement('script');
		script.src = url;
		script.onreadystatechange = callback;
		script.onload = callback;
		document.getElementsByTagName('head')[0].appendChild(script);
	}

	TransCoord(x, y) {
		if (proj4) {
			const p = proj4(this.EPSGUser, EPSG4326, [parseFloat(x), parseFloat(y)]);
			return { x: p[0], y: p[1] };
		}
		return { x, y };
	}

	handleFileLoad(e, returnData) {
		const zip = new JSZip(e.target.result);
		const shpFile = zip.file(/.shp$/i)[0];
		const dbfFile = zip.file(/.dbf$/i)[0];
		const prjFile = zip.file(/.prj$/i)[0];

		if (prjFile) {
			proj4.defs('EPSGUSER', zip.file(prjFile.name).asText());
			try {
				this.EPSGUser = proj4('EPSGUSER');
			} catch (error) {
				console.error('Unsupported Projection:', error);
			}
		}

		SHPParser.load(URL.createObjectURL(new Blob([shpFile.asArrayBuffer()])), this.shpLoader.bind(this), returnData);
		DBFParser.load(URL.createObjectURL(new Blob([dbfFile.asArrayBuffer()])), this.encoding, this.dbfLoader.bind(this), returnData);
	}

	handleZipLoad(data, returnData) {
		const zip = new JSZip(data);
		const shpFile = zip.file(/.shp$/i)[0];
		const dbfFile = zip.file(/.dbf$/i)[0];
		const prjFile = zip.file(/.prj$/i)[0];

		if (prjFile) {
			proj4.defs('EPSGUSER', zip.file(prjFile.name).asText());
			try {
				this.EPSGUser = proj4('EPSGUSER');
			} catch (error) {
				console.error('Unsupported Projection:', error);
			}
		}

		SHPParser.load(
			URL.createObjectURL(
				new Blob([shpFile.asArrayBuffer()])
			),
			this.shpLoader.bind(this),
			returnData
		);
		DBFParser.load(
			URL.createObjectURL(
				new Blob([dbfFile.asArrayBuffer()])
			),
			this.encoding,
			this.dbfLoader.bind(this),
			returnData
		);
	}

	shpLoader(data, returnData) {
		this.inputData['shp'] = data;
		if (this.inputData['shp'] && this.inputData['dbf']) {
			if (returnData) returnData(this.toGeojson(this.inputData));
		}
	}

	dbfLoader(data, returnData) {
		this.inputData['dbf'] = data;
		if (this.inputData['shp'] && this.inputData['dbf']) {
			if (returnData) returnData(this.toGeojson(this.inputData));
		}
	}

	toGeojson(geojsonData) {
		const geojson = {
			type: "FeatureCollection",
			features: [],
			bbox: [
				this.TransCoord(geojsonData.shp.minX, geojsonData.shp.minY).x,
				this.TransCoord(geojsonData.shp.minX, geojsonData.shp.minY).y,
				this.TransCoord(geojsonData.shp.maxX, geojsonData.shp.maxY).x,
				this.TransCoord(geojsonData.shp.maxX, geojsonData.shp.maxY).y,
			]
		};

		const shpRecords = geojsonData.shp.records;
		const dbfRecords = geojsonData.dbf.records;

		shpRecords.forEach((shpRecord, i) => {
			const feature = {
				type: 'Feature',
				geometry: this.getGeometry(shpRecord),
				properties: dbfRecords[i]
			};
			if (feature.geometry) geojson.features.push(feature);
		});

		return geojson;
	}

	getGeometry(shpRecord) {
		const shape = shpRecord.shape;
		const geometry = { type: "", coordinates: [] };

		// point : 1 , polyline : 3 , polygon : 5, multipoint : 8
		switch (shape.type) {
			case 1:
				geometry.type = "Point";
				const rePrjPoint = this.TransCoord(shape.content.x, shape.content.y);
				geometry.coordinates = [rePrjPoint.x, rePrjPoint.y];
				break;
			case 3:
			case 8:
				geometry.type = (shape.type === 3 ? "LineString" : "MultiPoint");
				geometry.coordinates = this.getCoordinates(shape.content.points);
				break;
			case 5:
				geometry.type = "Polygon";
				geometry.coordinates = this.getPolygonCoordinates(shape.content.parts, shape.content.points);
				break;
			default:
				return null;
		}

		return geometry;
	}

	getCoordinates(points) {
		const coordinates = [];
		for (let i = 0; i < points.length; i += 2) {
			const rePrjPoint = this.TransCoord(points[i], points[i + 1]);
			coordinates.push([rePrjPoint.x, rePrjPoint.y]);
		}
		return coordinates;
	}

	getPolygonCoordinates(parts, points) {
		const coordinates = [];
		for (let i = 0; i < parts.length; i++) {
			const part = [];
			const partStart = parts[i] * 2;
			const partEnd = parts[i + 1] * 2 || points.length;
			for (let j = partStart; j < partEnd; j += 2) {
				const rePrjPoint = this.TransCoord(points[j], points[j + 1]);
				part.push([rePrjPoint.x, rePrjPoint.y]);
			}
			coordinates.push(part);
		}
		return coordinates;
	}
}

module.exports = Shp2GeoJsonLoader;