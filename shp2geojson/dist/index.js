'use strict';

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _proj = require('proj4');

var _proj2 = _interopRequireDefault(_proj);

var _jszip = require('jszip');

var _jszip2 = _interopRequireDefault(_jszip);

var _jszipUtils = require('jszip-utils');

var _jszipUtils2 = _interopRequireDefault(_jszipUtils);

var _SHPParser = require('./SHPParser');

var _SHPParser2 = _interopRequireDefault(_SHPParser);

var _DBFParser = require('./DBFParser');

var _DBFParser2 = _interopRequireDefault(_DBFParser);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var EPSG4326 = (0, _proj2.default)('EPSG:4326');

var Shp2GeoJsonLoader = function () {
	function Shp2GeoJsonLoader() {
		_classCallCheck(this, Shp2GeoJsonLoader);

		this.inputData = {};
		this.geoData = {};
		this.EPSGUser = null;
		this.url = null;
		this.encoding = 'utf-8';
		this.EPSG = 4326;
	}

	_createClass(Shp2GeoJsonLoader, [{
		key: 'load',
		value: function load(config, returnData) {
			var _this = this;

			this.url = config.url;
			this.encoding = config.encoding || 'utf-8';
			this.EPSG = config.EPSG || 4326;

			this.loadEPSG('https://epsg.io/' + this.EPSG + '.js', function () {
				// predefined [EPSG:3821] customized projection
				if (_this.EPSG === 3821) {
					_proj2.default.defs([['EPSG:3821', '+proj=tmerc +ellps=GRS67 +towgs84=-752,-358,-179,-.0000011698,.0000018398,.0000009822,.00002329 +lat_0=0 +lon_0=121 +x_0=250000 +y_0=0 +k=0.9999 +units=m +no_defs']]);
				}
				_this.EPSGUser = (0, _proj2.default)('EPSG:' + _this.EPSG);

				if (typeof _this.url !== 'string') {
					var reader = new FileReader();
					reader.onload = function (e) {
						return _this.handleFileLoad(e, returnData);
					};
					reader.readAsArrayBuffer(_this.url);
				} else {
					_jszipUtils2.default.getBinaryContent(_this.url, function (err, data) {
						if (err) throw err;
						_this.handleZipLoad(data, returnData);
					});
				}
			});
		}
	}, {
		key: 'loadEPSG',
		value: function loadEPSG(url, callback) {
			var script = document.createElement('script');
			script.src = url;
			script.onreadystatechange = callback;
			script.onload = callback;
			document.getElementsByTagName('head')[0].appendChild(script);
		}
	}, {
		key: 'TransCoord',
		value: function TransCoord(x, y) {
			if (_proj2.default) {
				var p = (0, _proj2.default)(this.EPSGUser, EPSG4326, [parseFloat(x), parseFloat(y)]);
				return { x: p[0], y: p[1] };
			}
			return { x: x, y: y };
		}
	}, {
		key: 'handleFileLoad',
		value: function handleFileLoad(e, returnData) {
			var zip = new _jszip2.default(e.target.result);
			var shpFile = zip.file(/.shp$/i)[0];
			var dbfFile = zip.file(/.dbf$/i)[0];
			var prjFile = zip.file(/.prj$/i)[0];

			if (prjFile) {
				_proj2.default.defs('EPSGUSER', zip.file(prjFile.name).asText());
				try {
					this.EPSGUser = (0, _proj2.default)('EPSGUSER');
				} catch (error) {
					console.error('Unsupported Projection:', error);
				}
			}

			_SHPParser2.default.load(URL.createObjectURL(new Blob([shpFile.asArrayBuffer()])), this.shpLoader.bind(this), returnData);
			_DBFParser2.default.load(URL.createObjectURL(new Blob([dbfFile.asArrayBuffer()])), this.encoding, this.dbfLoader.bind(this), returnData);
		}
	}, {
		key: 'handleZipLoad',
		value: function handleZipLoad(data, returnData) {
			var zip = new _jszip2.default(data);
			var shpFile = zip.file(/.shp$/i)[0];
			var dbfFile = zip.file(/.dbf$/i)[0];
			var prjFile = zip.file(/.prj$/i)[0];

			if (prjFile) {
				_proj2.default.defs('EPSGUSER', zip.file(prjFile.name).asText());
				try {
					this.EPSGUser = (0, _proj2.default)('EPSGUSER');
				} catch (error) {
					console.error('Unsupported Projection:', error);
				}
			}

			_SHPParser2.default.load(URL.createObjectURL(new Blob([shpFile.asArrayBuffer()])), this.shpLoader.bind(this), returnData);
			_DBFParser2.default.load(URL.createObjectURL(new Blob([dbfFile.asArrayBuffer()])), this.encoding, this.dbfLoader.bind(this), returnData);
		}
	}, {
		key: 'shpLoader',
		value: function shpLoader(data, returnData) {
			this.inputData['shp'] = data;
			if (this.inputData['shp'] && this.inputData['dbf']) {
				if (returnData) returnData(this.toGeojson(this.inputData));
			}
		}
	}, {
		key: 'dbfLoader',
		value: function dbfLoader(data, returnData) {
			this.inputData['dbf'] = data;
			if (this.inputData['shp'] && this.inputData['dbf']) {
				if (returnData) returnData(this.toGeojson(this.inputData));
			}
		}
	}, {
		key: 'toGeojson',
		value: function toGeojson(geojsonData) {
			var _this2 = this;

			var geojson = {
				type: "FeatureCollection",
				features: [],
				bbox: [this.TransCoord(geojsonData.shp.minX, geojsonData.shp.minY).x, this.TransCoord(geojsonData.shp.minX, geojsonData.shp.minY).y, this.TransCoord(geojsonData.shp.maxX, geojsonData.shp.maxY).x, this.TransCoord(geojsonData.shp.maxX, geojsonData.shp.maxY).y]
			};

			var shpRecords = geojsonData.shp.records;
			var dbfRecords = geojsonData.dbf.records;

			shpRecords.forEach(function (shpRecord, i) {
				var feature = {
					type: 'Feature',
					geometry: _this2.getGeometry(shpRecord),
					properties: dbfRecords[i]
				};
				if (feature.geometry) geojson.features.push(feature);
			});

			return geojson;
		}
	}, {
		key: 'getGeometry',
		value: function getGeometry(shpRecord) {
			var shape = shpRecord.shape;
			var geometry = { type: "", coordinates: [] };

			// point : 1 , polyline : 3 , polygon : 5, multipoint : 8
			switch (shape.type) {
				case 1:
					geometry.type = "Point";
					var rePrjPoint = this.TransCoord(shape.content.x, shape.content.y);
					geometry.coordinates = [rePrjPoint.x, rePrjPoint.y];
					break;
				case 3:
				case 8:
					geometry.type = shape.type === 3 ? "LineString" : "MultiPoint";
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
	}, {
		key: 'getCoordinates',
		value: function getCoordinates(points) {
			var coordinates = [];
			for (var i = 0; i < points.length; i += 2) {
				var rePrjPoint = this.TransCoord(points[i], points[i + 1]);
				coordinates.push([rePrjPoint.x, rePrjPoint.y]);
			}
			return coordinates;
		}
	}, {
		key: 'getPolygonCoordinates',
		value: function getPolygonCoordinates(parts, points) {
			var coordinates = [];
			for (var i = 0; i < parts.length; i++) {
				var part = [];
				var partStart = parts[i] * 2;
				var partEnd = parts[i + 1] * 2 || points.length;
				for (var j = partStart; j < partEnd; j += 2) {
					var rePrjPoint = this.TransCoord(points[j], points[j + 1]);
					part.push([rePrjPoint.x, rePrjPoint.y]);
				}
				coordinates.push(part);
			}
			return coordinates;
		}
	}]);

	return Shp2GeoJsonLoader;
}();

module.exports = Shp2GeoJsonLoader;