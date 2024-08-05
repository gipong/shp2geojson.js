/*
 * predefined [EPSG:3821] projection
 * Please make sure your desired projection can find on http://epsg.io/
 *
 * Usage :
 *      loadshp({
 *          url: '/shp/test.zip', // path or your upload file
 *          encoding: 'big5' // default utf-8
 *          EPSG: 3826 // default 4326
 *      }, function(geojson) {
 *          // geojson returned
 *      });
 *
 * Created by Gipong <sheu781230@gmail.com>
 *
 */
/*
   2024-08-05
   Upgraded jszip.js to from v2.4 to v3.10
   Amended preview.js to fit the changes
        Updated JSZip function calling methods and syntax to v 3.x
        Removed JSZipUtils usage: Replaced it with the fetch API.
        Updated FileReader handling: Now JSZip.loadAsync is directly used after reading the file as an ArrayBuffer.
        Updated projection definition loading: Using proj4.defs inside the processZip function correctly waits for the async call to complete before proceeding.
   Updated by azure7749
 */

var inputData = {},
    geoData = {},
    EPSGUser, url, encoding, EPSG,
    EPSG4326 = proj4('EPSG:4326');

function loadshp(config, returnData) {
    url = config.url;
    encoding = config.encoding || 'utf-8';
    EPSG = config.EPSG || 4326;

    loadEPSG('https://epsg.io/' + EPSG + '.js', function () {
        if (EPSG == 3821) {
            proj4.defs([
                ['EPSG:3821', '+proj=tmerc +ellps=GRS67 +towgs84=-752,-358,-179,-.0000011698,.0000018398,.0000009822,.00002329 +lat_0=0 +lon_0=121 +x_0=250000 +y_0=0 +k=0.9999 +units=m +no_defs']
            ]);
        }

        EPSGUser = proj4('EPSG:' + EPSG);

        if (typeof url !== 'string') {
            var reader = new FileReader();
            reader.onload = function (e) {
                JSZip.loadAsync(e.target.result).then(function (zip) {
                    processZip(zip, returnData);
                });
            }
            reader.readAsArrayBuffer(url);
        } else {
            fetch(url)
                .then(response => {
                    if (!response.ok) {
                        throw new Error('Network response was not ok');
                    }
                    return response.arrayBuffer();
                })
                .then(data => {
                    JSZip.loadAsync(data).then(function (zip) {
                        processZip(zip, returnData);
                    });
                })
                .catch(err => {
                    console.error('Failed to fetch binary content:', err);
                });
        }
    });
}

function loadEPSG(url, callback) {
    var script = document.createElement('script');
    script.src = url;
    script.onreadystatechange = callback;
    script.onload = callback;
    document.getElementsByTagName('head')[0].appendChild(script);
}

function processZip(zip, returnData) {
    var URL = window.URL || window.webkitURL;
    var shpFile = zip.file(/.shp$/i)[0];
    var dbfFile = zip.file(/.dbf$/i)[0];
    var prjFile = zip.file(/.prj$/i)[0];

    if (prjFile) {
        proj4.defs('EPSGUSER', zip.file(prjFile.name).async("string").then(function(text) {
            proj4.defs('EPSGUSER', text);
            try {
                EPSGUser = proj4('EPSGUSER');
            } catch (e) {
                console.error('Unsupported Projection: ' + e);
            }
        }));
    }

    Promise.all([
        shpFile.async("arraybuffer").then(arrayBuffer => SHPParser.load(URL.createObjectURL(new Blob([arrayBuffer])), shpLoader, returnData)),
        dbfFile.async("arraybuffer").then(arrayBuffer => DBFParser.load(URL.createObjectURL(new Blob([arrayBuffer])), encoding, dbfLoader, returnData))
    ]).then(() => {
        if (inputData['shp'] && inputData['dbf'] && returnData) {
            returnData(toGeojson(inputData));
        }
    });
}

function TransCoord(x, y) {
    if (proj4) {
        var p = proj4(EPSGUser, EPSG4326, [parseFloat(x), parseFloat(y)]);
        return { x: p[0], y: p[1] };
    }
    return { x: x, y: y };
}

function shpLoader(data, returnData) {
    inputData['shp'] = data;
    if (inputData['shp'] && inputData['dbf']) {
        if (returnData) returnData(toGeojson(inputData));
    }
}

function dbfLoader(data, returnData) {
    inputData['dbf'] = data;
    if (inputData['shp'] && inputData['dbf']) {
        if (returnData) returnData(toGeojson(inputData));
    }
}

function toGeojson(geojsonData) {
    var geojson = {
        type: "FeatureCollection",
        features: [],
        bbox: [
            TransCoord(geojsonData.shp.minX, geojsonData.shp.minY).x,
            TransCoord(geojsonData.shp.minX, geojsonData.shp.minY).y,
            TransCoord(geojsonData.shp.maxX, geojsonData.shp.maxY).x,
            TransCoord(geojsonData.shp.maxX, geojsonData.shp.maxY).y
        ]
    };

    geojsonData.shp.records.forEach(function (record, i) {
        var feature = {
            type: 'Feature',
            geometry: { type: '', coordinates: [] },
            properties: geojsonData.dbf.records[i]
        };

        switch (record.shape.type) {
            case 1:
                feature.geometry.type = "Point";
                feature.geometry.coordinates = [
                    TransCoord(record.shape.content.x, record.shape.content.y).x,
                    TransCoord(record.shape.content.x, record.shape.content.y).y
                ];
                break;
            case 3:
            case 8:
                feature.geometry.type = (record.shape.type == 3 ? "LineString" : "MultiPoint");
                record.shape.content.points.forEach(function (point, j) {
                    if (j % 2 === 0) {
                        feature.geometry.coordinates.push([
                            TransCoord(record.shape.content.points[j], record.shape.content.points[j + 1]).x,
                            TransCoord(record.shape.content.points[j], record.shape.content.points[j + 1]).y
                        ]);
                    }
                });
                break;
            case 5:
                feature.geometry.type = "Polygon";
                record.shape.content.parts.forEach(function (partIndex, pts) {
                    var part = [];
                    for (var j = partIndex * 2; j < (record.shape.content.parts[pts + 1] * 2 || record.shape.content.points.length); j += 2) {
                        part.push([
                            TransCoord(record.shape.content.points[j], record.shape.content.points[j + 1]).x,
                            TransCoord(record.shape.content.points[j], record.shape.content.points[j + 1]).y
                        ]);
                    }
                    feature.geometry.coordinates.push(part);
                });
                break;
            default:
        }

        if ("coordinates" in feature.geometry) geojson.features.push(feature);
    });

    return geojson;
}
